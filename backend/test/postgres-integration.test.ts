import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';

import { Pool } from 'pg';

import { BackendService } from '../src/services/backend-service.js';
import { DispatchService } from '../src/services/dispatch-service.js';
import { PostgresStore } from '../src/services/postgres-store.js';
import {
  loadSeed,
  noopPasswordResetNotifier,
  noopPushGateway,
  noopRestaurantRealtime,
  nullEtaProvider,
} from './helpers.js';

const rootDir = process.cwd();
const schemaPath = path.join(rootDir, 'sql', 'schema.sql');

function parseEnvFile(raw: string): NodeJS.ProcessEnv {
  const parsed: NodeJS.ProcessEnv = {};
  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) {
      continue;
    }
    const separatorIndex = trimmed.indexOf('=');
    if (separatorIndex <= 0) {
      continue;
    }
    const key = trimmed.slice(0, separatorIndex).trim();
    const value = trimmed.slice(separatorIndex + 1).trim().replace(/^["']|["']$/g, '');
    parsed[key] = value;
  }
  return parsed;
}

function loadLocalPostgresEnv(): NodeJS.ProcessEnv {
  const envFilePath = path.join(rootDir, '.env.local-postgres');
  if (!existsSync(envFilePath)) {
    return {};
  }
  return parseEnvFile(readFileSync(envFilePath, 'utf8'));
}

