import assert from 'node:assert/strict';

import { BackendService } from '../src/services/backend-service.js';
import { DispatchService } from '../src/services/dispatch-service.js';
import {
  InMemoryStore,
  loadSeed,
  noopPasswordResetNotifier,
  noopPushGateway,
  noopRestaurantRealtime,
  nullEtaProvider,
} from './helpers.js';

function createService(store: InMemoryStore): BackendService {
  return new BackendService(
    store,
    new DispatchService(),
    noopPushGateway as never,
    nullEtaProvider,
    noopPasswordResetNotifier as never,
    noopRestaurantRealtime as never,
  );
}

export async function runBackendServiceTests(): Promise<void> {
  {
    const store = new InMemoryStore(loadSeed());
    const service = createService(store);

    const result = await service.loginDriver('driver@demo.com', 'Password123');
    assert.ok(result.token);
    assert.equal(result.driver.email, 'driver@demo.com');
    assert.equal('password' in result.driver, false);

    const db = await store.read();
    assert.equal(db.sessions.length, 1);
    assert.equal(db.auditLogs[0]?.action, 'driver.login');
  }

  {
    const store = new InMemoryStore(loadSeed());
    const service = createService(store);

    await assert.rejects(() => service.loginDriver('driver@demo.com', 'wrong'), /Invalid credentials/);
    const db = await store.read();
    assert.equal(db.auditLogs[0]?.action, 'auth.login.failed');
  }

  {
    const store = new InMemoryStore(loadSeed());
    const service = createService(store);

    const result = await service.loginRestaurant('falafel.dispatch@demo.com', 'Password123');
    assert.ok(result.token);
    assert.equal(result.restaurant.id, 'rst_a13c5f20');
  }

  {
    const store = new InMemoryStore(loadSeed());
    const service = createService(store);

    const staffUsers = await service.listRestaurantStaffUsers('rst_a13c5f20');
    assert.equal(staffUsers.length >= 2, true);
    const adminUsers = await service.listAdminUsers();
    assert.equal(adminUsers.length >= 1, true);
  }

  {
    const db = loadSeed();
    db.sessions.push({
      token: 'expired-token',
      userType: 'driver',
      userId: 'drv_1f2c9a44',
      tenantId: 'tnt_fleet_001',
      createdAt: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(),
      expiresAt: new Date(Date.now() - 60 * 1000).toISOString(),
    });

    const service = createService(new InMemoryStore(db));
    await assert.rejects(() => service.requireDriverFromToken('expired-token'), /Unauthorized/);
  }

  {
    const store = new InMemoryStore(loadSeed());
    const service = createService(store);
    const login = await service.loginDriver('driver@demo.com', 'Password123');
    const refreshed = await service.refreshSession(login.token, 'driver');
    assert.notEqual(refreshed.token, login.token);
    await assert.rejects(() => service.requireDriverFromToken(login.token), /Unauthorized/);
    const current = await service.requireDriverFromToken(refreshed.token);
    assert.equal(current.id, 'drv_1f2c9a44');
  }

  {
    process.env.ALLOW_INSECURE_PASSWORD_RESET_TOKEN_RESPONSE = 'true';
    const store = new InMemoryStore(loadSeed());
    const service = createService(store);

    const login = await service.loginDriver('driver@demo.com', 'Password123');
    const reset = await service.requestPasswordReset('driver', 'driver@demo.com');
    assert.ok(reset.debugToken);
    await service.confirmPasswordReset('driver', reset.debugToken as string, 'NewPassword123');
    await assert.rejects(() => service.requireDriverFromToken(login.token), /Unauthorized/);
    const relogin = await service.loginDriver('driver@demo.com', 'NewPassword123');
    assert.ok(relogin.token);
    process.env.ALLOW_INSECURE_PASSWORD_RESET_TOKEN_RESPONSE = 'false';
  }

  {
    const db = loadSeed();
    db.drivers[0]!.currentLocation = {
      latitude: 25.0764,
      longitude: 55.1443,
      accuracyMeters: 5,
      speedMetersPerSecond: 0,
      headingDegrees: 0,
      capturedAt: new Date().toISOString(),
    };
    db.orders.push({
      id: 'pending-order',
      tenantId: 'tnt_fleet_001',
      restaurantId: 'rst_a13c5f20',
      restaurant: db.restaurants[0]!.pickupLocation,
      customer: {
        name: 'Current Load',
        address: 'Dubai Marina',
        latitude: 25.0845,
        longitude: 55.1417,
      },
      deliveryArea: 'Dubai Marina',
      status: 'accepted',
      distanceKm: 1,
      estimatedKm: 2,
      estimatedMinutes: 8,
      driverDisplayDistanceKm: 2,
      driverDisplayMinutes: 8,
      driverDisplayMode: 'storeToCustomer',
      driverDisplayDistanceUnit: 'kilometer',
      displayCurrency: 'AED',
      tripEarnings: 23.5,
      companyCharge: 37,
      createdAt: new Date().toISOString(),
      expiresAt: null,
      assignedDriverId: 'drv_1f2c9a44',
      rejectedDriverIds: [],
      deliveredAt: null,
      pendingDispatchNotification: false,
      events: [],
    });

    const service = createService(new InMemoryStore(db));
    const profile = await service.getDriverProfile('drv_1f2c9a44');
    assert.equal(profile.currentLoad, 1);
    assert.equal(profile.locationFreshness, 'fresh');
  }

  {
    const db = loadSeed();
    db.drivers[0]!.isOnline = true;
    db.drivers[0]!.currentLocation = {
      latitude: 25.0764,
      longitude: 55.1443,
      accuracyMeters: 5,
      speedMetersPerSecond: 0,
      headingDegrees: 0,
      capturedAt: new Date().toISOString(),
    };
    db.orders.unshift({
      id: 'queued-order',
      tenantId: 'tnt_fleet_001',
      restaurantId: 'rst_a13c5f20',
      restaurant: db.restaurants[0]!.pickupLocation,
      customer: {
        name: 'Queued Customer',
        address: 'Dubai Marina',
        latitude: 25.0845,
        longitude: 55.1417,
      },
      deliveryArea: 'Dubai Marina',
      status: 'queued',
      distanceKm: 1,
      estimatedKm: 2,
      estimatedMinutes: 8,
      driverDisplayDistanceKm: 2,
      driverDisplayMinutes: 8,
      driverDisplayMode: 'storeToCustomer',
      driverDisplayDistanceUnit: 'kilometer',
      displayCurrency: 'AED',
      tripEarnings: 23.5,
      companyCharge: 37,
      createdAt: new Date().toISOString(),
      expiresAt: null,
      assignedDriverId: null,
      rejectedDriverIds: [],
      deliveredAt: null,
      pendingDispatchNotification: false,
      events: [],
    });

    const service = createService(new InMemoryStore(db));
    const incoming = await service.getIncomingOrder('drv_1f2c9a44');
    assert.equal(incoming?.id, 'queued-order');
    assert.equal(incoming?.assignedDriverId, 'drv_1f2c9a44');
    assert.equal(incoming?.status, 'pending');
  }

  {
    const store = new InMemoryStore(loadSeed());
    const service = createService(store);

    const restaurant = await service.updateRestaurantPricing('rst_a13c5f20', {
      driverPayoutRule: { baseAmount: 9.5, includedDistanceKm: 2, additionalPerKm: 1.25 },
      merchantBillingRule: { baseAmount: 16.75, includedDistanceKm: 3, additionalPerKm: 2.5 },
    });
    assert.equal(restaurant.pricing.driverPayoutRule.baseAmount, 9.5);
    assert.equal(restaurant.pricing.merchantBillingRule.baseAmount, 16.75);

    const trackingUpdated = await service.updateRestaurantTrackingSettings('rst_a13c5f20', {
      showPickedUpAsInTransit: false,
      showDriverEtaToPickup: true,
      showDestinationEta: false,
    });
    assert.equal(trackingUpdated.trackingSettings.showPickedUpAsInTransit, false);

    const merchant = await service.requireMerchantFromToken((await service.loginMerchant('falafel.group@demo.com', 'Password123')).token);
    const merchantPricing = await service.updateMerchantRestaurantPricing(merchant, 'rst_a13c5f20', {
      driverPayoutRule: { baseAmount: 11, includedDistanceKm: 1.5, additionalPerKm: 0.75 },
      merchantBillingRule: { baseAmount: 19, includedDistanceKm: 2.5, additionalPerKm: 1.5 },
    });
    assert.equal(merchantPricing.pricing.driverPayoutRule.baseAmount, 11);
    assert.equal(merchantPricing.pricing.merchantBillingRule.baseAmount, 19);

    const merchantTracking = await service.updateMerchantRestaurantTrackingSettings(merchant, 'rst_a13c5f20', {
      showPickedUpAsInTransit: true,
      showDriverEtaToPickup: true,
      showDestinationEta: true,
    });
    assert.equal(merchantTracking.trackingSettings.showDestinationEta, true);
  }

  {
    const store = new InMemoryStore(loadSeed());
    const service = createService(store);

    await assert.rejects(
      () => service.updateDriverDispatchPolicy('drv_3d8b6e21', {
        mode: 'allowListOnly',
        restaurantIds: ['rst_a13c5f20'],
        merchantIds: [],
      }),
      /outside the driver tenant scope/,
    );
  }
}
