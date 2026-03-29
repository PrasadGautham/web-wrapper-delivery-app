import { FastifyInstance, FastifyRequest } from 'fastify';

import { AdminRole, DistancePricingRule, DistanceUnit, DriverDispatchMode, DriverOfferDistanceMode, MerchantUserRole, RestaurantStaffRole } from '../domain/models.js';
import { assertValidPricingRule, normalizePricingRule } from '../services/pricing-rules.js';
import { BackendService } from '../services/backend-service.js';
import { RestaurantRealtimeService } from '../services/restaurant-realtime-service.js';
import { assertValidReportDateRange, toCsv } from '../utils/reporting.js';
import {
  AuthTransport,
  clearWebSessionCookie,
  isWebPortalRequest,
  resolveAuthSession,
  setWebSessionCookie,
} from './session-auth.js';

interface AdminAuthedRequest extends FastifyRequest {
  adminUserId?: string;
  adminTenantId?: string | null;
  adminRole?: AdminRole;
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

function isAdminRole(value: unknown): value is AdminRole {
  return value === 'platformAdmin' || value === 'opsAdmin' || value === 'supportAdmin' || value === 'billingAdmin' || value === 'tenantAdmin' || value === 'tenantOps' || value === 'tenantSupport';
}

function isPlatformAdminUser(request: AdminAuthedRequest): boolean {
  return request.adminRole === 'platformAdmin' || request.adminRole === 'opsAdmin' || request.adminRole === 'supportAdmin' || request.adminRole === 'billingAdmin';
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

async function ensureScopedMerchant(backendService: BackendService, adminRequest: AdminAuthedRequest, merchantId: string): Promise<void> {
  const merchants = await backendService.listMerchants({ tenantId: adminRequest.adminTenantId ?? null, role: adminRequest.adminRole as AdminRole });
  if (!merchants.some((merchant) => merchant.id === merchantId)) {
    throw new Error('Merchant not found for admin scope.');
  }
}

async function ensureScopedRestaurant(backendService: BackendService, adminRequest: AdminAuthedRequest, restaurantId: string): Promise<void> {
  const restaurants = await backendService.listRestaurants({ tenantId: adminRequest.adminTenantId ?? null, role: adminRequest.adminRole as AdminRole });
  if (!restaurants.some((restaurant) => restaurant.id === restaurantId)) {
    throw new Error('Restaurant not found for admin scope.');
  }
}

async function ensureScopedDriver(backendService: BackendService, adminRequest: AdminAuthedRequest, driverId: string): Promise<void> {
  const drivers = await backendService.listDrivers({ tenantId: adminRequest.adminTenantId ?? null, role: adminRequest.adminRole as AdminRole });
  if (!drivers.some((driver) => driver.id === driverId)) {
    throw new Error('Driver not found for admin scope.');
  }
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

function buildReportFileName(prefix: string, type: string, range: { startDate?: string; endDate?: string }) {
  if (!range.startDate && !range.endDate) {
    return `${prefix}-${type}-all-dates.csv`;
  }
  if (range.startDate && range.endDate) {
    return `${prefix}-${type}-${range.startDate}-to-${range.endDate}.csv`;
  }
  if (range.startDate) {
    return `${prefix}-${type}-from-${range.startDate}.csv`;
  }
  return `${prefix}-${type}-until-${range.endDate}.csv`;
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

function normalizeAdminReportType(value: unknown) {
  const normalized = String(value || 'orders').trim();
  const valid = new Set(['orders', 'drivers', 'stores', 'merchant-groups', 'tenants', 'days']);
  return valid.has(normalized) ? normalized : 'orders';
}

export async function registerAdminRoutes(
  app: FastifyInstance,
  backendService: BackendService,
  restaurantRealtime: RestaurantRealtimeService,
): Promise<void> {
  app.addHook('preHandler', async (request, reply) => {
    const isAdminSessionRoute = request.url.startsWith('/api/auth/admin/session');
    const isProtectedAdminAuthRoute =
      request.url.startsWith('/api/auth/admin/logout') ||
      request.url.startsWith('/api/auth/admin/refresh');

    if (!request.url.startsWith('/api/admin') && !isAdminSessionRoute && !isProtectedAdminAuthRoute) {
      return;
    }

    if (isAdminSessionRoute) {
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
      (request as AdminAuthedRequest).adminTenantId = adminUser.tenantId ?? null;
      (request as AdminAuthedRequest).adminRole = adminUser.role;
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
    try {
      const session = resolveAuthSession(request, 'admin');
      const adminUser = await backendService.requireAdminFromToken(session.token);
      return {
        authenticated: true,
        id: adminUser.id,
        name: adminUser.name,
        email: adminUser.email,
        role: adminUser.role,
        tenantId: adminUser.tenantId ?? null,
        isActive: adminUser.isActive,
        lastLoginAt: adminUser.lastLoginAt,
      };
    } catch {
      return { authenticated: false };
    }
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

  app.get('/api/admin/tenants', async (request) => {
    const adminRequest = request as AdminAuthedRequest;
    return backendService.listTenants({ tenantId: adminRequest.adminTenantId ?? null, role: adminRequest.adminRole as AdminRole });
  });
  app.get('/api/admin/merchants', async (request) => {
    const adminRequest = request as AdminAuthedRequest;
    return backendService.listMerchants({ tenantId: adminRequest.adminTenantId ?? null, role: adminRequest.adminRole as AdminRole });
  });
  app.get('/api/admin/merchants/:merchantId/users', async (request) => {
    const adminRequest = request as AdminAuthedRequest;
    const params = request.params as { merchantId: string };
    await ensureScopedMerchant(backendService, adminRequest, params.merchantId);
    return backendService.listMerchantUsers(params.merchantId);
  });
  app.get('/api/admin/restaurants', async (request) => {
    const adminRequest = request as AdminAuthedRequest;
    return backendService.listRestaurants({ tenantId: adminRequest.adminTenantId ?? null, role: adminRequest.adminRole as AdminRole });
  });
  app.get('/api/admin/drivers', async (request) => {
    const adminRequest = request as AdminAuthedRequest;
    return backendService.listDrivers({ tenantId: adminRequest.adminTenantId ?? null, role: adminRequest.adminRole as AdminRole });
  });
  app.get('/api/admin/admin-users', async (request) => {
    const adminRequest = request as AdminAuthedRequest;
    return backendService.listAdminUsers({ tenantId: adminRequest.adminTenantId ?? null, role: adminRequest.adminRole as AdminRole });
  });
  app.get('/api/admin/report', async (request, reply) => {
    const adminRequest = request as AdminAuthedRequest;
    try {
      const range = getReportRange(request);
      const query = request.query as { tenantId?: string };
      return backendService.getAdminOperationsReport({ tenantId: adminRequest.adminTenantId ?? null, role: adminRequest.adminRole as AdminRole }, range, query.tenantId?.trim() || undefined);
    } catch (error) {
      return reply.status(400).send({ message: (error as Error).message });
    }
  });

  app.get('/api/admin/orders', async (request, reply) => {
    const adminRequest = request as AdminAuthedRequest;
    try {
      const range = getReportRange(request);
      const query = request.query as { tenantId?: string };
      return backendService.getAdminOrders({ tenantId: adminRequest.adminTenantId ?? null, role: adminRequest.adminRole as AdminRole }, range, query.tenantId?.trim() || undefined);
    } catch (error) {
      return reply.status(400).send({ message: (error as Error).message });
    }
  });

  app.get('/api/admin/report-export.csv', async (request, reply) => {
    const adminRequest = request as AdminAuthedRequest;
    try {
      const range = getReportRange(request);
      const query = request.query as { tenantId?: string; reportType?: string };
      const reportType = normalizeAdminReportType(query.reportType);
      const scopedTenantId = query.tenantId?.trim() || undefined;
      const [report, orders] = await Promise.all([
        backendService.getAdminOperationsReport({ tenantId: adminRequest.adminTenantId ?? null, role: adminRequest.adminRole as AdminRole }, range, scopedTenantId),
        backendService.getAdminOrders({ tenantId: adminRequest.adminTenantId ?? null, role: adminRequest.adminRole as AdminRole }, range, scopedTenantId),
      ]);
      const rows: string[][] = [
        ['Report Scope', scopedTenantId ? 'Single tenant workspace' : 'Visible admin scope'],
        ['Report Period', describeReportRange(range)],
        [],
      ];

      if (reportType === 'drivers') {
        rows.push(['Driver', 'Total Orders', 'Active Orders', 'Delivered Orders', 'Store Charges', 'Driver Pay']);
        for (const item of report.byDriver) {
          rows.push([item.driverName, String(item.totalOrders), String(item.activeOrders), String(item.deliveredOrders), String(item.totalStoreCharges), String(item.totalDriverPay)]);
        }
      } else if (reportType === 'stores') {
        rows.push(['Store', 'Total Orders', 'Delivered Orders', 'Store Charges', 'Driver Pay']);
        for (const item of report.byStore) {
          rows.push([item.restaurantName, String(item.totalOrders), String(item.deliveredOrders), String(item.totalStoreCharges), String(item.totalDriverPay)]);
        }
      } else if (reportType === 'merchant-groups') {
        rows.push(['Merchant Group', 'Total Orders', 'Delivered Orders', 'Store Charges', 'Driver Pay']);
        for (const item of report.byMerchantGroup) {
          rows.push([item.merchantName, String(item.totalOrders), String(item.deliveredOrders), String(item.totalStoreCharges), String(item.totalDriverPay)]);
        }
      } else if (reportType === 'tenants') {
        rows.push(['Tenant', 'Total Orders', 'Delivered Orders', 'Store Charges', 'Driver Pay']);
        for (const item of report.byTenant) {
          rows.push([item.tenantName, String(item.totalOrders), String(item.deliveredOrders), String(item.totalStoreCharges), String(item.totalDriverPay)]);
        }
      } else if (reportType === 'days') {
        rows.push(['Date', 'Total Orders', 'Delivered Orders', 'Store Charges', 'Driver Pay']);
        for (const item of report.byDay) {
          rows.push([item.date, String(item.totalOrders), String(item.deliveredOrders), String(item.totalStoreCharges), String(item.totalDriverPay)]);
        }
      } else {
        rows.push(['Tenant', 'Merchant Group', 'Store', 'Order ID', 'Created At', 'Delivered At', 'Customer', 'Destination Address', 'Delivery Area', 'Status', 'Assigned Driver', 'Store Charge', 'Driver Pay', 'Currency']);
        for (const order of orders) {
          rows.push([order.tenantName, order.merchantName, order.restaurantName, order.id, order.createdAt, order.deliveredAt || '', order.customerName, order.destinationAddress, order.deliveryArea, order.status, order.assignedDriverName || '', String(order.storeCharge), String(order.driverPay), order.currency]);
        }
      }

      const prefix = isPlatformAdminUser(adminRequest) ? 'platform-admin-report' : 'tenant-admin-report';
      reply.header('Content-Type', 'text/csv; charset=utf-8');
      reply.header('Content-Disposition', `attachment; filename="${buildReportFileName(prefix, reportType, range)}"`);
      return toCsv(rows);
    } catch (error) {
      return reply.status(400).send({ message: (error as Error).message });
    }
  });

  app.get('/api/admin/restaurants/:restaurantId/staff-users', async (request) => {
    const adminRequest = request as AdminAuthedRequest;
    const params = request.params as { restaurantId: string };
    await ensureScopedRestaurant(backendService, adminRequest, params.restaurantId);
    return backendService.listRestaurantStaffUsers(params.restaurantId);
  });

  app.post('/api/admin/tenants', async (request, reply) => {
    const adminRequest = request as AdminAuthedRequest;
    if (!isPlatformAdminUser(adminRequest)) {
      return reply.status(403).send({ message: 'Only platform admins can create tenants.' });
    }
    const body = request.body as { name?: string; slug?: string };
    if (!body.name || !body.slug) {
      return reply.status(400).send({ message: 'name and slug are required.' });
    }
    try {
      return await backendService.createTenant({ name: body.name, slug: body.slug.trim().toLowerCase() });
    } catch (error) {
      return reply.status(400).send({ message: (error as Error).message });
    }
  });

  app.post('/api/admin/tenants/:tenantId/admin-users', async (request, reply) => {
    const adminRequest = request as AdminAuthedRequest;
    if (!isPlatformAdminUser(adminRequest)) {
      return reply.status(403).send({ message: 'Only platform admins can create tenant admin users.' });
    }
    const params = request.params as { tenantId: string };
    const body = request.body as { name?: string; email?: string; password?: string; role?: AdminRole };
    if (!body.name || !body.email || !body.password || (body.role !== 'tenantAdmin' && body.role !== 'tenantOps' && body.role !== 'tenantSupport')) {
      return reply.status(400).send({ message: 'name, email, password, and a tenant admin role are required.' });
    }
    try {
      return await backendService.createTenantAdmin(params.tenantId, { name: body.name, email: body.email, password: body.password, role: body.role });
    } catch (error) {
      return reply.status(400).send({ message: (error as Error).message });
    }
  });

  app.post('/api/admin/admin-users', async (request, reply) => {
    const adminRequest = request as AdminAuthedRequest;
    if (!isPlatformAdminUser(adminRequest)) {
      return reply.status(403).send({ message: 'Only platform admins can create platform admin users.' });
    }
    const body = request.body as { name?: string; email?: string; password?: string; role?: AdminRole };
    if (!body.name || !body.email || !body.password || !isAdminRole(body.role) || body.role.startsWith('tenant')) {
      return reply.status(400).send({ message: 'name, email, password, and a valid platform role are required.' });
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
    const adminRequest = request as AdminAuthedRequest;
    if (!isPlatformAdminUser(adminRequest)) {
      return reply.status(403).send({ message: 'Only platform admins can update platform admin users.' });
    }
    const params = request.params as { adminUserId: string };
    const body = request.body as { name?: string; password?: string; role?: AdminRole; isActive?: boolean };
    if (body.role != null && (!isAdminRole(body.role) || body.role.startsWith('tenant'))) {
      return reply.status(400).send({ message: 'Invalid platform admin role.' });
    }
    try {
      return await backendService.updateAdminUser(params.adminUserId, body);
    } catch (error) {
      return reply.status(400).send({ message: (error as Error).message });
    }
  });

  app.post('/api/admin/merchants', async (request, reply) => {
    const adminRequest = request as AdminAuthedRequest;
    const body = request.body as { tenantId?: string; name?: string };
    if (!body.name) {
      return reply.status(400).send({ message: 'name is required.' });
    }
    try {
      return await backendService.createMerchant({ tenantId: adminRequest.adminTenantId ?? null, role: adminRequest.adminRole as AdminRole }, { tenantId: body.tenantId, name: body.name });
    } catch (error) {
      return reply.status(400).send({ message: (error as Error).message });
    }
  });

  app.post('/api/admin/restaurants', async (request, reply) => {
    const adminRequest = request as AdminAuthedRequest;
    const body = request.body as { tenantId?: string; merchantId?: string; name?: string; email?: string; password?: string; pickupLocation?: { name?: string; address?: string; latitude?: number; longitude?: number }; currency?: string; distanceUnit?: DistanceUnit };
    if (!body.merchantId || !body.name || !body.email || !body.password || !body.pickupLocation?.name || !body.pickupLocation?.address || typeof body.pickupLocation.latitude !== 'number' || typeof body.pickupLocation.longitude !== 'number') {
      return reply.status(400).send({ message: 'merchantId, name, email, password, and a complete pickupLocation are required.' });
    }
    if (body.currency != null && !isCurrencyCode(body.currency)) {
      return reply.status(400).send({ message: 'currency must be a 3-letter ISO code.' });
    }
    if (body.distanceUnit != null && !isDistanceUnit(body.distanceUnit)) {
      return reply.status(400).send({ message: 'distanceUnit must be kilometer or mile.' });
    }
    try {
      return await backendService.createRestaurant({ tenantId: adminRequest.adminTenantId ?? null, role: adminRequest.adminRole as AdminRole }, {
        tenantId: body.tenantId,
        merchantId: body.merchantId,
        name: body.name,
        email: body.email,
        password: body.password,
        pickupLocation: { name: body.pickupLocation.name, address: body.pickupLocation.address, latitude: body.pickupLocation.latitude, longitude: body.pickupLocation.longitude },
        currency: body.currency,
        distanceUnit: body.distanceUnit,
      });
    } catch (error) {
      return reply.status(400).send({ message: (error as Error).message });
    }
  });

  app.post('/api/admin/drivers', async (request, reply) => {
    const adminRequest = request as AdminAuthedRequest;
    const body = request.body as { tenantId?: string; name?: string; email?: string; password?: string };
    if (!body.name || !body.email || !body.password) {
      return reply.status(400).send({ message: 'name, email, and password are required.' });
    }
    try {
      return await backendService.createDriver({ tenantId: adminRequest.adminTenantId ?? null, role: adminRequest.adminRole as AdminRole }, { tenantId: body.tenantId, name: body.name, email: body.email, password: body.password });
    } catch (error) {
      return reply.status(400).send({ message: (error as Error).message });
    }
  });

  app.post('/api/admin/merchants/:merchantId/users', async (request, reply) => {
    const adminRequest = request as AdminAuthedRequest;
    const params = request.params as { merchantId: string };
    const body = request.body as { name?: string; email?: string; password?: string; role?: MerchantUserRole };
    if (!body.name || !body.email || !body.password || !isMerchantUserRole(body.role)) {
      return reply.status(400).send({ message: 'name, email, password, and a valid merchant role are required.' });
    }
    try {
      await ensureScopedMerchant(backendService, adminRequest, params.merchantId);
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
    const adminRequest = request as AdminAuthedRequest;
    const params = request.params as { merchantId: string; merchantUserId: string };
    const body = request.body as { name?: string; password?: string; role?: MerchantUserRole; isActive?: boolean };
    if (body.role != null && !isMerchantUserRole(body.role)) {
      return reply.status(400).send({ message: 'Invalid merchant role.' });
    }
    try {
      await ensureScopedMerchant(backendService, adminRequest, params.merchantId);
      return await backendService.updateMerchantUser(params.merchantId, params.merchantUserId, body);
    } catch (error) {
      return reply.status(400).send({ message: (error as Error).message });
    }
  });

  app.post('/api/admin/restaurants/:restaurantId/staff-users', async (request, reply) => {
    const adminRequest = request as AdminAuthedRequest;
    const params = request.params as { restaurantId: string };
    const body = request.body as { name?: string; email?: string; password?: string; role?: RestaurantStaffRole };
    if (!body.name || !body.email || !body.password || !isRestaurantStaffRole(body.role)) {
      return reply.status(400).send({ message: 'name, email, password, and a valid restaurant role are required.' });
    }
    try {
      await ensureScopedRestaurant(backendService, adminRequest, params.restaurantId);
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
    const adminRequest = request as AdminAuthedRequest;
    const params = request.params as { restaurantId: string; staffUserId: string };
    const body = request.body as { name?: string; password?: string; role?: RestaurantStaffRole; isActive?: boolean };
    if (body.role != null && !isRestaurantStaffRole(body.role)) {
      return reply.status(400).send({ message: 'Invalid restaurant staff role.' });
    }
    try {
      await ensureScopedRestaurant(backendService, adminRequest, params.restaurantId);
      return await backendService.updateRestaurantStaffUser(params.restaurantId, params.staffUserId, body);
    } catch (error) {
      return reply.status(400).send({ message: (error as Error).message });
    }
  });

  app.patch('/api/admin/drivers/:driverId/dispatch-policy', async (request, reply) => {
    const adminRequest = request as AdminAuthedRequest;
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
      await ensureScopedDriver(backendService, adminRequest, params.driverId);
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
    const adminRequest = request as AdminAuthedRequest;
    const params = request.params as { driverId: string };
    const body = request.body as { maxActiveOrders?: number };
    if (typeof body.maxActiveOrders !== 'number' || body.maxActiveOrders < 1 || body.maxActiveOrders > 5) {
      return reply.status(400).send({ message: 'maxActiveOrders must be a number between 1 and 5.' });
    }

    try {
      await ensureScopedDriver(backendService, adminRequest, params.driverId);
      return await backendService.updateDriverCapacity(params.driverId, Math.floor(body.maxActiveOrders));
    } catch (error) {
      return reply.status(400).send({ message: (error as Error).message });
    }
  });

  app.patch('/api/admin/restaurants/:restaurantId/display-settings', async (request, reply) => {
    const adminRequest = request as AdminAuthedRequest;
    const params = request.params as { restaurantId: string };
    const body = request.body as { currency?: string; distanceUnit?: DistanceUnit };

    if (!isCurrencyCode(body.currency) || !isDistanceUnit(body.distanceUnit)) {
      return reply.status(400).send({ message: 'currency must be a 3-letter ISO code and distanceUnit must be kilometer or mile.' });
    }

    try {
      await ensureScopedRestaurant(backendService, adminRequest, params.restaurantId);
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
    const adminRequest = request as AdminAuthedRequest;
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
      await ensureScopedRestaurant(backendService, adminRequest, params.restaurantId);
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
    const adminRequest = request as AdminAuthedRequest;
    const params = request.params as { restaurantId: string };
    const body = request.body as { distanceMode?: DriverOfferDistanceMode };

    if (!isDriverOfferDistanceMode(body.distanceMode)) {
      return reply.status(400).send({ message: 'distanceMode must be storeToCustomer or includeCommuteToStore.' });
    }

    try {
      await ensureScopedRestaurant(backendService, adminRequest, params.restaurantId);
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
    const adminRequest = request as AdminAuthedRequest;
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
      await ensureScopedRestaurant(backendService, adminRequest, params.restaurantId);
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

