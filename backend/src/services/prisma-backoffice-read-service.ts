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

const capacityStatuses = ['pending', 'accepted', 'atRestaurant', 'pickedUp'] as const;
const activeRestaurantStatuses = ['queued', 'pending', 'accepted', 'atRestaurant', 'pickedUp'] as const;

type PrismaDriverRow = {
  id: string;
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
  merchantId: string;
  name: string;
  email: string;
  password: string;
  pickupLocation: unknown;
  driverPayoutRule: unknown;
  merchantBillingRule: unknown;
  currency: string;
  trackingSettings: unknown;
  staffUsers?: unknown;
};

type PrismaMerchantRow = {
  id: string;
  name: string;
  users?: unknown;
};

export class PrismaBackofficeReadService implements BackofficeReadService {
  constructor(private readonly prisma: PrismaClient) {}

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

  async getRestaurantReport(restaurantId: string): Promise<RestaurantReport> {
    const [totalOrders, activeOrders, deliveredOrders, payouts, charges] = await this.prisma.$transaction([
      this.prisma.order.count({ where: { restaurantId } }),
      this.prisma.order.count({
        where: {
          restaurantId,
          status: { in: [...activeRestaurantStatuses] },
        },
      }),
      this.prisma.order.count({ where: { restaurantId, status: 'delivered' } }),
      this.prisma.order.aggregate({ where: { restaurantId }, _sum: { tripEarnings: true } }),
      this.prisma.order.aggregate({ where: { restaurantId }, _sum: { companyCharge: true } }),
    ]);

    return {
      totalOrders,
      activeOrders,
      deliveredOrders,
      totalDriverPayout: Number((payouts._sum.tripEarnings ?? 0).toFixed(2)),
      totalRestaurantCharges: Number((charges._sum.companyCharge ?? 0).toFixed(2)),
    };
  }

  async getMerchantReport(merchantId: string): Promise<MerchantReport> {
    const restaurantIds = (
      await this.prisma.restaurant.findMany({
        where: { merchantId },
        select: { id: true },
      })
    ).map((item) => item.id);

    if (!restaurantIds.length) {
      return {
        totalRestaurants: 0,
        totalOrders: 0,
        activeOrders: 0,
        deliveredOrders: 0,
        totalDriverPayout: 0,
        totalRestaurantCharges: 0,
      };
    }

    const [totalOrders, activeOrders, deliveredOrders, payouts, charges] = await this.prisma.$transaction([
      this.prisma.order.count({ where: { restaurantId: { in: restaurantIds } } }),
      this.prisma.order.count({
        where: {
          restaurantId: { in: restaurantIds },
          status: { in: [...activeRestaurantStatuses] },
        },
      }),
      this.prisma.order.count({ where: { restaurantId: { in: restaurantIds }, status: 'delivered' } }),
      this.prisma.order.aggregate({ where: { restaurantId: { in: restaurantIds } }, _sum: { tripEarnings: true } }),
      this.prisma.order.aggregate({ where: { restaurantId: { in: restaurantIds } }, _sum: { companyCharge: true } }),
    ]);

    return {
      totalRestaurants: restaurantIds.length,
      totalOrders,
      activeOrders,
      deliveredOrders,
      totalDriverPayout: Number((payouts._sum.tripEarnings ?? 0).toFixed(2)),
      totalRestaurantCharges: Number((charges._sum.companyCharge ?? 0).toFixed(2)),
    };
  }

  private mapDriver(driver: PrismaDriverRow): DriverRecord {
    return {
      id: driver.id,
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
      trackingSettings: restaurant.trackingSettings as RestaurantTrackingSettings,
      staffUsers: (restaurant.staffUsers as RestaurantRecord['staffUsers'] | null) ?? [],
    };
  }

  private mapMerchant(merchant: PrismaMerchantRow): MerchantRecord {
    return {
      id: merchant.id,
      name: merchant.name,
      users: (merchant.users as MerchantRecord['users'] | null) ?? [],
    };
  }
}
