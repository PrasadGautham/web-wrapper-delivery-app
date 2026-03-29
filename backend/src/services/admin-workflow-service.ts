import { randomUUID } from 'node:crypto';

import {
  AdminOperationsReport,
  AdminOperationalHealthReport,
  AdminOrderReportView,
  AdminRole,
  AdminUserProfile,
  DistancePricingRule,
  AuditLogRecord,
  DriverDispatchPolicy,
  DriverProfile,
  DriverRecord,
  MerchantProfile,
  MerchantRecord,
  MerchantUserProfile,
  MerchantUserRole,
  MerchantView,
  OrderStatus,
  TenantProfile,
  TenantRecord,
  RestaurantProfile,
  RestaurantRecord,
  RestaurantStaffRole,
  RestaurantStaffUserProfile,
  RestaurantTrackingSettings,
  DriverOfferSettings,
  DistanceUnit,
} from '../domain/models.js';
import { hashPassword } from '../utils/passwords.js';
import { BackendRuntime } from './backend-runtime.js';
import { DispatchService } from './dispatch-service.js';
import {
  toDriverProfile,
  toMerchantUserProfile,
  toMerchantView,
  toRestaurantProfile,
  toRestaurantStaffProfile,
} from './profile-projections.js';
import { WorkflowStoreContract } from './store-contract.js';
import { assertValidPricingRule, normalizePricingRule } from './pricing-rules.js';
import { orderFallsWithinRange, ReportDateRange } from '../utils/reporting.js';
import { ObservabilityService } from './observability-service.js';
import { defaultDistanceUnit, defaultTenantCurrency, defaultTenantTimeZone, extractDateInTimeZone, normalizeTenantCurrency, normalizeTenantTimeZone, platformReportTimeZone } from '../utils/timezones.js';

function createAuditLog(input: Omit<AuditLogRecord, 'id' | 'at'>): AuditLogRecord {
  return {
    id: `audit-${randomUUID()}`,
    at: new Date().toISOString(),
    ...input,
  };
}

function toAdminUserProfile(user: {
  id: string;
  tenantId: string | null;
  name: string;
  email: string;
  role: AdminUserProfile['role'];
  isActive: boolean;
  lastLoginAt: string | null;
}): AdminUserProfile {
  return {
    id: user.id,
    tenantId: user.tenantId,
    name: user.name,
    email: user.email,
    role: user.role,
    isActive: user.isActive,
    lastLoginAt: user.lastLoginAt,
  };
}

function isPlatformAdmin(role: AdminRole): boolean {
  return role === 'platformAdmin' || role === 'opsAdmin' || role === 'supportAdmin' || role === 'billingAdmin';
}

function toTenantProfile(tenant: TenantRecord): TenantProfile {
  return {
    ...tenant,
    currency: normalizeTenantCurrency(tenant.currency ?? defaultTenantCurrency),
    timeZone: normalizeTenantTimeZone(tenant.timeZone ?? defaultTenantTimeZone),
  };
}

const stuckQueuedOrderThresholdMinutes = Number(process.env.ORDER_STUCK_MINUTES ?? '10');

function resolveReportTimeZone(tenants: TenantRecord[], scopedTenantId: string | null): string {
  if (!scopedTenantId) {
    return platformReportTimeZone;
  }
  const tenant = tenants.find((item) => item.id === scopedTenantId) ?? null;
  return normalizeTenantTimeZone(tenant?.timeZone ?? defaultTenantTimeZone);
}

export class AdminWorkflowService {
  constructor(
    private readonly runtime: BackendRuntime,
    private readonly dispatchService: DispatchService,
    private readonly workflowStore: WorkflowStoreContract | null = null,
    private readonly observability?: ObservabilityService,
  ) {}

  async listTenants(adminUser: { tenantId: string | null; role: AdminRole } = { tenantId: null, role: 'platformAdmin' }): Promise<TenantProfile[]> {
    return this.runtime.withDb(async (db) => {
      const visibleTenants = isPlatformAdmin(adminUser.role)
        ? db.tenants
        : db.tenants.filter((tenant) => tenant.id === adminUser.tenantId);
      return visibleTenants.map((tenant) => toTenantProfile(tenant));
    });
  }

  async listDrivers(adminUser: { tenantId: string | null; role: AdminRole } = { tenantId: null, role: 'platformAdmin' }): Promise<DriverProfile[]> {
    return this.runtime.withDb(async (db) => {
      const tenantById = new Map(db.tenants.map((tenant) => [tenant.id, tenant]));
      return db.drivers
        .filter((driver) => isPlatformAdmin(adminUser.role) || driver.tenantId === adminUser.tenantId)
        .map((driver) => toDriverProfile(driver, this.dispatchService.getDriverLoad(db, driver.id), tenantById.get(driver.tenantId) ?? null));
    });
  }

  async listRestaurants(adminUser: { tenantId: string | null; role: AdminRole } = { tenantId: null, role: 'platformAdmin' }): Promise<RestaurantProfile[]> {
    return this.runtime.withDb(async (db) => {
      const tenantById = new Map(db.tenants.map((tenant) => [tenant.id, tenant]));
      return db.restaurants
        .filter((restaurant) => isPlatformAdmin(adminUser.role) || restaurant.tenantId === adminUser.tenantId)
        .map((restaurant) => toRestaurantProfile(restaurant, tenantById.get(restaurant.tenantId) ?? null));
    });
  }

  async listMerchants(adminUser: { tenantId: string | null; role: AdminRole } = { tenantId: null, role: 'platformAdmin' }): Promise<MerchantView[]> {
    return this.runtime.withDb(async (db) => {
      const tenantById = new Map(db.tenants.map((tenant) => [tenant.id, tenant]));
      return db.merchants
        .filter((merchant) => isPlatformAdmin(adminUser.role) || merchant.tenantId === adminUser.tenantId)
        .map((merchant) => toMerchantView(merchant, tenantById.get(merchant.tenantId) ?? null));
    });
  }

  async listAdminUsers(adminUser: { tenantId: string | null; role: AdminRole } = { tenantId: null, role: 'platformAdmin' }): Promise<AdminUserProfile[]> {
    return this.runtime.withDb(async (db) =>
      (db.adminUsers ?? [])
        .filter((item) => isPlatformAdmin(adminUser.role) || item.tenantId === adminUser.tenantId)
        .map((item) => toAdminUserProfile(item)),
    );
  }