function deriveTestDatabaseUrl(connectionString: string): string {
  const url = new URL(connectionString);
  const databaseName = url.pathname.replace(/^\//, '');
  if (!databaseName) {
    throw new Error('DATABASE_URL must include a database name to derive POSTGRES_TEST_DATABASE_URL.');
  }
  if (databaseName.endsWith('_test')) {
    return connectionString;
  }
  url.pathname = `/${databaseName}_test`;
  return url.toString();
}

async function ensureTestDatabaseExists(connectionString: string): Promise<string> {
  const testConnectionString = deriveTestDatabaseUrl(connectionString);
  const testUrl = new URL(testConnectionString);
  const testDatabaseName = testUrl.pathname.replace(/^\//, '');

  const adminUrl = new URL(connectionString);
  adminUrl.pathname = '/postgres';

  const adminPool = new Pool({ connectionString: adminUrl.toString() });
  try {
    const existing = await adminPool.query('select 1 from pg_database where datname = $1', [testDatabaseName]);
    if (existing.rowCount === 0) {
      const escapedName = testDatabaseName.replace(/"/g, '""');
      await adminPool.query(`create database "${escapedName}"`);
    }
  } finally {
    await adminPool.end();
  }

  return testConnectionString;
}

async function resolveTestDatabaseUrl(): Promise<string | null> {
  const explicit = process.env.POSTGRES_TEST_DATABASE_URL?.trim();
  if (explicit) {
    return ensureTestDatabaseExists(explicit);
  }

  const localEnv = loadLocalPostgresEnv();
  const localDatabaseUrl = localEnv.DATABASE_URL?.trim() || process.env.DATABASE_URL?.trim();
  if (!localDatabaseUrl) {
    return null;
  }

  return ensureTestDatabaseExists(localDatabaseUrl);
}

async function resetDatabase(pool: Pool): Promise<void> {
  await pool.query(`
    truncate table audit_logs, password_reset_tokens, sessions, orders, admin_users, restaurants, drivers, merchants, tenants
    restart identity cascade
  `);
}

export async function runPostgresIntegrationTests(): Promise<void> {
  const connectionString = await resolveTestDatabaseUrl();
  if (!connectionString) {
    console.log('SKIP postgres-integration (local Postgres test database not configured)');
    return;
  }

  const pool = new Pool({ connectionString });
  const store = new PostgresStore(connectionString, schemaPath);

  try {
    await store.write(loadSeed());
    await resetDatabase(pool);
    await store.write(loadSeed());

    const service = new BackendService(
      store,
      new DispatchService(),
      noopPushGateway as never,
      nullEtaProvider,
      noopPasswordResetNotifier as never,
      noopRestaurantRealtime as never,
      null,
    );

    await assert.rejects(() => service.loginDriver('driver@demo.com', 'bad-password'), /Invalid credentials/);

    const driverLogin = await service.loginDriver('driver@demo.com', 'Password123');
    const restaurantLogin = await service.loginRestaurant('falafel@demo.com', 'Password123');
    const adminLogin = await service.loginAdmin('admin@demo.com', 'Password123');
    assert.ok(driverLogin.token);
    assert.ok(restaurantLogin.token);
    assert.ok(adminLogin.token);

    const rotated = await service.refreshSession(driverLogin.token, 'driver');
    assert.notEqual(rotated.token, driverLogin.token);
    await assert.rejects(() => service.requireDriverFromToken(driverLogin.token), /Unauthorized/);
    await service.requireDriverFromToken(rotated.token);

    const createdAdmin = await service.createAdminUser({
      name: 'Ops Lead',
      email: 'ops.lead@demo.com',
      password: 'Password123',
      role: 'opsAdmin',
    });
    assert.equal(createdAdmin.email, 'ops.lead@demo.com');

    const updatedAdmin = await service.updateAdminUser(createdAdmin.id, {
      name: 'Operations Lead',
      isActive: true,
      role: 'supportAdmin',
    });
    assert.equal(updatedAdmin.role, 'supportAdmin');

    const createdMerchantUser = await service.createMerchantUser('mrc_7f3a2d91', {
      name: 'Merchant Dispatcher',
      email: 'merchant.dispatch@demo.com',
      password: 'Password123',
      role: 'merchantDispatcher',
    });
    assert.equal(createdMerchantUser.email, 'merchant.dispatch@demo.com');

    const updatedMerchantUser = await service.updateMerchantUser('mrc_7f3a2d91', createdMerchantUser.id, {
      name: 'Merchant Dispatcher Updated',
      isActive: true,
      role: 'merchantManager',
    });
    assert.equal(updatedMerchantUser.role, 'merchantManager');

    const createdStaffUser = await service.createRestaurantStaffUser('rst_a13c5f20', {
      name: 'Night Dispatcher',
      email: 'night.dispatch@demo.com',
      password: 'Password123',
      role: 'dispatcher',
    });
    assert.equal(createdStaffUser.email, 'night.dispatch@demo.com');

    const updatedStaffUser = await service.updateRestaurantStaffUser('rst_a13c5f20', createdStaffUser.id, {
      name: 'Night Dispatch Lead',
      isActive: true,
      role: 'manager',
    });
    assert.equal(updatedStaffUser.role, 'manager');

    const merchantLogin = await service.loginMerchant('merchant.dispatch@demo.com', 'Password123');
    const staffLogin = await service.loginRestaurant('night.dispatch@demo.com', 'Password123');
    assert.ok(merchantLogin.token);
    assert.ok(staffLogin.token);

    await service.updateDriverDispatchPolicy('drv_1f2c9a44', {
      mode: 'allowListOnly',
      restaurantIds: ['rst_a13c5f20'],
      merchantIds: [],
    });
    const updatedDriver = await service.updateDriverCapacity('drv_1f2c9a44', 2);
    assert.equal(updatedDriver.maxActiveOrders, 2);

    await service.updateDriverLocation('drv_1f2c9a44', {
      latitude: 25.0829,
      longitude: 55.1451,
      accuracyMeters: 5,
      speedMetersPerSecond: 0,
      headingDegrees: 0,
      capturedAt: new Date().toISOString(),
    });
    await service.updateDriverAvailability('drv_1f2c9a44', true);

    const rejectedOrder = await service.createRestaurantOrder('rst_a13c5f20', {
      customerName: 'Rejected Customer',
      customerAddress: 'Business Bay',
      customerLatitude: 25.188,
      customerLongitude: 55.271,
      deliveryArea: 'Business Bay',
    });
    assert.equal((await service.getIncomingOrder('drv_1f2c9a44'))?.id, rejectedOrder.id);
    await service.rejectOrder('drv_1f2c9a44', rejectedOrder.id);
    assert.equal(await service.getIncomingOrder('drv_1f2c9a44'), null);

    const createdOrder = await service.createRestaurantOrder('rst_a13c5f20', {
      customerName: 'Integration Customer',
      customerAddress: 'Dubai Marina',
      customerLatitude: 25.08,
      customerLongitude: 55.14,
      deliveryArea: 'Dubai Marina',
    });
    assert.equal(createdOrder.restaurantId, 'rst_a13c5f20');

    const incoming = await service.getIncomingOrder('drv_1f2c9a44');
    assert.ok(incoming);
    assert.equal(incoming?.id, createdOrder.id);

    await service.acceptOrder('drv_1f2c9a44', createdOrder.id);
    await service.markArrived('drv_1f2c9a44', createdOrder.id);
    await service.pickupOrder('drv_1f2c9a44', createdOrder.id);
    await service.completeOrder('drv_1f2c9a44', createdOrder.id);

    await service.logout(merchantLogin.token);
    await assert.rejects(() => service.requireMerchantFromToken(merchantLogin.token), /Unauthorized/);

    process.env.ALLOW_INSECURE_PASSWORD_RESET_TOKEN_RESPONSE = 'true';
    const resetRequest = await service.requestPasswordReset('driver', 'driver@demo.com');
    assert.ok(resetRequest.debugToken);
    await service.confirmPasswordReset('driver', resetRequest.debugToken as string, 'NewPassword123');
    await assert.rejects(() => service.requireDriverFromToken(rotated.token), /Unauthorized/);
    const relogin = await service.loginDriver('driver@demo.com', 'NewPassword123');
    assert.ok(relogin.token);
    process.env.ALLOW_INSECURE_PASSWORD_RESET_TOKEN_RESPONSE = 'false';

    const earnings = await service.getDriverEarnings('drv_1f2c9a44');
    assert.equal(earnings.completedDeliveries, 1);
    assert.equal(earnings.total > 0, true);

    const report = await service.getRestaurantReport('rst_a13c5f20');
    assert.equal(report.totalOrders, 2);
    assert.equal(report.deliveredOrders, 1);


    const merchantReport = await service.getMerchantReport('mrc_7f3a2d91');
    assert.equal(merchantReport.totalOrders, 2);
    assert.equal(merchantReport.totalRestaurants >= 1, true);

    const orders = await service.getRestaurantOrders('rst_a13c5f20');
    assert.equal(orders.length, 2);
    assert.equal(orders.some((item) => item.status === 'delivered'), true);
    assert.equal(orders.some((item) => item.id === rejectedOrder.id && item.status === 'queued'), true);

    const db = await store.read();
    assert.equal(db.tenants.length >= 2, true);
    assert.equal(db.merchants.every((item) => Boolean(item.tenantId)), true);
    assert.equal(db.drivers.every((item) => Boolean(item.tenantId)), true);
    assert.equal(db.restaurants.every((item) => Boolean(item.tenantId)), true);
    assert.equal(db.orders.every((item) => Boolean(item.tenantId)), true);
    assert.equal(db.adminUsers.some((item) => item.role === 'tenantAdmin' && Boolean(item.tenantId)), true);
    const rejectedOrderRecord = db.orders.find((item) => item.id === rejectedOrder.id);
    assert.ok(rejectedOrderRecord);
    assert.deepEqual(rejectedOrderRecord?.rejectedDriverIds, ['drv_1f2c9a44']);
    assert.equal(db.sessions.length >= 3, true);
    assert.equal(db.orders.some((item) => item.id === createdOrder.id && item.status === 'delivered'), true);
    assert.equal(db.orders.some((item) => item.id === rejectedOrder.id && item.status === 'queued'), true);
    assert.equal(db.auditLogs.some((item) => item.action === 'auth.login.failed'), true);
    assert.equal(db.auditLogs.some((item) => item.action === 'driver.session.rotated'), true);
    assert.equal(db.auditLogs.some((item) => item.action === 'auth.password-reset.completed'), true);
    assert.equal(db.auditLogs.some((item) => item.action === 'merchant-user.created'), true);
    assert.equal(db.auditLogs.some((item) => item.action === 'restaurant-staff-user.created'), true);
    assert.equal(db.auditLogs.some((item) => item.action === 'order.rejected'), true);
  } finally {
    await pool.end();
  }
}


