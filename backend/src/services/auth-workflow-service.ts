import { createHash, randomBytes, randomUUID } from 'node:crypto';

import {
  AdminUserProfile,
  AdminUserRecord,
  AuditLogRecord,
  DriverProfile,
  DriverRecord,
  MerchantProfile,
  MerchantRecord,
  MerchantUserRecord,
  PasswordResetTokenRecord,
  RestaurantProfile,
  RestaurantRecord,
  RestaurantStaffUserRecord,
  SessionRecord,
  UserType,
} from '../domain/models.js';
import { hashPassword, isPasswordHashed, verifyPassword } from '../utils/passwords.js';
import { BackendRuntime } from './backend-runtime.js';
import { DispatchService } from './dispatch-service.js';
import { PasswordResetNotifier } from './password-reset-notifier.js';
import { toDriverProfile, toMerchantProfile, toRestaurantProfile } from './profile-projections.js';
import { WorkflowStoreContract } from './store-contract.js';

const defaultSessionHours = Number(process.env.SESSION_TTL_HOURS ?? '12');
const passwordResetTtlMinutes = Number(process.env.PASSWORD_RESET_TTL_MINUTES ?? '15');
const restaurantStaffResetPrefix = 'restaurant-user';
const merchantUserResetPrefix = 'merchant-user';

function allowsInsecurePasswordResetTokenResponse(): boolean {
  return process.env.ALLOW_INSECURE_PASSWORD_RESET_TOKEN_RESPONSE === 'true';
}

function createSession(userType: SessionRecord['userType'], userId: string, tenantId: string | null): SessionRecord {
  return {
    token: randomUUID(),
    userType,
    userId,
    tenantId,
    createdAt: new Date().toISOString(),
    expiresAt: new Date(Date.now() + defaultSessionHours * 60 * 60 * 1000).toISOString(),
  };
}

function createAuditLog(input: Omit<AuditLogRecord, 'id' | 'at'>): AuditLogRecord {
  return {
    id: `audit-${randomUUID()}`,
    at: new Date().toISOString(),
    ...input,
  };
}

function hashResetToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

function createPasswordResetToken(userType: UserType, userId: string, tenantId: string | null): { token: string; record: PasswordResetTokenRecord } {
  const token = randomBytes(24).toString('base64url');
  return {
    token,
    record: {
      id: `reset-${randomUUID()}`,
      userType,
      userId,
      tenantId,
      tokenHash: hashResetToken(token),
      createdAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + passwordResetTtlMinutes * 60 * 1000).toISOString(),
    },
  };
}

function ensureStrongPassword(password: string): void {
  const hasUpper = /[A-Z]/.test(password);
  const hasLower = /[a-z]/.test(password);
  const hasDigit = /\d/.test(password);
  if (password.length < 10 || !hasUpper || !hasLower || !hasDigit) {
    throw new Error('Password must be at least 10 characters and include upper, lower, and numeric characters.');
  }
}

function createRestaurantStaffResetSubject(restaurantId: string, staffUserId: string): string {
  return `${restaurantStaffResetPrefix}:${restaurantId}:${staffUserId}`;
}

function parseRestaurantStaffResetSubject(value: string): { restaurantId: string; staffUserId: string } | null {
  const [prefix, restaurantId, staffUserId] = value.split(':');
  if (prefix !== restaurantStaffResetPrefix || !restaurantId || !staffUserId) {
    return null;
  }
  return { restaurantId, staffUserId };
}

function createMerchantUserResetSubject(merchantId: string, merchantUserId: string): string {
  return `${merchantUserResetPrefix}:${merchantId}:${merchantUserId}`;
}

function parseMerchantUserResetSubject(value: string): { merchantId: string; merchantUserId: string } | null {
  const [prefix, merchantId, merchantUserId] = value.split(':');
  if (prefix !== merchantUserResetPrefix || !merchantId || !merchantUserId) {
    return null;
  }
  return { merchantId, merchantUserId };
}

