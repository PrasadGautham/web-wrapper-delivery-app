import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { DatabaseShape } from '../domain/models.js';
import {
  OperationalStateContext,
  OperationalStateStoreContract,
  StoreContract,
  WorkflowStoreContext,
  WorkflowStoreContract,
} from './store-contract.js';

const activeLoadStatuses = new Set(['pending', 'accepted', 'atRestaurant', 'pickedUp']);

export class FileStore implements StoreContract, WorkflowStoreContract, OperationalStateStoreContract {
  constructor(private readonly dataFilePath: string, private readonly seedFilePath: string) {}

  async read(): Promise<DatabaseShape> {
    await this.ensureStoreExists();
    const raw = await readFile(this.dataFilePath, 'utf8');
    return JSON.parse(raw) as DatabaseShape;
  }

  async write(data: DatabaseShape): Promise<void> {
    await mkdir(path.dirname(this.dataFilePath), { recursive: true });
    await writeFile(this.dataFilePath, `${JSON.stringify(data, null, 2)}\n`, 'utf8');
  }

  async withWorkflowReadContext<T>(callback: (context: WorkflowStoreContext) => Promise<T> | T): Promise<T> {
    const db = await this.read();
    return callback(this.createWorkflowContext(db));
  }

  async withWorkflowWriteContext<T>(callback: (context: WorkflowStoreContext) => Promise<T> | T): Promise<T> {
    const db = await this.read();
    const result = await callback(this.createWorkflowContext(db));
    await this.write(db);
    return result;
  }

  async withOperationalReadContext<T>(callback: (context: OperationalStateContext) => Promise<T> | T): Promise<T> {
    const db = await this.read();
    return callback(this.createOperationalContext(db));
  }

  async withOperationalWriteContext<T>(callback: (context: OperationalStateContext) => Promise<T> | T): Promise<T> {
    const db = await this.read();
    const result = await callback(this.createOperationalContext(db));
    await this.write(db);
    return result;
  }

  private createOperationalContext(db: DatabaseShape): OperationalStateContext {
    return {
      state: {
        drivers: db.drivers,
        driverTrips: db.driverTrips,
        restaurants: db.restaurants,
        orders: db.orders,
      },
      appendAuditLog: async (log) => {
        db.auditLogs ??= [];
        db.auditLogs.unshift(log);
        if (db.auditLogs.length > 5000) {
          db.auditLogs = db.auditLogs.slice(0, 5000);
        }
      },
    };
  }

