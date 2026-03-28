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
    assert.equal(result.restaurant.id, 'restaurant-001');
  }

  {
    const store = new InMemoryStore(loadSeed());
    const service = createService(store);

    const staffUsers = await service.listRestaurantStaffUsers('restaurant-001');
    assert.equal(staffUsers.length >= 2, true);
    const adminUsers = await service.listAdminUsers();
    assert.equal(adminUsers.length >= 1, true);
  }

  {
    const db = loadSeed();
    db.sessions.push({
      token: 'expired-token',
      userType: 'driver',
      userId: 'driver-001',
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
    assert.equal(current.id, 'driver-001');
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
      restaurantId: 'restaurant-001',
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
      tripEarnings: 23.5,
      companyCharge: 37,
      createdAt: new Date().toISOString(),
      expiresAt: null,
      assignedDriverId: 'driver-001',
      rejectedDriverIds: [],
      deliveredAt: null,
      pendingDispatchNotification: false,
      events: [],
    });

    const service = createService(new InMemoryStore(db));
    const profile = await service.getDriverProfile('driver-001');
    assert.equal(profile.currentLoad, 1);
    assert.equal(profile.locationFreshness, 'fresh');
  }
  {
    const store = new InMemoryStore(loadSeed());
    const service = createService(store);

    const restaurant = await service.updateRestaurantPricing('restaurant-001', {
      driverRatePerOrder: 9.5,
      restaurantChargePerOrder: 16.75,
    });
    assert.equal(restaurant.driverRatePerOrder, 9.5);
    assert.equal(restaurant.restaurantChargePerOrder, 16.75);

    const trackingUpdated = await service.updateRestaurantTrackingSettings('restaurant-001', {
      showPickedUpAsInTransit: false,
      showDriverEtaToPickup: true,
      showDestinationEta: false,
    });
    assert.equal(trackingUpdated.trackingSettings.showPickedUpAsInTransit, false);

    const merchant = await service.requireMerchantFromToken((await service.loginMerchant('falafel.group@demo.com', 'Password123')).token);
    const merchantPricing = await service.updateMerchantRestaurantPricing(merchant, 'restaurant-001', {
      driverRatePerOrder: 11,
      restaurantChargePerOrder: 19,
    });
    assert.equal(merchantPricing.driverRatePerOrder, 11);
    assert.equal(merchantPricing.restaurantChargePerOrder, 19);

    const merchantTracking = await service.updateMerchantRestaurantTrackingSettings(merchant, 'restaurant-001', {
      showPickedUpAsInTransit: true,
      showDriverEtaToPickup: true,
      showDestinationEta: true,
    });
    assert.equal(merchantTracking.trackingSettings.showDestinationEta, true);
  }
}