async function verifyAndUpgradePassword(
  password: string,
  currentHash: string,
  save: (nextPassword: string) => Promise<void>,
): Promise<boolean> {
  const ok = await verifyPassword(password, currentHash);
  if (!ok) {
    return false;
  }
  if (!isPasswordHashed(currentHash)) {
    await save(await hashPassword(password));
  }
  return true;
}

function toAdminProfile(adminUser: AdminUserRecord): AdminUserProfile {
  const { password: _password, ...profile } = adminUser;
  return profile;
}

export class AuthWorkflowService {
  constructor(
    private readonly runtime: BackendRuntime,
    private readonly dispatchService: DispatchService,
    private readonly passwordResetNotifier: PasswordResetNotifier,
    private readonly workflowStore: WorkflowStoreContract | null = null,
  ) {}

  async loginDriver(email: string, password: string): Promise<{ token: string; driver: DriverProfile }> {
    if (!this.workflowStore) {
      return this.runtime.withMutableDb(async (db) => {
        const driver = db.drivers.find((item) => item.email.toLowerCase() === email.toLowerCase());
        if (!driver || !(await verifyAndUpgradePassword(password, driver.password, async (next) => { driver.password = next; }))) {
          this.runtime.appendAuditLog(db, {
            actorType: 'system',
            actorId: 'auth',
            action: 'auth.login.failed',
            entityType: 'driver',
            entityId: email,
          });
          throw new Error('Invalid credentials.');
        }

        const token = this.runtime.createSession(db, 'driver', driver.id, driver.tenantId);
        this.runtime.appendAuditLog(db, {
          actorType: 'driver',
          actorId: driver.id,
          action: 'driver.login',
          entityType: 'driver',
          entityId: driver.id,
        });
        return {
          token,
          driver: toDriverProfile(driver, this.dispatchService.getDriverLoad(db, driver.id), db.tenants.find((item) => item.id === driver.tenantId) ?? null),
        };
      });
    }

    const result = await this.workflowStore.withWorkflowWriteContext(async (context) => {
      await context.deleteExpiredSessions(new Date().toISOString());
      const driver = await context.findDriverByEmail(email);
      if (!driver || !(await verifyAndUpgradePassword(password, driver.password, async (next) => {
        driver.password = next;
        await context.saveDriver(driver);
      }))) {
        await context.appendAuditLog(
          createAuditLog({ actorType: 'system', actorId: 'auth', action: 'auth.login.failed', entityType: 'driver', entityId: email }),
        );
        return { ok: false as const };
      }

      const session = createSession('driver', driver.id, driver.tenantId);
      await context.replaceSession(session);
      await context.appendAuditLog(
        createAuditLog({ actorType: 'driver', actorId: driver.id, action: 'driver.login', entityType: 'driver', entityId: driver.id }),
      );

      return {
        ok: true as const,
        token: session.token,
        driver: toDriverProfile(driver, await context.countDriverActiveLoad(driver.id), await context.findTenantById(driver.tenantId)),
      };
    });

    if (!result.ok) {
      throw new Error('Invalid credentials.');
    }
    return { token: result.token, driver: result.driver };
  }

