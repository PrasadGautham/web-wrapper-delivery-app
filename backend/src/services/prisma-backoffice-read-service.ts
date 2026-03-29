import { PrismaClient } from '@prisma/client';

import {
  DriverDispatchPolicy,
  DriverLocationSnapshot,
  DriverProfile,
  DriverRecord,
  MerchantRecord,
  MerchantReport,
  MerchantView,
  RestaurantProfile,
  RestaurantRecord,
  RestaurantReport,
  RestaurantTrackingSettings,
  TenantRecord,
} from '../domain/models.js';
import {
  defaultDistanceUnit,
  defaultTenantTimeZone,
  extractDateInTimeZone,
  localDateBoundaryToUtc,
  normalizeTenantCurrency,
  normalizeTenantTimeZone,
  platformReportTimeZone,
} from '../utils/timezones.js';
import { BackofficeReadService } from './backoffice-read-service.js';
import { toDriverProfile, toMerchantView, toRestaurantProfile } from './profile-projections.js';
import { ReportDateRange } from '../utils/reporting.js';

const capacityStatuses = ['pending', 'accepted', 'atRestaurant', 'pickedUp'] as const;
const activeRestaurantStatuses = ['queued', 'pending', 'accepted', 'atRestaurant', 'pickedUp'] as const;

type PrismaDriverRow = {
  id: string;
  tenantId?: string;
  name: string;
  email: string;
  password: string;
  rating: number;
  completedOrders: number;
  totalDistanceKm: number;
  isOnline: boolean;
  currentLocation: unknown;
  deviceToken: string | null;
  dispatchPolicy: unknown;
  maxActiveOrders: number;
};

type PrismaRestaurantRow = {
  id: string;
  tenantId?: string;
  merchantId: string;
  name: string;
  email: string;
  password: string;
  pickupLocation: unknown;
  driverPayoutRule: unknown;
  merchantBillingRule: unknown;
  currency: string;
  distanceUnit?: string;
  trackingSettings: unknown;
  driverOfferSettings?: unknown;
  staffUsers?: unknown;
};

type PrismaMerchantRow = {
  id: string;
  tenantId?: string;
  name: string;
  users?: unknown;
};

type PrismaTenantRow = {
  id: string;
  name: string;
  slug: string;
  currency: string;
  timeZone: string;
  isActive: boolean;
  createdAt: Date;
};

type PrismaDriverTripRow = {
  id: string;
  tenantId: string;
  driverId: string;
  status: string;
  startedAt: Date;
  completedAt: Date | null;
  orderIds: string[];
  restaurantIds: string[];
};

type PrismaReportOrderRow = {
  id: string;
  tripId: string | null;
  restaurantId: string;
  status: string;
  companyCharge: number;
  assignedDriverId: string | null;
  createdAt: Date;
};

export class PrismaBackofficeReadService implements BackofficeReadService {
  constructor(private readonly prisma: PrismaClient) {}

  private toOrderDateWhere(range: ReportDateRange = {}, timeZone = platformReportTimeZone) {
    const createdAt = {
      ...(range.startDate ? { gte: new Date(localDateBoundaryToUtc(range.startDate, timeZone, false)) } : {}),
      ...(range.endDate ? { lte: new Date(localDateBoundaryToUtc(range.endDate, timeZone, true)) } : {}),
    };
    return Object.keys(createdAt).length ? { createdAt } : {};
  }

  async listDrivers(): Promise<DriverProfile[]> {
    const [drivers, activeAssignments, tenants] = await Promise.all([
      this.prisma.driver.findMany({ orderBy: { id: 'asc' } }),
      this.prisma.order.findMany({
        where: { assignedDriverId: { not: null }, status: { in: [...capacityStatuses] } },
        select: { assignedDriverId: true },
      }),
      this.loadTenants(),
    ]);

    const loadByDriverId = new Map<string, number>();
    for (const row of activeAssignments) {
      if (!row.assignedDriverId) continue;
      loadByDriverId.set(row.assignedDriverId, (loadByDriverId.get(row.assignedDriverId) ?? 0) + 1);
    }
    const tenantById = new Map<string, TenantRecord>(tenants.map((tenant: PrismaTenantRow) => [tenant.id, this.mapTenant(tenant)]));
    return drivers.map((driver: PrismaDriverRow) =>
      toDriverProfile(this.mapDriver(driver), loadByDriverId.get(driver.id) ?? 0, tenantById.get(driver.tenantId ?? '') ?? null),
    );
  }

