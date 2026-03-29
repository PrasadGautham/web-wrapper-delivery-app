import { randomUUID } from 'node:crypto';

import {
  MerchantProfile,
  MerchantRecord,
  MerchantReport,
  MerchantRestaurantProfile,
  RestaurantRecord,
  RestaurantReport,
  RestaurantStaffRole,
  RestaurantStaffUserProfile,
  StoreOrderView,
  DriverOfferSettings,
} from '../domain/models.js';
import { hashPassword } from '../utils/passwords.js';
import { BackofficeReadService } from './backoffice-read-service.js';
import { BackendRuntime } from './backend-runtime.js';
import { DispatchService } from './dispatch-service.js';
import { toMerchantProfile, toMerchantRestaurantProfile, toRestaurantStaffProfile } from './profile-projections.js';
import { ReportDateRange } from '../utils/reporting.js';
import { extractDateInTimeZone, normalizeTenantTimeZone } from '../utils/timezones.js';

export class MerchantWorkflowService {
  constructor(
    private readonly runtime: BackendRuntime,
    private readonly dispatchService: DispatchService,
    private readonly restaurantWorkflowService: {
      getRestaurantOrders(restaurantId: string, range?: ReportDateRange): Promise<StoreOrderView[]>;
      getRestaurantReport(restaurantId: string, range?: ReportDateRange): Promise<RestaurantReport>;
    },
    private readonly backofficeReadService: BackofficeReadService | null,
  ) {}

  async getMerchantProfile(merchantId: string): Promise<MerchantProfile> {
    return this.runtime.withDb(async (db) => {
      const merchant = db.merchants.find((item) => item.id === merchantId);
      if (!merchant) {
        throw new Error('Merchant not found.');
      }
      const tenant = db.tenants.find((item) => item.id === merchant.tenantId) ?? null;
      return toMerchantProfile(merchant, tenant);
    });
  }

  async listMerchantRestaurants(merchantId: string): Promise<MerchantRestaurantProfile[]> {
    return this.runtime.withDb(async (db) =>
      db.restaurants.filter((restaurant) => restaurant.merchantId === merchantId).map((restaurant) => toMerchantRestaurantProfile(restaurant, db.tenants.find((item) => item.id === restaurant.tenantId) ?? null)),
    );
  }

  async getMerchantOrders(merchantId: string, range: ReportDateRange = {}): Promise<Array<{ restaurant: MerchantRestaurantProfile; orders: StoreOrderView[] }>> {
    const restaurants = await this.listMerchantRestaurants(merchantId);
    return Promise.all(restaurants.map(async (restaurant) => ({
      restaurant,
      orders: await this.restaurantWorkflowService.getRestaurantOrders(restaurant.id, range),
    })));
  }

  async getMerchantReport(merchantId: string, range: ReportDateRange = {}): Promise<MerchantReport> {
    if (this.backofficeReadService) {
      return this.backofficeReadService.getMerchantReport(merchantId, range);
    }
    const restaurants = await this.listMerchantRestaurants(merchantId);
    const reports = await Promise.all(restaurants.map((restaurant) => this.restaurantWorkflowService.getRestaurantReport(restaurant.id, range)));
    const groups = await this.getMerchantOrders(merchantId, range);
    const allOrders = groups.flatMap((group) => group.orders.map((order) => ({ restaurant: group.restaurant, order })));
    const byCourier = new Map<string, { driverId: string; driverName: string; totalOrders: number; deliveredOrders: number; totalRestaurantCharges: number }>();
    const timeZone = normalizeTenantTimeZone(restaurants[0]?.timeZone);
    const byDay = new Map<string, { date: string; totalOrders: number; deliveredOrders: number; totalRestaurantCharges: number }>();
    for (const item of allOrders) {
      if (item.order.assignedDriverId && item.order.tracking.assignedDriverName) {
        const driver = byCourier.get(item.order.assignedDriverId) || { driverId: item.order.assignedDriverId, driverName: item.order.tracking.assignedDriverName, totalOrders: 0, deliveredOrders: 0, totalRestaurantCharges: 0 };
        driver.totalOrders += 1;
        driver.deliveredOrders += item.order.status === 'delivered' ? 1 : 0;
        driver.totalRestaurantCharges += item.order.companyCharge;
        byCourier.set(item.order.assignedDriverId, driver);
      }
      const dayKey = extractDateInTimeZone(item.order.createdAt, timeZone);
      const day = byDay.get(dayKey) || { date: dayKey, totalOrders: 0, deliveredOrders: 0, totalRestaurantCharges: 0 };
      day.totalOrders += 1;
      day.deliveredOrders += item.order.status === 'delivered' ? 1 : 0;
      day.totalRestaurantCharges += item.order.companyCharge;
      byDay.set(dayKey, day);
    }
    const totalOrders = reports.reduce((sum, item) => sum + item.totalOrders, 0);
    const deliveredOrders = reports.reduce((sum, item) => sum + item.deliveredOrders, 0);
    const totalRestaurantCharges = Number(reports.reduce((sum, item) => sum + item.totalRestaurantCharges, 0).toFixed(2));
    return {
      totalRestaurants: restaurants.length,
      totalOrders,
      activeOrders: reports.reduce((sum, item) => sum + item.activeOrders, 0),
      deliveredOrders,
      totalRestaurantCharges,
      averageRestaurantCharge: totalOrders ? Number((totalRestaurantCharges / totalOrders).toFixed(2)) : 0,
      completionRate: totalOrders ? Number(((deliveredOrders / totalOrders) * 100).toFixed(1)) : 0,
      statusMix: Array.from(allOrders.reduce((map, item) => {
        map.set(item.order.status, (map.get(item.order.status) || 0) + 1);
        return map;
      }, new Map<string, number>()).entries()).map(([status, count]) => ({ status, count })).sort((left, right) => right.count - left.count),
      byStore: restaurants.map((restaurant, index) => ({
        restaurantId: restaurant.id,
        restaurantName: restaurant.name,
        totalOrders: reports[index].totalOrders,
        deliveredOrders: reports[index].deliveredOrders,
        totalRestaurantCharges: reports[index].totalRestaurantCharges,
      })).sort((left, right) => right.totalOrders - left.totalOrders),
      byCourier: Array.from(byCourier.values()).map((item) => ({ ...item, totalRestaurantCharges: Number(item.totalRestaurantCharges.toFixed(2)) })).sort((left, right) => right.totalOrders - left.totalOrders),
      byDay: Array.from(byDay.values()).map((item) => ({ ...item, totalRestaurantCharges: Number(item.totalRestaurantCharges.toFixed(2)) })).sort((left, right) => left.date.localeCompare(right.date)),
    };
  }

