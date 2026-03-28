import assert from 'node:assert/strict';

import { loadSeed, InMemoryStore } from './helpers.js';

export async function runStoreContextsTests(): Promise<void> {
  {
    const store = new InMemoryStore(loadSeed());
    const driver = await store.withWorkflowReadContext((context) => context.findDriverByEmail('driver@demo.com'));
    assert.equal(driver?.id, 'drv_1f2c9a44');
  }

  {
    const store = new InMemoryStore(loadSeed());
    await store.withWorkflowWriteContext(async (context) => {
      const driver = await context.findDriverById('drv_1f2c9a44');
      assert.ok(driver);
      driver.deviceToken = 'test-token';
      await context.saveDriver(driver);
      await context.replaceSession({
        token: 'session-1',
        userType: 'driver',
        userId: 'drv_1f2c9a44',
        createdAt: new Date().toISOString(),
        expiresAt: new Date(Date.now() + 60_000).toISOString(),
      });
    });

    const db = await store.read();
    assert.equal(db.drivers[0]?.deviceToken, 'test-token');
    assert.equal(db.sessions[0]?.token, 'session-1');
  }

  {
    const store = new InMemoryStore(loadSeed());
    await store.withOperationalWriteContext(async (context) => {
      context.state.orders.push({
        id: 'op-order',
        restaurantId: 'rst_a13c5f20',
        restaurant: context.state.restaurants[0]!.pickupLocation,
        customer: {
          name: 'Operational',
          address: 'Dubai Marina',
          latitude: 25.08,
          longitude: 55.14,
        },
        deliveryArea: 'Dubai Marina',
        status: 'queued',
        distanceKm: 1,
        estimatedKm: 1.5,
        estimatedMinutes: 8,
        driverDisplayDistanceKm: 1.5,
        driverDisplayMinutes: 8,
        driverDisplayMode: 'storeToCustomer',
        tripEarnings: 10,
        companyCharge: 15,
        createdAt: new Date().toISOString(),
        expiresAt: null,
        assignedDriverId: null,
        rejectedDriverIds: [],
        deliveredAt: null,
        pendingDispatchNotification: false,
        events: [],
      });
    });

    const db = await store.read();
    assert.equal(db.orders.some((item) => item.id === 'op-order'), true);
  }
}