  async getOrdersReport(
    adminUser: { tenantId: string | null; role: AdminRole } = { tenantId: null, role: 'platformAdmin' },
    range: ReportDateRange = {},
    requestedTenantId?: string,
  ): Promise<AdminOrderReportView[]> {
    const scopedTenantId = this.resolveReportTenantId(adminUser, requestedTenantId);
    return this.runtime.withDb(async (db) => {
      this.dispatchService.tick(db as never);
      const tenantById = new Map(db.tenants.map((tenant) => [tenant.id, tenant]));
      const merchantById = new Map(db.merchants.map((merchant) => [merchant.id, merchant]));
      const restaurantById = new Map(db.restaurants.map((restaurant) => [restaurant.id, restaurant]));
      const driverById = new Map(db.drivers.map((driver) => [driver.id, driver]));
      const reportTimeZone = resolveReportTimeZone(db.tenants, scopedTenantId);

      return db.orders
        .filter((order) => (!scopedTenantId || order.tenantId == scopedTenantId) && orderFallsWithinRange(order.createdAt, range, reportTimeZone))
        .sort((left, right) => right.createdAt.localeCompare(left.createdAt))
        .map((order) => {
          const tenant = tenantById.get(order.tenantId);
          const restaurant = restaurantById.get(order.restaurantId);
          const merchant = restaurant ? merchantById.get(restaurant.merchantId) : null;
          const driver = order.assignedDriverId ? driverById.get(order.assignedDriverId) : null;
          const tripOrderCount = this.dispatchService.getTripOrderCount(db as never, order.tripId);
          return {
            id: order.id,
            tripId: order.tripId,
            tripOrderCount,
            isBatchedTrip: tripOrderCount > 1,
            tenantId: order.tenantId,
            tenantName: tenant?.name || order.tenantId,
            merchantId: merchant?.id || restaurant?.merchantId || '',
            merchantName: merchant?.name || 'Unknown merchant group',
            restaurantId: order.restaurantId,
            restaurantName: restaurant?.name || order.restaurant.name,
            assignedDriverId: order.assignedDriverId,
            assignedDriverName: driver?.name || null,
            customerName: order.customer.name,
            destinationAddress: order.customer.address,
            deliveryArea: order.deliveryArea,
            status: order.status,
            createdAt: order.createdAt,
            deliveredAt: order.deliveredAt,
            storeCharge: Number(order.companyCharge.toFixed(2)),
            driverPay: Number(order.tripEarnings.toFixed(2)),
            currency: order.displayCurrency || restaurant?.currency || defaultTenantCurrency,
          };
        });
    });
  }