  async listRestaurantStaffUsers(merchant: MerchantRecord, restaurantId: string): Promise<RestaurantStaffUserProfile[]> {
    return this.runtime.withDb(async (db) => {
      const restaurant = this.requireMerchantRestaurant(db.restaurants, merchant.id, restaurantId);
      return restaurant.staffUsers.map((user) => toRestaurantStaffProfile(user));
    });
  }

  async createRestaurantStaffUser(
    merchant: MerchantRecord,
    restaurantId: string,
    input: { name: string; email: string; password: string; role: RestaurantStaffRole },
  ): Promise<RestaurantStaffUserProfile> {
    return this.runtime.withMutableDb(async (db) => {
      const restaurant = this.requireMerchantRestaurant(db.restaurants, merchant.id, restaurantId);
      if (restaurant.staffUsers.some((user) => user.email.toLowerCase() === input.email.toLowerCase())) {
        throw new Error('Restaurant staff email already exists for this store.');
      }
      const staffUser: RestaurantRecord['staffUsers'][number] = {
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
        actorType: 'merchant',
        actorId: merchant.id,
        action: 'merchant.restaurant-staff-user.created',
        entityType: 'restaurant-staff-user',
        entityId: staffUser.id,
        metadata: { restaurantId },
      });
      return toRestaurantStaffProfile(staffUser);
    });
  }

  async updateRestaurantStaffUser(
    merchant: MerchantRecord,
    restaurantId: string,
    staffUserId: string,
    input: { name?: string; password?: string; role?: RestaurantStaffRole; isActive?: boolean },
  ): Promise<RestaurantStaffUserProfile> {
    return this.runtime.withMutableDb(async (db) => {
      const restaurant = this.requireMerchantRestaurant(db.restaurants, merchant.id, restaurantId);
      const staffUser = restaurant.staffUsers.find((item) => item.id === staffUserId);
      if (!staffUser) {
        throw new Error('Restaurant staff user not found.');
      }
      if (input.name != null) staffUser.name = input.name;
      if (input.role != null) staffUser.role = input.role;
      if (input.isActive != null) staffUser.isActive = input.isActive;
      if (input.password) staffUser.password = await hashPassword(input.password);
      this.runtime.appendAuditLog(db, {
        actorType: 'merchant',
        actorId: merchant.id,
        action: 'merchant.restaurant-staff-user.updated',
        entityType: 'restaurant-staff-user',
        entityId: staffUser.id,
        metadata: { restaurantId },
      });
      return toRestaurantStaffProfile(staffUser);
    });
  }

  async updateRestaurantDriverOfferSettings(
    merchant: MerchantRecord,
    restaurantId: string,
    settings: DriverOfferSettings,
  ): Promise<MerchantRestaurantProfile> {
    return this.runtime.withMutableDb(async (db) => {
      const restaurant = this.requireMerchantRestaurant(db.restaurants, merchant.id, restaurantId);
      restaurant.driverOfferSettings = { ...settings };
      this.runtime.appendAuditLog(db, {
        actorType: 'merchant',
        actorId: merchant.id,
        action: 'merchant.restaurant-driver-offer-settings.updated',
        entityType: 'restaurant',
        entityId: restaurantId,
        metadata: settings as unknown as Record<string, unknown>,
      });
      return toMerchantRestaurantProfile(restaurant, db.tenants.find((item) => item.id === restaurant.tenantId) ?? null);
    });
  }

  async updateRestaurantTrackingSettings(
    merchant: MerchantRecord,
    restaurantId: string,
    settings: RestaurantRecord['trackingSettings'],
  ): Promise<MerchantRestaurantProfile> {
    return this.runtime.withMutableDb(async (db) => {
      const restaurant = this.requireMerchantRestaurant(db.restaurants, merchant.id, restaurantId);
      restaurant.trackingSettings = { ...settings };
      this.runtime.appendAuditLog(db, {
        actorType: 'merchant',
        actorId: merchant.id,
        action: 'merchant.restaurant-tracking-settings.updated',
        entityType: 'restaurant',
        entityId: restaurantId,
        metadata: settings as unknown as Record<string, unknown>,
      });
      return toMerchantRestaurantProfile(restaurant, db.tenants.find((item) => item.id === restaurant.tenantId) ?? null);
    });
  }
  private requireMerchantRestaurant(restaurants: RestaurantRecord[], merchantId: string, restaurantId: string): RestaurantRecord {
    const restaurant = restaurants.find((item) => item.id === restaurantId && item.merchantId === merchantId);
    if (!restaurant) {
      throw new Error('Restaurant not found for merchant.');
    }
    return restaurant;
  }
}






