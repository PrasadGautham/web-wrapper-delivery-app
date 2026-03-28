import { FastifyInstance, FastifyRequest } from 'fastify';

import { BackendService } from '../services/backend-service.js';
import { RestaurantRealtimeService } from '../services/restaurant-realtime-service.js';

interface RestaurantAuthedRequest extends FastifyRequest {
  restaurantId: string;
  authToken: string;
}

function getBearerToken(request: FastifyRequest): string {
  const header = request.headers.authorization;
  if (!header?.startsWith('Bearer ')) {
    throw new Error('Unauthorized');
  }
  return header.slice('Bearer '.length);
}

export async function registerRestaurantRoutes(
  app: FastifyInstance,
  backendService: BackendService,
  restaurantRealtime: RestaurantRealtimeService,
): Promise<void> {
  app.addHook('preHandler', async (request, reply) => {
    if (
      (!request.url.startsWith('/api/restaurants') || request.url.startsWith('/api/restaurants/me/stream')) &&
      !request.url.startsWith('/api/auth/restaurant/session') &&
      !request.url.startsWith('/api/auth/restaurant/logout') &&
      !request.url.startsWith('/api/auth/restaurant/refresh') &&
      !request.url.startsWith('/api/auth/restaurant/stream-ticket')
    ) {
      return;
    }

    try {
      const token = getBearerToken(request);
      const restaurant = await backendService.requireRestaurantFromToken(token);
      (request as RestaurantAuthedRequest).restaurantId = restaurant.id;
      (request as RestaurantAuthedRequest).authToken = token;
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
      return reply.send(result);
    } catch (error) {
      return reply.status(401).send({ message: (error as Error).message });
    }
  });

  app.get('/api/auth/restaurant/session', async (request) => {
    const authedRequest = request as RestaurantAuthedRequest;
    return backendService.getRestaurantProfile(authedRequest.restaurantId);
  });

  app.post('/api/auth/restaurant/refresh', async (request, reply) => {
    const authedRequest = request as RestaurantAuthedRequest;
    try {
      return await backendService.refreshSession(authedRequest.authToken, 'restaurant');
    } catch (error) {
      return reply.status(401).send({ message: (error as Error).message || 'Unauthorized' });
    }
  });

  app.post('/api/auth/restaurant/logout', async (request) => {
    const authedRequest = request as RestaurantAuthedRequest;
    await backendService.logout(authedRequest.authToken);
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

  app.get('/api/restaurants/me/orders', async (request) => {
    const authedRequest = request as RestaurantAuthedRequest;
    return backendService.getRestaurantOrders(authedRequest.restaurantId);
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

  app.get('/api/restaurants/me/report', async (request) => {
    const authedRequest = request as RestaurantAuthedRequest;
    return backendService.getRestaurantReport(authedRequest.restaurantId);
  });
}

