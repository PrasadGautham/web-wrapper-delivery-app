import {
  DatabaseShape,
  OrderRecord,
  RestaurantPortalProfile,
  RestaurantRecord,
  RestaurantReport,
  StoreOrderView,
} from '../domain/models.js';
import { BackofficeReadService } from './backoffice-read-service.js';
import { BackendRuntime } from './backend-runtime.js';
import { DispatchService } from './dispatch-service.js';
import { DriverWorkflowService } from './driver-workflow-service.js';
import { toRestaurantPortalProfile } from './profile-projections.js';
import { RestaurantRealtimeService } from './restaurant-realtime-service.js';
import { orderFallsWithinRange, ReportDateRange } from '../utils/reporting.js';
import { extractDateInTimeZone, normalizeTenantTimeZone } from '../utils/timezones.js';

export class RestaurantWorkflowService {
  constructor(
    private readonly runtime: BackendRuntime,
    private readonly dispatchService: DispatchService,
    private readonly driverWorkflowService: DriverWorkflowService,
    private readonly restaurantRealtime: RestaurantRealtimeService,
    private readonly backofficeReadService: BackofficeReadService | null,
  ) {}

  async getRestaurantProfile(restaurantId: string): Promise<RestaurantPortalProfile> {
    return this.runtime.withDb(async (db) => {
      this.dispatchService.tick(db as never);
      const restaurant = this.runtime.requireRestaurant(db, restaurantId);
      const tenant = db.tenants.find((item) => item.id === restaurant.tenantId) ?? null;
      return toRestaurantPortalProfile(restaurant, tenant);
    });
  }

  async createRestaurantOrder(
    restaurantId: string,
    input: {
      customerName: string;
      customerAddress: string;
      customerLatitude: number;
      customerLongitude: number;
      deliveryArea: string;
    },
  ): Promise<OrderRecord> {
    return this.runtime.withMutableOperationalDb(async (state, appendAuditLog) => {
      const restaurant = this.runtime.requireRestaurant(state, restaurantId);
      this.dispatchService.tick(state as never);
      const order = this.dispatchService.createRestaurantOrder(state as never, restaurant, input);
      await appendAuditLog({
        actorType: 'restaurant',
        actorId: restaurantId,
        action: 'order.created',
        entityType: 'order',
        entityId: order.id,
      });
      this.restaurantRealtime.publishRestaurantUpdated(restaurantId);
      return order;
    });
  }

  async getRestaurantOrders(restaurantId: string, range: ReportDateRange = {}): Promise<StoreOrderView[]> {
    return this.runtime.withDb(async (db) => {
      this.dispatchService.tick(db as never);
      const restaurant = this.runtime.requireRestaurant(db, restaurantId);
      const tenant = db.tenants.find((item) => item.id === restaurant.tenantId) ?? null;
      const timeZone = normalizeTenantTimeZone(tenant?.timeZone);
      const orders = db.orders
        .filter((order) => order.restaurantId === restaurantId && orderFallsWithinRange(order.createdAt, range, timeZone))
        .sort((left, right) => right.createdAt.localeCompare(left.createdAt));
      return Promise.all(orders.map((order) => this.toRestaurantOrderView(db as DatabaseShape, restaurant, order)));
    });
  }

