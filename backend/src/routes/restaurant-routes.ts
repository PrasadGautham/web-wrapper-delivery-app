import { FastifyInstance, FastifyRequest } from 'fastify';

import { BackendService } from '../services/backend-service.js';
import { RestaurantRealtimeService } from '../services/restaurant-realtime-service.js';
import { assertValidReportDateRange, toCsv } from '../utils/reporting.js';
import { formatDateTimeInTimeZone } from '../utils/timezones.js';
import {
  AuthTransport,
  clearWebSessionCookie,
  isWebPortalRequest,
  resolveAuthSession,
  setWebSessionCookie,
} from './session-auth.js';

interface RestaurantAuthedRequest extends FastifyRequest {
  restaurantId: string;
  authToken: string;
  authTransport: AuthTransport;
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

export async function registerRestaurantRoutes(
  app: FastifyInstance,
  backendService: BackendService,
  restaurantRealtime: RestaurantRealtimeService,
): Promise<void> {
  app.addHook('preHandler', async (request, reply) => {
    const isRestaurantSessionRoute = request.url.startsWith('/api/auth/restaurant/session');
    if (
      (!request.url.startsWith('/api/restaurants') || request.url.startsWith('/api/restaurants/me/stream')) &&
      !isRestaurantSessionRoute &&
      !request.url.startsWith('/api/auth/restaurant/logout') &&
      !request.url.startsWith('/api/auth/restaurant/refresh') &&
      !request.url.startsWith('/api/auth/restaurant/stream-ticket')
    ) {
      return;
    }

    if (isRestaurantSessionRoute) {
      return;
    }

    try {
      const session = resolveAuthSession(request, 'restaurant');
      const restaurant = await backendService.requireRestaurantFromToken(session.token);
      (request as RestaurantAuthedRequest).restaurantId = restaurant.id;
      (request as RestaurantAuthedRequest).authToken = session.token;
      (request as RestaurantAuthedRequest).authTransport = session.transport;
    } catch {
      return reply.status(401).send({ message: 'Unauthorized' });
    }
  });

  app.post('/api/auth/restaurant/login', async (request, reply) => {
    const body = request.body as { email?: string; password?: string };
    if (!body.email || !body.password) {
      return reply.status(400).send({ message: 'Email and password are required.' });
    }

    try {
      const result = await backendService.loginRestaurant(body.email, body.password);
      if (isWebPortalRequest(request)) {
        setWebSessionCookie(reply, 'restaurant', result.token);
        return { restaurant: result.restaurant, sessionTransport: 'cookie' };
      }
      return reply.send(result);
    } catch (error) {
      return reply.status(401).send({ message: (error as Error).message });
    }
  });

  app.get('/api/auth/restaurant/session', async (request) => {
    try {
      const session = resolveAuthSession(request, 'restaurant');
      const restaurant = await backendService.requireRestaurantFromToken(session.token);
      return { authenticated: true, ...(await backendService.getRestaurantProfile(restaurant.id)) };
    } catch {
      return { authenticated: false };
    }
  });

  app.post('/api/auth/restaurant/refresh', async (request, reply) => {
    const authedRequest = request as RestaurantAuthedRequest;
    try {
      const refreshed = await backendService.refreshSession(authedRequest.authToken, 'restaurant');
      if (authedRequest.authTransport === 'cookie' || isWebPortalRequest(request)) {
        setWebSessionCookie(reply, 'restaurant', refreshed.token);
        return { sessionTransport: 'cookie' };
      }
      return refreshed;
    } catch (error) {
      return reply.status(401).send({ message: (error as Error).message || 'Unauthorized' });
    }
  });

  app.post('/api/auth/restaurant/logout', async (request, reply) => {
    const authedRequest = request as RestaurantAuthedRequest;
    await backendService.logout(authedRequest.authToken);
    if (authedRequest.authTransport === 'cookie' || isWebPortalRequest(request)) {
      clearWebSessionCookie(reply, 'restaurant');
    }
    return { ok: true };
  });

  app.post('/api/auth/restaurant/stream-ticket', async (request, reply) => {
    const authedRequest = request as RestaurantAuthedRequest;
    try {
      return restaurantRealtime.issueTicket(authedRequest.restaurantId);
    } catch (error) {
      return reply.status(401).send({ message: (error as Error).message || 'Unauthorized' });
    }
  });

  app.get('/api/restaurants/me/stream', async (request, reply) => {
    const query = request.query as { ticket?: string };
    if (!query.ticket) {
      return reply.status(400).send({ message: 'ticket is required.' });
    }
    const scope = restaurantRealtime.resolveTicket(query.ticket);
    if (!scope || scope.restaurantIds.length !== 1) {
      return reply.status(401).send({ message: 'Invalid or expired stream ticket.' });
    }

    const restaurantId = scope.restaurantIds[0];
    reply.raw.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    });
    reply.raw.write(`event: ready\ndata: ${JSON.stringify({ restaurantId, at: new Date().toISOString() })}\n\n`);

    const keepAlive = setInterval(() => {
      reply.raw.write(`event: ping\ndata: ${JSON.stringify({ at: new Date().toISOString() })}\n\n`);
    }, 15000);

    const unsubscribe = restaurantRealtime.subscribe(restaurantId, (event) => {
      reply.raw.write(`event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`);
    });

    request.raw.on('close', () => {
      clearInterval(keepAlive);
      unsubscribe();
      reply.raw.end();
    });

    return reply;
  });

  app.get('/api/restaurants/me/profile', async (request) => {
    const authedRequest = request as RestaurantAuthedRequest;
    return backendService.getRestaurantProfile(authedRequest.restaurantId);
  });

  app.get('/api/restaurants/me/orders', async (request, reply) => {
    const authedRequest = request as RestaurantAuthedRequest;
    try {
      const range = getReportRange(request);
      return backendService.getRestaurantOrders(authedRequest.restaurantId, range);
    } catch (error) {
      return reply.status(400).send({ message: (error as Error).message });
    }
  });

  app.post('/api/restaurants/me/orders', async (request, reply) => {
    const authedRequest = request as RestaurantAuthedRequest;
    const body = request.body as {
      customerName?: string;
      customerAddress?: string;
      customerLatitude?: number;
      customerLongitude?: number;
      deliveryArea?: string;
    };

    if (
      !body.customerName ||
      !body.customerAddress ||
      typeof body.customerLatitude !== 'number' ||
      typeof body.customerLongitude !== 'number' ||
      !body.deliveryArea
    ) {
      return reply.status(400).send({ message: 'Missing order fields.' });
    }

    return backendService.createRestaurantOrder(authedRequest.restaurantId, {
      customerName: body.customerName,
      customerAddress: body.customerAddress,
      customerLatitude: body.customerLatitude,
      customerLongitude: body.customerLongitude,
      deliveryArea: body.deliveryArea,
    });
  });

  app.get('/api/restaurants/me/report', async (request, reply) => {
    const authedRequest = request as RestaurantAuthedRequest;
    try {
      const range = getReportRange(request);
      return backendService.getRestaurantReport(authedRequest.restaurantId, range);
    } catch (error) {
      return reply.status(400).send({ message: (error as Error).message });
    }
  });

  app.get('/api/restaurants/me/report-export.csv', async (request, reply) => {
    const authedRequest = request as RestaurantAuthedRequest;
    try {
      const range = getReportRange(request);
      const [profile, orders] = await Promise.all([
        backendService.getRestaurantProfile(authedRequest.restaurantId),
        backendService.getRestaurantOrders(authedRequest.restaurantId, range),
      ]);
      const rows = [
        ['Report Scope', `Store-only for ${profile.name}`],
        ['Report Period', describeReportRange(range)],
        [],
        [
        'Trip ID',
        'Trip Size',
        'Batched Trip',
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
        'ETA Source',
      ]];
      for (const order of orders) {
        rows.push([
          order.tripId || '',
          String(order.tripOrderCount || 1),
          order.isBatchedTrip ? 'Yes' : 'No',
          order.id,
          formatDateTimeInTimeZone(order.createdAt, profile.timeZone),
          order.deliveredAt ? formatDateTimeInTimeZone(order.deliveredAt, profile.timeZone) : '',
          order.customer.name,
          order.customer.address,
          order.deliveryArea,
          order.tracking.displayStatus,
          order.tracking.assignedDriverName || '',
          String(order.companyCharge),
          order.displayCurrency || profile.currency,
          order.tracking.etaSource || '',
        ]);
      }
      reply.header('Content-Type', 'text/csv; charset=utf-8');
      const fileName = buildReportFileName('restaurant-orders-report', range);
      reply.header('Content-Disposition', `attachment; filename="${fileName}"`);
      return toCsv(rows);
    } catch (error) {
      return reply.status(400).send({ message: (error as Error).message });
    }
  });
}

