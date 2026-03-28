import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';

export interface AppConfig {
  host: string;
  port: number;
  databaseUrl: string | null;
  googleMapsApiKey: string | null;
  firebaseServiceAccountPath: string | null;
  adminApiKey: string | null;
  allowAdminApiKeyFallback: boolean;
  allowedWebOrigins: string[];
  metricsApiKey: string | null;
  redisUrl: string | null;
  webSessionCookieSecure: boolean;
  webSessionCookieDomain: string | null;
  webSessionCookieSameSite: 'Strict' | 'Lax' | 'None';
  webSessionCookieMaxAgeSeconds: number;
  smtpHost: string | null;
  smtpPort: number | null;
  smtpUser: string | null;
  smtpPassword: string | null;
  smtpFromEmail: string | null;
  passwordResetBaseUrl: string | null;
  alertWebhookUrl: string | null;
  alertMinIntervalSeconds: number;
  sessionTtlHours: number;
  staleLocationMinutes: number;
  dispatchIntervalMs: number;
}

function parseEnvFile(raw: string): NodeJS.ProcessEnv {
  const parsed: NodeJS.ProcessEnv = {};
  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) {
      continue;
    }
    const separatorIndex = trimmed.indexOf('=');
    if (separatorIndex <= 0) {
      continue;
    }
    const key = trimmed.slice(0, separatorIndex).trim();
    const value = trimmed.slice(separatorIndex + 1).trim().replace(/^['"]|['"]$/g, '');
    parsed[key] = value;
  }
  return parsed;
}

function resolveEnv(env: NodeJS.ProcessEnv): NodeJS.ProcessEnv {
  const envFile = env.ENV_FILE?.trim();
  if (!envFile) {
    return env;
  }
  const resolvedPath = path.isAbsolute(envFile) ? envFile : path.resolve(process.cwd(), envFile);
  if (!existsSync(resolvedPath)) {
    throw new Error(`ENV_FILE does not exist: ${resolvedPath}`);
  }
  return { ...parseEnvFile(readFileSync(resolvedPath, 'utf8')), ...env };
}

function readPositiveInteger(value: string | undefined, fallback: number, name: string): number {
  const raw = value?.trim();
  if (!raw) {
    return fallback;
  }
  const parsed = Number(raw);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new Error(`${name} must be a positive integer.`);
  }
  return parsed;
}

function readOptionalString(value: string | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

function readOptionalPort(value: string | undefined, name: string): number | null {
  const raw = value?.trim();
  if (!raw) {
    return null;
  }
  const parsed = Number(raw);
  if (!Number.isInteger(parsed) || parsed <= 0 || parsed > 65535) {
    throw new Error(`${name} must be a valid TCP port.`);
  }
  return parsed;
}

function readBoolean(value: string | undefined, fallback: boolean, name = 'Boolean configuration'): boolean {
  const raw = value?.trim().toLowerCase();
  if (!raw) {
    return fallback;
  }
  if (raw === 'true') {
    return true;
  }
  if (raw === 'false') {
    return false;
  }
  throw new Error(`${name} values must be true or false.`);
}

function readSameSite(value: string | undefined): 'Strict' | 'Lax' | 'None' {
  const raw = value?.trim().toLowerCase();
  if (!raw || raw === 'strict') {
    return 'Strict';
  }
  if (raw === 'lax') {
    return 'Lax';
  }
  if (raw === 'none') {
    return 'None';
  }
  throw new Error('WEB_SESSION_COOKIE_SAME_SITE must be Strict, Lax, or None.');
}

function readStringList(value: string | undefined): string[] {
  return (value ?? '')
    .split(',')
    .map((item) => item.trim())
    .filter((item) => item.length > 0);
}

export function loadAppConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
  const resolvedEnv = resolveEnv(env);
  const port = readPositiveInteger(resolvedEnv.PORT, 8080, 'PORT');
  if (port > 65535) {
    throw new Error('PORT must be 65535 or lower.');
  }

  const webSessionCookieSecure = readBoolean(resolvedEnv.WEB_SESSION_COOKIE_SECURE, false, 'WEB_SESSION_COOKIE_SECURE');
  const webSessionCookieSameSite = readSameSite(resolvedEnv.WEB_SESSION_COOKIE_SAME_SITE);
  if (webSessionCookieSameSite === 'None' && !webSessionCookieSecure) {
    throw new Error('WEB_SESSION_COOKIE_SECURE must be true when WEB_SESSION_COOKIE_SAME_SITE=None.');
  }

  return {
    host: resolvedEnv.HOST?.trim() || '0.0.0.0',
    port,
    databaseUrl: readOptionalString(resolvedEnv.DATABASE_URL),
    googleMapsApiKey: readOptionalString(resolvedEnv.GOOGLE_MAPS_API_KEY),
    firebaseServiceAccountPath: readOptionalString(resolvedEnv.FIREBASE_SERVICE_ACCOUNT_PATH),
    adminApiKey: readOptionalString(resolvedEnv.ADMIN_API_KEY),
    allowAdminApiKeyFallback: readBoolean(resolvedEnv.ALLOW_ADMIN_API_KEY_FALLBACK, false, 'ALLOW_ADMIN_API_KEY_FALLBACK'),
    allowedWebOrigins: readStringList(resolvedEnv.ALLOWED_WEB_ORIGINS),
    metricsApiKey: readOptionalString(resolvedEnv.METRICS_API_KEY),
    redisUrl: readOptionalString(resolvedEnv.REDIS_URL),
    webSessionCookieSecure,
    webSessionCookieDomain: readOptionalString(resolvedEnv.WEB_SESSION_COOKIE_DOMAIN),
    webSessionCookieSameSite,
    webSessionCookieMaxAgeSeconds: readPositiveInteger(resolvedEnv.WEB_SESSION_COOKIE_MAX_AGE_SECONDS, 12 * 60 * 60, 'WEB_SESSION_COOKIE_MAX_AGE_SECONDS'),
    smtpHost: readOptionalString(resolvedEnv.SMTP_HOST),
    smtpPort: readOptionalPort(resolvedEnv.SMTP_PORT, 'SMTP_PORT'),
    smtpUser: readOptionalString(resolvedEnv.SMTP_USER),
    smtpPassword: readOptionalString(resolvedEnv.SMTP_PASSWORD),
    smtpFromEmail: readOptionalString(resolvedEnv.SMTP_FROM_EMAIL),
    passwordResetBaseUrl: readOptionalString(resolvedEnv.PASSWORD_RESET_BASE_URL),
    alertWebhookUrl: readOptionalString(resolvedEnv.ALERT_WEBHOOK_URL),
    alertMinIntervalSeconds: readPositiveInteger(
      resolvedEnv.ALERT_MIN_INTERVAL_SECONDS,
      300,
      'ALERT_MIN_INTERVAL_SECONDS',
    ),
    sessionTtlHours: readPositiveInteger(resolvedEnv.SESSION_TTL_HOURS, 12, 'SESSION_TTL_HOURS'),
    staleLocationMinutes: readPositiveInteger(resolvedEnv.STALE_LOCATION_MINUTES, 5, 'STALE_LOCATION_MINUTES'),
    dispatchIntervalMs: readPositiveInteger(resolvedEnv.DISPATCH_INTERVAL_MS, 5000, 'DISPATCH_INTERVAL_MS'),
  };
}