  async getRestaurantReport(restaurantId: string, range: ReportDateRange = {}): Promise<RestaurantReport> {
    if (this.backofficeReadService) {
      return this.backofficeReadService.getRestaurantReport(restaurantId, range);
    }
    return this.runtime.withDb(async (db) => {
      this.dispatchService.tick(db as never);
      const restaurant = this.runtime.requireRestaurant(db, restaurantId);
      const tenant = db.tenants.find((item) => item.id === restaurant.tenantId) ?? null;
      const timeZone = normalizeTenantTimeZone(tenant?.timeZone);
      const activeStatuses = new Set(['queued', 'pending', 'accepted', 'atRestaurant', 'pickedUp']);
      const orders = db.orders.filter((order) => order.restaurantId === restaurantId && orderFallsWithinRange(order.createdAt, range, timeZone));
      const totalOrders = orders.length;
      const activeOrders = orders.filter((order) => activeStatuses.has(order.status)).length;
      const deliveredOrders = orders.filter((order) => order.status === 'delivered').length;
      const totalRestaurantCharges = Number(orders.reduce((sum, order) => sum + order.companyCharge, 0).toFixed(2));
      const driverById = new Map(db.drivers.map((driver) => [driver.id, driver]));
      const statusMix = Array.from(orders.reduce((map, order) => {
        map.set(order.status, (map.get(order.status) || 0) + 1);
        return map;
      }, new Map<string, number>()).entries()).map(([status, count]) => ({ status, count })).sort((left, right) => right.count - left.count);
      const byCourier = new Map<string, { driverId: string; driverName: string; totalOrders: number; deliveredOrders: number; totalRestaurantCharges: number }>();
      const byDay = new Map<string, { date: string; totalOrders: number; deliveredOrders: number; totalRestaurantCharges: number }>();
      const tripRecordById = new Map(db.driverTrips.map((trip) => [trip.id, trip]));
      const tripById = new Map<string, { tripId: string; driverId: string; driverName: string; orderCount: number; deliveredOrders: number; startedAt: string; completedAt: string | null; totalRestaurantCharges: number }>();
      for (const order of orders) {
        if (order.assignedDriverId) {
          const driverName = driverById.get(order.assignedDriverId)?.name || 'Unknown courier';
          const driver = byCourier.get(order.assignedDriverId) || { driverId: order.assignedDriverId, driverName, totalOrders: 0, deliveredOrders: 0, totalRestaurantCharges: 0 };
          driver.totalOrders += 1;
          driver.deliveredOrders += order.status === 'delivered' ? 1 : 0;
          driver.totalRestaurantCharges += order.companyCharge;
          byCourier.set(order.assignedDriverId, driver);
        }
        if (order.tripId) {
          const trip = tripRecordById.get(order.tripId) ?? null;
          const driverName = order.assignedDriverId ? (driverById.get(order.assignedDriverId)?.name || 'Unknown courier') : 'Unassigned';
          const tripSummary = tripById.get(order.tripId) || { tripId: order.tripId, driverId: trip?.driverId ?? order.assignedDriverId ?? 'unknown-driver', driverName, orderCount: 0, deliveredOrders: 0, startedAt: trip?.startedAt ?? order.createdAt, completedAt: trip?.completedAt ?? null, totalRestaurantCharges: 0 };
          tripSummary.orderCount += 1;
          tripSummary.deliveredOrders += order.status === 'delivered' ? 1 : 0;
          tripSummary.totalRestaurantCharges += order.companyCharge;
          tripById.set(order.tripId, tripSummary);
        }
        const dayKey = extractDateInTimeZone(order.createdAt, timeZone);
        const day = byDay.get(dayKey) || { date: dayKey, totalOrders: 0, deliveredOrders: 0, totalRestaurantCharges: 0 };
        day.totalOrders += 1;
        day.deliveredOrders += order.status === 'delivered' ? 1 : 0;
        day.totalRestaurantCharges += order.companyCharge;
        byDay.set(dayKey, day);
      }
      return {
        totalOrders,
        activeOrders,
        deliveredOrders,
        totalRestaurantCharges,
        averageRestaurantCharge: totalOrders ? Number((totalRestaurantCharges / totalOrders).toFixed(2)) : 0,
        completionRate: totalOrders ? Number(((deliveredOrders / totalOrders) * 100).toFixed(1)) : 0,
        statusMix,
        byCourier: Array.from(byCourier.values()).map((item) => ({ ...item, totalRestaurantCharges: Number(item.totalRestaurantCharges.toFixed(2)) })).sort((left, right) => right.totalOrders - left.totalOrders),
        byDay: Array.from(byDay.values()).map((item) => ({ ...item, totalRestaurantCharges: Number(item.totalRestaurantCharges.toFixed(2)) })).sort((left, right) => left.date.localeCompare(right.date)),
        byTrip: Array.from(tripById.values()).map((item) => ({ ...item, totalRestaurantCharges: Number(item.totalRestaurantCharges.toFixed(2)) })).sort((left, right) => right.orderCount - left.orderCount || left.startedAt.localeCompare(right.startedAt)),
      };
    });
  }

  private async toRestaurantOrderView(
    db: DatabaseShape,
    restaurant: RestaurantRecord,
    order: OrderRecord,
  ): Promise<StoreOrderView> {
    const driver = order.assignedDriverId
      ? db.drivers.find((item) => item.id === order.assignedDriverId) ?? null
      : null;

    const beforePickup = order.status === 'pending' || order.status === 'accepted' || order.status === 'atRestaurant';
    const canUseLiveDriverLocation = Boolean(driver && this.driverWorkflowService.isDriverLocationFresh(driver.currentLocation));

    const pickupEta =
      beforePickup && restaurant.trackingSettings.showDriverEtaToPickup && driver
        ? await this.driverWorkflowService.estimateRouteMinutes(driver.currentLocation, restaurant.pickupLocation)
        : null;

    const destinationOrigin = canUseLiveDriverLocation ? driver!.currentLocation : restaurant.pickupLocation;
    const destinationEta =
      restaurant.trackingSettings.showDestinationEta && order.status === 'pickedUp'
        ? await this.driverWorkflowService.estimateRouteMinutes(destinationOrigin, order.customer)
        : null;

    const displayStatus =
      restaurant.trackingSettings.showPickedUpAsInTransit && order.status === 'pickedUp'
        ? 'inTransit'
        : order.status;

    const { tripEarnings: _tripEarnings, ...storeVisibleOrder } = order;
    const tripOrderCount = this.dispatchService.getTripOrderCount(db as never, order.tripId);

    return {
      ...storeVisibleOrder,
      tripOrderCount,
      isBatchedTrip: tripOrderCount > 1,
      tracking: {
        displayStatus,
        driverEtaToPickupMinutes: pickupEta?.minutes ?? null,
        destinationEtaMinutes: destinationEta?.minutes ?? null,
        assignedDriverName: driver?.name ?? null,
        assignedDriverPhoneHint: driver ? driver.email : null,
        etaSource: destinationEta?.source ?? pickupEta?.source ?? 'not-available',
      },
    };
  }
}

