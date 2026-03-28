import assert from 'node:assert/strict';

import { DispatchService } from '../src/services/dispatch-service.js';
import { cloneDb, loadSeed } from './helpers.js';

function makeFresh(latitude: number, longitude: number) {
  return {
    latitude,
    longitude,
    accuracyMeters: 5,
    speedMetersPerSecond: 0,
    headingDegrees: 0,
    capturedAt: new Date().toISOString(),
  };
}

export async function runDispatchServiceTests(): Promise<void> {
  {
    const db = cloneDb(loadSeed());
    const service = new DispatchService();

    db.drivers[0]!.isOnline = true;
    db.drivers[1]!.isOnline = true;
    db.drivers[0]!.currentLocation = makeFresh(25.0764, 55.1443);
    db.drivers[1]!.currentLocation = makeFresh(25.18, 55.26);

    const order = service.createRestaurantOrder(db, db.restaurants[0]!, {
      customerName: 'A',
      customerAddress: 'Dubai Marina',
      customerLatitude: 25.0845,
      customerLongitude: 55.1417,
      deliveryArea: 'Dubai Marina',
    });

    assert.equal(order.assignedDriverId, 'drv_1f2c9a44');
  }

  {
    const db = cloneDb(loadSeed());
    const service = new DispatchService();

    db.drivers[0]!.isOnline = true;
    db.drivers[1]!.isOnline = true;
    db.drivers[0]!.currentLocation = {
      latitude: 25.0764,
      longitude: 55.1443,
      accuracyMeters: 5,
      speedMetersPerSecond: 0,
      headingDegrees: 0,
      capturedAt: new Date(Date.now() - 10 * 60 * 1000).toISOString(),
    };
    db.drivers[1]!.currentLocation = makeFresh(25.18, 55.26);

    const order = service.createRestaurantOrder(db, db.restaurants[0]!, {
      customerName: 'A',
      customerAddress: 'Dubai Marina',
      customerLatitude: 25.0845,
      customerLongitude: 55.1417,
      deliveryArea: 'Dubai Marina',
    });

    assert.equal(order.assignedDriverId, 'drv_3d8b6e21');
  }

  {
    const db = cloneDb(loadSeed());
    const service = new DispatchService();

    db.drivers[1]!.isOnline = true;
    db.drivers[1]!.currentLocation = makeFresh(25.1868, 55.26);
    db.drivers[2]!.isOnline = true;
    db.drivers[2]!.dispatchPolicy.mode = 'open';
    db.drivers[2]!.currentLocation = makeFresh(25.20, 55.28);

    db.orders.push({
      id: 'existing-order',
      restaurantId: 'rst_b72e4d11',
      restaurant: db.restaurants[1]!.pickupLocation,
      customer: {
        name: 'Existing',
        address: 'Downtown Dubai',
        latitude: 25.1945,
        longitude: 55.2744,
      },
      deliveryArea: 'Downtown',
      status: 'accepted',
      distanceKm: 2,
      estimatedKm: 5,
      estimatedMinutes: 15,
      driverDisplayDistanceKm: 5,
      driverDisplayMinutes: 15,
      driverDisplayMode: 'storeToCustomer',
      driverDisplayDistanceUnit: 'kilometer',
      displayCurrency: 'AED',
      tripEarnings: 28,
      companyCharge: 42,
      createdAt: new Date().toISOString(),
      expiresAt: null,
      assignedDriverId: 'drv_3d8b6e21',
      rejectedDriverIds: [],
      deliveredAt: null,
      pendingDispatchNotification: false,
      events: [],
    });

    const order = service.createRestaurantOrder(db, db.restaurants[1]!, {
      customerName: 'B',
      customerAddress: 'Downtown Dubai',
      customerLatitude: 25.1945,
      customerLongitude: 55.2744,
      deliveryArea: 'Downtown',
    });

    assert.equal(order.assignedDriverId, 'drv_7a4e1c90');
  }
  {
    const db = cloneDb(loadSeed());
    const service = new DispatchService();

    db.drivers[0]!.isOnline = true;
    db.drivers[0]!.currentLocation = makeFresh(25.0764, 55.1443);
    db.orders.push({
      id: 'retry-order',
      restaurantId: 'rst_a13c5f20',
      restaurant: db.restaurants[0]!.pickupLocation,
      customer: {
        name: 'Retry',
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
      createdAt: new Date(Date.now() - 2 * 60 * 1000).toISOString(),
      expiresAt: null,
      assignedDriverId: null,
      rejectedDriverIds: ['drv_1f2c9a44'],
      deliveredAt: null,
      pendingDispatchNotification: false,
      events: [{ type: 'offerExpired', at: new Date(Date.now() - 31 * 1000).toISOString(), actorId: 'drv_1f2c9a44' }],
    });

    const changed = service.assignQueuedOrders(db);
    assert.equal(changed, true);
    const retried = db.orders.find((order) => order.id === 'retry-order');
    assert.equal(retried?.assignedDriverId, 'drv_1f2c9a44');
    assert.equal(retried?.status, 'pending');
  }
  {
    const db = cloneDb(loadSeed());
    const service = new DispatchService();

    db.drivers[0]!.isOnline = true;
    db.drivers[0]!.currentLocation = makeFresh(25.0764, 55.1443);
    db.orders.push({
      id: 'manual-reject-order',
      restaurantId: 'rst_a13c5f20',
      restaurant: db.restaurants[0]!.pickupLocation,
      customer: {
        name: 'Manual Reject',
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
      createdAt: new Date(Date.now() - 2 * 60 * 1000).toISOString(),
      expiresAt: null,
      assignedDriverId: null,
      rejectedDriverIds: ['drv_1f2c9a44'],
      deliveredAt: null,
      pendingDispatchNotification: false,
      events: [{ type: 'rejected', at: new Date(Date.now() - 31 * 1000).toISOString(), actorId: 'drv_1f2c9a44' }],
    });

    const changed = service.assignQueuedOrders(db);
    assert.equal(changed, false);
    const retried = db.orders.find((order) => order.id === 'manual-reject-order');
    assert.equal(retried?.assignedDriverId, null);
    assert.equal(retried?.status, 'queued');
  }
  {
    const db = cloneDb(loadSeed());
    const service = new DispatchService();

    db.drivers[0]!.isOnline = true;
    db.drivers[0]!.currentLocation = {
      latitude: 37.4219983,
      longitude: -122.084,
      accuracyMeters: 5,
      speedMetersPerSecond: 0,
      headingDegrees: 0,
      capturedAt: new Date(Date.now() - 20 * 60 * 1000).toISOString(),
    };

    const order = service.createRestaurantOrder(db, db.restaurants[0]!, {
      customerName: 'Stale dedicated',
      customerAddress: 'Dubai Marina',
      customerLatitude: 25.0845,
      customerLongitude: 55.1417,
      deliveryArea: 'Dubai Marina',
    });

    assert.equal(order.assignedDriverId, 'drv_1f2c9a44');
    assert.equal(order.status, 'pending');
  }
}




