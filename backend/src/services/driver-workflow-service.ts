import {
  DriverLocationSnapshot,
  DriverProfile,
  OrderRecord,
} from '../domain/models.js';
import { haversineDistanceKm } from '../utils/geo.js';
import { BackendRuntime } from './backend-runtime.js';
import { DispatchService } from './dispatch-service.js';
import { EtaProvider } from './eta-provider.js';
import { getDriverLocationFreshness, toDriverProfile } from './profile-projections.js';
import { RestaurantRealtimeService } from './restaurant-realtime-service.js';

function startOfDay(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

const averageKmPerMinute = 0.55;
const maxReasonableStaticEtaDistanceKm = 80;

function summarizeOrders(orders: OrderRecord[]): Map<string, string> {
  return new Map(orders.map((order) => [order.id, `${order.status}|${order.assignedDriverId ?? ''}|${order.expiresAt ?? ''}`]));
}

export class DriverWorkflowService {
  constructor(
    private readonly runtime: BackendRuntime,
    private readonly dispatchService: DispatchService,
    private readonly etaProvider: EtaProvider | null,
    private readonly restaurantRealtime: RestaurantRealtimeService,
  ) {}

  async updateDriverLocation(
    driverId: string,
    input: {
      latitude: number;
      longitude: number;
      accuracyMeters: number | null;
      speedMetersPerSecond: number | null;
      headingDegrees: number | null;
      capturedAt: string;
    },
  ): Promise<DriverProfile> {
    return this.runtime.withMutableOperationalDb(async (state, appendAuditLog) => {
      const driver = this.dispatchService.updateDriverLocation(state as never, driverId, input);
      if (driver.isOnline) {
        this.dispatchService.assignQueuedOrders(state as never);
      }
      await appendAuditLog({
        actorType: 'driver',
        actorId: driverId,
        action: 'driver.location.updated',
        entityType: 'driver',
        entityId: driverId,
        metadata: {
          latitude: input.latitude,
          longitude: input.longitude,
          capturedAt: input.capturedAt,
        },
      });
      this.publishRestaurantsForDriver(state.orders, driverId);
      return toDriverProfile(driver, this.dispatchService.getDriverLoad(state as never, driver.id));
    });
  }

  async runDispatchCycle(): Promise<void> {
    await this.runtime.withMutableOperationalDb(async (state) => {
      const before = summarizeOrders(state.orders);
      this.dispatchService.tick(state as never);
      this.dispatchService.assignQueuedOrders(state as never);
      this.publishRestaurantsForChangedOrders(before, state.orders);
    });
  }

  async getDriverProfile(driverId: string): Promise<DriverProfile> {
    return this.runtime.withOperationalDb(async (state) => {
      this.dispatchService.tick(state as never);
      return toDriverProfile(this.runtime.requireDriver(state, driverId), this.dispatchService.getDriverLoad(state as never, driverId));
    });
  }

  async updateDriverAvailability(driverId: string, isOnline: boolean): Promise<DriverProfile> {
    return this.runtime.withMutableOperationalDb(async (state, appendAuditLog) => {
      const before = summarizeOrders(state.orders);
      this.dispatchService.tick(state as never);
      const driver = this.dispatchService.updateDriverAvailability(state as never, driverId, isOnline);
      await appendAuditLog({
        actorType: 'driver',
        actorId: driverId,
        action: 'driver.availability.updated',
        entityType: 'driver',
        entityId: driverId,
        metadata: { isOnline },
      });
      this.publishRestaurantsForChangedOrders(before, state.orders);
      return toDriverProfile(driver, this.dispatchService.getDriverLoad(state as never, driver.id));
    });
  }

  async getIncomingOrder(driverId: string): Promise<OrderRecord | null> {
    return this.runtime.withOperationalDb(async (state) => this.dispatchService.getIncomingOrderForDriver(state as never, driverId));
  }

  async getActiveOrder(driverId: string): Promise<OrderRecord | null> {
    return this.runtime.withOperationalDb(async (state) => this.dispatchService.getActiveOrderForDriver(state as never, driverId));
  }

  async acceptOrder(driverId: string, orderId: string): Promise<OrderRecord> {
    return this.runtime.withMutableOperationalDb(async (state, appendAuditLog) => {
      const order = this.dispatchService.acceptOrder(state as never, driverId, orderId);
      await appendAuditLog({
        actorType: 'driver',
        actorId: driverId,
        action: 'order.accepted',
        entityType: 'order',
        entityId: orderId,
      });
      this.restaurantRealtime.publishRestaurantUpdated(order.restaurantId);
      return order;
    });
  }

  async rejectOrder(driverId: string, orderId: string): Promise<void> {
    await this.runtime.withMutableOperationalDb(async (state, appendAuditLog) => {
      const order = state.orders.find((item) => item.id == orderId) ?? null;
      this.dispatchService.rejectOrder(state as never, driverId, orderId);
      await appendAuditLog({
        actorType: 'driver',
        actorId: driverId,
        action: 'order.rejected',
        entityType: 'order',
        entityId: orderId,
      });
      if (order) {
        this.restaurantRealtime.publishRestaurantUpdated(order.restaurantId);
      }
    });
  }

  async markArrived(driverId: string, orderId: string): Promise<OrderRecord> {
    return this.runtime.withMutableOperationalDb(async (state, appendAuditLog) => {
      const order = this.dispatchService.markStatus(state as never, driverId, orderId, 'atRestaurant');
      await appendAuditLog({
        actorType: 'driver',
        actorId: driverId,
        action: 'order.arrived',
        entityType: 'order',
        entityId: orderId,
      });
      this.restaurantRealtime.publishRestaurantUpdated(order.restaurantId);
      return order;
    });
  }

  async pickupOrder(driverId: string, orderId: string): Promise<OrderRecord> {
    return this.runtime.withMutableOperationalDb(async (state, appendAuditLog) => {
      const order = this.dispatchService.markStatus(state as never, driverId, orderId, 'pickedUp');
      await appendAuditLog({
        actorType: 'driver',
        actorId: driverId,
        action: 'order.picked-up',
        entityType: 'order',
        entityId: orderId,
      });
      this.restaurantRealtime.publishRestaurantUpdated(order.restaurantId);
      return order;
    });
  }

  async completeOrder(driverId: string, orderId: string): Promise<OrderRecord> {
    return this.runtime.withMutableOperationalDb(async (state, appendAuditLog) => {
      const order = this.dispatchService.markStatus(state as never, driverId, orderId, 'delivered');
      await appendAuditLog({
        actorType: 'driver',
        actorId: driverId,
        action: 'order.delivered',
        entityType: 'order',
        entityId: orderId,
      });
      this.restaurantRealtime.publishRestaurantUpdated(order.restaurantId);
      return order;
    });
  }

  async getDriverEarnings(driverId: string): Promise<{
    daily: number;
    weekly: number;
    total: number;
    completedDeliveries: number;
    distanceTravelledKm: number;
    points: Array<{ label: string; amount: number }>;
  }> {
    return this.runtime.withOperationalDb(async (state) => {
      this.dispatchService.tick(state as never);
      const driver = this.runtime.requireDriver(state, driverId);
      const delivered = state.orders.filter(
        (order) => order.assignedDriverId === driverId && order.status === 'delivered' && order.deliveredAt,
      );
      const now = new Date();
      const dayStart = startOfDay(now).getTime();
      const weekStart = dayStart - 6 * 24 * 60 * 60 * 1000;

      const daily = delivered
        .filter((order) => new Date(order.deliveredAt as string).getTime() >= dayStart)
        .reduce((sum, order) => sum + order.tripEarnings, 0);
      const weekly = delivered
        .filter((order) => new Date(order.deliveredAt as string).getTime() >= weekStart)
        .reduce((sum, order) => sum + order.tripEarnings, 0);
      const total = delivered.reduce((sum, order) => sum + order.tripEarnings, 0);

      const points = Array.from({ length: 7 }).map((_, index) => {
        const date = new Date(weekStart + index * 24 * 60 * 60 * 1000);
        const bucketStart = startOfDay(date).getTime();
        const bucketEnd = bucketStart + 24 * 60 * 60 * 1000;
        return {
          label: date.toLocaleDateString('en-US', { weekday: 'short' }),
          amount: Number(
            delivered
              .filter((order) => {
                const deliveredAt = new Date(order.deliveredAt as string).getTime();
                return deliveredAt >= bucketStart && deliveredAt < bucketEnd;
              })
              .reduce((sum, order) => sum + order.tripEarnings, 0)
              .toFixed(2),
          ),
        };
      });

      return {
        daily: Number(daily.toFixed(2)),
        weekly: Number(weekly.toFixed(2)),
        total: Number(total.toFixed(2)),
        completedDeliveries: driver.completedOrders,
        distanceTravelledKm: Number(driver.totalDistanceKm.toFixed(1)),
        points,
      };
    });
  }

  async estimateRouteMinutes(
    origin: { latitude: number; longitude: number },
    destination: { latitude: number; longitude: number },
  ): Promise<{ minutes: number; source: 'google-routes' | 'live-driver-location' | 'static-estimate' } | null> {
    const googleEstimate = this.etaProvider ? await this.etaProvider.estimateMinutes({ origin, destination }) : null;
    if (googleEstimate) {
      return googleEstimate;
    }
    const distanceKm = haversineDistanceKm(origin, destination);
    if (!Number.isFinite(distanceKm) || distanceKm > maxReasonableStaticEtaDistanceKm) {
      return null;
    }
    return {
      minutes: Math.max(3, Math.round(distanceKm / averageKmPerMinute)),
      source: 'static-estimate',
    };
  }

  isDriverLocationFresh(location: DriverLocationSnapshot): boolean {
    return getDriverLocationFreshness(location) === 'fresh';
  }

  private publishRestaurantsForDriver(orders: OrderRecord[], driverId: string): void {
    const restaurantIds = new Set(
      orders
        .filter((order) => order.assignedDriverId === driverId && order.status !== 'delivered')
        .map((order) => order.restaurantId),
    );
    for (const restaurantId of restaurantIds) {
      this.restaurantRealtime.publishRestaurantUpdated(restaurantId);
    }
  }

  private publishRestaurantsForChangedOrders(before: Map<string, string>, orders: OrderRecord[]): void {
    const restaurantIds = new Set<string>();
    for (const order of orders) {
      const next = `${order.status}|${order.assignedDriverId ?? ''}|${order.expiresAt ?? ''}`;
      if (before.get(order.id) !== next) {
        restaurantIds.add(order.restaurantId);
      }
    }
    for (const restaurantId of restaurantIds) {
      this.restaurantRealtime.publishRestaurantUpdated(restaurantId);
    }
  }
}
