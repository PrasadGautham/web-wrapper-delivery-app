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

    assert.equal(order.assignedDriverId, 'driver-001');
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

    assert.equal(order.assignedDriverId, 'driver-002');
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
      restaurantId: 'restaurant-002',
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
      tripEarnings: 28,
      companyCharge: 42,
      createdAt: new Date().toISOString(),
      expiresAt: null,
      assignedDriverId: 'driver-002',
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

    assert.equal(order.assignedDriverId, 'driver-003');
  }
}
