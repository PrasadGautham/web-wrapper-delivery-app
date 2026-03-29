import { FastifyInstance, FastifyRequest } from 'fastify';

import { DriverOfferDistanceMode, RestaurantStaffRole } from '../domain/models.js';
import { BackendService } from '../services/backend-service.js';
import { assertValidReportDateRange, toCsv } from '../utils/reporting.js';
import { RestaurantRealtimeService } from '../services/restaurant-realtime-service.js';
import {
  AuthTransport,
  clearWebSessionCookie,
  isWebPortalRequest,
  resolveAuthSession,
  setWebSessionCookie,
} from './session-auth.js';

interface MerchantAuthedRequest extends FastifyRequest {
  merchantId: string;
  authToken: string;
  authTransport: AuthTransport;
}

function isRestaurantStaffRole(value: unknown): value is RestaurantStaffRole {
  return value === 'owner' || value === 'manager' || value === 'dispatcher' || value === 'viewer';
}

function isDriverOfferDistanceMode(value: unknown): value is DriverOfferDistanceMode {
  return value === 'storeToCustomer' || value === 'includeCommuteToStore';
}

function getReportRange(request: FastifyRequest) {
  const query = request.query as { startDate?: string; endDate?: string };
  const range = {
    startDate: query.startDate?.trim() || undefined,
    endDate: query.endDate?.trim() || undefined,
  };
  assertValidReportDateRange(range);
  return range;
}

function buildReportFileName(prefix: string, range: { startDate?: string; endDate?: string }) {
  if (!range.startDate && !range.endDate) {
    return `${prefix}-all-dates.csv`;
  }
  if (range.startDate && range.endDate) {
    return `${prefix}-${range.startDate}-to-${range.endDate}.csv`;
  }
  if (range.startDate) {
    return `${prefix}-from-${range.startDate}.csv`;
  }
  return `${prefix}-until-${range.endDate}.csv`;
}

function describeReportRange(range: { startDate?: string; endDate?: string }) {
  if (!range.startDate && !range.endDate) {
    return 'All available dates';
  }
  if (range.startDate && range.endDate) {
    return `${range.startDate} to ${range.endDate}`;
  }
  if (range.startDate) {
    return `From ${range.startDate}`;
  }
  return `Until ${range.endDate}`;
}


