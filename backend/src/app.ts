import path from 'node:path';
import { fileURLToPath } from 'node:url';

import cors from '@fastify/cors';
import fastifyStatic from '@fastify/static';
import { PrismaClient } from '@prisma/client';
import Fastify, { FastifyInstance, FastifyReply } from 'fastify';

import { AppConfig } from './config/app-config.js';
import { registerAdminRoutes } from './routes/admin-routes.js';
import { registerDriverRoutes } from './routes/driver-routes.js';
import { registerMerchantRoutes } from './routes/merchant-routes.js';
import { registerRestaurantRoutes } from './routes/restaurant-routes.js';
import { AlertingService } from './services/alerting-service.js';
import { BackendService } from './services/backend-service.js';
import { DispatchService } from './services/dispatch-service.js';
import { GoogleRoutesEtaProvider } from './services/google-routes-eta-provider.js';
import { ObservabilityService } from './services/observability-service.js';
import {
  NoopPasswordResetNotifier,
  SmtpPasswordResetNotifier,
} from './services/password-reset-notifier.js';
import { PrismaBackofficeReadService } from './services/prisma-backoffice-read-service.js';
import { InMemoryRateLimiter, RateLimitRule, RateLimiter } from './services/rate-limiter.js';
import { RedisRateLimiter } from './services/redis-rate-limiter.js';
import { PushGateway } from './services/push-gateway.js';
import { PostgresStore } from './services/postgres-store.js';
import { RestaurantRealtimeService } from './services/restaurant-realtime-service.js';
import { FileStore } from './services/store.js';
import { StoreContract } from './services/store-contract.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');
const htmlRoutes = new Set(['/restaurant', '/merchant', '/admin']);

type CspReportPayload = {
  'csp-report'?: {
    'effective-directive'?: string;
    'violated-directive'?: string;
    'blocked-uri'?: string;
    'document-uri'?: string;
  };
  body?: {
    effectiveDirective?: string;
    blockedURL?: string;
    documentURL?: string;
  };
  type?: string;
} | Array<{
  body?: {
    effectiveDirective?: string;
    blockedURL?: string;
    documentURL?: string;
  };
  type?: string;
}>;

function resolveRateLimitRule(url: string): RateLimitRule | null {
  if (
    url.startsWith('/api/auth/driver/login') ||
    url.startsWith('/api/auth/restaurant/login') ||
    url.startsWith('/api/auth/merchant/login') ||
    url.startsWith('/api/auth/admin/login')
  ) {
    return { bucket: 'auth-login', windowMs: 15 * 60 * 1000, maxRequests: 8 };
  }
  if (url.startsWith('/api/auth/password-reset/request')) {
    return { bucket: 'password-reset', windowMs: 15 * 60 * 1000, maxRequests: 5 };
  }
  if (url.startsWith('/api/admin')) {
    return { bucket: 'admin', windowMs: 60 * 1000, maxRequests: 60 };
  }
  if (url.startsWith('/api/restaurants/me/orders') && url !== '/api/restaurants/me/orders') {
    return { bucket: 'restaurant-orders-detail', windowMs: 60 * 1000, maxRequests: 120 };
  }
  if (url.startsWith('/api/restaurants/me/orders')) {
    return { bucket: 'restaurant-orders', windowMs: 60 * 1000, maxRequests: 30 };
  }
  if (url.startsWith('/api/driver/location')) {
    return { bucket: 'driver-location', windowMs: 60 * 1000, maxRequests: 240 };
  }
  return null;
}

function createStore(config: AppConfig, app: FastifyInstance): StoreContract {
  if (config.databaseUrl) {
    app.log.info('Using Postgres storage adapter.');
    return new PostgresStore(config.databaseUrl, path.join(rootDir, 'sql', 'schema.sql'));
  }
  app.log.info('Using file storage adapter.');
  return new FileStore(
    path.join(rootDir, 'data', 'db.json'),
    path.join(rootDir, 'data', 'seed.json'),
  );
}

function createRateLimiter(config: AppConfig, app: FastifyInstance): { rateLimiter: RateLimiter; mode: 'memory' | 'redis' } {
  if (config.redisUrl) {
    app.log.info('Using Redis rate limiter.');
    return { rateLimiter: new RedisRateLimiter(config.redisUrl), mode: 'redis' };
  }
  app.log.info('Using in-memory rate limiter.');
  return { rateLimiter: new InMemoryRateLimiter(), mode: 'memory' };
}

function createPasswordResetNotifier(config: AppConfig, app: FastifyInstance) {
  if (config.smtpHost && config.smtpPort && config.smtpFromEmail) {
    app.log.info('Using SMTP password reset notifier.');
    return new SmtpPasswordResetNotifier({
      host: config.smtpHost,
      port: config.smtpPort,
      user: config.smtpUser,
      password: config.smtpPassword,
      fromEmail: config.smtpFromEmail,
      resetBaseUrl: config.passwordResetBaseUrl,
    });
  }
  app.log.info('Using noop password reset notifier.');
  return new NoopPasswordResetNotifier(app.log);
}