  async loginRestaurant(email: string, password: string): Promise<{ token: string; restaurant: RestaurantProfile }> {
    if (!this.workflowStore) {
      return this.runtime.withMutableDb(async (db) => {
        const match = this.findRestaurantLoginTarget(db.restaurants, email);
        if (!match || !(await this.verifyRestaurantLogin(password, match, async () => undefined))) {
          this.runtime.appendAuditLog(db, {
            actorType: 'system',
            actorId: 'auth',
            action: 'auth.login.failed',
            entityType: 'restaurant',
            entityId: email,
          });
          throw new Error('Invalid credentials.');
        }

        const token = this.runtime.createSession(db, 'restaurant', match.restaurant.id, match.restaurant.tenantId);
        this.runtime.appendAuditLog(db, {
          actorType: 'restaurant',
          actorId: match.restaurant.id,
          action: 'restaurant.login',
          entityType: 'restaurant',
          entityId: match.restaurant.id,
          metadata: match.staffUser ? { staffUserId: match.staffUser.id, role: match.staffUser.role } : { role: 'owner' },
        });
        return { token, restaurant: toRestaurantProfile(match.restaurant, db.tenants.find((item) => item.id === match.restaurant.tenantId) ?? null) };
      });
    }

    return this.workflowStore.withWorkflowWriteContext(async (context) => {
      await context.deleteExpiredSessions(new Date().toISOString());
      const restaurant = (await context.findRestaurantByEmail(email)) ?? (await context.findRestaurantByStaffEmail(email));
      if (!restaurant) {
        await context.appendAuditLog(createAuditLog({ actorType: 'system', actorId: 'auth', action: 'auth.login.failed', entityType: 'restaurant', entityId: email }));
        throw new Error('Invalid credentials.');
      }
      const match = this.findRestaurantLoginTarget([restaurant], email);
      if (!match || !(await this.verifyRestaurantLogin(password, match, async () => context.saveRestaurant(match.restaurant)))) {
        await context.appendAuditLog(createAuditLog({ actorType: 'system', actorId: 'auth', action: 'auth.login.failed', entityType: 'restaurant', entityId: email }));
        throw new Error('Invalid credentials.');
      }
      const session = createSession('restaurant', match.restaurant.id, match.restaurant.tenantId);
      await context.replaceSession(session);
      await context.saveRestaurant(match.restaurant);
      await context.appendAuditLog(createAuditLog({
        actorType: 'restaurant',
        actorId: match.restaurant.id,
        action: 'restaurant.login',
        entityType: 'restaurant',
        entityId: match.restaurant.id,
        metadata: match.staffUser ? { staffUserId: match.staffUser.id, role: match.staffUser.role } : { role: 'owner' },
      }));
      return { token: session.token, restaurant: toRestaurantProfile(match.restaurant, await context.findTenantById(match.restaurant.tenantId)) };
    });
  }

  async loginMerchant(email: string, password: string): Promise<{ token: string; merchant: MerchantProfile }> {
    if (!this.workflowStore) {
      return this.runtime.withMutableDb(async (db) => {
        const match = this.findMerchantLoginTarget(db.merchants, email);
        if (!match || !(await this.verifyMerchantLogin(password, match, async () => undefined))) {
          this.runtime.appendAuditLog(db, {
            actorType: 'system',
            actorId: 'auth',
            action: 'auth.login.failed',
            entityType: 'merchant',
            entityId: email,
          });
          throw new Error('Invalid credentials.');
        }
        const token = this.runtime.createSession(db, 'merchant', match.merchant.id, match.merchant.tenantId);
        this.runtime.appendAuditLog(db, {
          actorType: 'merchant',
          actorId: match.merchant.id,
          action: 'merchant.login',
          entityType: 'merchant',
          entityId: match.merchant.id,
          metadata: { merchantUserId: match.user.id, role: match.user.role },
        });
        return { token, merchant: toMerchantProfile(match.merchant, db.tenants.find((item) => item.id === match.merchant.tenantId) ?? null) };
      });
    }

    return this.workflowStore.withWorkflowWriteContext(async (context) => {
      await context.deleteExpiredSessions(new Date().toISOString());
      const merchant = await context.findMerchantByUserEmail(email);
      if (!merchant) {
        await context.appendAuditLog(createAuditLog({ actorType: 'system', actorId: 'auth', action: 'auth.login.failed', entityType: 'merchant', entityId: email }));
        throw new Error('Invalid credentials.');
      }
      const match = this.findMerchantLoginTarget([merchant], email);
      if (!match || !(await this.verifyMerchantLogin(password, match, async () => context.saveMerchant(match.merchant)))) {
        await context.appendAuditLog(createAuditLog({ actorType: 'system', actorId: 'auth', action: 'auth.login.failed', entityType: 'merchant', entityId: email }));
        throw new Error('Invalid credentials.');
      }
      const session = createSession('merchant', match.merchant.id, match.merchant.tenantId);
      await context.replaceSession(session);
      await context.saveMerchant(match.merchant);
      await context.appendAuditLog(createAuditLog({
        actorType: 'merchant',
        actorId: match.merchant.id,
        action: 'merchant.login',
        entityType: 'merchant',
        entityId: match.merchant.id,
        metadata: { merchantUserId: match.user.id, role: match.user.role },
      }));
      return { token: session.token, merchant: toMerchantProfile(match.merchant, await context.findTenantById(match.merchant.tenantId)) };
    });
  }