  async getOperationsReport(
    adminUser: { tenantId: string | null; role: AdminRole } = { tenantId: null, role: 'platformAdmin' },
    range: ReportDateRange = {},
    requestedTenantId?: string,
  ): Promise<AdminOperationsReport> {
    const rows = await this.getOrdersReport(adminUser, range, requestedTenantId);
    const scopedTenantId = this.resolveReportTenantId(adminUser, requestedTenantId);
    const activeStatuses = new Set<OrderStatus>(['queued', 'pending', 'accepted', 'atRestaurant', 'pickedUp']);
    const totalOrders = rows.length;
    const activeOrders = rows.filter((row) => activeStatuses.has(row.status)).length;
    const deliveredOrders = rows.filter((row) => row.status === 'delivered').length;
    const totalStoreCharges = Number(rows.reduce((sum, row) => sum + row.storeCharge, 0).toFixed(2));
    const totalDriverPay = Number(rows.reduce((sum, row) => sum + row.driverPay, 0).toFixed(2));

    const statusMap = new Map<string, number>();
    const tenantMap = new Map<string, { tenantId: string; tenantName: string; totalOrders: number; deliveredOrders: number; totalStoreCharges: number; totalDriverPay: number }>();
    const merchantMap = new Map<string, { merchantId: string; merchantName: string; totalOrders: number; deliveredOrders: number; totalStoreCharges: number; totalDriverPay: number }>();
    const storeMap = new Map<string, { restaurantId: string; restaurantName: string; totalOrders: number; deliveredOrders: number; totalStoreCharges: number; totalDriverPay: number }>();
    const driverMap = new Map<string, { driverId: string; driverName: string; totalOrders: number; activeOrders: number; deliveredOrders: number; totalStoreCharges: number; totalDriverPay: number }>();
    const dayMap = new Map<string, { date: string; totalOrders: number; deliveredOrders: number; totalStoreCharges: number; totalDriverPay: number }>();
    const tripMap = new Map<string, { tripId: string; tenantId: string; tenantName: string; driverId: string; driverName: string; orderCount: number; deliveredOrders: number; storeCount: number; restaurantNames: string[]; startedAt: string; completedAt: string | null; totalStoreCharges: number; totalDriverPay: number }>();
    const { reportTimeZone, tripById } = await this.runtime.withDb(async (db) => ({
      reportTimeZone: resolveReportTimeZone(db.tenants, scopedTenantId),
      tripById: new Map(
        db.driverTrips
          .filter((trip) => !scopedTenantId || trip.tenantId === scopedTenantId)
          .map((trip) => [trip.id, trip]),
      ),
    }));

    for (const row of rows) {
      statusMap.set(row.status, (statusMap.get(row.status) || 0) + 1);

      const tenant = tenantMap.get(row.tenantId) || { tenantId: row.tenantId, tenantName: row.tenantName, totalOrders: 0, deliveredOrders: 0, totalStoreCharges: 0, totalDriverPay: 0 };
      tenant.totalOrders += 1;
      tenant.deliveredOrders += row.status === 'delivered' ? 1 : 0;
      tenant.totalStoreCharges += row.storeCharge;
      tenant.totalDriverPay += row.driverPay;
      tenantMap.set(row.tenantId, tenant);

      const merchant = merchantMap.get(row.merchantId) || { merchantId: row.merchantId, merchantName: row.merchantName, totalOrders: 0, deliveredOrders: 0, totalStoreCharges: 0, totalDriverPay: 0 };
      merchant.totalOrders += 1;
      merchant.deliveredOrders += row.status === 'delivered' ? 1 : 0;
      merchant.totalStoreCharges += row.storeCharge;
      merchant.totalDriverPay += row.driverPay;
      merchantMap.set(row.merchantId, merchant);

      const store = storeMap.get(row.restaurantId) || { restaurantId: row.restaurantId, restaurantName: row.restaurantName, totalOrders: 0, deliveredOrders: 0, totalStoreCharges: 0, totalDriverPay: 0 };
      store.totalOrders += 1;
      store.deliveredOrders += row.status === 'delivered' ? 1 : 0;
      store.totalStoreCharges += row.storeCharge;
      store.totalDriverPay += row.driverPay;
      storeMap.set(row.restaurantId, store);

      if (row.assignedDriverId && row.assignedDriverName) {
        const driver = driverMap.get(row.assignedDriverId) || { driverId: row.assignedDriverId, driverName: row.assignedDriverName, totalOrders: 0, activeOrders: 0, deliveredOrders: 0, totalStoreCharges: 0, totalDriverPay: 0 };
        driver.totalOrders += 1;
        driver.activeOrders += activeStatuses.has(row.status) ? 1 : 0;
        driver.deliveredOrders += row.status === 'delivered' ? 1 : 0;
        driver.totalStoreCharges += row.storeCharge;
        driver.totalDriverPay += row.driverPay;
        driverMap.set(row.assignedDriverId, driver);
      }

      if (row.tripId && row.assignedDriverId && row.assignedDriverName) {
        const trip = tripById.get(row.tripId) ?? null;
        const summary = tripMap.get(row.tripId) || { tripId: row.tripId, tenantId: row.tenantId, tenantName: row.tenantName, driverId: trip?.driverId ?? row.assignedDriverId, driverName: row.assignedDriverName, orderCount: 0, deliveredOrders: 0, storeCount: 0, restaurantNames: [], startedAt: trip?.startedAt ?? row.createdAt, completedAt: trip?.completedAt ?? null, totalStoreCharges: 0, totalDriverPay: 0 };
        summary.orderCount += 1;
        summary.deliveredOrders += row.status === 'delivered' ? 1 : 0;
        if (!summary.restaurantNames.includes(row.restaurantName)) {
          summary.restaurantNames.push(row.restaurantName);
          summary.storeCount = summary.restaurantNames.length;
        }
        summary.completedAt = trip?.completedAt ?? summary.completedAt;
        summary.totalStoreCharges += row.storeCharge;
        summary.totalDriverPay += row.driverPay;
        tripMap.set(row.tripId, summary);
      }
      const dateKey = extractDateInTimeZone(row.createdAt, reportTimeZone);
      const day = dayMap.get(dateKey) || { date: dateKey, totalOrders: 0, deliveredOrders: 0, totalStoreCharges: 0, totalDriverPay: 0 };
      day.totalOrders += 1;
      day.deliveredOrders += row.status === 'delivered' ? 1 : 0;
      day.totalStoreCharges += row.storeCharge;
      day.totalDriverPay += row.driverPay;
      dayMap.set(dateKey, day);
    }

    const roundMoneyRows = <T extends { totalStoreCharges: number; totalDriverPay: number }>(items: T[]) => items.map((item) => ({ ...item, totalStoreCharges: Number(item.totalStoreCharges.toFixed(2)), totalDriverPay: Number(item.totalDriverPay.toFixed(2)) }));

    return {
      totalOrders,
      activeOrders,
      deliveredOrders,
      totalStoreCharges,
      totalDriverPay,
      averageStoreCharge: totalOrders ? Number((totalStoreCharges / totalOrders).toFixed(2)) : 0,
      averageDriverPay: totalOrders ? Number((totalDriverPay / totalOrders).toFixed(2)) : 0,
      completionRate: totalOrders ? Number(((deliveredOrders / totalOrders) * 100).toFixed(1)) : 0,
      statusMix: Array.from(statusMap.entries()).map(([status, count]) => ({ status, count })).sort((left, right) => right.count - left.count),
      byTenant: roundMoneyRows(Array.from(tenantMap.values()).sort((left, right) => right.totalOrders - left.totalOrders)),
      byMerchantGroup: roundMoneyRows(Array.from(merchantMap.values()).sort((left, right) => right.totalOrders - left.totalOrders)),
      byStore: roundMoneyRows(Array.from(storeMap.values()).sort((left, right) => right.totalOrders - left.totalOrders)),
      byDriver: roundMoneyRows(Array.from(driverMap.values()).sort((left, right) => right.totalOrders - left.totalOrders)),
      byDay: roundMoneyRows(Array.from(dayMap.values()).sort((left, right) => left.date.localeCompare(right.date))),
      byTrip: roundMoneyRows(Array.from(tripMap.values()).sort((left, right) => right.orderCount - left.orderCount || left.startedAt.localeCompare(right.startedAt))),
    };
  }

