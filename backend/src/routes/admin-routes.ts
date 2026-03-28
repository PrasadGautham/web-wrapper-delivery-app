import { FastifyInstance, FastifyRequest } from 'fastify';

import { DistancePricingRule, DistanceUnit, DriverDispatchMode, DriverOfferDistanceMode, MerchantUserRole, PlatformAdminRole, RestaurantStaffRole } from '../domain/models.js';
import { assertValidPricingRule, normalizePricingRule } from '../services/pricing-rules.js';
import { BackendService } from '../services/backend-service.js';
import { RestaurantRealtimeService } from '../services/restaurant-realtime-service.js';
import {
  AuthTransport,
  clearWebSessionCookie,
  isWebPortalRequest,
  resolveAuthSession,
  setWebSessionCookie,
} from './session-auth.js';

interface AdminAuthedRequest extends FastifyRequest {
  adminUserId?: string;
  authToken?: string;
  authTransport?: AuthTransport;
}

function ensureAdminEnabled(): string {
  const apiKey = process.env.ADMIN_API_KEY;
  if (!apiKey) {
    throw new Error('Admin API is disabled. Set ADMIN_API_KEY to enable it.');
  }
  return apiKey;
}

function allowAdminApiKeyFallback(): boolean {
  return process.env.ALLOW_ADMIN_API_KEY_FALLBACK === 'true';
}

function isDispatchMode(value: unknown): value is DriverDispatchMode {
  return value === 'open' || value === 'allowListOnly' || value === 'allowListWithFallback';
}

function isRestaurantStaffRole(value: unknown): value is RestaurantStaffRole {
  return value === 'owner' || value === 'manager' || value === 'dispatcher' || value === 'viewer';
}

function isPlatformAdminRole(value: unknown): value is PlatformAdminRole {
  return value === 'platformAdmin' || value === 'opsAdmin' || value === 'supportAdmin' || value === 'billingAdmin';
}

function isMerchantUserRole(value: unknown): value is MerchantUserRole {
  return value === 'merchantOwner' || value === 'merchantManager' || value === 'merchantDispatcher' || value === 'merchantViewer';
}

function isDriverOfferDistanceMode(value: unknown): value is DriverOfferDistanceMode {
  return value === 'storeToCustomer' || value === 'includeCommuteToStore';
}

function isDistanceUnit(value: unknown): value is DistanceUnit {
  return value === 'kilometer' || value === 'mile';
}

function isCurrencyCode(value: unknown): value is string {
  return typeof value === 'string' && /^[A-Z]{3}$/.test(value.trim());
}

