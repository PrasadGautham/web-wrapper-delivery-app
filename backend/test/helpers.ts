import { readFileSync } from 'node:fs';
import path from 'node:path';

import { DatabaseShape } from '../src/domain/models.js';
import {
  OperationalStateContext,
  OperationalStateStoreContract,
  StoreContract,
  WorkflowStoreContext,
  WorkflowStoreContract,
} from '../src/services/store-contract.js';

export function loadSeed(): DatabaseShape {
  const raw = readFileSync(path.join(process.cwd(), 'data', 'seed.json'), 'utf8');
  const parsed = JSON.parse(raw) as DatabaseShape;
  parsed.adminUsers ??= [];
  parsed.passwordResetTokens ??= [];
  parsed.merchants.forEach((merchant) => {
    merchant.users ??= [];
  });
  parsed.restaurants.forEach((restaurant) => {
    restaurant.staffUsers ??= [];
  });
  return parsed;
}

export function cloneDb(db: DatabaseShape): DatabaseShape {
  return structuredClone(db);
}

export class InMemoryStore implements StoreContract, WorkflowStoreContract, OperationalStateStoreContract {
  constructor(public db: DatabaseShape) {}

  async read(): Promise<DatabaseShape> {
    return cloneDb(this.db);
  }

  async write(data: DatabaseShape): Promise<void> {
    this.db = cloneDb(data);
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
        restaurants: db.restaurants,
        orders: db.orders,
      },
      appendAuditLog: async (log) => {
        db.auditLogs ??= [];
        db.auditLogs.unshift(log);
      },
    };
  }

  private createWorkflowContext(db: DatabaseShape): WorkflowStoreContext {
    db.passwordResetTokens ??= [];
    db.adminUsers ??= [];
    return {
      findDriverByEmail: async (email) => db.drivers.find((item) => item.email.toLowerCase() === email.toLowerCase()) ?? null,
      findDriverById: async (driverId) => db.drivers.find((item) => item.id === driverId) ?? null,
      countDriverActiveLoad: async (driverId) =>
        db.orders.filter((order) => order.assignedDriverId === driverId && ['pending', 'accepted', 'atRestaurant', 'pickedUp'].includes(order.status)).length,
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
      findAdminUserByEmail: async (email) => (db.adminUsers ?? []).find((item) => item.email.toLowerCase() === email.toLowerCase()) ?? null,
      findAdminUserById: async (adminUserId) => (db.adminUsers ?? []).find((item) => item.id === adminUserId) ?? null,
      saveAdminUser: async (adminUser) => {
        db.adminUsers ??= [];
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
        const now = new Date(nowIso).getTime();
        db.sessions = db.sessions.filter((item) => new Date(item.expiresAt).getTime() > now);
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
        const now = new Date(nowIso).getTime();
        db.passwordResetTokens = db.passwordResetTokens.filter((item) => new Date(item.expiresAt).getTime() > now);
      },
      appendAuditLog: async (log) => {
        db.auditLogs ??= [];
        db.auditLogs.unshift(log);
      },
    };
  }
}

export const noopPushGateway = {
  async sendIncomingOrderOffer(): Promise<boolean> {
    return true;
  },
};

export const nullEtaProvider = {
  async estimateMinutes(): Promise<null> {
    return null;
  },
};

export const noopPasswordResetNotifier = {
  async sendPasswordReset(): Promise<void> {
    return;
  },
};

export const noopRestaurantRealtime = {
  issueTicket() {
    return { ticket: 'ticket', expiresAt: new Date(Date.now() + 1000).toISOString() };
  },
  resolveTicket() {
    return { restaurantIds: ['restaurant-001'] };
  },
  subscribe() {
    return () => {};
  },
  publishRestaurantUpdated() {
    return;
  },
};