  async getOperationalHealth(
    adminUser: { tenantId: string | null; role: AdminRole } = { tenantId: null, role: 'platformAdmin' },
    requestedTenantId?: string,
  ): Promise<AdminOperationalHealthReport> {
    const scopedTenantId = this.resolveReportTenantId(adminUser, requestedTenantId);
    return this.runtime.withDb(async (db) => {
      this.dispatchService.tick(db as never);
      this.dispatchService.assignQueuedOrders(db as never);

      const visibleTenants = db.tenants.filter((tenant) => isPlatformAdmin(adminUser.role) ? (!scopedTenantId || tenant.id === scopedTenantId) : tenant.id === scopedTenantId);
      const tenantIds = new Set(visibleTenants.map((tenant) => tenant.id));
      const tenantById = new Map(visibleTenants.map((tenant) => [tenant.id, tenant]));
      const restaurants = db.restaurants.filter((restaurant) => tenantIds.has(restaurant.tenantId));
      const restaurantById = new Map(restaurants.map((restaurant) => [restaurant.id, restaurant]));
      const orders = db.orders.filter((order) => tenantIds.has(order.tenantId));
      const drivers = db.drivers.filter((driver) => tenantIds.has(driver.tenantId));
      const timeZone = resolveReportTimeZone(db.tenants, scopedTenantId);
      const counters = this.observability?.getCountersSnapshot() ?? { authFailures: [], recentAuthFailures: 0, pushOffersSent: 0, pushOfferFailures: 0, dispatchAssignments: 0, offerExpirations: 0 };

      const queuedOrders = orders.filter((order) => order.status === 'queued');
      const pendingOffers = orders.filter((order) => order.status === 'pending');
      const activeTrips = orders.filter((order) => order.status === 'accepted' || order.status === 'atRestaurant' || order.status === 'pickedUp');
      const deliveredOrders = orders.filter((order) => order.status === 'delivered');
      const now = Date.now();
      const queuedAges = queuedOrders.map((order) => Math.max(0, (now - new Date(order.createdAt).getTime()) / 60000));
      const oldestQueuedOrderMinutes = queuedAges.length ? Number(Math.max(...queuedAges).toFixed(1)) : 0;
      const averageQueuedOrderMinutes = queuedAges.length ? Number((queuedAges.reduce((sum, age) => sum + age, 0) / queuedAges.length).toFixed(1)) : 0;
      const stuckOrders = queuedOrders
        .map((order) => ({
          order,
          ageMinutes: Math.max(0, (now - new Date(order.createdAt).getTime()) / 60000),
          restaurant: restaurantById.get(order.restaurantId) ?? null,
          tenant: tenantById.get(order.tenantId) ?? null,
          lastEventType: order.events.length ? order.events[order.events.length - 1].type : null,
        }))
        .filter((item) => item.ageMinutes >= stuckQueuedOrderThresholdMinutes)
        .sort((left, right) => right.ageMinutes - left.ageMinutes);

      const freshnessCounts = { fresh: 0, stale: 0, missing: 0 };
      const staleDrivers: AdminOperationalHealthReport['staleDrivers'] = drivers
        .map((driver) => {
          const freshness = this.dispatchService.getLocationFreshness(driver);
          freshnessCounts[freshness] += 1;
          const lastLocationAt = driver.currentLocation.capturedAt ?? null;
          const minutesSinceLocation = lastLocationAt ? Number(((now - new Date(lastLocationAt).getTime()) / 60000).toFixed(1)) : null;
          return {
            driverId: driver.id,
            driverName: driver.name,
            tenantName: tenantById.get(driver.tenantId)?.name ?? driver.tenantId,
            freshness,
            isOnline: driver.isOnline,
            lastLocationAt,
            minutesSinceLocation,
          };
        })
        .filter((driver): driver is AdminOperationalHealthReport['staleDrivers'][number] => driver.freshness !== 'fresh')
        .sort((left, right) => Number(right.isOnline) - Number(left.isOnline) || (right.minutesSinceLocation ?? -1) - (left.minutesSinceLocation ?? -1))
        .slice(0, 8);

      this.observability?.updateOperationalSnapshot({
        queuedOrders: queuedOrders.length,
        pendingOffers: pendingOffers.length,
        stuckQueuedOrders: stuckOrders.length,
        onlineDrivers: drivers.filter((driver) => driver.isOnline).length,
        driverFreshness: freshnessCounts,
      });

      return {
        generatedAt: new Date().toISOString(),
        scope: isPlatformAdmin(adminUser.role) ? 'platform' : 'tenant',
        timeZone,
        tenantId: scopedTenantId,
        tenantName: scopedTenantId ? (tenantById.get(scopedTenantId)?.name ?? null) : null,
        summary: {
          totalOrders: orders.length,
          queuedOrders: queuedOrders.length,
          pendingOffers: pendingOffers.length,
          activeTrips: activeTrips.length,
          deliveredOrders: deliveredOrders.length,
          oldestQueuedOrderMinutes,
          averageQueuedOrderMinutes,
          stuckQueuedOrders: stuckOrders.length,
          onlineDrivers: drivers.filter((driver) => driver.isOnline).length,
          driversWithFreshLocation: freshnessCounts.fresh,
          driversWithStaleLocation: freshnessCounts.stale,
          driversWithMissingLocation: freshnessCounts.missing,
          recentAuthFailures: counters.recentAuthFailures,
          pushOffersSent: counters.pushOffersSent,
          pushOfferFailures: counters.pushOfferFailures,
          dispatchAssignments: counters.dispatchAssignments,
          offerExpirations: counters.offerExpirations,
        },
        locationFreshness: [
          { state: 'fresh', count: freshnessCounts.fresh },
          { state: 'stale', count: freshnessCounts.stale },
          { state: 'missing', count: freshnessCounts.missing },
        ],
        authFailures: counters.authFailures,
        topStuckOrders: stuckOrders.slice(0, 8).map((item) => ({
          orderId: item.order.id,
          tenantName: item.tenant?.name ?? item.order.tenantId,
          restaurantName: item.restaurant?.name ?? item.order.restaurantId,
          ageMinutes: Number(item.ageMinutes.toFixed(1)),
          lastEventType: item.lastEventType,
        })),
        staleDrivers,
      };
    });
  }

  async createTenant(input: { name: string; slug: string; currency?: string; timeZone?: string }): Promise<TenantProfile> {
    return this.runtime.withMutableDb(async (db) => {
      db.tenants ??= [];
      if (db.tenants.some((item) => item.slug.toLowerCase() === input.slug.toLowerCase())) {
        throw new Error('Tenant slug already exists.');
      }
      const tenant: TenantRecord = {
        id: `tenant-${randomUUID()}`,
        name: input.name,
        slug: input.slug,
        currency: normalizeTenantCurrency(input.currency ?? defaultTenantCurrency),
        timeZone: normalizeTenantTimeZone(input.timeZone ?? defaultTenantTimeZone),
        isActive: true,
        createdAt: new Date().toISOString(),
      };
      db.tenants.push(tenant);
      this.runtime.appendAuditLog(db, {
        actorType: 'admin',
        actorId: 'admin-api',
        tenantId: null,
        action: 'tenant.created',
        entityType: 'tenant',
        entityId: tenant.id,
        metadata: { slug: tenant.slug },
      });
      return toTenantProfile(tenant);
    });
  }

  async createTenantAdmin(tenantId: string, input: { name: string; email: string; password: string; role: Extract<AdminRole, 'tenantAdmin' | 'tenantOps' | 'tenantSupport'> }): Promise<AdminUserProfile> {
    return this.runtime.withMutableDb(async (db) => {
      const tenant = (db.tenants ?? []).find((item) => item.id === tenantId && item.isActive);
      if (!tenant) {
        throw new Error('Tenant not found.');
      }
      db.adminUsers ??= [];
      if (db.adminUsers.some((item) => item.email.toLowerCase() == input.email.toLowerCase())) {
        throw new Error('Admin user email already exists.');
      }
      const user = {
        id: `admin-${randomUUID()}`,
        tenantId,
        name: input.name,
        email: input.email,
        password: await hashPassword(input.password),
        role: input.role,
        isActive: true,
        lastLoginAt: null,
      };
      db.adminUsers.push(user);
      this.runtime.appendAuditLog(db, {
        actorType: 'admin',
        actorId: 'admin-api',
        tenantId,
        action: 'tenant-admin.created',
        entityType: 'admin-user',
        entityId: user.id,
        metadata: { role: user.role, email: user.email },
      });
      return toAdminUserProfile(user);
    });
  }