export async function registerAdminRoutes(
  app: FastifyInstance,
  backendService: BackendService,
  restaurantRealtime: RestaurantRealtimeService,
): Promise<void> {
  app.addHook('preHandler', async (request, reply) => {
    const isAdminSessionRoute =
      request.url.startsWith('/api/auth/admin/session') ||
      request.url.startsWith('/api/auth/admin/logout') ||
      request.url.startsWith('/api/auth/admin/refresh');

    if (!request.url.startsWith('/api/admin') && !isAdminSessionRoute) {
      return;
    }

    const requestKey = request.headers['x-admin-key'];
    if (allowAdminApiKeyFallback() && typeof requestKey === 'string') {
      try {
        const configuredKey = ensureAdminEnabled();
        if (requestKey === configuredKey) {
          return;
        }
      } catch (error) {
        if (request.url.startsWith('/api/admin')) {
          return reply.status(503).send({ message: (error as Error).message });
        }
      }
    }

    try {
      const session = resolveAuthSession(request, 'admin');
      const adminUser = await backendService.requireAdminFromToken(session.token);
      (request as AdminAuthedRequest).adminUserId = adminUser.id;
      (request as AdminAuthedRequest).authToken = session.token;
      (request as AdminAuthedRequest).authTransport = session.transport;
    } catch {
      return reply.status(401).send({ message: 'Unauthorized' });
    }
  });

  app.post('/api/auth/admin/login', async (request, reply) => {
    const body = request.body as { email?: string; password?: string };
    if (!body.email || !body.password) {
      return reply.status(400).send({ message: 'Email and password are required.' });
    }

    try {
      const result = await backendService.loginAdmin(body.email, body.password);
      if (isWebPortalRequest(request)) {
        setWebSessionCookie(reply, 'admin', result.token);
        return { adminUser: result.adminUser, sessionTransport: 'cookie' };
      }
      return result;
    } catch (error) {
      return reply.status(401).send({ message: (error as Error).message });
    }
  });

  app.get('/api/auth/admin/session', async (request) => {
    const authedRequest = request as AdminAuthedRequest;
    const adminUser = await backendService.requireAdminFromToken(authedRequest.authToken as string);
    return {
      id: adminUser.id,
      name: adminUser.name,
      email: adminUser.email,
      role: adminUser.role,
      isActive: adminUser.isActive,
      lastLoginAt: adminUser.lastLoginAt,
    };
  });

  app.post('/api/auth/admin/refresh', async (request, reply) => {
    const authedRequest = request as AdminAuthedRequest;
    try {
      const refreshed = await backendService.refreshSession(authedRequest.authToken as string, 'admin');
      if (authedRequest.authTransport === 'cookie' || isWebPortalRequest(request)) {
        setWebSessionCookie(reply, 'admin', refreshed.token);
        return { sessionTransport: 'cookie' };
      }
      return refreshed;
    } catch (error) {
      return reply.status(401).send({ message: (error as Error).message || 'Unauthorized' });
    }
  });

  app.post('/api/auth/admin/logout', async (request, reply) => {
    const authedRequest = request as AdminAuthedRequest;
    await backendService.logout(authedRequest.authToken as string);
    if (authedRequest.authTransport === 'cookie' || isWebPortalRequest(request)) {
      clearWebSessionCookie(reply, 'admin');
    }
    return { ok: true };
  });

  app.get('/api/admin/merchants', async () => backendService.listMerchants());
  app.get('/api/admin/merchants/:merchantId/users', async (request) => {
    const params = request.params as { merchantId: string };
    return backendService.listMerchantUsers(params.merchantId);
  });
  app.get('/api/admin/restaurants', async () => backendService.listRestaurants());
  app.get('/api/admin/drivers', async () => backendService.listDrivers());
  app.get('/api/admin/admin-users', async () => backendService.listAdminUsers());
  app.get('/api/admin/restaurants/:restaurantId/staff-users', async (request) => {
    const params = request.params as { restaurantId: string };
    return backendService.listRestaurantStaffUsers(params.restaurantId);
  });

  app.post('/api/admin/admin-users', async (request, reply) => {
    const body = request.body as { name?: string; email?: string; password?: string; role?: PlatformAdminRole };
    if (!body.name || !body.email || !body.password || !isPlatformAdminRole(body.role)) {
      return reply.status(400).send({ message: 'name, email, password, and a valid role are required.' });
    }
    try {
      return await backendService.createAdminUser({
        name: body.name,
        email: body.email,
        password: body.password,
        role: body.role,
      });
    } catch (error) {
      return reply.status(400).send({ message: (error as Error).message });
    }
  });

  app.patch('/api/admin/admin-users/:adminUserId', async (request, reply) => {
    const params = request.params as { adminUserId: string };
    const body = request.body as { name?: string; password?: string; role?: PlatformAdminRole; isActive?: boolean };
    if (body.role != null && !isPlatformAdminRole(body.role)) {
      return reply.status(400).send({ message: 'Invalid admin role.' });
    }
    try {
      return await backendService.updateAdminUser(params.adminUserId, body);
    } catch (error) {
      return reply.status(400).send({ message: (error as Error).message });
    }
  });

  app.post('/api/admin/merchants/:merchantId/users', async (request, reply) => {
    const params = request.params as { merchantId: string };
    const body = request.body as { name?: string; email?: string; password?: string; role?: MerchantUserRole };
    if (!body.name || !body.email || !body.password || !isMerchantUserRole(body.role)) {
      return reply.status(400).send({ message: 'name, email, password, and a valid merchant role are required.' });
    }
    try {
      return await backendService.createMerchantUser(params.merchantId, {
        name: body.name,
        email: body.email,
        password: body.password,
        role: body.role,
      });
    } catch (error) {
      return reply.status(400).send({ message: (error as Error).message });
    }
  });

  app.patch('/api/admin/merchants/:merchantId/users/:merchantUserId', async (request, reply) => {
    const params = request.params as { merchantId: string; merchantUserId: string };
    const body = request.body as { name?: string; password?: string; role?: MerchantUserRole; isActive?: boolean };
    if (body.role != null && !isMerchantUserRole(body.role)) {
      return reply.status(400).send({ message: 'Invalid merchant role.' });
    }
    try {
      return await backendService.updateMerchantUser(params.merchantId, params.merchantUserId, body);
    } catch (error) {
      return reply.status(400).send({ message: (error as Error).message });
    }
  });

  app.post('/api/admin/restaurants/:restaurantId/staff-users', async (request, reply) => {
    const params = request.params as { restaurantId: string };
    const body = request.body as { name?: string; email?: string; password?: string; role?: RestaurantStaffRole };
    if (!body.name || !body.email || !body.password || !isRestaurantStaffRole(body.role)) {
      return reply.status(400).send({ message: 'name, email, password, and a valid restaurant role are required.' });
    }
    try {
      return await backendService.createRestaurantStaffUser(params.restaurantId, {
        name: body.name,
        email: body.email,
        password: body.password,
        role: body.role,
      });
    } catch (error) {
      return reply.status(400).send({ message: (error as Error).message });
    }
  });

  app.patch('/api/admin/restaurants/:restaurantId/staff-users/:staffUserId', async (request, reply) => {
    const params = request.params as { restaurantId: string; staffUserId: string };
    const body = request.body as { name?: string; password?: string; role?: RestaurantStaffRole; isActive?: boolean };
    if (body.role != null && !isRestaurantStaffRole(body.role)) {
      return reply.status(400).send({ message: 'Invalid restaurant staff role.' });
    }
    try {
      return await backendService.updateRestaurantStaffUser(params.restaurantId, params.staffUserId, body);
    } catch (error) {
      return reply.status(400).send({ message: (error as Error).message });
    }
  });

  app.patch('/api/admin/drivers/:driverId/dispatch-policy', async (request, reply) => {
    const params = request.params as { driverId: string };
    const body = request.body as {
      mode?: DriverDispatchMode;
      restaurantIds?: string[];
      merchantIds?: string[];
    };

    if (!isDispatchMode(body.mode)) {
      return reply.status(400).send({ message: 'Invalid dispatch mode.' });
    }
    if (body.restaurantIds != null && !Array.isArray(body.restaurantIds)) {
      return reply.status(400).send({ message: 'restaurantIds must be an array.' });
    }
    if (body.merchantIds != null && !Array.isArray(body.merchantIds)) {
      return reply.status(400).send({ message: 'merchantIds must be an array.' });
    }

    try {
      return await backendService.updateDriverDispatchPolicy(params.driverId, {
        mode: body.mode,
        restaurantIds: body.restaurantIds ?? [],
        merchantIds: body.merchantIds ?? [],
      });
    } catch (error) {
      return reply.status(400).send({ message: (error as Error).message });
    }
  });

  app.patch('/api/admin/drivers/:driverId/capacity', async (request, reply) => {
    const params = request.params as { driverId: string };
    const body = request.body as { maxActiveOrders?: number };
    if (typeof body.maxActiveOrders !== 'number' || body.maxActiveOrders < 1 || body.maxActiveOrders > 5) {
      return reply.status(400).send({ message: 'maxActiveOrders must be a number between 1 and 5.' });
    }

    try {
      return await backendService.updateDriverCapacity(params.driverId, Math.floor(body.maxActiveOrders));
    } catch (error) {
      return reply.status(400).send({ message: (error as Error).message });
    }
  });

  app.patch('/api/admin/restaurants/:restaurantId/display-settings', async (request, reply) => {
    const params = request.params as { restaurantId: string };
    const body = request.body as { currency?: string; distanceUnit?: DistanceUnit };

    if (!isCurrencyCode(body.currency) || !isDistanceUnit(body.distanceUnit)) {
      return reply.status(400).send({ message: 'currency must be a 3-letter ISO code and distanceUnit must be kilometer or mile.' });
    }

    try {
      const updated = await backendService.updateRestaurantDisplaySettings(params.restaurantId, {
        currency: body.currency,
        distanceUnit: body.distanceUnit,
      });
      restaurantRealtime.publishRestaurantUpdated(params.restaurantId);
      return updated;
    } catch (error) {
      return reply.status(400).send({ message: (error as Error).message });
    }
  });

  app.patch('/api/admin/restaurants/:restaurantId/pricing', async (request, reply) => {
    const params = request.params as { restaurantId: string };
    const body = request.body as {
      driverPayoutRule?: DistancePricingRule;
      merchantBillingRule?: DistancePricingRule;
    };

    try {
      if (!body.driverPayoutRule || !body.merchantBillingRule) {
        throw new Error('driverPayoutRule and merchantBillingRule are required.');
      }
      assertValidPricingRule(body.driverPayoutRule, 'Driver payout rule');
      assertValidPricingRule(body.merchantBillingRule, 'Merchant billing rule');
      const updated = await backendService.updateRestaurantPricing(params.restaurantId, {
        driverPayoutRule: normalizePricingRule(body.driverPayoutRule),
        merchantBillingRule: normalizePricingRule(body.merchantBillingRule),
      });
      restaurantRealtime.publishRestaurantUpdated(params.restaurantId);
      return updated;
    } catch (error) {
      return reply.status(400).send({ message: (error as Error).message });
    }
  });

  app.patch('/api/admin/restaurants/:restaurantId/driver-offer-settings', async (request, reply) => {
    const params = request.params as { restaurantId: string };
    const body = request.body as { distanceMode?: DriverOfferDistanceMode };

    if (!isDriverOfferDistanceMode(body.distanceMode)) {
      return reply.status(400).send({ message: 'distanceMode must be storeToCustomer or includeCommuteToStore.' });
    }

    try {
      const updated = await backendService.updateRestaurantDriverOfferSettings(params.restaurantId, {
        distanceMode: body.distanceMode,
      });
      restaurantRealtime.publishRestaurantUpdated(params.restaurantId);
      return updated;
    } catch (error) {
      return reply.status(400).send({ message: (error as Error).message });
    }
  });

  app.patch('/api/admin/restaurants/:restaurantId/tracking-settings', async (request, reply) => {
    const params = request.params as { restaurantId: string };
    const body = request.body as {
      showPickedUpAsInTransit?: boolean;
      showDriverEtaToPickup?: boolean;
      showDestinationEta?: boolean;
    };

    if (
      typeof body.showPickedUpAsInTransit !== 'boolean' ||
      typeof body.showDriverEtaToPickup !== 'boolean' ||
      typeof body.showDestinationEta !== 'boolean'
    ) {
      return reply.status(400).send({ message: 'Tracking settings must all be boolean values.' });
    }

    try {
      const updated = await backendService.updateRestaurantTrackingSettings(params.restaurantId, {
        showPickedUpAsInTransit: body.showPickedUpAsInTransit,
        showDriverEtaToPickup: body.showDriverEtaToPickup,
        showDestinationEta: body.showDestinationEta,
      });
      restaurantRealtime.publishRestaurantUpdated(params.restaurantId);
      return updated;
    } catch (error) {
      return reply.status(400).send({ message: (error as Error).message });
    }
  });
}