  async loginAdmin(email: string, password: string): Promise<{ token: string; adminUser: AdminUserProfile }> {
    if (!this.workflowStore) {
      return this.runtime.withMutableDb(async (db) => {
        db.adminUsers ??= [];
        const adminUser = db.adminUsers.find((item) => item.email.toLowerCase() === email.toLowerCase() && item.isActive);
        if (!adminUser || !(await verifyAndUpgradePassword(password, adminUser.password, async (next) => { adminUser.password = next; }))) {
          this.runtime.appendAuditLog(db, {
            actorType: 'system',
            actorId: 'auth',
            action: 'auth.login.failed',
            entityType: 'admin',
            entityId: email,
          });
          throw new Error('Invalid credentials.');
        }
        adminUser.lastLoginAt = new Date().toISOString();
        const token = this.runtime.createSession(db, 'admin', adminUser.id, adminUser.tenantId ?? null);
        this.runtime.appendAuditLog(db, {
          actorType: 'admin',
          actorId: adminUser.id,
          action: 'admin.login',
          entityType: 'admin',
          entityId: adminUser.id,
        });
        return { token, adminUser: toAdminProfile(adminUser) };
      });
    }

    return this.workflowStore.withWorkflowWriteContext(async (context) => {
      await context.deleteExpiredSessions(new Date().toISOString());
      const adminUser = await context.findAdminUserByEmail(email);
      if (!adminUser || !adminUser.isActive || !(await verifyAndUpgradePassword(password, adminUser.password, async (next) => {
        adminUser.password = next;
        await context.saveAdminUser(adminUser);
      }))) {
        await context.appendAuditLog(createAuditLog({ actorType: 'system', actorId: 'auth', action: 'auth.login.failed', entityType: 'admin', entityId: email }));
        throw new Error('Invalid credentials.');
      }
      adminUser.lastLoginAt = new Date().toISOString();
      await context.saveAdminUser(adminUser);
      const session = createSession('admin', adminUser.id, adminUser.tenantId ?? null);
      await context.replaceSession(session);
      await context.appendAuditLog(createAuditLog({ actorType: 'admin', actorId: adminUser.id, action: 'admin.login', entityType: 'admin', entityId: adminUser.id }));
      return { token: session.token, adminUser: toAdminProfile(adminUser) };
    });
  }

  async refreshSession(token: string, userType: UserType): Promise<{ token: string }> {
    if (!this.workflowStore) {
      return this.runtime.withMutableDb(async (db) => {
        const session = this.runtime.requireSession(db, token, userType);
        db.sessions = db.sessions.filter((item) => item.token !== token);
        const newToken = this.runtime.createSession(db, userType, session.userId, session.tenantId ?? null);
        this.runtime.appendAuditLog(db, {
          actorType: userType === 'admin' ? 'admin' : userType,
          actorId: session.userId,
          action: `${userType}.session.rotated`,
          entityType: userType,
          entityId: session.userId,
        });
        return { token: newToken };
      });
    }

    return this.workflowStore.withWorkflowWriteContext(async (context) => {
      await context.deleteExpiredSessions(new Date().toISOString());
      const session = await context.findSessionByToken(token);
      if (!session || session.userType !== userType || new Date(session.expiresAt).getTime() <= Date.now()) {
        throw new Error('Unauthorized');
      }
      await context.deleteSession(token);
      const nextSession = createSession(userType, session.userId, session.tenantId ?? null);
      await context.replaceSession(nextSession);
      await context.appendAuditLog(createAuditLog({ actorType: userType === 'admin' ? 'admin' : userType, actorId: session.userId, action: `${userType}.session.rotated`, entityType: userType, entityId: session.userId }));
      return { token: nextSession.token };
    });
  }