  async createMerchant(adminUser: { tenantId: string | null; role: AdminRole } = { tenantId: null, role: 'platformAdmin' }, input: { tenantId?: string; name: string }): Promise<MerchantProfile> {
    return this.runtime.withMutableDb(async (db) => {
      const tenantId = this.resolveManagedTenantId(adminUser, input.tenantId);
      const tenant = (db.tenants ?? []).find((item) => item.id === tenantId && item.isActive);
      if (!tenant) {
        throw new Error('Tenant not found.');
      }
      const merchant: MerchantRecord = { id: `merchant-${randomUUID()}`, tenantId, name: input.name, users: [] };
      db.merchants.push(merchant);
      this.runtime.appendAuditLog(db, { actorType: 'admin', actorId: 'admin-api', tenantId, action: 'merchant.created', entityType: 'merchant', entityId: merchant.id });
      return { id: merchant.id, tenantId: merchant.tenantId, name: merchant.name, currency: tenant.currency, timeZone: tenant.timeZone };
    });
  }

  async createRestaurant(adminUser: { tenantId: string | null; role: AdminRole } = { tenantId: null, role: 'platformAdmin' }, input: { tenantId?: string; merchantId: string; name: string; email: string; password: string; pickupLocation: RestaurantRecord['pickupLocation']; distanceUnit?: DistanceUnit }): Promise<RestaurantProfile> {
    return this.runtime.withMutableDb(async (db) => {
      const tenantId = this.resolveManagedTenantId(adminUser, input.tenantId);
      const tenant = (db.tenants ?? []).find((item) => item.id === tenantId && item.isActive);
      if (!tenant) {
        throw new Error('Tenant not found.');
      }
      const merchant = db.merchants.find((item) => item.id === input.merchantId && item.tenantId === tenantId);
      if (!merchant) {
        throw new Error('Merchant not found for tenant.');
      }
      if (db.restaurants.some((item) => item.email.toLowerCase() === input.email.toLowerCase())) {
        throw new Error('Restaurant email already exists.');
      }
      const restaurant: RestaurantRecord = {
        id: `restaurant-${randomUUID()}`,
        tenantId,
        merchantId: merchant.id,
        name: input.name,
        email: input.email,
        password: await hashPassword(input.password),
        pickupLocation: input.pickupLocation,
        pricing: {
          driverPayoutRule: normalizePricingRule({ baseAmount: 0, includedDistanceKm: 0, additionalPerKm: 0 }),
          merchantBillingRule: normalizePricingRule({ baseAmount: 0, includedDistanceKm: 0, additionalPerKm: 0 }),
        },
        currency: tenant.currency,
        distanceUnit: input.distanceUnit ?? defaultDistanceUnit,
        trackingSettings: { showPickedUpAsInTransit: true, showDriverEtaToPickup: true, showDestinationEta: true },
        driverOfferSettings: { distanceMode: 'storeToCustomer' },
        staffUsers: [],
      };
      db.restaurants.push(restaurant);
      this.runtime.appendAuditLog(db, { actorType: 'admin', actorId: 'admin-api', tenantId, action: 'restaurant.created', entityType: 'restaurant', entityId: restaurant.id, metadata: { merchantId: merchant.id } });
      return toRestaurantProfile(restaurant, tenant);
    });
  }

  async createDriver(adminUser: { tenantId: string | null; role: AdminRole } = { tenantId: null, role: 'platformAdmin' }, input: { tenantId?: string; name: string; email: string; password: string }): Promise<DriverProfile> {
    return this.runtime.withMutableDb(async (db) => {
      const tenantId = this.resolveManagedTenantId(adminUser, input.tenantId);
      const tenant = (db.tenants ?? []).find((item) => item.id === tenantId && item.isActive);
      if (!tenant) {
        throw new Error('Tenant not found.');
      }
      if (db.drivers.some((item) => item.email.toLowerCase() === input.email.toLowerCase())) {
        throw new Error('Driver email already exists.');
      }
      const driver: DriverRecord = {
        id: `driver-${randomUUID()}`,
        tenantId,
        name: input.name,
        email: input.email,
        password: await hashPassword(input.password),
        rating: 5,
        completedOrders: 0,
        totalDistanceKm: 0,
        isOnline: false,
        currentLocation: { latitude: 25.2048, longitude: 55.2708, accuracyMeters: null, speedMetersPerSecond: null, headingDegrees: null, capturedAt: null },
        deviceToken: null,
        dispatchPolicy: { mode: 'open', restaurantIds: [], merchantIds: [] },
        maxActiveOrders: 1,
      };
      db.drivers.push(driver);
      this.runtime.appendAuditLog(db, { actorType: 'admin', actorId: 'admin-api', tenantId, action: 'driver.created', entityType: 'driver', entityId: driver.id });
      return toDriverProfile(driver, 0, tenant);
    });
  }

  async createAdminUser(input: {
    name: string;
    email: string;
    password: string;
    role: AdminRole;
  }): Promise<AdminUserProfile> {
    return this.runtime.withMutableDb(async (db) => {
      db.adminUsers ??= [];
      if (db.adminUsers.some((item) => item.email.toLowerCase() === input.email.toLowerCase())) {
        throw new Error('Admin user email already exists.');
      }
      const user = {
        id: `admin-${randomUUID()}`,
        tenantId: null,
        name: input.name,
        email: input.email,
        password: await hashPassword(input.password),
        role: input.role,
        isActive: true,
        lastLoginAt: null,
      };
      db.adminUsers.push(user);
      this.runtime.appendAuditLog(db, {
        actorType: 'admin',
        actorId: 'admin-api',
        action: 'admin-user.created',
        entityType: 'admin-user',
        entityId: user.id,
        metadata: { role: user.role, email: user.email },
      });
      return toAdminUserProfile(user);
    });
  }