export async function registerMerchantRoutes(
  app: FastifyInstance,
  backendService: BackendService,
  restaurantRealtime: RestaurantRealtimeService,
): Promise<void> {
  app.addHook('preHandler', async (request, reply) => {
    if (
      (!request.url.startsWith('/api/merchant') || request.url.startsWith('/api/merchant/me/stream')) &&
      !request.url.startsWith('/api/auth/merchant/session') &&
      !request.url.startsWith('/api/auth/merchant/logout') &&
      !request.url.startsWith('/api/auth/merchant/refresh') &&
      !request.url.startsWith('/api/auth/merchant/stream-ticket')
    ) {
      return;
    }

    try {
      const session = resolveAuthSession(request, 'merchant');
      const merchant = await backendService.requireMerchantFromToken(session.token);
      (request as MerchantAuthedRequest).merchantId = merchant.id;
      (request as MerchantAuthedRequest).authToken = session.token;
      (request as MerchantAuthedRequest).authTransport = session.transport;
    } catch {
      return reply.status(401).send({ message: 'Unauthorized' });
    }
  });

  app.post('/api/auth/merchant/login', async (request, reply) => {
    const body = request.body as { email?: string; password?: string };
    if (!body.email || !body.password) {
      return reply.status(400).send({ message: 'Email and password are required.' });
    }

    try {
      const result = await backendService.loginMerchant(body.email, body.password);
      if (isWebPortalRequest(request)) {
        setWebSessionCookie(reply, 'merchant', result.token);
        return { merchant: result.merchant, sessionTransport: 'cookie' };
      }
      return result;
    } catch (error) {
      return reply.status(401).send({ message: (error as Error).message });
    }
  });

  app.get('/api/auth/merchant/session', async (request) => {
    const authedRequest = request as MerchantAuthedRequest;
    return backendService.getMerchantProfile(authedRequest.merchantId);
  });

  app.post('/api/auth/merchant/refresh', async (request, reply) => {
    const authedRequest = request as MerchantAuthedRequest;
    try {
      const refreshed = await backendService.refreshSession(authedRequest.authToken, 'merchant');
      if (authedRequest.authTransport === 'cookie' || isWebPortalRequest(request)) {
        setWebSessionCookie(reply, 'merchant', refreshed.token);
        return { sessionTransport: 'cookie' };
      }
      return refreshed;
    } catch (error) {
      return reply.status(401).send({ message: (error as Error).message || 'Unauthorized' });
    }
  });

  app.post('/api/auth/merchant/logout', async (request, reply) => {
    const authedRequest = request as MerchantAuthedRequest;
    await backendService.logout(authedRequest.authToken);
    if (authedRequest.authTransport === 'cookie' || isWebPortalRequest(request)) {
      clearWebSessionCookie(reply, 'merchant');
    }
    return { ok: true };
  });

  app.post('/api/auth/merchant/stream-ticket', async (request, reply) => {
    const authedRequest = request as MerchantAuthedRequest;
    try {
      const restaurants = await backendService.listMerchantRestaurants(authedRequest.merchantId);
      return restaurantRealtime.issueTicket(restaurants.map((item) => item.id));
    } catch (error) {
      return reply.status(401).send({ message: (error as Error).message || 'Unauthorized' });
    }
  });

  app.get('/api/merchant/me/stream', async (request, reply) => {
    const query = request.query as { ticket?: string };
    if (!query.ticket) {
      return reply.status(400).send({ message: 'ticket is required.' });
    }
    const scope = restaurantRealtime.resolveTicket(query.ticket);
    if (!scope || scope.restaurantIds.length === 0) {
      return reply.status(401).send({ message: 'Invalid or expired stream ticket.' });
    }

    reply.raw.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    });
    reply.raw.write(`event: ready\ndata: ${JSON.stringify({ restaurantIds: scope.restaurantIds, at: new Date().toISOString() })}\n\n`);

    const keepAlive = setInterval(() => {
      reply.raw.write(`event: ping\ndata: ${JSON.stringify({ at: new Date().toISOString() })}\n\n`);
    }, 15000);

    const unsubscribe = restaurantRealtime.subscribeMany(scope.restaurantIds, (event) => {
      reply.raw.write(`event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`);
    });

    request.raw.on('close', () => {
      clearInterval(keepAlive);
      unsubscribe();
      reply.raw.end();
    });

    return reply;
  });

  app.get('/api/merchant/me/profile', async (request) => {
    const authedRequest = request as MerchantAuthedRequest;
    return backendService.getMerchantProfile(authedRequest.merchantId);
  });

  app.get('/api/merchant/me/restaurants', async (request) => {
    const authedRequest = request as MerchantAuthedRequest;
    return backendService.listMerchantRestaurants(authedRequest.merchantId);
  });

  app.get('/api/merchant/me/orders', async (request, reply) => {
    const authedRequest = request as MerchantAuthedRequest;
    try {
      const range = getReportRange(request);
      return backendService.getMerchantOrders(authedRequest.merchantId, range);
    } catch (error) {
      return reply.status(400).send({ message: (error as Error).message });
    }
  });

  app.get('/api/merchant/me/report', async (request, reply) => {
    const authedRequest = request as MerchantAuthedRequest;
    try {
      const range = getReportRange(request);
      return backendService.getMerchantReport(authedRequest.merchantId, range);
    } catch (error) {
      return reply.status(400).send({ message: (error as Error).message });
    }
  });

  app.get('/api/merchant/me/report-export.csv', async (request, reply) => {
    const authedRequest = request as MerchantAuthedRequest;
    try {
      const range = getReportRange(request);
      const groups = await backendService.getMerchantOrders(authedRequest.merchantId, range);
      const rows = [
        ['Report Scope', 'Merchant-wide across all associated stores'],
        ['Report Period', describeReportRange(range)],
        [],
        [
        'Store',
        'Order ID',
        'Created At',
        'Delivered At',
        'Customer',
        'Destination Address',
        'Delivery Area',
        'Status',
        'Assigned Courier',
        'Store Charge',
        'Currency',
        'Driver Offer Distance',
        'Distance Unit',
      ]];
      for (const group of groups) {
        for (const order of group.orders) {
          rows.push([
            group.restaurant.name,
            order.id,
            order.createdAt,
            order.deliveredAt || '',
            order.customer.name,
            order.customer.address,
            order.deliveryArea,
            order.tracking.displayStatus,
            order.tracking.assignedDriverName || '',
            String(order.companyCharge),
            order.displayCurrency || group.restaurant.currency,
            String(order.driverDisplayDistanceKm),
            order.driverDisplayDistanceUnit || group.restaurant.distanceUnit,
          ]);
        }
      }
      reply.header('Content-Type', 'text/csv; charset=utf-8');
      const fileName = buildReportFileName('merchant-orders-report', range);
      reply.header('Content-Disposition', `attachment; filename="${fileName}"`);
      return toCsv(rows);
    } catch (error) {
      return reply.status(400).send({ message: (error as Error).message });
    }
  });

  app.get('/api/merchant/me/restaurants/:restaurantId/staff-users', async (request) => {
    const authedRequest = request as MerchantAuthedRequest;
    const merchant = await backendService.requireMerchantFromToken(authedRequest.authToken);
    const params = request.params as { restaurantId: string };
    return backendService.listMerchantRestaurantStaffUsers(merchant, params.restaurantId);
  });

  app.post('/api/merchant/me/restaurants/:restaurantId/staff-users', async (request, reply) => {
    const authedRequest = request as MerchantAuthedRequest;
    const merchant = await backendService.requireMerchantFromToken(authedRequest.authToken);
    const params = request.params as { restaurantId: string };
    const body = request.body as { name?: string; email?: string; password?: string; role?: RestaurantStaffRole };
    if (!body.name || !body.email || !body.password || !isRestaurantStaffRole(body.role)) {
      return reply.status(400).send({ message: 'name, email, password, and a valid role are required.' });
    }
    try {
      return await backendService.createMerchantRestaurantStaffUser(merchant, params.restaurantId, {
        name: body.name,
        email: body.email,
        password: body.password,
        role: body.role,
      });
    } catch (error) {
      return reply.status(400).send({ message: (error as Error).message });
    }
  });

  app.patch('/api/merchant/me/restaurants/:restaurantId/driver-offer-settings', async (request, reply) => {
    const authedRequest = request as MerchantAuthedRequest;
    const merchant = await backendService.requireMerchantFromToken(authedRequest.authToken);
    const params = request.params as { restaurantId: string };
    const body = request.body as { distanceMode?: DriverOfferDistanceMode };
    if (!isDriverOfferDistanceMode(body.distanceMode)) {
      return reply.status(400).send({ message: 'distanceMode must be storeToCustomer or includeCommuteToStore.' });
    }
    try {
      const updated = await backendService.updateMerchantRestaurantDriverOfferSettings(merchant, params.restaurantId, {
        distanceMode: body.distanceMode,
      });
      restaurantRealtime.publishRestaurantUpdated(params.restaurantId);
      return updated;
    } catch (error) {
      return reply.status(400).send({ message: (error as Error).message });
    }
  });

  app.patch('/api/merchant/me/restaurants/:restaurantId/tracking-settings', async (request, reply) => {
    const authedRequest = request as MerchantAuthedRequest;
    const merchant = await backendService.requireMerchantFromToken(authedRequest.authToken);
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
      const updated = await backendService.updateMerchantRestaurantTrackingSettings(merchant, params.restaurantId, {
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

  app.patch('/api/merchant/me/restaurants/:restaurantId/staff-users/:staffUserId', async (request, reply) => {
    const authedRequest = request as MerchantAuthedRequest;
    const merchant = await backendService.requireMerchantFromToken(authedRequest.authToken);
    const params = request.params as { restaurantId: string; staffUserId: string };
    const body = request.body as { name?: string; password?: string; role?: RestaurantStaffRole; isActive?: boolean };
    if (body.role != null && !isRestaurantStaffRole(body.role)) {
      return reply.status(400).send({ message: 'Invalid restaurant staff role.' });
    }
    try {
      return await backendService.updateMerchantRestaurantStaffUser(merchant, params.restaurantId, params.staffUserId, body);
    } catch (error) {
      return reply.status(400).send({ message: (error as Error).message });
    }
  });
}