  async requestPasswordReset(userType: UserType, email: string): Promise<{ ok: true; debugToken?: string }> {
    if (!this.workflowStore) {
      return this.runtime.withMutableDb(async (db) => {
        const target = this.findPasswordResetTarget(db, userType, email);
        this.runtime.appendAuditLog(db, {
          actorType: 'system',
          actorId: 'auth',
          action: 'auth.password-reset.requested',
          entityType: userType,
          entityId: email,
          metadata: { userFound: Boolean(target) },
        });

        if (!target) {
          return { ok: true };
        }

        db.passwordResetTokens = (db.passwordResetTokens ?? []).filter((item) => !(item.userType === userType && item.userId === target.userId));
        const { token, record } = createPasswordResetToken(userType, target.userId, target.tenantId ?? null);
        db.passwordResetTokens.push(record);
        await this.passwordResetNotifier.sendPasswordReset({ userType, email: target.email, token });
        return allowsInsecurePasswordResetTokenResponse() ? { ok: true, debugToken: token } : { ok: true };
      });
    }

    return this.workflowStore.withWorkflowWriteContext(async (context) => {
      await context.deleteExpiredPasswordResetTokens(new Date().toISOString());
      const target = await this.findPasswordResetTargetWithContext(context, userType, email);
      await context.appendAuditLog(createAuditLog({
        actorType: 'system',
        actorId: 'auth',
        action: 'auth.password-reset.requested',
        entityType: userType,
        entityId: email,
        metadata: { userFound: Boolean(target) },
      }));

      if (!target) {
        return { ok: true };
      }

      await context.deletePasswordResetTokensForUser(userType, target.userId);
      const { token, record } = createPasswordResetToken(userType, target.userId, target.tenantId ?? null);
      await context.savePasswordResetToken(record);
      await this.passwordResetNotifier.sendPasswordReset({ userType, email: target.email, token });
      return allowsInsecurePasswordResetTokenResponse() ? { ok: true, debugToken: token } : { ok: true };
    });
  }

  async confirmPasswordReset(userType: UserType, token: string, newPassword: string): Promise<{ ok: true }> {
    ensureStrongPassword(newPassword);
    if (!this.workflowStore) {
      throw new Error('Password reset confirmation requires workflow store support.');
    }

    return this.workflowStore.withWorkflowWriteContext(async (context) => {
      await context.deleteExpiredPasswordResetTokens(new Date().toISOString());
      const resetToken = await context.findPasswordResetTokenByHash(hashResetToken(token), userType);
      if (!resetToken || new Date(resetToken.expiresAt).getTime() <= Date.now()) {
        await context.appendAuditLog(createAuditLog({ actorType: 'system', actorId: 'auth', action: 'auth.password-reset.failed', entityType: userType, entityId: userType }));
        throw new Error('Invalid or expired password reset token.');
      }

      let sessionUserId = resetToken.userId;
      if (userType === 'driver') {
        const driver = await context.findDriverById(resetToken.userId);
        if (!driver) {
          throw new Error('Driver not found.');
        }
        driver.password = await hashPassword(newPassword);
        await context.saveDriver(driver);
      } else if (userType === 'restaurant') {
        const restaurantStaffSubject = parseRestaurantStaffResetSubject(resetToken.userId);
        if (restaurantStaffSubject) {
          const restaurant = await context.findRestaurantById(restaurantStaffSubject.restaurantId);
          if (!restaurant) {
            throw new Error('Restaurant not found.');
          }
          const staffUser = restaurant.staffUsers.find((item) => item.id === restaurantStaffSubject.staffUserId);
          if (!staffUser) {
            throw new Error('Restaurant staff user not found.');
          }
          staffUser.password = await hashPassword(newPassword);
          await context.saveRestaurant(restaurant);
          sessionUserId = restaurant.id;
        } else {
          const restaurant = await context.findRestaurantById(resetToken.userId);
          if (!restaurant) {
            throw new Error('Restaurant not found.');
          }
          restaurant.password = await hashPassword(newPassword);
          await context.saveRestaurant(restaurant);
          sessionUserId = restaurant.id;
        }
      } else if (userType === 'merchant') {
        const merchantUserSubject = parseMerchantUserResetSubject(resetToken.userId);
        if (!merchantUserSubject) {
          throw new Error('Merchant reset token is invalid.');
        }
        const merchant = await context.findMerchantById(merchantUserSubject.merchantId);
        if (!merchant) {
          throw new Error('Merchant not found.');
        }
        const merchantUser = merchant.users.find((item) => item.id === merchantUserSubject.merchantUserId);
        if (!merchantUser) {
          throw new Error('Merchant user not found.');
        }
        merchantUser.password = await hashPassword(newPassword);
        await context.saveMerchant(merchant);
        sessionUserId = merchant.id;
      } else {
        const adminUser = await context.findAdminUserById(resetToken.userId);
        if (!adminUser) {
          throw new Error('Admin user not found.');
        }
        adminUser.password = await hashPassword(newPassword);
        await context.saveAdminUser(adminUser);
      }

      await context.deletePasswordResetToken(resetToken.id);
      await context.deleteSessionsForUser(userType, sessionUserId);
      await context.deletePasswordResetTokensForUser(userType, resetToken.userId);
      await context.appendAuditLog(createAuditLog({ actorType: 'system', actorId: 'auth', action: 'auth.password-reset.completed', entityType: userType, entityId: resetToken.userId }));
      return { ok: true };
    });
  }