  async updateAdminUser(adminUserId: string, input: {
    name?: string;
    password?: string;
    role?: AdminUserProfile['role'];
    isActive?: boolean;
  }): Promise<AdminUserProfile> {
    return this.runtime.withMutableDb(async (db) => {
      db.adminUsers ??= [];
      const user = db.adminUsers.find((item) => item.id === adminUserId);
      if (!user) {
        throw new Error('Admin user not found.');
      }
      if (input.name != null) user.name = input.name;
      if (input.role != null) user.role = input.role;
      if (input.isActive != null) user.isActive = input.isActive;
      if (input.password) user.password = await hashPassword(input.password);
      this.runtime.appendAuditLog(db, {
        actorType: 'admin',
        actorId: 'admin-api',
        action: 'admin-user.updated',
        entityType: 'admin-user',
        entityId: user.id,
      });
      return toAdminUserProfile(user);
    });
  }

  async listMerchantUsers(merchantId: string): Promise<MerchantUserProfile[]> {
    return this.runtime.withDb(async (db) => {
      const merchant = this.requireMerchant(db.merchants, merchantId);
      return merchant.users.map((item) => toMerchantUserProfile(item));
    });
  }

  async createMerchantUser(
    merchantId: string,
    input: { name: string; email: string; password: string; role: MerchantUserRole },
  ): Promise<MerchantUserProfile> {
    return this.runtime.withMutableDb(async (db) => {
      const merchant = this.requireMerchant(db.merchants, merchantId);
      if (merchant.users.some((item) => item.email.toLowerCase() === input.email.toLowerCase())) {
        throw new Error('Merchant user email already exists for this merchant.');
      }
      const merchantUser = {
        id: `merchant-user-${randomUUID()}`,
        name: input.name,
        email: input.email,
        password: await hashPassword(input.password),
        role: input.role,
        isActive: true,
        lastLoginAt: null,
      };
      merchant.users.push(merchantUser);
      this.runtime.appendAuditLog(db, {
        actorType: 'admin',
        actorId: 'admin-api',
        action: 'merchant-user.created',
        entityType: 'merchant-user',
        entityId: merchantUser.id,
        metadata: { merchantId, role: merchantUser.role },
      });
      return toMerchantUserProfile(merchantUser);
    });
  }

  async updateMerchantUser(
    merchantId: string,
    merchantUserId: string,
    input: { name?: string; password?: string; role?: MerchantUserRole; isActive?: boolean },
  ): Promise<MerchantUserProfile> {
    return this.runtime.withMutableDb(async (db) => {
      const merchant = this.requireMerchant(db.merchants, merchantId);
      const merchantUser = merchant.users.find((item) => item.id === merchantUserId);
      if (!merchantUser) {
        throw new Error('Merchant user not found.');
      }
      if (input.name != null) merchantUser.name = input.name;
      if (input.role != null) merchantUser.role = input.role;
      if (input.isActive != null) merchantUser.isActive = input.isActive;
      if (input.password) merchantUser.password = await hashPassword(input.password);
      this.runtime.appendAuditLog(db, {
        actorType: 'admin',
        actorId: 'admin-api',
        action: 'merchant-user.updated',
        entityType: 'merchant-user',
        entityId: merchantUser.id,
        metadata: { merchantId },
      });
      return toMerchantUserProfile(merchantUser);
    });
  }

  async listRestaurantStaffUsers(restaurantId: string): Promise<RestaurantStaffUserProfile[]> {
    return this.runtime.withDb(async (db) => {
      const restaurant = this.runtime.requireRestaurant(db, restaurantId);
      return restaurant.staffUsers.map((item) => toRestaurantStaffProfile(item));
    });
  }

  async createRestaurantStaffUser(
    restaurantId: string,
    input: { name: string; email: string; password: string; role: RestaurantStaffRole },
  ): Promise<RestaurantStaffUserProfile> {
    return this.runtime.withMutableDb(async (db) => {
      const restaurant = this.runtime.requireRestaurant(db, restaurantId);
      restaurant.staffUsers ??= [];
      if (restaurant.staffUsers.some((item) => item.email.toLowerCase() === input.email.toLowerCase())) {
        throw new Error('Restaurant staff email already exists for this store.');
      }
      const staffUser = {
        id: `staff-${randomUUID()}`,
        name: input.name,
        email: input.email,
        password: await hashPassword(input.password),
        role: input.role,
        isActive: true,
        lastLoginAt: null,
      };
      restaurant.staffUsers.push(staffUser);
      this.runtime.appendAuditLog(db, {
        actorType: 'admin',
        actorId: 'admin-api',
        action: 'restaurant-staff-user.created',
        entityType: 'restaurant-staff-user',
        entityId: staffUser.id,
        metadata: { restaurantId, role: staffUser.role },
      });
      return toRestaurantStaffProfile(staffUser);
    });
  }

  async updateRestaurantStaffUser(
    restaurantId: string,
    staffUserId: string,
    input: { name?: string; password?: string; role?: RestaurantStaffRole; isActive?: boolean },
  ): Promise<RestaurantStaffUserProfile> {
    return this.runtime.withMutableDb(async (db) => {
      const restaurant = this.runtime.requireRestaurant(db, restaurantId);
      const staffUser = restaurant.staffUsers.find((item) => item.id === staffUserId);
      if (!staffUser) {
        throw new Error('Restaurant staff user not found.');
      }
      if (input.name != null) staffUser.name = input.name;
      if (input.role != null) staffUser.role = input.role;
      if (input.isActive != null) staffUser.isActive = input.isActive;
      if (input.password) staffUser.password = await hashPassword(input.password);
      this.runtime.appendAuditLog(db, {
        actorType: 'admin',
        actorId: 'admin-api',
        action: 'restaurant-staff-user.updated',
        entityType: 'restaurant-staff-user',
        entityId: staffUser.id,
        metadata: { restaurantId },
      });
      return toRestaurantStaffProfile(staffUser);
    });
  }