  async listRestaurants(): Promise<RestaurantProfile[]> {
    const [restaurants, tenants] = await Promise.all([
      this.prisma.restaurant.findMany({ orderBy: { id: 'asc' } }),
      this.loadTenants(),
    ]);
    const tenantById = new Map<string, TenantRecord>(tenants.map((tenant: PrismaTenantRow) => [tenant.id, this.mapTenant(tenant)]));
    return restaurants.map((restaurant: PrismaRestaurantRow) => toRestaurantProfile(this.mapRestaurant(restaurant), tenantById.get(restaurant.tenantId ?? '') ?? null));
  }

  async listMerchants(): Promise<MerchantView[]> {
    const [merchants, tenants] = await Promise.all([
      this.prisma.merchant.findMany({ orderBy: { id: 'asc' } }),
      this.loadTenants(),
    ]);
    const tenantById = new Map<string, TenantRecord>(tenants.map((tenant: PrismaTenantRow) => [tenant.id, this.mapTenant(tenant)]));
    return merchants.map((merchant: PrismaMerchantRow) => toMerchantView(this.mapMerchant(merchant), tenantById.get(merchant.tenantId ?? '') ?? null));
  }

  async getRestaurantReport(restaurantId: string, range: ReportDateRange = {}): Promise<RestaurantReport> {
    const restaurant = await this.prisma.restaurant.findUnique({ where: { id: restaurantId }, select: { tenantId: true } });
    const tenant = restaurant?.tenantId ? await this.findTenantById(restaurant.tenantId) : null;
    const timeZone = normalizeTenantTimeZone(tenant?.timeZone ?? defaultTenantTimeZone);
    const [orders, drivers, trips] = await Promise.all([
      this.loadReportOrdersForRestaurant(restaurantId, range, timeZone),
      this.prisma.driver.findMany({ select: { id: true, name: true } }),
      this.loadDriverTrips(restaurant?.tenantId ?? null),
    ]);

    const driverNameById = new Map<string, string>(drivers.map((driver: { id: string; name: string }) => [driver.id, driver.name]));
    const tripById = new Map<string, PrismaDriverTripRow>(trips.map((trip) => [trip.id, trip]));
    const totalOrders = orders.length;
    const activeOrders = orders.filter((order) => activeRestaurantStatuses.includes(order.status as (typeof activeRestaurantStatuses)[number])).length;
    const deliveredOrders = orders.filter((order) => order.status === 'delivered').length;
    const totalRestaurantCharges = Number(orders.reduce((sum, order) => sum + Number(order.companyCharge), 0).toFixed(2));
    const statusAccumulator = new Map<string, number>();
    const byCourier = new Map<string, { driverId: string; driverName: string; totalOrders: number; deliveredOrders: number; totalRestaurantCharges: number }>();
    const byDay = new Map<string, { date: string; totalOrders: number; deliveredOrders: number; totalRestaurantCharges: number }>();
    const byTrip = new Map<string, { tripId: string; driverId: string; driverName: string; orderCount: number; deliveredOrders: number; startedAt: string; completedAt: string | null; totalRestaurantCharges: number }>();

    for (const order of orders) {
      statusAccumulator.set(order.status, (statusAccumulator.get(order.status) ?? 0) + 1);
      if (order.assignedDriverId) {
        const driver = byCourier.get(order.assignedDriverId) ?? {
          driverId: order.assignedDriverId,
          driverName: driverNameById.get(order.assignedDriverId) ?? 'Unknown courier',
          totalOrders: 0,
          deliveredOrders: 0,
          totalRestaurantCharges: 0,
        };
        driver.totalOrders += 1;
        driver.deliveredOrders += order.status === 'delivered' ? 1 : 0;
        driver.totalRestaurantCharges += Number(order.companyCharge);
        byCourier.set(order.assignedDriverId, driver);
      }
      if (order.tripId) {
        const trip = tripById.get(order.tripId) ?? null;
        const driverId = trip?.driverId ?? order.assignedDriverId ?? 'unknown-driver';
        const summary = byTrip.get(order.tripId) ?? {
          tripId: order.tripId,
          driverId,
          driverName: driverNameById.get(driverId) ?? 'Unknown courier',
          orderCount: 0,
          deliveredOrders: 0,
          startedAt: trip?.startedAt.toISOString() ?? order.createdAt.toISOString(),
          completedAt: trip?.completedAt ? trip.completedAt.toISOString() : null,
          totalRestaurantCharges: 0,
        };
        summary.orderCount += 1;
        summary.deliveredOrders += order.status === 'delivered' ? 1 : 0;
        summary.totalRestaurantCharges += Number(order.companyCharge);
        byTrip.set(order.tripId, summary);
      }
      const dayKey = extractDateInTimeZone(order.createdAt.toISOString(), timeZone);
      const day = byDay.get(dayKey) ?? { date: dayKey, totalOrders: 0, deliveredOrders: 0, totalRestaurantCharges: 0 };
      day.totalOrders += 1;
      day.deliveredOrders += order.status === 'delivered' ? 1 : 0;
      day.totalRestaurantCharges += Number(order.companyCharge);
      byDay.set(dayKey, day);
    }

    return {
      totalOrders,
      activeOrders,
      deliveredOrders,
      totalRestaurantCharges,
      averageRestaurantCharge: totalOrders ? Number((totalRestaurantCharges / totalOrders).toFixed(2)) : 0,
      completionRate: totalOrders ? Number(((deliveredOrders / totalOrders) * 100).toFixed(1)) : 0,
      statusMix: Array.from(statusAccumulator.entries())
        .map(([status, count]) => ({ status, count }))
        .sort((left, right) => right.count - left.count),
      byCourier: Array.from(byCourier.values())
        .map((item) => ({ ...item, totalRestaurantCharges: Number(item.totalRestaurantCharges.toFixed(2)) }))
        .sort((left, right) => right.totalOrders - left.totalOrders),
      byDay: Array.from(byDay.values())
        .map((item) => ({ ...item, totalRestaurantCharges: Number(item.totalRestaurantCharges.toFixed(2)) }))
        .sort((left, right) => left.date.localeCompare(right.date)),
      byTrip: Array.from(byTrip.values())
        .map((item) => ({ ...item, totalRestaurantCharges: Number(item.totalRestaurantCharges.toFixed(2)) }))
        .sort((left, right) => right.orderCount - left.orderCount || left.startedAt.localeCompare(right.startedAt)),
    };
  }

