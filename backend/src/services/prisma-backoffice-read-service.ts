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
} from '../domain/models.js';
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

export class PrismaBackofficeReadService implements BackofficeReadService {
  constructor(private readonly prisma: PrismaClient) {}

  private toOrderDateWhere(range: ReportDateRange = {}) {
    const createdAt = {
      ...(range.startDate ? { gte: new Date(`${range.startDate}T00:00:00.000Z`) } : {}),
      ...(range.endDate ? { lte: new Date(`${range.endDate}T23:59:59.999Z`) } : {}),
    };
    return Object.keys(createdAt).length ? { createdAt } : {};
  }

  async listDrivers(): Promise<DriverProfile[]> {
    const [drivers, activeAssignments] = await this.prisma.$transaction([
      this.prisma.driver.findMany({ orderBy: { id: 'asc' } }),
      this.prisma.order.findMany({
        where: {
          assignedDriverId: { not: null },
          status: { in: [...capacityStatuses] },
        },
        select: { assignedDriverId: true },
      }),
    ]);

    const loadByDriverId = new Map<string, number>();
    for (const row of activeAssignments) {
      if (!row.assignedDriverId) {
        continue;
      }
      loadByDriverId.set(row.assignedDriverId, (loadByDriverId.get(row.assignedDriverId) ?? 0) + 1);
    }

    return drivers.map((driver) =>
      toDriverProfile(this.mapDriver(driver), loadByDriverId.get(driver.id) ?? 0),
    );
  }

  async listRestaurants(): Promise<RestaurantProfile[]> {
    const restaurants = await this.prisma.restaurant.findMany({ orderBy: { id: 'asc' } });
    return restaurants.map((restaurant) => toRestaurantProfile(this.mapRestaurant(restaurant)));
  }

  async listMerchants(): Promise<MerchantView[]> {
    const merchants = await this.prisma.merchant.findMany({ orderBy: { id: 'asc' } });
    return merchants.map((merchant) => toMerchantView(this.mapMerchant(merchant)));
  }

  async getRestaurantReport(restaurantId: string, range: ReportDateRange = {}): Promise<RestaurantReport> {
    const dateWhere = this.toOrderDateWhere(range);
    const [orders, drivers] = await this.prisma.$transaction([
      this.prisma.order.findMany({
        where: { restaurantId, ...dateWhere },
        select: {
          status: true,
          companyCharge: true,
          tripEarnings: true,
          assignedDriverId: true,
          createdAt: true,
        },
      }),
      this.prisma.driver.findMany({ select: { id: true, name: true } }),
    ]);
    const driverNameById = new Map(drivers.map((driver) => [driver.id, driver.name]));
    const totalOrders = orders.length;
    const activeOrders = orders.filter((order) => activeRestaurantStatuses.includes(order.status as (typeof activeRestaurantStatuses)[number])).length;
    const deliveredOrders = orders.filter((order) => order.status === 'delivered').length;
    const totalRestaurantCharges = Number(orders.reduce((sum, order) => sum + Number(order.companyCharge), 0).toFixed(2));
    const statusMix = Array.from(orders.reduce((map, order) => {
      map.set(order.status, (map.get(order.status) || 0) + 1);
      return map;
    }, new Map<string, number>()).entries()).map(([status, count]) => ({ status, count })).sort((left, right) => right.count - left.count);
    const byCourier = new Map<string, { driverId: string; driverName: string; totalOrders: number; deliveredOrders: number; totalRestaurantCharges: number }>();
    const byDay = new Map<string, { date: string; totalOrders: number; deliveredOrders: number; totalRestaurantCharges: number }>();
    for (const order of orders) {
      if (order.assignedDriverId) {
        const driver = byCourier.get(order.assignedDriverId) || { driverId: order.assignedDriverId, driverName: driverNameById.get(order.assignedDriverId) || 'Unknown courier', totalOrders: 0, deliveredOrders: 0, totalRestaurantCharges: 0 };
        driver.totalOrders += 1;
        driver.deliveredOrders += order.status === 'delivered' ? 1 : 0;
        driver.totalRestaurantCharges += Number(order.companyCharge);
        byCourier.set(order.assignedDriverId, driver);
      }
      const dayKey = order.createdAt.toISOString().slice(0, 10);
      const day = byDay.get(dayKey) || { date: dayKey, totalOrders: 0, deliveredOrders: 0, totalRestaurantCharges: 0 };
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
      statusMix,
      byCourier: Array.from(byCourier.values()).map((item) => ({ ...item, totalRestaurantCharges: Number(item.totalRestaurantCharges.toFixed(2)) })).sort((left, right) => right.totalOrders - left.totalOrders),
      byDay: Array.from(byDay.values()).map((item) => ({ ...item, totalRestaurantCharges: Number(item.totalRestaurantCharges.toFixed(2)) })).sort((left, right) => left.date.localeCompare(right.date)),
    };
  }