  async updateDriverDispatchPolicy(driverId: string, policy: DriverDispatchPolicy): Promise<DriverProfile> {
    if (!this.workflowStore) {
      return this.runtime.withMutableDb(async (db) => {
        const driver = this.runtime.requireDriver(db, driverId);
        driver.dispatchPolicy = await this.normalizeAndValidateDispatchPolicy(
          async (restaurantId) => this.runtime.requireRestaurant(db, restaurantId),
          async (merchantId) => db.merchants.find((item) => item.id === merchantId) ?? null,
          driver.tenantId,
          policy,
        );
        this.runtime.appendAuditLog(db, {
          actorType: 'admin',
          actorId: 'admin-api',
          action: 'driver.dispatch-policy.updated',
          entityType: 'driver',
          entityId: driverId,
          metadata: driver.dispatchPolicy as unknown as Record<string, unknown>,
        });
        return toDriverProfile(driver, this.dispatchService.getDriverLoad(db, driver.id));
      });
    }

    return this.workflowStore.withWorkflowWriteContext(async (context) => {
      const driver = await context.findDriverById(driverId);
      if (!driver) {
        throw new Error('Driver not found.');
      }
      driver.dispatchPolicy = await this.normalizeAndValidateDispatchPolicy(
        (restaurantId) => context.findRestaurantById(restaurantId),
        (merchantId) => context.findMerchantById(merchantId),
        driver.tenantId,
        policy,
      );
      await context.saveDriver(driver);
      await context.appendAuditLog(createAuditLog({ actorType: 'admin', actorId: 'admin-api', action: 'driver.dispatch-policy.updated', entityType: 'driver', entityId: driverId, metadata: driver.dispatchPolicy as unknown as Record<string, unknown> }));
      return toDriverProfile(driver, await context.countDriverActiveLoad(driver.id));
    });
  }

  async updateDriverCapacity(driverId: string, maxActiveOrders: number): Promise<DriverProfile> {
    if (!this.workflowStore) {
      return this.runtime.withMutableDb(async (db) => {
        const driver = this.runtime.requireDriver(db, driverId);
        driver.maxActiveOrders = maxActiveOrders;
        this.runtime.appendAuditLog(db, {
          actorType: 'admin',
          actorId: 'admin-api',
          action: 'driver.capacity.updated',
          entityType: 'driver',
          entityId: driverId,
          metadata: { maxActiveOrders },
        });
        return toDriverProfile(driver, this.dispatchService.getDriverLoad(db, driver.id));
      });
    }

    return this.workflowStore.withWorkflowWriteContext(async (context) => {
      const driver = await context.findDriverById(driverId);
      if (!driver) {
        throw new Error('Driver not found.');
      }
      driver.maxActiveOrders = maxActiveOrders;
      await context.saveDriver(driver);
      await context.appendAuditLog(createAuditLog({ actorType: 'admin', actorId: 'admin-api', action: 'driver.capacity.updated', entityType: 'driver', entityId: driverId, metadata: { maxActiveOrders } }));
      return toDriverProfile(driver, await context.countDriverActiveLoad(driver.id));
    });
  }


  async updateRestaurantDisplaySettings(restaurantId: string, settings: { distanceUnit: DistanceUnit }): Promise<RestaurantProfile> {
    if (!this.workflowStore) {
      return this.runtime.withMutableDb(async (db) => {
        const restaurant = this.runtime.requireRestaurant(db, restaurantId);
        const tenant = db.tenants.find((item) => item.id === restaurant.tenantId) ?? null;
        restaurant.currency = normalizeTenantCurrency(tenant?.currency ?? restaurant.currency ?? defaultTenantCurrency);
        restaurant.distanceUnit = settings.distanceUnit;
        this.runtime.appendAuditLog(db, {
          actorType: 'admin',
          actorId: 'admin-api',
          action: 'restaurant.display-settings.updated',
          entityType: 'restaurant',
          entityId: restaurantId,
          metadata: settings as unknown as Record<string, unknown>,
        });
        return toRestaurantProfile(restaurant, tenant);
      });
    }

    return this.workflowStore.withWorkflowWriteContext(async (context) => {
      const restaurant = await context.findRestaurantById(restaurantId);
      if (!restaurant) {
        throw new Error('Restaurant not found.');
      }
      const tenant = await context.findTenantById(restaurant.tenantId);
      restaurant.currency = normalizeTenantCurrency(tenant?.currency ?? restaurant.currency ?? defaultTenantCurrency);
      restaurant.distanceUnit = settings.distanceUnit;
      await context.saveRestaurant(restaurant);
      await context.appendAuditLog(createAuditLog({ actorType: 'admin', actorId: 'admin-api', action: 'restaurant.display-settings.updated', entityType: 'restaurant', entityId: restaurantId, metadata: settings as unknown as Record<string, unknown> }));
      return toRestaurantProfile(restaurant, tenant);
    });
  }

  async updateRestaurantDriverOfferSettings(restaurantId: string, settings: DriverOfferSettings): Promise<RestaurantProfile> {
    if (!this.workflowStore) {
      return this.runtime.withMutableDb(async (db) => {
        const restaurant = this.runtime.requireRestaurant(db, restaurantId);
        const tenant = db.tenants.find((item) => item.id === restaurant.tenantId) ?? null;
        restaurant.driverOfferSettings = { ...settings };
        this.runtime.appendAuditLog(db, {
          actorType: 'admin',
          actorId: 'admin-api',
          action: 'restaurant.driver-offer-settings.updated',
          entityType: 'restaurant',
          entityId: restaurantId,
          metadata: settings as unknown as Record<string, unknown>,
        });
        return toRestaurantProfile(restaurant, tenant);
      });
    }

    return this.workflowStore.withWorkflowWriteContext(async (context) => {
      const restaurant = await context.findRestaurantById(restaurantId);
      if (!restaurant) {
        throw new Error('Restaurant not found.');
      }
      const tenant = await context.findTenantById(restaurant.tenantId);
      restaurant.driverOfferSettings = { ...settings };
      await context.saveRestaurant(restaurant);
      await context.appendAuditLog(createAuditLog({ actorType: 'admin', actorId: 'admin-api', action: 'restaurant.driver-offer-settings.updated', entityType: 'restaurant', entityId: restaurantId, metadata: settings as unknown as Record<string, unknown> }));
      return toRestaurantProfile(restaurant, tenant);
    });
  }

