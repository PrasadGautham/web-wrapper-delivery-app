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

export class RestaurantWorkflowService {
  constructor(
    private readonly runtime: BackendRuntime,
    private readonly dispatchService: DispatchService,
    private readonly driverWorkflowService: DriverWorkflowService,
    private readonly restaurantRealtime: RestaurantRealtimeService,
    private readonly backofficeReadService: BackofficeReadService | null,
  ) {}

  async getRestaurantProfile(restaurantId: string): Promise<RestaurantPortalProfile> {
    return this.runtime.withOperationalDb(async (state) => {
      this.dispatchService.tick(state as never);
      return toRestaurantPortalProfile(this.runtime.requireRestaurant(state, restaurantId));
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
    return this.runtime.withOperationalDb(async (state) => {
      this.dispatchService.tick(state as never);
      const restaurant = this.runtime.requireRestaurant(state, restaurantId);
      const orders = state.orders
        .filter((order) => order.restaurantId === restaurantId && orderFallsWithinRange(order.createdAt, range))
        .sort((left, right) => right.createdAt.localeCompare(left.createdAt));
      return Promise.all(orders.map((order) => this.toRestaurantOrderView(state as DatabaseShape, restaurant, order)));
    });
  }

  async getRestaurantReport(restaurantId: string, range: ReportDateRange = {}): Promise<RestaurantReport> {
    if (this.backofficeReadService) {
      return this.backofficeReadService.getRestaurantReport(restaurantId, range);
    }
    return this.runtime.withOperationalDb(async (state) => {
      this.dispatchService.tick(state as never);
      const orders = state.orders.filter((order) => order.restaurantId === restaurantId && orderFallsWithinRange(order.createdAt, range));
      return {
        totalOrders: orders.length,
        activeOrders: orders.filter((order) =>
          ['queued', 'pending', 'accepted', 'atRestaurant', 'pickedUp'].includes(order.status),
        ).length,
        deliveredOrders: orders.filter((order) => order.status === 'delivered').length,
        totalRestaurantCharges: Number(orders.reduce((sum, order) => sum + order.companyCharge, 0).toFixed(2)),
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

    return {
      ...storeVisibleOrder,
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