  async getMerchantReport(merchantId: string, range: ReportDateRange = {}): Promise<MerchantReport> {
    const merchant = await this.prisma.merchant.findUnique({ where: { id: merchantId }, select: { tenantId: true } });
    const tenant = merchant?.tenantId ? await this.findTenantById(merchant.tenantId) : null;
    const timeZone = normalizeTenantTimeZone(tenant?.timeZone ?? defaultTenantTimeZone);
    const restaurants = await this.prisma.restaurant.findMany({ where: { merchantId }, select: { id: true, name: true } });
    const restaurantIds = restaurants.map((item: { id: string; name: string }) => item.id);

    if (!restaurantIds.length) {
      return {
        totalRestaurants: 0,
        totalOrders: 0,
        activeOrders: 0,
        deliveredOrders: 0,
        totalRestaurantCharges: 0,
        averageRestaurantCharge: 0,
        completionRate: 0,
        statusMix: [],
        byStore: [],
        byCourier: [],
        byDay: [],
        byTrip: [],
      };
    }

    const [orders, drivers, trips] = await Promise.all([
      this.loadReportOrdersForRestaurants(restaurantIds, range, timeZone),
      this.prisma.driver.findMany({ select: { id: true, name: true } }),
      this.loadDriverTrips(merchant?.tenantId ?? null),
    ]);

    const restaurantNameById = new Map<string, string>(restaurants.map((item: { id: string; name: string }) => [item.id, item.name]));
    const driverNameById = new Map<string, string>(drivers.map((driver: { id: string; name: string }) => [driver.id, driver.name]));
    const tripById = new Map<string, PrismaDriverTripRow>(trips.map((trip) => [trip.id, trip]));
    const totalOrders = orders.length;
    const activeOrders = orders.filter((order) => activeRestaurantStatuses.includes(order.status as (typeof activeRestaurantStatuses)[number])).length;
    const deliveredOrders = orders.filter((order) => order.status === 'delivered').length;
    const totalRestaurantCharges = Number(orders.reduce((sum, order) => sum + Number(order.companyCharge), 0).toFixed(2));
    const statusAccumulator = new Map<string, number>();
    const byStore = new Map<string, { restaurantId: string; restaurantName: string; totalOrders: number; deliveredOrders: number; totalRestaurantCharges: number }>();
    const byCourier = new Map<string, { driverId: string; driverName: string; totalOrders: number; deliveredOrders: number; totalRestaurantCharges: number }>();
    const byDay = new Map<string, { date: string; totalOrders: number; deliveredOrders: number; totalRestaurantCharges: number }>();
    const byTrip = new Map<string, { tripId: string; driverId: string; driverName: string; orderCount: number; deliveredOrders: number; startedAt: string; completedAt: string | null; totalRestaurantCharges: number }>();

    for (const order of orders) {
      statusAccumulator.set(order.status, (statusAccumulator.get(order.status) ?? 0) + 1);
      const store = byStore.get(order.restaurantId) ?? {
        restaurantId: order.restaurantId,
        restaurantName: restaurantNameById.get(order.restaurantId) ?? 'Unknown store',
        totalOrders: 0,
        deliveredOrders: 0,
        totalRestaurantCharges: 0,
      };
      store.totalOrders += 1;
      store.deliveredOrders += order.status === 'delivered' ? 1 : 0;
      store.totalRestaurantCharges += Number(order.companyCharge);
      byStore.set(order.restaurantId, store);

      if (order.assignedDriverId) {
        const driver = byCourier.get(order.assignedDriverId) ?? {
          driverId: order.assignedDriverId,
          driverName: driverNameById.get(order.assignedDriverId) ?? 'Unknown courier',
          totalOrders: 0,
          deliveredOrders: 0,
          totalRestaurantCharges: 0,
        };
        driver.totalOrders += 1;
        driver.deliveredOrders += order.status === 'delivered' ? 1 : 0;
        driver.totalRestaurantCharges += Number(order.companyCharge);
        byCourier.set(order.assignedDriverId, driver);
      }

      if (order.tripId) {
        const trip = tripById.get(order.tripId) ?? null;
        const driverId = trip?.driverId ?? order.assignedDriverId ?? 'unknown-driver';
        const summary = byTrip.get(order.tripId) ?? {
          tripId: order.tripId,
          driverId,
          driverName: driverNameById.get(driverId) ?? 'Unknown courier',
          orderCount: 0,
          deliveredOrders: 0,
          startedAt: trip?.startedAt.toISOString() ?? order.createdAt.toISOString(),
          completedAt: trip?.completedAt ? trip.completedAt.toISOString() : null,
          totalRestaurantCharges: 0,
        };
        summary.orderCount += 1;
        summary.deliveredOrders += order.status === 'delivered' ? 1 : 0;
        summary.totalRestaurantCharges += Number(order.companyCharge);
        byTrip.set(order.tripId, summary);
      }

      const dayKey = extractDateInTimeZone(order.createdAt.toISOString(), timeZone);
      const day = byDay.get(dayKey) ?? { date: dayKey, totalOrders: 0, deliveredOrders: 0, totalRestaurantCharges: 0 };
      day.totalOrders += 1;
      day.deliveredOrders += order.status === 'delivered' ? 1 : 0;
      day.totalRestaurantCharges += Number(order.companyCharge);
      byDay.set(dayKey, day);
    }

    return {
      totalRestaurants: restaurantIds.length,
      totalOrders,
      activeOrders,
      deliveredOrders,
      totalRestaurantCharges,
      averageRestaurantCharge: totalOrders ? Number((totalRestaurantCharges / totalOrders).toFixed(2)) : 0,
      completionRate: totalOrders ? Number(((deliveredOrders / totalOrders) * 100).toFixed(1)) : 0,
      statusMix: Array.from(statusAccumulator.entries())
        .map(([status, count]) => ({ status, count }))
        .sort((left, right) => right.count - left.count),
      byStore: Array.from(byStore.values())
        .map((item) => ({ ...item, totalRestaurantCharges: Number(item.totalRestaurantCharges.toFixed(2)) }))
        .sort((left, right) => right.totalOrders - left.totalOrders),
      byCourier: Array.from(byCourier.values())
        .map((item) => ({ ...item, totalRestaurantCharges: Number(item.totalRestaurantCharges.toFixed(2)) }))
        .sort((left, right) => right.totalOrders - left.totalOrders),
      byDay: Array.from(byDay.values())
        .map((item) => ({ ...item, totalRestaurantCharges: Number(item.totalRestaurantCharges.toFixed(2)) }))
        .sort((left, right) => left.date.localeCompare(right.date)),
      byTrip: Array.from(byTrip.values())
        .map((item) => ({ ...item, totalRestaurantCharges: Number(item.totalRestaurantCharges.toFixed(2)) }))
        .sort((left, right) => right.orderCount - left.orderCount || left.startedAt.localeCompare(right.startedAt)),
    };
  }