  private createWorkflowContext(db: DatabaseShape): WorkflowStoreContext {
    db.tenants ??= [];
    db.passwordResetTokens ??= [];
    db.adminUsers ??= [];
    db.driverTrips ??= [];
    return {
      listTenants: async () => db.tenants,
      findTenantById: async (tenantId) => db.tenants.find((item) => item.id === tenantId) ?? null,
      findTenantBySlug: async (slug) => db.tenants.find((item) => item.slug.toLowerCase() === slug.toLowerCase()) ?? null,
      saveTenant: async (tenant) => {
        const index = db.tenants.findIndex((item) => item.id === tenant.id);
        if (index >= 0) {
          db.tenants[index] = tenant;
        } else {
          db.tenants.push(tenant);
        }
      },
      findDriverByEmail: async (email) => db.drivers.find((item) => item.email.toLowerCase() === email.toLowerCase()) ?? null,
      findDriverById: async (driverId) => db.drivers.find((item) => item.id === driverId) ?? null,
      countDriverActiveLoad: async (driverId) =>
        db.orders.filter((order) => order.assignedDriverId === driverId && activeLoadStatuses.has(order.status)).length,
      saveDriver: async (driver) => {
        const index = db.drivers.findIndex((item) => item.id === driver.id);
        if (index >= 0) {
          db.drivers[index] = driver;
        }
      },
      findRestaurantByEmail: async (email) => db.restaurants.find((item) => item.email.toLowerCase() === email.toLowerCase()) ?? null,
      findRestaurantByStaffEmail: async (email) => db.restaurants.find((item) => item.staffUsers.some((user) => user.email.toLowerCase() === email.toLowerCase())) ?? null,
      findRestaurantById: async (restaurantId) => db.restaurants.find((item) => item.id === restaurantId) ?? null,
      saveRestaurant: async (restaurant) => {
        const index = db.restaurants.findIndex((item) => item.id === restaurant.id);
        if (index >= 0) {
          db.restaurants[index] = restaurant;
        }
      },
      findMerchantById: async (merchantId) => db.merchants.find((item) => item.id === merchantId) ?? null,
      findMerchantByUserEmail: async (email) => db.merchants.find((item) => item.users.some((user) => user.email.toLowerCase() === email.toLowerCase())) ?? null,
      saveMerchant: async (merchant) => {
        const index = db.merchants.findIndex((item) => item.id === merchant.id);
        if (index >= 0) {
          db.merchants[index] = merchant;
        }
      },
      findAdminUserByEmail: async (email) => db.adminUsers.find((item) => item.email.toLowerCase() === email.toLowerCase()) ?? null,
      findAdminUserById: async (adminUserId) => db.adminUsers.find((item) => item.id === adminUserId) ?? null,
      saveAdminUser: async (adminUser) => {
        const index = db.adminUsers.findIndex((item) => item.id === adminUser.id);
        if (index >= 0) {
          db.adminUsers[index] = adminUser;
        } else {
          db.adminUsers.push(adminUser);
        }
      },
      findSessionByToken: async (token) => db.sessions.find((item) => item.token === token) ?? null,
      replaceSession: async (session) => {
        db.sessions = db.sessions.filter((item) => !(item.userType === session.userType && item.userId === session.userId));
        db.sessions.push(session);
      },
      deleteSession: async (token) => {
        db.sessions = db.sessions.filter((item) => item.token !== token);
      },
      deleteSessionsForUser: async (userType, userId) => {
        db.sessions = db.sessions.filter((item) => !(item.userType === userType && item.userId === userId));
      },
      deleteExpiredSessions: async (nowIso) => {
        const cutoff = new Date(nowIso).getTime();
        db.sessions = db.sessions.filter((item) => new Date(item.expiresAt).getTime() > cutoff);
      },
      findPasswordResetTokenByHash: async (tokenHash, userType) =>
        db.passwordResetTokens.find((item) => item.tokenHash === tokenHash && item.userType === userType) ?? null,
      savePasswordResetToken: async (record) => {
        const index = db.passwordResetTokens.findIndex((item) => item.id === record.id);
        if (index >= 0) {
          db.passwordResetTokens[index] = record;
        } else {
          db.passwordResetTokens.push(record);
        }
      },
      deletePasswordResetToken: async (id) => {
        db.passwordResetTokens = db.passwordResetTokens.filter((item) => item.id !== id);
      },
      deletePasswordResetTokensForUser: async (userType, userId) => {
        db.passwordResetTokens = db.passwordResetTokens.filter((item) => !(item.userType === userType && item.userId === userId));
      },
      deleteExpiredPasswordResetTokens: async (nowIso) => {
        const cutoff = new Date(nowIso).getTime();
        db.passwordResetTokens = db.passwordResetTokens.filter((item) => new Date(item.expiresAt).getTime() > cutoff);
      },
      appendAuditLog: async (log) => {
        db.auditLogs ??= [];
        db.auditLogs.unshift(log);
        if (db.auditLogs.length > 5000) {
          db.auditLogs = db.auditLogs.slice(0, 5000);
        }
      },
    };
  }

  private async ensureStoreExists(): Promise<void> {
    try {
      await readFile(this.dataFilePath, 'utf8');
    } catch {
      const seed = await readFile(this.seedFilePath, 'utf8');
      await mkdir(path.dirname(this.dataFilePath), { recursive: true });
      await writeFile(this.dataFilePath, seed, 'utf8');
    }
  }
}