  async logout(token: string): Promise<void> {
    if (!this.workflowStore) {
      await this.runtime.withMutableDb(async (db) => {
        const session = db.sessions.find((item) => item.token === token);
        if (session) {
          this.runtime.appendAuditLog(db, { actorType: session.userType === 'admin' ? 'admin' : session.userType, actorId: session.userId, action: `${session.userType}.logout`, entityType: session.userType, entityId: session.userId });
        }
        db.sessions = db.sessions.filter((item) => item.token !== token);
      });
      return;
    }

    await this.workflowStore.withWorkflowWriteContext(async (context) => {
      await context.deleteExpiredSessions(new Date().toISOString());
      const session = await context.findSessionByToken(token);
      if (session) {
        await context.appendAuditLog(createAuditLog({ actorType: session.userType === 'admin' ? 'admin' : session.userType, actorId: session.userId, action: `${session.userType}.logout`, entityType: session.userType, entityId: session.userId }));
      }
      await context.deleteSession(token);
    });
  }

  async requireDriverFromToken(token: string): Promise<DriverRecord> {
    if (!this.workflowStore) {
      return this.runtime.withDb(async (db) => {
        const session = this.runtime.requireSession(db, token, 'driver');
        return this.runtime.requireDriver(db, session.userId);
      });
    }

    return this.workflowStore.withWorkflowReadContext(async (context) => {
      const session = await context.findSessionByToken(token);
      if (!session || session.userType !== 'driver' || new Date(session.expiresAt).getTime() <= Date.now()) {
        throw new Error('Unauthorized');
      }
      const driver = await context.findDriverById(session.userId);
      if (!driver) {
        throw new Error('Driver not found.');
      }
      return driver;
    });
  }

  async requireRestaurantFromToken(token: string): Promise<RestaurantRecord> {
    if (!this.workflowStore) {
      return this.runtime.withDb(async (db) => {
        const session = this.runtime.requireSession(db, token, 'restaurant');
        return this.runtime.requireRestaurant(db, session.userId);
      });
    }

    return this.workflowStore.withWorkflowReadContext(async (context) => {
      const session = await context.findSessionByToken(token);
      if (!session || session.userType !== 'restaurant' || new Date(session.expiresAt).getTime() <= Date.now()) {
        throw new Error('Unauthorized');
      }
      const restaurant = await context.findRestaurantById(session.userId);
      if (!restaurant) {
        throw new Error('Restaurant not found.');
      }
      return restaurant;
    });
  }