  private async loadReportOrdersForRestaurant(restaurantId: string, range: ReportDateRange, timeZone: string): Promise<PrismaReportOrderRow[]> {
    const params: unknown[] = [restaurantId];
    const clauses = ['restaurant_id = $1'];
    if (range.startDate) {
      params.push(new Date(localDateBoundaryToUtc(range.startDate, timeZone, false)));
      clauses.push(`created_at >= $${params.length}`);
    }
    if (range.endDate) {
      params.push(new Date(localDateBoundaryToUtc(range.endDate, timeZone, true)));
      clauses.push(`created_at <= $${params.length}`);
    }
    return this.prisma.$queryRawUnsafe<PrismaReportOrderRow[]>(`
      select
        id,
        trip_id as "tripId",
        restaurant_id as "restaurantId",
        status,
        company_charge as "companyCharge",
        assigned_driver_id as "assignedDriverId",
        created_at as "createdAt"
      from orders
      where ${clauses.join(' and ')}
      order by created_at desc
    `, ...params);
  }

  private async loadReportOrdersForRestaurants(restaurantIds: string[], range: ReportDateRange, timeZone: string): Promise<PrismaReportOrderRow[]> {
    const params: unknown[] = [restaurantIds];
    const clauses = ['restaurant_id = any($1)'];
    if (range.startDate) {
      params.push(new Date(localDateBoundaryToUtc(range.startDate, timeZone, false)));
      clauses.push(`created_at >= $${params.length}`);
    }
    if (range.endDate) {
      params.push(new Date(localDateBoundaryToUtc(range.endDate, timeZone, true)));
      clauses.push(`created_at <= $${params.length}`);
    }
    return this.prisma.$queryRawUnsafe<PrismaReportOrderRow[]>(`
      select
        id,
        trip_id as "tripId",
        restaurant_id as "restaurantId",
        status,
        company_charge as "companyCharge",
        assigned_driver_id as "assignedDriverId",
        created_at as "createdAt"
      from orders
      where ${clauses.join(' and ')}
      order by created_at desc
    `, ...params);
  }

