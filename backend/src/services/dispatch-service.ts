import { randomUUID } from 'node:crypto';

import { DatabaseShape, DriverRecord, LocationSnapshot, OrderRecord, RestaurantRecord } from '../domain/models.js';
import { calculatePricingAmount } from './pricing-rules.js';
import { haversineDistanceKm } from '../utils/geo.js';

const offerWindowSeconds = 30;
const staleLocationThresholdMinutes = Number(process.env.STALE_LOCATION_MINUTES ?? '5');

function nowIso(): string {
  return new Date().toISOString();
}

function isActiveStatus(status: OrderRecord['status']): boolean {
  return status === 'accepted' || status === 'atRestaurant' || status === 'pickedUp';
}

export class DispatchService {
  tick(db: DatabaseShape): boolean {
    let changed = false;
    const now = Date.now();

    for (const order of db.orders) {
      if (order.status !== 'pending' || !order.expiresAt || !order.assignedDriverId) {
        continue;
      }

      if (new Date(order.expiresAt).getTime() > now) {
        continue;
      }

      order.rejectedDriverIds.push(order.assignedDriverId);
      order.events.push({
        type: 'offerExpired',
        at: nowIso(),
        actorId: order.assignedDriverId,
      });
      order.assignedDriverId = null;
      order.expiresAt = null;
      order.status = 'queued';
      order.pendingDispatchNotification = false;
      changed = true;
      if (this.assignBestDriver(db, order)) {
        changed = true;
      }
    }

    return changed;
  }

  createRestaurantOrder(
    db: DatabaseShape,
    restaurant: RestaurantRecord,
    input: {
      customerName: string;
      customerAddress: string;
      customerLatitude: number;
      customerLongitude: number;
      deliveryArea: string;
    },
  ): OrderRecord {
    const customerLocation: LocationSnapshot = {
      name: input.customerName,
      address: input.customerAddress,
      latitude: input.customerLatitude,
      longitude: input.customerLongitude,
    };
    const estimatedKm = Number(
      haversineDistanceKm(restaurant.pickupLocation, customerLocation).toFixed(1),
    );
    const order: OrderRecord = {
      id: `order-${randomUUID()}`,
      restaurantId: restaurant.id,
      restaurant: restaurant.pickupLocation,
      customer: customerLocation,
      deliveryArea: input.deliveryArea,
      status: 'queued',
      distanceKm: Number((estimatedKm * 0.45).toFixed(1)),
      estimatedKm,
      estimatedMinutes: Math.max(10, Math.round(estimatedKm * 4)),
      tripEarnings: calculatePricingAmount(restaurant.pricing.driverPayoutRule, estimatedKm),
      companyCharge: calculatePricingAmount(restaurant.pricing.merchantBillingRule, estimatedKm),
      createdAt: nowIso(),
      expiresAt: null,
      assignedDriverId: null,
      rejectedDriverIds: [],
      deliveredAt: null,
      pendingDispatchNotification: false,
      events: [{ type: 'orderCreated', at: nowIso(), actorId: restaurant.id }],
    };

    db.orders.unshift(order);
    this.assignBestDriver(db, order);
    return order;
  }

  updateDriverAvailability(db: DatabaseShape, driverId: string, isOnline: boolean): DriverRecord {
    const driver = this.requireDriver(db, driverId);
    driver.isOnline = isOnline;

    if (!isOnline) {
      const pending = db.orders.find(
        (order) => order.status === 'pending' && order.assignedDriverId === driverId,
      );
      if (pending) {
        pending.rejectedDriverIds.push(driverId);
        pending.assignedDriverId = null;
        pending.expiresAt = null;
        pending.status = 'queued';
        pending.pendingDispatchNotification = false;
        pending.events.push({ type: 'driverWentOffline', at: nowIso(), actorId: driverId });
        this.assignBestDriver(db, pending);
      }
      return driver;
    }

    this.assignQueuedOrders(db);

    return driver;
  }

  assignQueuedOrders(db: DatabaseShape): boolean {
    let changed = false;
    for (const queued of db.orders.filter((item) => item.status === 'queued')) {
      if (this.assignBestDriver(db, queued)) {
        changed = true;
      }
    }
    return changed;
  }

