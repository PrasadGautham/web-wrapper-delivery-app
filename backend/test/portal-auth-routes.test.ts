import assert from 'node:assert/strict';

import Fastify, { FastifyInstance } from 'fastify';

import { registerAdminRoutes } from '../src/routes/admin-routes.js';
import { registerMerchantRoutes } from '../src/routes/merchant-routes.js';
import { registerRestaurantRoutes } from '../src/routes/restaurant-routes.js';
import { BackendService } from '../src/services/backend-service.js';
import { DispatchService } from '../src/services/dispatch-service.js';
import { RestaurantRealtimeService } from '../src/services/restaurant-realtime-service.js';
import {
  InMemoryStore,
  loadSeed,
  noopPasswordResetNotifier,
  noopPushGateway,
  nullEtaProvider,
} from './helpers.js';

function createService(): BackendService {
  return new BackendService(
    new InMemoryStore(loadSeed()),
    new DispatchService(),
    noopPushGateway as never,
    nullEtaProvider,
    noopPasswordResetNotifier as never,
    new RestaurantRealtimeService(),
  );
}

function extractCookie(setCookieHeader: string | string[] | undefined): string {
  const raw = Array.isArray(setCookieHeader) ? setCookieHeader[0] : setCookieHeader;
  assert.ok(raw, 'expected Set-Cookie header');
  return raw.split(';', 1)[0];
}

async function buildTestApp(): Promise<FastifyInstance> {
  process.env.WEB_SESSION_COOKIE_SECURE = 'false';
  process.env.WEB_SESSION_COOKIE_SAME_SITE = 'Strict';
  process.env.WEB_SESSION_COOKIE_MAX_AGE_SECONDS = '43200';
  process.env.ALLOW_ADMIN_API_KEY_FALLBACK = 'false';

  const app = Fastify();
  const service = createService();
  const realtime = new RestaurantRealtimeService();

  app.setErrorHandler((error, _request, reply) => {
    const statusCode = typeof (error as { statusCode?: number }).statusCode === 'number'
      ? (error as { statusCode: number }).statusCode
      : 500;
    if (!reply.sent) {
      reply.status(statusCode).send({ message: statusCode >= 500 ? 'Internal server error.' : (error as Error).message });
    }
  });

  await registerAdminRoutes(app, service, realtime);
  await registerMerchantRoutes(app, service, realtime);
  await registerRestaurantRoutes(app, service, realtime);
  return app;
}