function isOriginAllowed(origin: string | undefined, allowedOrigins: string[]): boolean {
  if (!origin) {
    return true;
  }
  return allowedOrigins.includes(origin);
}

function applySecurityHeaders(reply: FastifyReply) {
  reply.header('X-Content-Type-Options', 'nosniff');
  reply.header('X-Frame-Options', 'DENY');
  reply.header('Referrer-Policy', 'no-referrer');
  reply.header('Permissions-Policy', 'geolocation=(self), microphone=(), camera=()');
}

function buildCspHeader(config: AppConfig): string {
  const directives = [
    "default-src 'self'",
    "script-src 'self'",
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data:",
    "connect-src 'self'",
    "object-src 'none'",
    "base-uri 'self'",
    "frame-ancestors 'none'",
  ];

  if (config.cspReportUri) {
    directives.push(`report-uri ${config.cspReportUri}`);
  }

  return directives.join('; ');
}

function extractEffectiveDirective(payload: CspReportPayload): string {
  if (Array.isArray(payload)) {
    return payload[0]?.body?.effectiveDirective ?? payload[0]?.type ?? 'unknown';
  }
  return payload['csp-report']?.['effective-directive']
    ?? payload['csp-report']?.['violated-directive']
    ?? payload.body?.effectiveDirective
    ?? payload.type
    ?? 'unknown';
}