  async updateRestaurantTrackingSettings(restaurantId: string, settings: RestaurantTrackingSettings): Promise<RestaurantProfile> {
    if (!this.workflowStore) {
      return this.runtime.withMutableDb(async (db) => {
        const restaurant = this.runtime.requireRestaurant(db, restaurantId);
        const tenant = db.tenants.find((item) => item.id === restaurant.tenantId) ?? null;
        restaurant.trackingSettings = { ...settings };
        this.runtime.appendAuditLog(db, {
          actorType: 'admin',
          actorId: 'admin-api',
          action: 'restaurant.tracking-settings.updated',
          entityType: 'restaurant',
          entityId: restaurantId,
          metadata: settings as unknown as Record<string, unknown>,
        });
        return toRestaurantProfile(restaurant, tenant);
      });
    }

    return this.workflowStore.withWorkflowWriteContext(async (context) => {
      const restaurant = await context.findRestaurantById(restaurantId);
      if (!restaurant) {
        throw new Error('Restaurant not found.');
      }
      const tenant = await context.findTenantById(restaurant.tenantId);
      restaurant.trackingSettings = { ...settings };
      await context.saveRestaurant(restaurant);
      await context.appendAuditLog(createAuditLog({ actorType: 'admin', actorId: 'admin-api', action: 'restaurant.tracking-settings.updated', entityType: 'restaurant', entityId: restaurantId, metadata: settings as unknown as Record<string, unknown> }));
      return toRestaurantProfile(restaurant, tenant);
    });
  }

  async updateRestaurantPricing(
    restaurantId: string,
    pricing: { driverPayoutRule: DistancePricingRule; merchantBillingRule: DistancePricingRule },
  ): Promise<RestaurantProfile> {
    if (!this.workflowStore) {
      return this.runtime.withMutableDb(async (db) => {
        const restaurant = this.runtime.requireRestaurant(db, restaurantId);
        const tenant = db.tenants.find((item) => item.id === restaurant.tenantId) ?? null;
        restaurant.pricing = {
          driverPayoutRule: normalizePricingRule(pricing.driverPayoutRule),
          merchantBillingRule: normalizePricingRule(pricing.merchantBillingRule),
        };
        this.runtime.appendAuditLog(db, {
          actorType: 'admin',
          actorId: 'admin-api',
          action: 'restaurant.pricing.updated',
          entityType: 'restaurant',
          entityId: restaurantId,
          metadata: pricing as unknown as Record<string, unknown>,
        });
        return toRestaurantProfile(restaurant, tenant);
      });
    }

    return this.workflowStore.withWorkflowWriteContext(async (context) => {
      const restaurant = await context.findRestaurantById(restaurantId);
      if (!restaurant) {
        throw new Error('Restaurant not found.');
      }
      const tenant = await context.findTenantById(restaurant.tenantId);
      restaurant.pricing = {
          driverPayoutRule: normalizePricingRule(pricing.driverPayoutRule),
          merchantBillingRule: normalizePricingRule(pricing.merchantBillingRule),
        };
      await context.saveRestaurant(restaurant);
      await context.appendAuditLog(createAuditLog({ actorType: 'admin', actorId: 'admin-api', action: 'restaurant.pricing.updated', entityType: 'restaurant', entityId: restaurantId, metadata: pricing as unknown as Record<string, unknown> }));
      return toRestaurantProfile(restaurant, tenant);
    });
  }

  async updateTenantSettings(tenantId: string, settings: { currency: string; timeZone: string }): Promise<TenantProfile> {
    return this.runtime.withMutableDb(async (db) => {
      const tenant = (db.tenants ?? []).find((item) => item.id === tenantId);
      if (!tenant) {
        throw new Error('Tenant not found.');
      }
      tenant.currency = normalizeTenantCurrency(settings.currency);
      tenant.timeZone = normalizeTenantTimeZone(settings.timeZone);
      for (const restaurant of db.restaurants.filter((item) => item.tenantId === tenantId)) {
        restaurant.currency = tenant.currency;
      }
      this.runtime.appendAuditLog(db, {
        actorType: 'admin',
        actorId: 'admin-api',
        tenantId,
        action: 'tenant.settings.updated',
        entityType: 'tenant',
        entityId: tenantId,
        metadata: settings as unknown as Record<string, unknown>,
      });
      return toTenantProfile(tenant);
    });
  }
  private resolveReportTenantId(
    adminUser: { tenantId: string | null; role: AdminRole } = { tenantId: null, role: 'platformAdmin' },
    requestedTenantId?: string,
  ): string | null {
    if (isPlatformAdmin(adminUser.role)) {
      return requestedTenantId || null;
    }
    if (!adminUser.tenantId) {
      throw new Error('Tenant admin is not attached to a tenant.');
    }
    if (requestedTenantId && requestedTenantId !== adminUser.tenantId) {
      throw new Error('Unauthorized tenant scope.');
    }
    return adminUser.tenantId;
  }

  private resolveManagedTenantId(adminUser: { tenantId: string | null; role: AdminRole } = { tenantId: null, role: 'platformAdmin' }, requestedTenantId?: string): string {
    if (isPlatformAdmin(adminUser.role)) {
      if (!requestedTenantId) {
        throw new Error('tenantId is required for platform admin actions.');
      }
      return requestedTenantId;
    }
    if (!adminUser.tenantId) {
      throw new Error('Tenant admin is not attached to a tenant.');
    }
    if (requestedTenantId && requestedTenantId !== adminUser.tenantId) {
      throw new Error('Unauthorized tenant scope.');
    }
    return adminUser.tenantId;
  }

  private requireMerchant(merchants: MerchantRecord[], merchantId: string): MerchantRecord {
    const merchant = merchants.find((item) => item.id === merchantId);
    if (!merchant) {
      throw new Error('Merchant not found.');
    }
    return merchant;
  }

  private async normalizeAndValidateDispatchPolicy(
    findRestaurant: (restaurantId: string) => Promise<{ id: string; tenantId?: string } | null>,
    findMerchant: (merchantId: string) => Promise<MerchantRecord | null>,
    managedTenantId: string,
    policy: DriverDispatchPolicy,
  ): Promise<DriverDispatchPolicy> {
    const restaurantIds = [...new Set(policy.restaurantIds)];
    const merchantIds = [...new Set(policy.merchantIds)];

    for (const restaurantId of restaurantIds) {
      const restaurant = await findRestaurant(restaurantId);
      if (!restaurant) {
        throw new Error('Restaurant not found.');
      }
      if ((restaurant.tenantId ?? managedTenantId) !== managedTenantId) {
        throw new Error('Restaurant is outside the driver tenant scope.');
      }
    }
    for (const merchantId of merchantIds) {
      const merchant = await findMerchant(merchantId);
      if (!merchant) {
        throw new Error(`Merchant not found: ${merchantId}`);
      }
      if (merchant.tenantId !== managedTenantId) {
        throw new Error(`Merchant is outside the driver tenant scope: ${merchantId}`);
      }
    }

    return {
      mode: policy.mode,
      restaurantIds,
      merchantIds,
    };
  }
}



