  updateDriverLocation(
    db: DatabaseShape,
    driverId: string,
    input: {
      latitude: number;
      longitude: number;
      accuracyMeters: number | null;
      speedMetersPerSecond: number | null;
      headingDegrees: number | null;
      capturedAt: string;
    },
  ): DriverRecord {
    const driver = this.requireDriver(db, driverId);
    driver.currentLocation = {
      latitude: input.latitude,
      longitude: input.longitude,
      accuracyMeters: input.accuracyMeters,
      speedMetersPerSecond: input.speedMetersPerSecond,
      headingDegrees: input.headingDegrees,
      capturedAt: input.capturedAt,
    };
    return driver;
  }

  acceptOrder(db: DatabaseShape, driverId: string, orderId: string): OrderRecord {
    const order = this.requireOrder(db, orderId);
    if (order.assignedDriverId !== driverId || order.status !== 'pending') {
      throw new Error('Order is not available for this driver.');
    }

    order.status = 'accepted';
    order.expiresAt = null;
    order.pendingDispatchNotification = false;
    order.events.push({ type: 'accepted', at: nowIso(), actorId: driverId });
    return order;
  }

  rejectOrder(db: DatabaseShape, driverId: string, orderId: string): void {
    const order = this.requireOrder(db, orderId);
    if (order.assignedDriverId !== driverId || order.status !== 'pending') {
      return;
    }

    order.rejectedDriverIds.push(driverId);
    order.assignedDriverId = null;
    order.expiresAt = null;
    order.status = 'queued';
    order.pendingDispatchNotification = false;
    order.events.push({ type: 'rejected', at: nowIso(), actorId: driverId });
    this.assignBestDriver(db, order);
  }

  markStatus(
    db: DatabaseShape,
    driverId: string,
    orderId: string,
    status: 'atRestaurant' | 'pickedUp' | 'delivered',
  ): OrderRecord {
    const order = this.requireOrder(db, orderId);
    if (order.assignedDriverId !== driverId || !isActiveStatus(order.status)) {
      throw new Error('Driver cannot update this order.');
    }

    order.status = status;
    order.pendingDispatchNotification = false;
    order.events.push({ type: status, at: nowIso(), actorId: driverId });

    if (status === 'delivered') {
      order.deliveredAt = nowIso();
      const driver = this.requireDriver(db, driverId);
      driver.completedOrders += 1;
      driver.totalDistanceKm = Number((driver.totalDistanceKm + order.estimatedKm).toFixed(1));
      this.assignQueuedOrders(db);
    }

    return order;
  }

  getIncomingOrderForDriver(db: DatabaseShape, driverId: string): OrderRecord | null {
    this.tick(db);
    return (
      db.orders.find((order) => order.status === 'pending' && order.assignedDriverId === driverId) ??
      null
    );
  }

  getActiveOrderForDriver(db: DatabaseShape, driverId: string): OrderRecord | null {
    this.tick(db);
    return (
      db.orders.find(
        (order) => order.assignedDriverId === driverId && isActiveStatus(order.status),
      ) ?? null
    );
  }

  getOrdersNeedingDispatchNotification(db: DatabaseShape): Array<{ driver: DriverRecord; order: OrderRecord }> {
    const notifications: Array<{ driver: DriverRecord; order: OrderRecord }> = [];
    for (const order of db.orders) {
      if (!order.pendingDispatchNotification || !order.assignedDriverId) {
        continue;
      }
      const driver = db.drivers.find((item) => item.id === order.assignedDriverId);
      if (!driver) {
        continue;
      }
      notifications.push({ driver, order });
    }
    return notifications;
  }

  markDispatchNotificationSent(order: OrderRecord): void {
    order.pendingDispatchNotification = false;
  }

  getDriverLoad(db: DatabaseShape, driverId: string): number {
    return db.orders.filter((order) => order.assignedDriverId === driverId && this.countsTowardCapacity(order.status)).length;
  }

  getLocationFreshness(driver: DriverRecord): 'fresh' | 'stale' | 'missing' {
    if (!driver.currentLocation.capturedAt) {
      return 'missing';
    }
    const ageMs = Date.now() - new Date(driver.currentLocation.capturedAt).getTime();
    return ageMs <= staleLocationThresholdMinutes * 60 * 1000 ? 'fresh' : 'stale';
  }