export async function runPortalAuthRoutesTests(): Promise<void> {
  const app = await buildTestApp();
  try {
    {
      const login = await app.inject({
        method: 'POST',
        url: '/api/auth/merchant/login',
        headers: { 'x-portal-client': 'web' },
        payload: { email: 'falafel.group@demo.com', password: 'Password123' },
      });
      assert.equal(login.statusCode, 200);
      assert.equal(Object.prototype.hasOwnProperty.call(JSON.parse(login.body), 'token'), false);
      const cookie = extractCookie(login.headers['set-cookie']);

      const profile = await app.inject({ method: 'GET', url: '/api/auth/merchant/session', headers: { cookie } });
      assert.equal(profile.statusCode, 200);

      const streamTicket = await app.inject({ method: 'POST', url: '/api/auth/merchant/stream-ticket', headers: { cookie } });
      assert.equal(streamTicket.statusCode, 200);

      const pricingUpdate = await app.inject({
        method: 'PATCH',
        url: '/api/merchant/me/restaurants/restaurant-001/pricing',
        headers: { cookie },
        payload: { driverRatePerOrder: 12.5, restaurantChargePerOrder: 18.75 },
      });
      assert.equal(pricingUpdate.statusCode, 200);
      assert.equal(JSON.parse(pricingUpdate.body).driverRatePerOrder, 12.5);

      const trackingUpdate = await app.inject({
        method: 'PATCH',
        url: '/api/merchant/me/restaurants/restaurant-001/tracking-settings',
        headers: { cookie },
        payload: { showPickedUpAsInTransit: false, showDriverEtaToPickup: true, showDestinationEta: false },
      });
      assert.equal(trackingUpdate.statusCode, 200);

      const refresh = await app.inject({ method: 'POST', url: '/api/auth/merchant/refresh', headers: { cookie, 'x-portal-client': 'web' } });
      assert.equal(refresh.statusCode, 200);
      const refreshedCookie = extractCookie(refresh.headers['set-cookie']);
      assert.notEqual(refreshedCookie, cookie);

      const logout = await app.inject({ method: 'POST', url: '/api/auth/merchant/logout', headers: { cookie: refreshedCookie, 'x-portal-client': 'web' } });
      assert.equal(logout.statusCode, 200);
      assert.match(extractCookie(logout.headers['set-cookie']), /^driverapp_merchant_session=/);
    }

    {
      const login = await app.inject({
        method: 'POST',
        url: '/api/auth/restaurant/login',
        headers: { 'x-portal-client': 'web' },
        payload: { email: 'falafel.dispatch@demo.com', password: 'Password123' },
      });
      assert.equal(login.statusCode, 200);
      assert.equal(Object.prototype.hasOwnProperty.call(JSON.parse(login.body), 'token'), false);
      const cookie = extractCookie(login.headers['set-cookie']);

      const streamTicket = await app.inject({ method: 'POST', url: '/api/auth/restaurant/stream-ticket', headers: { cookie } });
      assert.equal(streamTicket.statusCode, 200);

      const logout = await app.inject({ method: 'POST', url: '/api/auth/restaurant/logout', headers: { cookie, 'x-portal-client': 'web' } });
      assert.equal(logout.statusCode, 200);
    }

    {
      const login = await app.inject({
        method: 'POST',
        url: '/api/auth/admin/login',
        headers: { 'x-portal-client': 'web' },
        payload: { email: 'admin@demo.com', password: 'Password123' },
      });
      assert.equal(login.statusCode, 200);
      assert.equal(Object.prototype.hasOwnProperty.call(JSON.parse(login.body), 'token'), false);
      const cookie = extractCookie(login.headers['set-cookie']);

      const session = await app.inject({ method: 'GET', url: '/api/auth/admin/session', headers: { cookie } });
      assert.equal(session.statusCode, 200);

      const pricingUpdate = await app.inject({
        method: 'PATCH',
        url: '/api/admin/restaurants/restaurant-001/pricing',
        headers: { cookie },
        payload: { driverRatePerOrder: 8.25, restaurantChargePerOrder: 15.5 },
      });
      assert.equal(pricingUpdate.statusCode, 200);

      const dispatchUpdate = await app.inject({
        method: 'PATCH',
        url: '/api/admin/drivers/driver-001/dispatch-policy',
        headers: { cookie },
        payload: { mode: 'allowListOnly', restaurantIds: ['restaurant-001'], merchantIds: [] },
      });
      assert.equal(dispatchUpdate.statusCode, 200);

      const capacityUpdate = await app.inject({
        method: 'PATCH',
        url: '/api/admin/drivers/driver-001/capacity',
        headers: { cookie },
        payload: { maxActiveOrders: 2 },
      });
      assert.equal(capacityUpdate.statusCode, 200);

      const trackingUpdate = await app.inject({
        method: 'PATCH',
        url: '/api/admin/restaurants/restaurant-001/tracking-settings',
        headers: { cookie },
        payload: { showPickedUpAsInTransit: true, showDriverEtaToPickup: true, showDestinationEta: true },
      });
      assert.equal(trackingUpdate.statusCode, 200);

      const logout = await app.inject({ method: 'POST', url: '/api/auth/admin/logout', headers: { cookie, 'x-portal-client': 'web' } });
      assert.equal(logout.statusCode, 200);
    }

    {
      const login = await app.inject({
        method: 'POST',
        url: '/api/auth/merchant/login',
        payload: { email: 'falafel.group@demo.com', password: 'Password123' },
      });
      assert.equal(login.statusCode, 200);
      assert.ok(JSON.parse(login.body).token);
      assert.equal(login.headers['set-cookie'], undefined);
    }
  } finally {
    await app.close();
  }
}