  async getMerchantReport(merchantId: string, range: ReportDateRange = {}): Promise<MerchantReport> {
    const restaurants = await this.prisma.restaurant.findMany({ where: { merchantId }, select: { id: true, name: true } });
    const restaurantIds = restaurants.map((item) => item.id);

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
      };
    }

    const dateWhere = this.toOrderDateWhere(range);
    const [orders, drivers] = await this.prisma.$transaction([
      this.prisma.order.findMany({
        where: { restaurantId: { in: restaurantIds }, ...dateWhere },
        select: {
          restaurantId: true,
          status: true,
          companyCharge: true,
          tripEarnings: true,
          assignedDriverId: true,
          createdAt: true,
        },
      }),
      this.prisma.driver.findMany({ select: { id: true, name: true } }),
    ]);
    const restaurantNameById = new Map(restaurants.map((restaurant) => [restaurant.id, restaurant.name]));
    const driverNameById = new Map(drivers.map((driver) => [driver.id, driver.name]));
    const totalOrders = orders.length;
    const activeOrders = orders.filter((order) => activeRestaurantStatuses.includes(order.status as (typeof activeRestaurantStatuses)[number])).length;
    const deliveredOrders = orders.filter((order) => order.status === 'delivered').length;
    const totalRestaurantCharges = Number(orders.reduce((sum, order) => sum + Number(order.companyCharge), 0).toFixed(2));
    const statusMix = Array.from(orders.reduce((map, order) => {
      map.set(order.status, (map.get(order.status) || 0) + 1);
      return map;
    }, new Map<string, number>()).entries()).map(([status, count]) => ({ status, count })).sort((left, right) => right.count - left.count);
    const byStore = new Map<string, { restaurantId: string; restaurantName: string; totalOrders: number; deliveredOrders: number; totalRestaurantCharges: number }>();
    const byCourier = new Map<string, { driverId: string; driverName: string; totalOrders: number; deliveredOrders: number; totalRestaurantCharges: number }>();
    const byDay = new Map<string, { date: string; totalOrders: number; deliveredOrders: number; totalRestaurantCharges: number }>();
    for (const order of orders) {
      const store = byStore.get(order.restaurantId) || { restaurantId: order.restaurantId, restaurantName: restaurantNameById.get(order.restaurantId) || 'Unknown store', totalOrders: 0, deliveredOrders: 0, totalRestaurantCharges: 0 };
      store.totalOrders += 1;
      store.deliveredOrders += order.status === 'delivered' ? 1 : 0;
      store.totalRestaurantCharges += Number(order.companyCharge);
      byStore.set(order.restaurantId, store);
      if (order.assignedDriverId) {
        const driver = byCourier.get(order.assignedDriverId) || { driverId: order.assignedDriverId, driverName: driverNameById.get(order.assignedDriverId) || 'Unknown courier', totalOrders: 0, deliveredOrders: 0, totalRestaurantCharges: 0 };
        driver.totalOrders += 1;
        driver.deliveredOrders += order.status === 'delivered' ? 1 : 0;
        driver.totalRestaurantCharges += Number(order.companyCharge);
        byCourier.set(order.assignedDriverId, driver);
      }
      const dayKey = order.createdAt.toISOString().slice(0, 10);
      const day = byDay.get(dayKey) || { date: dayKey, totalOrders: 0, deliveredOrders: 0, totalRestaurantCharges: 0 };
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
      statusMix,
      byStore: Array.from(byStore.values()).map((item) => ({ ...item, totalRestaurantCharges: Number(item.totalRestaurantCharges.toFixed(2)) })).sort((left, right) => right.totalOrders - left.totalOrders),
      byCourier: Array.from(byCourier.values()).map((item) => ({ ...item, totalRestaurantCharges: Number(item.totalRestaurantCharges.toFixed(2)) })).sort((left, right) => right.totalOrders - left.totalOrders),
      byDay: Array.from(byDay.values()).map((item) => ({ ...item, totalRestaurantCharges: Number(item.totalRestaurantCharges.toFixed(2)) })).sort((left, right) => left.date.localeCompare(right.date)),
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
      distanceUnit: (restaurant.distanceUnit as RestaurantRecord['distanceUnit'] | null) ?? 'kilometer',
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