  private assignBestDriver(db: DatabaseShape, order: OrderRecord): boolean {
    const restaurant = this.requireRestaurant(db, order.restaurantId);
    const rankedCandidates = this.rankDispatchCandidates(db, restaurant, order.rejectedDriverIds);
    const selectedDriver = rankedCandidates[0];
    if (!selectedDriver) {
      return false;
    }

    const distanceKm = haversineDistanceKm(selectedDriver.currentLocation, restaurant.pickupLocation);
    order.assignedDriverId = selectedDriver.id;
    order.status = 'pending';
    order.expiresAt = new Date(Date.now() + offerWindowSeconds * 1000).toISOString();
    order.tripEarnings = calculatePricingAmount(restaurant.pricing.driverPayoutRule, order.estimatedKm);
    order.companyCharge = calculatePricingAmount(restaurant.pricing.merchantBillingRule, order.estimatedKm);
    order.pendingDispatchNotification = true;
    order.events.push({
      type: 'offerAssigned',
      at: nowIso(),
      actorId: selectedDriver.id,
      notes: `Tier ${this.describeDispatchTier(selectedDriver, restaurant)} | Distance ${distanceKm.toFixed(2)} km`,
    });
    return true;
  }

  private rankDispatchCandidates(
    db: DatabaseShape,
    restaurant: RestaurantRecord,
    rejectedDriverIds: string[],
  ): DriverRecord[] {
    const baseCandidates = db.drivers
      .filter((driver) => driver.isOnline)
      .filter((driver) => !rejectedDriverIds.includes(driver.id))
      .filter((driver) => this.driverHasCapacity(db, driver.id))
      .filter((driver) => this.getLocationFreshness(driver) === 'fresh');

    const assignedCandidates = baseCandidates.filter((driver) => this.matchesAllowList(driver, restaurant));
    const openCandidates = baseCandidates.filter((driver) => driver.dispatchPolicy.mode === 'open');
    const fallbackCandidates = baseCandidates.filter(
      (driver) =>
        driver.dispatchPolicy.mode === 'allowListWithFallback' &&
        !this.matchesAllowList(driver, restaurant),
    );

    const ranked = [
      ...this.sortDriversByDistance(assignedCandidates, restaurant),
      ...this.sortDriversByDistance(openCandidates, restaurant),
      ...this.sortDriversByDistance(fallbackCandidates, restaurant),
    ];

    return this.uniqueDrivers(ranked);
  }

  private sortDriversByDistance(drivers: DriverRecord[], restaurant: RestaurantRecord): DriverRecord[] {
    return [...drivers].sort((left, right) => {
      const leftDistance = haversineDistanceKm(left.currentLocation, restaurant.pickupLocation);
      const rightDistance = haversineDistanceKm(right.currentLocation, restaurant.pickupLocation);
      return leftDistance - rightDistance;
    });
  }

  private uniqueDrivers(drivers: DriverRecord[]): DriverRecord[] {
    const seen = new Set<string>();
    return drivers.filter((driver) => {
      if (seen.has(driver.id)) {
        return false;
      }
      seen.add(driver.id);
      return true;
    });
  }

  private matchesAllowList(driver: DriverRecord, restaurant: RestaurantRecord): boolean {
    const policy = driver.dispatchPolicy;
    return (
      policy.restaurantIds.includes(restaurant.id) ||
      policy.merchantIds.includes(restaurant.merchantId)
    );
  }

  private describeDispatchTier(driver: DriverRecord, restaurant: RestaurantRecord): string {
    if (this.matchesAllowList(driver, restaurant)) {
      return 'allow-list';
    }
    if (driver.dispatchPolicy.mode === 'open') {
      return 'open';
    }
    return 'fallback-open';
  }

  private driverHasCapacity(db: DatabaseShape, driverId: string): boolean {
    const driver = this.requireDriver(db, driverId);
    return this.getDriverLoad(db, driverId) < driver.maxActiveOrders;
  }

  private countsTowardCapacity(status: OrderRecord['status']): boolean {
    return status === 'pending' || isActiveStatus(status);
  }

  private requireDriver(db: DatabaseShape, driverId: string): DriverRecord {
    const driver = db.drivers.find((item) => item.id === driverId);
    if (!driver) {
      throw new Error('Driver not found.');
    }
    return driver;
  }

  private requireOrder(db: DatabaseShape, orderId: string): OrderRecord {
    const order = db.orders.find((item) => item.id === orderId);
    if (!order) {
      throw new Error('Order not found.');
    }
    return order;
  }

  private requireRestaurant(db: DatabaseShape, restaurantId: string): RestaurantRecord {
    const restaurant = db.restaurants.find((item) => item.id === restaurantId);
    if (!restaurant) {
      throw new Error('Restaurant not found.');
    }
    return restaurant;
  }
}