  private async loadDriverTrips(tenantId: string | null): Promise<PrismaDriverTripRow[]> {
    if (!tenantId) {
      return [];
    }
    return this.prisma.$queryRawUnsafe<PrismaDriverTripRow[]>(`
      select
        id,
        tenant_id as "tenantId",
        driver_id as "driverId",
        status,
        started_at as "startedAt",
        completed_at as "completedAt",
        order_ids as "orderIds",
        restaurant_ids as "restaurantIds"
      from driver_trips
      where tenant_id = $1
      order by started_at desc
    `, tenantId);
  }

  private async loadTenants(): Promise<PrismaTenantRow[]> {
    return this.prisma.$queryRawUnsafe<PrismaTenantRow[]>(`
      select id, name, slug, currency, time_zone as "timeZone", is_active as "isActive", created_at as "createdAt"
      from tenants
      order by id asc
    `);
  }

  private async findTenantById(tenantId: string): Promise<PrismaTenantRow | null> {
    const rows = await this.prisma.$queryRawUnsafe<PrismaTenantRow[]>(`
      select id, name, slug, currency, time_zone as "timeZone", is_active as "isActive", created_at as "createdAt"
      from tenants
      where id = $1
      limit 1
    `, tenantId);
    return rows[0] ?? null;
  }

