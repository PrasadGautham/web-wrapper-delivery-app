import { randomUUID } from 'node:crypto';

import {
  DistancePricingRule,
  MerchantProfile,
  MerchantRecord,
  MerchantReport,
  RestaurantOrderView,
  RestaurantProfile,
  RestaurantRecord,
  RestaurantReport,
  RestaurantStaffRole,
  RestaurantStaffUserProfile,
} from '../domain/models.js';
import { hashPassword } from '../utils/passwords.js';
import { BackofficeReadService } from './backoffice-read-service.js';
import { BackendRuntime } from './backend-runtime.js';
import { DispatchService } from './dispatch-service.js';
import { toMerchantProfile, toRestaurantProfile, toRestaurantStaffProfile } from './profile-projections.js';
import { assertValidPricingRule, normalizePricingRule } from './pricing-rules.js';

export class MerchantWorkflowService {
  constructor(
    private readonly runtime: BackendRuntime,
    private readonly dispatchService: DispatchService,
    private readonly restaurantWorkflowService: {
      getRestaurantOrders(restaurantId: string): Promise<RestaurantOrderView[]>;
      getRestaurantReport(restaurantId: string): Promise<RestaurantReport>;
    },
    private readonly backofficeReadService: BackofficeReadService | null,
  ) {}

  async getMerchantProfile(merchantId: string): Promise<MerchantProfile> {
    return this.runtime.withDb(async (db) => {
      const merchant = db.merchants.find((item) => item.id === merchantId);
      if (!merchant) {
        throw new Error('Merchant not found.');
      }
      return toMerchantProfile(merchant);
    });
  }

  async listMerchantRestaurants(merchantId: string): Promise<RestaurantProfile[]> {
    return this.runtime.withOperationalDb(async (state) =>
      state.restaurants.filter((restaurant) => restaurant.merchantId === merchantId).map((restaurant) => toRestaurantProfile(restaurant)),
    );
  }

  async getMerchantOrders(merchantId: string): Promise<Array<{ restaurant: RestaurantProfile; orders: RestaurantOrderView[] }>> {
    const restaurants = await this.listMerchantRestaurants(merchantId);
    return Promise.all(restaurants.map(async (restaurant) => ({
      restaurant,
      orders: await this.restaurantWorkflowService.getRestaurantOrders(restaurant.id),
    })));
  }

  async getMerchantReport(merchantId: string): Promise<MerchantReport> {
    if (this.backofficeReadService) {
      return this.backofficeReadService.getMerchantReport(merchantId);
    }
    const restaurants = await this.listMerchantRestaurants(merchantId);
    const reports = await Promise.all(restaurants.map((restaurant) => this.restaurantWorkflowService.getRestaurantReport(restaurant.id)));
    return {
      totalRestaurants: restaurants.length,
      totalOrders: reports.reduce((sum, item) => sum + item.totalOrders, 0),
      activeOrders: reports.reduce((sum, item) => sum + item.activeOrders, 0),
      deliveredOrders: reports.reduce((sum, item) => sum + item.deliveredOrders, 0),
      totalDriverPayout: Number(reports.reduce((sum, item) => sum + item.totalDriverPayout, 0).toFixed(2)),
      totalRestaurantCharges: Number(reports.reduce((sum, item) => sum + item.totalRestaurantCharges, 0).toFixed(2)),
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

  async updateRestaurantPricing(
    merchant: MerchantRecord,
    restaurantId: string,
    pricing: { driverPayoutRule: DistancePricingRule; merchantBillingRule: DistancePricingRule },
  ): Promise<RestaurantProfile> {
    return this.runtime.withMutableDb(async (db) => {
      const restaurant = this.requireMerchantRestaurant(db.restaurants, merchant.id, restaurantId);
      restaurant.pricing = {
        driverPayoutRule: normalizePricingRule(pricing.driverPayoutRule),
        merchantBillingRule: normalizePricingRule(pricing.merchantBillingRule),
      };
      this.runtime.appendAuditLog(db, {
        actorType: 'merchant',
        actorId: merchant.id,
        action: 'merchant.restaurant-pricing.updated',
        entityType: 'restaurant',
        entityId: restaurantId,
        metadata: pricing as unknown as Record<string, unknown>,
      });
      return toRestaurantProfile(restaurant);
    });
  }

  async updateRestaurantTrackingSettings(
    merchant: MerchantRecord,
    restaurantId: string,
    settings: RestaurantRecord['trackingSettings'],
  ): Promise<RestaurantProfile> {
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
      return toRestaurantProfile(restaurant);
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





