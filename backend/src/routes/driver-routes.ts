import { FastifyInstance, FastifyRequest } from 'fastify';

import { BackendService } from '../services/backend-service.js';

interface AuthedRequest extends FastifyRequest {
  driverId: string;
  authToken: string;
}

function getBearerToken(request: FastifyRequest): string {
  const header = request.headers.authorization;
  if (!header?.startsWith('Bearer ')) {
    throw new Error('Unauthorized');
  }
  return header.slice('Bearer '.length);
}

export async function registerDriverRoutes(
  app: FastifyInstance,
  backendService: BackendService,
): Promise<void> {
  app.addHook('preHandler', async (request, reply) => {
    if (
      !request.url.startsWith('/api/driver') &&
      !request.url.startsWith('/api/auth/driver/session') &&
      !request.url.startsWith('/api/auth/driver/logout') &&
      !request.url.startsWith('/api/auth/driver/refresh')
    ) {
      return;
    }

    try {
      const token = getBearerToken(request);
      const driver = await backendService.requireDriverFromToken(token);
      (request as AuthedRequest).driverId = driver.id;
      (request as AuthedRequest).authToken = token;
    } catch {
      return reply.status(401).send({ message: 'Unauthorized' });
    }
  });

  app.post('/api/auth/driver/login', async (request, reply) => {
    const body = request.body as { email?: string; password?: string };
    if (!body.email || !body.password) {
      return reply.status(400).send({ message: 'Email and password are required.' });
    }

    try {
      const result = await backendService.loginDriver(body.email, body.password);
      return reply.send(result);
    } catch (error) {
      return reply.status(401).send({ message: (error as Error).message });
    }
  });

  app.post('/api/auth/password-reset/request', async (request, reply) => {
    const body = request.body as { userType?: 'driver' | 'restaurant' | 'merchant' | 'admin'; email?: string };
    if ((body.userType !== 'driver' && body.userType !== 'restaurant' && body.userType !== 'merchant' && body.userType !== 'admin') || !body.email) {
      return reply.status(400).send({ message: 'userType and email are required.' });
    }
    return backendService.requestPasswordReset(body.userType, body.email);
  });

  app.post('/api/auth/password-reset/confirm', async (request, reply) => {
    const body = request.body as { userType?: 'driver' | 'restaurant' | 'merchant' | 'admin'; token?: string; newPassword?: string };
    if ((body.userType !== 'driver' && body.userType !== 'restaurant' && body.userType !== 'merchant' && body.userType !== 'admin') || !body.token || !body.newPassword) {
      return reply.status(400).send({ message: 'userType, token, and newPassword are required.' });
    }
    try {
      return await backendService.confirmPasswordReset(body.userType, body.token, body.newPassword);
    } catch (error) {
      return reply.status(400).send({ message: (error as Error).message });
    }
  });

  app.get('/api/auth/driver/session', async (request) => {
    const authedRequest = request as AuthedRequest;
    return backendService.getDriverProfile(authedRequest.driverId);
  });

  app.post('/api/auth/driver/refresh', async (request, reply) => {
    const authedRequest = request as AuthedRequest;
    try {
      return await backendService.refreshSession(authedRequest.authToken, 'driver');
    } catch (error) {
      return reply.status(401).send({ message: (error as Error).message || 'Unauthorized' });
    }
  });

  app.post('/api/auth/driver/logout', async (request) => {
    const authedRequest = request as AuthedRequest;
    await backendService.logout(authedRequest.authToken);
    return { ok: true };
  });

  app.post('/api/driver/devices/token', async (request, reply) => {
    const authedRequest = request as AuthedRequest;
    const body = request.body as { token?: string };
    if (!body.token) {
      return reply.status(400).send({ message: 'Device token is required.' });
    }

    await backendService.registerDriverDeviceToken(authedRequest.driverId, body.token);
    return { ok: true };
  });

  app.post('/api/driver/location', async (request, reply) => {
    const authedRequest = request as AuthedRequest;
    const body = request.body as {
      latitude?: number;
      longitude?: number;
      accuracyMeters?: number | null;
      speedMetersPerSecond?: number | null;
      headingDegrees?: number | null;
      capturedAt?: string;
    };

    if (
      typeof body.latitude !== 'number' ||
      typeof body.longitude !== 'number' ||
      !body.capturedAt
    ) {
      return reply.status(400).send({ message: 'latitude, longitude, and capturedAt are required.' });
    }

    return backendService.updateDriverLocation(authedRequest.driverId, {
      latitude: body.latitude,
      longitude: body.longitude,
      accuracyMeters: typeof body.accuracyMeters === 'number' ? body.accuracyMeters : null,
      speedMetersPerSecond:
        typeof body.speedMetersPerSecond === 'number' ? body.speedMetersPerSecond : null,
      headingDegrees: typeof body.headingDegrees === 'number' ? body.headingDegrees : null,
      capturedAt: body.capturedAt,
    });
  });

  app.get('/api/driver/profile', async (request) => {
    const authedRequest = request as AuthedRequest;
    return backendService.getDriverProfile(authedRequest.driverId);
  });

  app.patch('/api/driver/availability', async (request, reply) => {
    const authedRequest = request as AuthedRequest;
    const body = request.body as { isOnline?: boolean };
    if (typeof body.isOnline !== 'boolean') {
      return reply.status(400).send({ message: 'isOnline must be a boolean.' });
    }

    return backendService.updateDriverAvailability(authedRequest.driverId, body.isOnline);
  });

  app.get('/api/driver/orders/incoming', async (request) => {
    const authedRequest = request as AuthedRequest;
    return backendService.getIncomingOrder(authedRequest.driverId);
  });

  app.get('/api/driver/orders/active', async (request) => {
    const authedRequest = request as AuthedRequest;
    return backendService.getActiveOrder(authedRequest.driverId);
  });

  app.post('/api/driver/orders/:orderId/accept', async (request) => {
    const authedRequest = request as AuthedRequest;
    const params = request.params as { orderId: string };
    return backendService.acceptOrder(authedRequest.driverId, params.orderId);
  });

  app.post('/api/driver/orders/:orderId/reject', async (request) => {
    const authedRequest = request as AuthedRequest;
    const params = request.params as { orderId: string };
    await backendService.rejectOrder(authedRequest.driverId, params.orderId);
    return { ok: true };
  });

  app.post('/api/driver/orders/:orderId/arrived', async (request) => {
    const authedRequest = request as AuthedRequest;
    const params = request.params as { orderId: string };
    return backendService.markArrived(authedRequest.driverId, params.orderId);
  });

  app.post('/api/driver/orders/:orderId/pickup', async (request) => {
    const authedRequest = request as AuthedRequest;
    const params = request.params as { orderId: string };
    return backendService.pickupOrder(authedRequest.driverId, params.orderId);
  });

  app.post('/api/driver/orders/:orderId/deliver', async (request) => {
    const authedRequest = request as AuthedRequest;
    const params = request.params as { orderId: string };
    return backendService.completeOrder(authedRequest.driverId, params.orderId);
  });

  app.get('/api/driver/earnings', async (request) => {
    const authedRequest = request as AuthedRequest;
    return backendService.getDriverEarnings(authedRequest.driverId);
  });
}