export async function buildApp(
  config: AppConfig,
): Promise<{ app: FastifyInstance; backendService: BackendService; observability: ObservabilityService }> {
  process.env.SESSION_TTL_HOURS = String(config.sessionTtlHours);
  process.env.STALE_LOCATION_MINUTES = String(config.staleLocationMinutes);
  process.env.ADMIN_API_KEY = config.adminApiKey ?? '';
  process.env.ALLOW_ADMIN_API_KEY_FALLBACK = String(config.allowAdminApiKeyFallback);
  process.env.FIREBASE_SERVICE_ACCOUNT_PATH = config.firebaseServiceAccountPath ?? '';
  process.env.GOOGLE_MAPS_API_KEY = config.googleMapsApiKey ?? '';
  process.env.WEB_SESSION_COOKIE_SECURE = String(config.webSessionCookieSecure);
  process.env.WEB_SESSION_COOKIE_DOMAIN = config.webSessionCookieDomain ?? '';
  process.env.WEB_SESSION_COOKIE_SAME_SITE = config.webSessionCookieSameSite;
  process.env.WEB_SESSION_COOKIE_MAX_AGE_SECONDS = String(config.webSessionCookieMaxAgeSeconds);
  process.env.CSP_REPORT_ONLY = String(config.cspReportOnly);
  process.env.CSP_REPORT_URI = config.cspReportUri ?? '';

  const app = Fastify({ logger: true, trustProxy: true });
  const observability = new ObservabilityService();
  const alerting = new AlertingService(
    config.alertWebhookUrl,
    config.alertMinIntervalSeconds * 1000,
    app.log,
  );
  const { rateLimiter, mode: rateLimiterMode } = createRateLimiter(config, app);
  const store = createStore(config, app);
  const prisma = config.databaseUrl ? new PrismaClient({ datasourceUrl: config.databaseUrl }) : null;
  const backofficeReadService = prisma ? new PrismaBackofficeReadService(prisma) : null;
  const pushGateway = new PushGateway(app.log);
  const etaProvider = config.googleMapsApiKey ? new GoogleRoutesEtaProvider(config.googleMapsApiKey) : null;
  const restaurantRealtime = new RestaurantRealtimeService();
  const passwordResetNotifier = createPasswordResetNotifier(config, app);
  const backendService = new BackendService(
    store,
    new DispatchService(),
    pushGateway,
    etaProvider,
    passwordResetNotifier,
    restaurantRealtime,
    backofficeReadService,
  );
  const cspHeaderValue = buildCspHeader(config);

  app.addContentTypeParser('application/csp-report', { parseAs: 'string' }, (_request, body, done) => {
    try {
      done(null, body ? JSON.parse(String(body)) : {});
    } catch (error) {
      done(error as Error, undefined);
    }
  });
  app.addContentTypeParser('application/reports+json', { parseAs: 'string' }, (_request, body, done) => {
    try {
      done(null, body ? JSON.parse(String(body)) : []);
    } catch (error) {
      done(error as Error, undefined);
    }
  });

  await app.register(cors, {
    origin: (origin, callback) => callback(null, isOriginAllowed(origin, config.allowedWebOrigins)),
    credentials: true,
  });
  await app.register(fastifyStatic, {
    root: path.join(rootDir, 'public'),
    prefix: '/',
  });

  app.addHook('onRequest', async (request) => {
    observability.activeRequests.inc();
    (request as typeof request & { startTime?: bigint }).startTime = process.hrtime.bigint();
  });

  app.addHook('onSend', async (request, reply, payload) => {
    applySecurityHeaders(reply);
    if (htmlRoutes.has(request.url)) {
      reply.header(config.cspReportOnly ? 'Content-Security-Policy-Report-Only' : 'Content-Security-Policy', cspHeaderValue);
      if (config.cspReportUri) {
        const reportEndpoint = `csp-endpoint=\"${config.cspReportUri}\"`;
        reply.header('Reporting-Endpoints', reportEndpoint);
        reply.header('Report-To', JSON.stringify({
          group: 'csp-endpoint',
          max_age: 10886400,
          endpoints: [{ url: config.cspReportUri }],
        }));
      }
      reply.header('Cache-Control', 'no-store');
    }
    return payload;
  });

  app.addHook('preHandler', async (request, reply) => {
    const rule = resolveRateLimitRule(request.url);
    if (!rule) {
      return;
    }
    const ip = request.ip ?? 'unknown';
    const result = await rateLimiter.check(ip, rule);
    if (!result.allowed) {
      observability.rateLimitRejectionsTotal.inc({ bucket: rule.bucket });
      reply.header('Retry-After', result.retryAfterSeconds);
      reply.status(429).send({ message: 'Too many requests. Please try again later.' });
    }
  });

  app.addHook('onResponse', async (request, reply) => {
    observability.activeRequests.dec();
    const startTime = (request as typeof request & { startTime?: bigint }).startTime;
    const durationMs = startTime ? Number(process.hrtime.bigint() - startTime) / 1_000_000 : 0;
    const route = request.routeOptions.url || request.url;
    const labels = { method: request.method, route, status_code: String(reply.statusCode) };
    observability.requestsTotal.inc(labels);
    observability.requestDurationMs.observe(labels, durationMs);
    if (
      reply.statusCode === 401 &&
      (
        route.startsWith('/api/auth/driver/login') ||
        route.startsWith('/api/auth/restaurant/login') ||
        route.startsWith('/api/auth/merchant/login') ||
        route.startsWith('/api/auth/admin/login')
      )
    ) {
      observability.authFailuresTotal.inc({ route });
    }
  });

  app.setErrorHandler((error, request, reply) => {
    const statusCode = typeof (error as { statusCode?: number }).statusCode === 'number'
      ? (error as { statusCode: number }).statusCode
      : 500;
    if (statusCode >= 500) {
      observability.uncaughtErrorsTotal.inc();
      request.log.error(error);
      void alerting.sendAlert('http.uncaught-error', {
        method: request.method,
        url: request.url,
        message: error instanceof Error ? error.message : String(error),
      });
    } else {
      request.log.warn(error);
    }
    if (!reply.sent) {
      const message = statusCode >= 500 ? 'Internal server error.' : (error as Error).message;
      reply.status(statusCode).send({ message });
    }
  });

  app.get('/api/health', async () => ({
    ok: true,
    service: 'driver-app-backend',
    storage: config.databaseUrl ? 'postgres' : 'file',
    trafficAwareEta: Boolean(config.googleMapsApiKey),
    readModel: backofficeReadService ? 'prisma' : 'store',
    rateLimiter: rateLimiterMode,
    realtime: 'sse',
    passwordResetDelivery: config.smtpHost && config.smtpPort && config.smtpFromEmail ? 'smtp' : 'noop',
    timestamp: new Date().toISOString(),
  }));

  app.post('/api/security/csp-report', async (request, reply) => {
    const payload = (request.body ?? {}) as CspReportPayload;
    observability.cspViolationReportsTotal.inc({ effective_directive: extractEffectiveDirective(payload) });
    return reply.status(204).send();
  });

  app.get('/api/metrics', async (request, reply) => {
    if (config.metricsApiKey) {
      const requestKey = request.headers['x-metrics-key'];
      if (typeof requestKey !== 'string' || requestKey !== config.metricsApiKey) {
        return reply.status(401).send({ message: 'Unauthorized' });
      }
    }
    reply.header('Content-Type', observability.registry.contentType);
    return observability.metrics();
  });

  await registerAdminRoutes(app, backendService, restaurantRealtime);
  await registerDriverRoutes(app, backendService);
  await registerMerchantRoutes(app, backendService, restaurantRealtime);
  await registerRestaurantRoutes(app, backendService, restaurantRealtime);

  app.get('/restaurant', async (_request, reply) => reply.sendFile('restaurant.html'));
  app.get('/merchant', async (_request, reply) => reply.sendFile('merchant.html'));
  app.get('/admin', async (_request, reply) => reply.sendFile('admin.html'));

  app.addHook('onClose', async () => {
    if (prisma) {
      await prisma.$disconnect();
    }
    if (rateLimiter.close) {
      await rateLimiter.close();
    }
  });

  return { app, backendService, observability };
}


