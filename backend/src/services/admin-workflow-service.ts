import { randomUUID } from 'node:crypto';

import {
  AdminUserProfile,
  AuditLogRecord,
  DriverDispatchPolicy,
  DriverProfile,
  MerchantRecord,
  MerchantUserProfile,
  MerchantUserRole,
  MerchantView,
  RestaurantProfile,
  RestaurantStaffRole,
  RestaurantStaffUserProfile,
  RestaurantTrackingSettings,
} from '../domain/models.js';
import { hashPassword } from '../utils/passwords.js';
import { BackofficeReadService } from './backoffice-read-service.js';
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

function createAuditLog(input: Omit<AuditLogRecord, 'id' | 'at'>): AuditLogRecord {
  return {
    id: `audit-${randomUUID()}`,
    at: new Date().toISOString(),
    ...input,
  };
}

function toAdminUserProfile(user: {
  id: string;
  name: string;
  email: string;
  role: AdminUserProfile['role'];
  isActive: boolean;
  lastLoginAt: string | null;
}): AdminUserProfile {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role,
    isActive: user.isActive,
    lastLoginAt: user.lastLoginAt,
  };
}

export class AdminWorkflowService {
  constructor(
    private readonly runtime: BackendRuntime,
    private readonly dispatchService: DispatchService,
    private readonly backofficeReadService: BackofficeReadService | null,
    private readonly workflowStore: WorkflowStoreContract | null = null,
  ) {}

  async listDrivers(): Promise<DriverProfile[]> {
    if (this.backofficeReadService) {
      return this.backofficeReadService.listDrivers();
    }
    return this.runtime.withDb(async (db) =>
      db.drivers.map((driver) => toDriverProfile(driver, this.dispatchService.getDriverLoad(db, driver.id))),
    );
  }

  async listRestaurants(): Promise<RestaurantProfile[]> {
    if (this.backofficeReadService) {
      return this.backofficeReadService.listRestaurants();
    }
    return this.runtime.withDb(async (db) => db.restaurants.map((restaurant) => toRestaurantProfile(restaurant)));
  }

  async listMerchants(): Promise<MerchantView[]> {
    if (this.backofficeReadService) {
      return this.backofficeReadService.listMerchants();
    }
    return this.runtime.withDb(async (db) => db.merchants.map((merchant) => toMerchantView(merchant)));
  }

  async listAdminUsers(): Promise<AdminUserProfile[]> {
    return this.runtime.withDb(async (db) => (db.adminUsers ?? []).map((item) => toAdminUserProfile(item)));
  }

  async createAdminUser(input: {
    name: string;
    email: string;
    password: string;
    role: AdminUserProfile['role'];
  }): Promise<AdminUserProfile> {
    return this.runtime.withMutableDb(async (db) => {
      db.adminUsers ??= [];
      if (db.adminUsers.some((item) => item.email.toLowerCase() === input.email.toLowerCase())) {
        throw new Error('Admin user email already exists.');
      }
      const user = {
        id: `admin-${randomUUID()}`,
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

  async updateRestaurantTrackingSettings(restaurantId: string, settings: RestaurantTrackingSettings): Promise<RestaurantProfile> {
    if (!this.workflowStore) {
      return this.runtime.withMutableDb(async (db) => {
        const restaurant = this.runtime.requireRestaurant(db, restaurantId);
        restaurant.trackingSettings = { ...settings };
        this.runtime.appendAuditLog(db, {
          actorType: 'admin',
          actorId: 'admin-api',
          action: 'restaurant.tracking-settings.updated',
          entityType: 'restaurant',
          entityId: restaurantId,
          metadata: settings as unknown as Record<string, unknown>,
        });
        return toRestaurantProfile(restaurant);
      });
    }

    return this.workflowStore.withWorkflowWriteContext(async (context) => {
      const restaurant = await context.findRestaurantById(restaurantId);
      if (!restaurant) {
        throw new Error('Restaurant not found.');
      }
      restaurant.trackingSettings = { ...settings };
      await context.saveRestaurant(restaurant);
      await context.appendAuditLog(createAuditLog({ actorType: 'admin', actorId: 'admin-api', action: 'restaurant.tracking-settings.updated', entityType: 'restaurant', entityId: restaurantId, metadata: settings as unknown as Record<string, unknown> }));
      return toRestaurantProfile(restaurant);
    });
  }

  private requireMerchant(merchants: MerchantRecord[], merchantId: string): MerchantRecord {
    const merchant = merchants.find((item) => item.id === merchantId);
    if (!merchant) {
      throw new Error('Merchant not found.');
    }
    return merchant;
  }

  private async normalizeAndValidateDispatchPolicy(
    findRestaurant: (restaurantId: string) => Promise<{ id: string } | null>,
    findMerchant: (merchantId: string) => Promise<MerchantRecord | null>,
    policy: DriverDispatchPolicy,
  ): Promise<DriverDispatchPolicy> {
    const restaurantIds = [...new Set(policy.restaurantIds)];
    const merchantIds = [...new Set(policy.merchantIds)];

    for (const restaurantId of restaurantIds) {
      const restaurant = await findRestaurant(restaurantId);
      if (!restaurant) {
        throw new Error('Restaurant not found.');
      }
    }
    for (const merchantId of merchantIds) {
      const merchant = await findMerchant(merchantId);
      if (!merchant) {
        throw new Error(`Merchant not found: ${merchantId}`);
      }
    }

    return {
      mode: policy.mode,
      restaurantIds,
      merchantIds,
    };
  }
}