  async requireMerchantFromToken(token: string): Promise<MerchantRecord> {
    if (!this.workflowStore) {
      return this.runtime.withDb(async (db) => {
        const session = this.runtime.requireSession(db, token, 'merchant');
        const merchant = db.merchants.find((item) => item.id === session.userId);
        if (!merchant) {
          throw new Error('Merchant not found.');
        }
        return merchant;
      });
    }

    return this.workflowStore.withWorkflowReadContext(async (context) => {
      const session = await context.findSessionByToken(token);
      if (!session || session.userType !== 'merchant' || new Date(session.expiresAt).getTime() <= Date.now()) {
        throw new Error('Unauthorized');
      }
      const merchant = await context.findMerchantById(session.userId);
      if (!merchant) {
        throw new Error('Merchant not found.');
      }
      return merchant;
    });
  }

  async requireAdminFromToken(token: string): Promise<AdminUserRecord> {
    if (!this.workflowStore) {
      return this.runtime.withDb(async (db) => {
        const session = this.runtime.requireSession(db, token, 'admin');
        const adminUser = (db.adminUsers ?? []).find((item) => item.id === session.userId && item.isActive);
        if (!adminUser) {
          throw new Error('Admin user not found.');
        }
        return adminUser;
      });
    }

    return this.workflowStore.withWorkflowReadContext(async (context) => {
      const session = await context.findSessionByToken(token);
      if (!session || session.userType !== 'admin' || new Date(session.expiresAt).getTime() <= Date.now()) {
        throw new Error('Unauthorized');
      }
      const adminUser = await context.findAdminUserById(session.userId);
      if (!adminUser || !adminUser.isActive) {
        throw new Error('Admin user not found.');
      }
      return adminUser;
    });
  }

  async registerDriverDeviceToken(driverId: string, deviceToken: string): Promise<void> {
    if (!this.workflowStore) {
      await this.runtime.withMutableDb(async (db) => {
        const driver = this.runtime.requireDriver(db, driverId);
        driver.deviceToken = deviceToken;
        this.runtime.appendAuditLog(db, { actorType: 'driver', actorId: driverId, action: 'driver.device-token.updated', entityType: 'driver', entityId: driverId });
      });
      return;
    }

    await this.workflowStore.withWorkflowWriteContext(async (context) => {
      const driver = await context.findDriverById(driverId);
      if (!driver) {
        throw new Error('Driver not found.');
      }
      driver.deviceToken = deviceToken;
      await context.saveDriver(driver);
      await context.appendAuditLog(createAuditLog({ actorType: 'driver', actorId: driverId, action: 'driver.device-token.updated', entityType: 'driver', entityId: driverId }));
    });
  }

  private findRestaurantLoginTarget(restaurants: RestaurantRecord[], email: string): { restaurant: RestaurantRecord; staffUser: RestaurantStaffUserRecord | null } | null {
    for (const restaurant of restaurants) {
      if (restaurant.email.toLowerCase() === email.toLowerCase()) {
        return { restaurant, staffUser: null };
      }
      const staffUser = restaurant.staffUsers.find((candidate) => candidate.email.toLowerCase() === email.toLowerCase() && candidate.isActive) ?? null;
      if (staffUser) {
        return { restaurant, staffUser };
      }
    }
    return null;
  }

  private async verifyRestaurantLogin(
    password: string,
    target: { restaurant: RestaurantRecord; staffUser: RestaurantStaffUserRecord | null },
    save: () => Promise<void>,
  ): Promise<boolean> {
    if (!target.staffUser) {
      return verifyAndUpgradePassword(password, target.restaurant.password, async (next) => {
        target.restaurant.password = next;
        await save();
      });
    }
    const ok = await verifyAndUpgradePassword(password, target.staffUser.password, async (next) => {
      target.staffUser!.password = next;
      await save();
    });
    if (ok) {
      target.staffUser.lastLoginAt = new Date().toISOString();
      await save();
    }
    return ok;
  }

  private findMerchantLoginTarget(merchants: MerchantRecord[], email: string): { merchant: MerchantRecord; user: MerchantUserRecord } | null {
    for (const merchant of merchants) {
      const user = merchant.users.find((candidate) => candidate.email.toLowerCase() === email.toLowerCase() && candidate.isActive);
      if (user) {
        return { merchant, user };
      }
    }
    return null;
  }

