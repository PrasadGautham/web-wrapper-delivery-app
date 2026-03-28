import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

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

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');
const schemaPath = path.join(rootDir, 'sql', 'schema.sql');

async function resetDatabase(pool: Pool): Promise<void> {
  await pool.query(`
    truncate table audit_logs, password_reset_tokens, sessions, orders, admin_users, restaurants, drivers, merchants
    restart identity cascade
  `);
}

export async function runPostgresIntegrationTests(): Promise<void> {
  const connectionString = process.env.POSTGRES_TEST_DATABASE_URL?.trim();
  if (!connectionString) {
    console.log('SKIP postgres-integration (POSTGRES_TEST_DATABASE_URL not set)');
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
    assert.ok(driverLogin.token);
    assert.ok(restaurantLogin.token);

    const rotated = await service.refreshSession(driverLogin.token, 'driver');
    assert.notEqual(rotated.token, driverLogin.token);
    await assert.rejects(() => service.requireDriverFromToken(driverLogin.token), /Unauthorized/);
    await service.requireDriverFromToken(rotated.token);

    await service.updateDriverDispatchPolicy('driver-001', {
      mode: 'allowListOnly',
      restaurantIds: ['restaurant-001'],
      merchantIds: [],
    });
    const updatedDriver = await service.updateDriverCapacity('driver-001', 2);
    assert.equal(updatedDriver.maxActiveOrders, 2);

    await service.updateDriverLocation('driver-001', {
      latitude: 25.0829,
      longitude: 55.1451,
      accuracyMeters: 5,
      speedMetersPerSecond: 0,
      headingDegrees: 0,
      capturedAt: new Date().toISOString(),
    });
    await service.updateDriverAvailability('driver-001', true);

    const createdOrder = await service.createRestaurantOrder('restaurant-001', {
      customerName: 'Integration Customer',
      customerAddress: 'Dubai Marina',
      customerLatitude: 25.08,
      customerLongitude: 55.14,
      deliveryArea: 'Dubai Marina',
    });
    assert.equal(createdOrder.restaurantId, 'restaurant-001');

    const incoming = await service.getIncomingOrder('driver-001');
    assert.ok(incoming);
    assert.equal(incoming?.id, createdOrder.id);

    await service.acceptOrder('driver-001', createdOrder.id);
    await service.markArrived('driver-001', createdOrder.id);
    await service.pickupOrder('driver-001', createdOrder.id);
    await service.completeOrder('driver-001', createdOrder.id);

    process.env.ALLOW_INSECURE_PASSWORD_RESET_TOKEN_RESPONSE = 'true';
    const resetRequest = await service.requestPasswordReset('driver', 'driver@demo.com');
    assert.ok(resetRequest.debugToken);
    await service.confirmPasswordReset('driver', resetRequest.debugToken as string, 'NewPassword123');
    await assert.rejects(() => service.requireDriverFromToken(rotated.token), /Unauthorized/);
    const relogin = await service.loginDriver('driver@demo.com', 'NewPassword123');
    assert.ok(relogin.token);
    process.env.ALLOW_INSECURE_PASSWORD_RESET_TOKEN_RESPONSE = 'false';

    const earnings = await service.getDriverEarnings('driver-001');
    assert.equal(earnings.completedDeliveries, 1);
    assert.equal(earnings.total > 0, true);

    const report = await service.getRestaurantReport('restaurant-001');
    assert.equal(report.totalOrders, 1);
    assert.equal(report.deliveredOrders, 1);

    const orders = await service.getRestaurantOrders('restaurant-001');
    assert.equal(orders.length, 1);
    assert.equal(orders[0]?.status, 'delivered');

    const db = await store.read();
    assert.equal(db.sessions.length >= 2, true);
    assert.equal(db.orders.some((item) => item.id === createdOrder.id && item.status === 'delivered'), true);
    assert.equal(db.auditLogs.some((item) => item.action === 'auth.login.failed'), true);
    assert.equal(db.auditLogs.some((item) => item.action === 'driver.session.rotated'), true);
    assert.equal(db.auditLogs.some((item) => item.action === 'auth.password-reset.completed'), true);
  } finally {
    await pool.end();
  }
}