  private mapTenant(tenant: PrismaTenantRow): TenantRecord {
    return {
      id: tenant.id,
      name: tenant.name,
      slug: tenant.slug,
      currency: normalizeTenantCurrency(tenant.currency),
      timeZone: normalizeTenantTimeZone(tenant.timeZone),
      isActive: tenant.isActive,
      createdAt: tenant.createdAt.toISOString(),
    };
  }

  private mapDriver(driver: PrismaDriverRow): DriverRecord {
    return {
      id: driver.id,
      tenantId: driver.tenantId ?? 'unknown-tenant',
      name: driver.name,
      email: driver.email,
      password: driver.password,
      rating: Number(driver.rating),
      completedOrders: driver.completedOrders,
      totalDistanceKm: Number(driver.totalDistanceKm),
      isOnline: driver.isOnline,
      currentLocation: driver.currentLocation as DriverLocationSnapshot,
      deviceToken: driver.deviceToken,
      dispatchPolicy: driver.dispatchPolicy as DriverDispatchPolicy,
      maxActiveOrders: driver.maxActiveOrders,
    };
  }

  private mapRestaurant(restaurant: PrismaRestaurantRow): RestaurantRecord {
    return {
      id: restaurant.id,
      tenantId: restaurant.tenantId ?? 'unknown-tenant',
      merchantId: restaurant.merchantId,
      name: restaurant.name,
      email: restaurant.email,
      password: restaurant.password,
      pickupLocation: restaurant.pickupLocation as RestaurantRecord['pickupLocation'],
      pricing: {
        driverPayoutRule: restaurant.driverPayoutRule as RestaurantRecord['pricing']['driverPayoutRule'],
        merchantBillingRule: restaurant.merchantBillingRule as RestaurantRecord['pricing']['merchantBillingRule'],
      },
      currency: restaurant.currency,
      distanceUnit: (restaurant.distanceUnit as RestaurantRecord['distanceUnit'] | null) ?? defaultDistanceUnit,
      trackingSettings: restaurant.trackingSettings as RestaurantTrackingSettings,
      driverOfferSettings: (restaurant.driverOfferSettings as RestaurantRecord['driverOfferSettings'] | null) ?? { distanceMode: 'storeToCustomer' },
      staffUsers: (restaurant.staffUsers as RestaurantRecord['staffUsers'] | null) ?? [],
    };
  }

  private mapMerchant(merchant: PrismaMerchantRow): MerchantRecord {
    return {
      id: merchant.id,
      tenantId: merchant.tenantId ?? 'unknown-tenant',
      name: merchant.name,
      users: (merchant.users as MerchantRecord['users'] | null) ?? [],
    };
  }
}