  private async verifyMerchantLogin(
    password: string,
    target: { merchant: MerchantRecord; user: MerchantUserRecord },
    save: () => Promise<void>,
  ): Promise<boolean> {
    const ok = await verifyAndUpgradePassword(password, target.user.password, async (next) => {
      target.user.password = next;
      await save();
    });
    if (ok) {
      target.user.lastLoginAt = new Date().toISOString();
      await save();
    }
    return ok;
  }

  private findPasswordResetTarget(
    db: { drivers: DriverRecord[]; restaurants: RestaurantRecord[]; merchants: MerchantRecord[]; adminUsers?: AdminUserRecord[] },
    userType: UserType,
    email: string,
  ): { userId: string; email: string; tenantId: string | null } | null {
    if (userType === 'driver') {
      const driver = db.drivers.find((item) => item.email.toLowerCase() === email.toLowerCase()) ?? null;
      return driver ? { userId: driver.id, email: driver.email, tenantId: driver.tenantId } : null;
    }
    if (userType === 'restaurant') {
      const directRestaurant = db.restaurants.find((item) => item.email.toLowerCase() === email.toLowerCase()) ?? null;
      if (directRestaurant) {
        return { userId: directRestaurant.id, email: directRestaurant.email, tenantId: directRestaurant.tenantId };
      }
      for (const restaurant of db.restaurants) {
        const staffUser = restaurant.staffUsers.find((item) => item.email.toLowerCase() === email.toLowerCase() && item.isActive);
        if (staffUser) {
          return {
            userId: createRestaurantStaffResetSubject(restaurant.id, staffUser.id),
            email: staffUser.email,
            tenantId: restaurant.tenantId,
          };
        }
      }
      return null;
    }
    if (userType === 'merchant') {
      const match = this.findMerchantLoginTarget(db.merchants, email);
      return match ? { userId: createMerchantUserResetSubject(match.merchant.id, match.user.id), email: match.user.email, tenantId: match.merchant.tenantId } : null;
    }
    const adminUser = (db.adminUsers ?? []).find((item) => item.email.toLowerCase() === email.toLowerCase() && item.isActive) ?? null;
    return adminUser ? { userId: adminUser.id, email: adminUser.email, tenantId: adminUser.tenantId ?? null } : null;
  }

  private async findPasswordResetTargetWithContext(
    context: {
      findDriverByEmail(email: string): Promise<DriverRecord | null>;
      findRestaurantByEmail(email: string): Promise<RestaurantRecord | null>;
      findRestaurantByStaffEmail(email: string): Promise<RestaurantRecord | null>;
      findMerchantByUserEmail(email: string): Promise<MerchantRecord | null>;
      findAdminUserByEmail(email: string): Promise<AdminUserRecord | null>;
    },
    userType: UserType,
    email: string,
  ): Promise<{ userId: string; email: string; tenantId: string | null } | null> {
    if (userType === 'driver') {
      const driver = await context.findDriverByEmail(email);
      return driver ? { userId: driver.id, email: driver.email, tenantId: driver.tenantId } : null;
    }
    if (userType === 'restaurant') {
      const restaurant = (await context.findRestaurantByEmail(email)) ?? (await context.findRestaurantByStaffEmail(email));
      if (restaurant) {
        return { userId: restaurant.id, email: restaurant.email, tenantId: restaurant.tenantId };
      }
      return null;
    }
    if (userType === 'merchant') {
      const merchant = await context.findMerchantByUserEmail(email);
      if (!merchant) {
        return null;
      }
      const match = this.findMerchantLoginTarget([merchant], email);
      return match ? { userId: createMerchantUserResetSubject(match.merchant.id, match.user.id), email: match.user.email, tenantId: match.merchant.tenantId } : null;
    }
    const adminUser = await context.findAdminUserByEmail(email);
    return adminUser && adminUser.isActive ? { userId: adminUser.id, email: adminUser.email, tenantId: adminUser.tenantId ?? null } : null;
  }
}


