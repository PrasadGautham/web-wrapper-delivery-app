import { randomUUID } from 'node:crypto';

import {
  AuditLogRecord,
  DatabaseShape,
  DriverRecord,
  RestaurantRecord,
  SessionRecord,
  UserType,
} from '../domain/models.js';
import { DispatchService } from './dispatch-service.js';
import { calculatePricingAmount } from './pricing-rules.js';
import { PushGateway } from './push-gateway.js';
import { hasOperationalStateStore, StoreContract } from './store-contract.js';

export class BackendRuntime {
  constructor(
    private readonly store: StoreContract,
    private readonly dispatchService: DispatchService,
    private readonly pushGateway: PushGateway,
    private readonly sessionHours: number,
    private readonly logger?: { warn: (message: unknown) => void },
  ) {}

  async withDb<T>(callback: (db: DatabaseShape) => Promise<T> | T): Promise<T> {
    const db = await this.store.read();
    this.cleanupExpiredSessions(db);
    this.normalizeOperationalState(db);
    db.auditLogs ??= [];
    return callback(db);
  }

  async withMutableDb<T>(callback: (db: DatabaseShape) => Promise<T> | T): Promise<T> {
    const db = await this.store.read();
    this.cleanupExpiredSessions(db);
    this.normalizeOperationalState(db);
    db.auditLogs ??= [];
    const result = await callback(db);
    await this.flushPendingNotifications(db);
    await this.store.write(db);
    return result;
  }

  async withOperationalDb<T>(
    callback: (state: Pick<DatabaseShape, 'drivers' | 'restaurants' | 'orders'>) => Promise<T> | T,
  ): Promise<T> {
    if (hasOperationalStateStore(this.store)) {
      return this.store.withOperationalReadContext(async (context) => {
        this.normalizeOperationalState(context.state as DatabaseShape);
        return callback(context.state);
      });
    }
    return this.withDb((db) =>
      callback({
        drivers: db.drivers,
        restaurants: db.restaurants,
        orders: db.orders,
      }),
    );
  }

  async withMutableOperationalDb<T>(
    callback: (
      state: Pick<DatabaseShape, 'drivers' | 'restaurants' | 'orders'>,
      appendAuditLog: (input: Omit<AuditLogRecord, 'id' | 'at'>) => Promise<void>,
    ) => Promise<T> | T,
  ): Promise<T> {
    if (hasOperationalStateStore(this.store)) {
      return this.store.withOperationalWriteContext(async (context) => {
        this.normalizeOperationalState(context.state as DatabaseShape);
        const result = await callback(context.state, async (input) => {
          await context.appendAuditLog({
            id: `audit-${randomUUID()}`,
            at: new Date().toISOString(),
            ...input,
          });
        });
        await this.flushPendingNotifications(context.state as DatabaseShape);
        return result;
      });
    }

    return this.withMutableDb(async (db) =>
      callback(
        {
          drivers: db.drivers,
          restaurants: db.restaurants,
          orders: db.orders,
        },
        async (input) => {
          this.appendAuditLog(db, input);
        },
      ),
    );
  }

  createSession(db: DatabaseShape, userType: UserType, userId: string): string {
    this.cleanupExpiredSessions(db);
    db.sessions = db.sessions.filter((item) => !(item.userType === userType && item.userId === userId));
    const token = randomUUID();
    const session: SessionRecord = {
      token,
      userType,
      userId,
      createdAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + this.sessionHours * 60 * 60 * 1000).toISOString(),
    };
    db.sessions.push(session);
    return token;
  }

  requireSession(db: DatabaseShape, token: string, userType: UserType): SessionRecord {
    this.cleanupExpiredSessions(db);
    const session = db.sessions.find((item) => item.token === token && item.userType === userType);
    if (!session) {
      throw new Error('Unauthorized');
    }
    return session;
  }

  requireDriver(db: Pick<DatabaseShape, 'drivers'>, driverId: string): DriverRecord {
    const driver = db.drivers.find((item) => item.id === driverId);
    if (!driver) {
      throw new Error('Driver not found.');
    }
    return driver;
  }

  requireRestaurant(db: Pick<DatabaseShape, 'restaurants'>, restaurantId: string): RestaurantRecord {
    const restaurant = db.restaurants.find((item) => item.id === restaurantId);
    if (!restaurant) {
      throw new Error('Restaurant not found.');
    }
    return restaurant;
  }

  appendAuditLog(db: DatabaseShape, input: Omit<AuditLogRecord, 'id' | 'at'>): void {
    db.auditLogs.unshift({
      id: `audit-${randomUUID()}`,
      at: new Date().toISOString(),
      ...input,
    });
    if (db.auditLogs.length > 5000) {
      db.auditLogs = db.auditLogs.slice(0, 5000);
    }
  }

  private cleanupExpiredSessions(db: DatabaseShape): void {
    const now = Date.now();
    db.sessions = db.sessions.filter((session) => new Date(session.expiresAt).getTime() > now);
  }

  private normalizeOperationalState(db: Pick<DatabaseShape, 'restaurants' | 'orders'>): void {
    for (const order of db.orders) {
      const restaurant = db.restaurants.find((item) => item.id === order.restaurantId);
      if (!restaurant) {
        continue;
      }
      restaurant.driverOfferSettings ??= { distanceMode: 'storeToCustomer' };
      if (typeof order.tripEarnings !== 'number' || !Number.isFinite(order.tripEarnings)) {
        order.tripEarnings = calculatePricingAmount(restaurant.pricing.driverPayoutRule, order.estimatedKm ?? 0);
      }
      if (typeof order.companyCharge !== 'number' || !Number.isFinite(order.companyCharge)) {
        order.companyCharge = calculatePricingAmount(restaurant.pricing.merchantBillingRule, order.estimatedKm ?? 0);
      }
      if (typeof order.driverDisplayDistanceKm !== 'number' || !Number.isFinite(order.driverDisplayDistanceKm)) {
        order.driverDisplayDistanceKm = order.estimatedKm ?? 0;
      }
      if (typeof order.driverDisplayMinutes !== 'number' || !Number.isFinite(order.driverDisplayMinutes)) {
        order.driverDisplayMinutes = order.estimatedMinutes ?? 0;
      }
      if (order.driverDisplayMode !== 'storeToCustomer' && order.driverDisplayMode !== 'includeCommuteToStore') {
        order.driverDisplayMode = restaurant.driverOfferSettings.distanceMode ?? 'storeToCustomer';
      }
    }
  }

  private async flushPendingNotifications(db: Pick<DatabaseShape, 'drivers' | 'orders'>): Promise<void> {
    const notifications = this.dispatchService.getOrdersNeedingDispatchNotification(db as DatabaseShape);
    for (const { driver, order } of notifications) {
      try {
        const sent = await this.pushGateway.sendIncomingOrderOffer(driver, order);
        if (sent) {
          this.dispatchService.markDispatchNotificationSent(order);
        }
      } catch (error) {
        this.logger?.warn({
          message: 'Failed to send incoming order offer.',
          orderId: order.id,
          driverId: driver.id,
          error,
        });
      }
    }
  }
}
