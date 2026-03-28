import {
  AdminRole,
  AdminUserProfile,
  DistancePricingRule,
  DriverDispatchPolicy,
  DriverProfile,
  DriverRecord,
  TenantProfile,
  MerchantProfile,
  MerchantRecord,
  MerchantReport,
  MerchantRestaurantProfile,
  MerchantUserProfile,
  MerchantUserRole,
  MerchantView,
  OrderRecord,
  RestaurantProfile,
  RestaurantPortalProfile,
  RestaurantRecord,
  RestaurantReport,
  StoreOrderView,
  RestaurantStaffRole,
  RestaurantStaffUserProfile,
  RestaurantTrackingSettings,
  DriverOfferSettings,
  DistanceUnit,
  UserType,
} from '../domain/models.js';
import { AdminWorkflowService } from './admin-workflow-service.js';
import { AuthWorkflowService } from './auth-workflow-service.js';
import { BackofficeReadService } from './backoffice-read-service.js';
import { BackendRuntime } from './backend-runtime.js';
import { DispatchService } from './dispatch-service.js';
import { DriverWorkflowService } from './driver-workflow-service.js';
import { EtaProvider } from './eta-provider.js';
import { MerchantWorkflowService } from './merchant-workflow-service.js';
import { PasswordResetNotifier } from './password-reset-notifier.js';
import { PushGateway } from './push-gateway.js';
import { RestaurantRealtimeService } from './restaurant-realtime-service.js';
import { RestaurantWorkflowService } from './restaurant-workflow-service.js';
import { hasWorkflowStore, StoreContract } from './store-contract.js';
import { ReportDateRange } from '../utils/reporting.js';

const defaultSessionHours = Number(process.env.SESSION_TTL_HOURS ?? '12');

export class BackendService {
  private readonly runtime: BackendRuntime;
  private readonly authWorkflow: AuthWorkflowService;
  private readonly adminWorkflow: AdminWorkflowService;
  private readonly driverWorkflow: DriverWorkflowService;
  private readonly restaurantWorkflow: RestaurantWorkflowService;
  private readonly merchantWorkflow: MerchantWorkflowService;

  constructor(
    store: StoreContract,
    dispatchService: DispatchService,
    pushGateway: PushGateway,
    etaProvider: EtaProvider | null,
    passwordResetNotifier: PasswordResetNotifier,
    restaurantRealtime: RestaurantRealtimeService,
    backofficeReadService: BackofficeReadService | null = null,
    logger?: { warn: (message: unknown) => void },
  ) {
    this.runtime = new BackendRuntime(store, dispatchService, pushGateway, defaultSessionHours, logger);
    const workflowStore = hasWorkflowStore(store) ? store : null;
    this.authWorkflow = new AuthWorkflowService(
      this.runtime,
      dispatchService,
      passwordResetNotifier,
      workflowStore,
    );
    this.driverWorkflow = new DriverWorkflowService(
      this.runtime,
      dispatchService,
      etaProvider,
      restaurantRealtime,
    );
    this.adminWorkflow = new AdminWorkflowService(
      this.runtime,
      dispatchService,
      workflowStore,
    );
    this.restaurantWorkflow = new RestaurantWorkflowService(
      this.runtime,
      dispatchService,
      this.driverWorkflow,
      restaurantRealtime,
      backofficeReadService,
    );
    this.merchantWorkflow = new MerchantWorkflowService(
      this.runtime,
      dispatchService,
      this.restaurantWorkflow,
      backofficeReadService,
    );
  }

  loginDriver(email: string, password: string): Promise<{ token: string; driver: DriverProfile }> {
    return this.authWorkflow.loginDriver(email, password);
  }

  loginRestaurant(email: string, password: string): Promise<{ token: string; restaurant: RestaurantProfile }> {
    return this.authWorkflow.loginRestaurant(email, password);
  }

  loginMerchant(email: string, password: string): Promise<{ token: string; merchant: MerchantProfile }> {
    return this.authWorkflow.loginMerchant(email, password);
  }

  loginAdmin(email: string, password: string): Promise<{ token: string; adminUser: AdminUserProfile }> {
    return this.authWorkflow.loginAdmin(email, password);
  }

  refreshSession(token: string, userType: UserType): Promise<{ token: string }> {
    return this.authWorkflow.refreshSession(token, userType);
  }

  requestPasswordReset(userType: UserType, email: string): Promise<{ ok: true; debugToken?: string }> {
    return this.authWorkflow.requestPasswordReset(userType, email);
  }

  confirmPasswordReset(userType: UserType, token: string, newPassword: string): Promise<{ ok: true }> {
    return this.authWorkflow.confirmPasswordReset(userType, token, newPassword);
  }

  logout(token: string): Promise<void> {
    return this.authWorkflow.logout(token);
  }

  requireDriverFromToken(token: string): Promise<DriverRecord> {
    return this.authWorkflow.requireDriverFromToken(token);
  }

  requireRestaurantFromToken(token: string): Promise<RestaurantRecord> {
    return this.authWorkflow.requireRestaurantFromToken(token);
  }

  requireMerchantFromToken(token: string): Promise<MerchantRecord> {
    return this.authWorkflow.requireMerchantFromToken(token);
  }

  requireAdminFromToken(token: string) {
    return this.authWorkflow.requireAdminFromToken(token);
  }

  registerDriverDeviceToken(driverId: string, deviceToken: string): Promise<void> {
    return this.authWorkflow.registerDriverDeviceToken(driverId, deviceToken);
  }

  updateDriverLocation(
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
    return this.driverWorkflow.updateDriverLocation(driverId, input);
  }

  listTenants(adminUser: { tenantId: string | null; role: AdminRole } = { tenantId: null, role: 'platformAdmin' }): Promise<TenantProfile[]> {
    return this.adminWorkflow.listTenants(adminUser);
  }

  createTenant(input: { name: string; slug: string }): Promise<TenantProfile> {
    return this.adminWorkflow.createTenant(input);
  }

  createTenantAdmin(tenantId: string, input: { name: string; email: string; password: string; role: Extract<AdminRole, 'tenantAdmin' | 'tenantOps' | 'tenantSupport'> }): Promise<AdminUserProfile> {
    return this.adminWorkflow.createTenantAdmin(tenantId, input);
  }

  listDrivers(adminUser: { tenantId: string | null; role: AdminRole } = { tenantId: null, role: 'platformAdmin' }): Promise<DriverProfile[]> {
    return this.adminWorkflow.listDrivers(adminUser);
  }

  listRestaurants(adminUser: { tenantId: string | null; role: AdminRole } = { tenantId: null, role: 'platformAdmin' }): Promise<RestaurantProfile[]> {
    return this.adminWorkflow.listRestaurants(adminUser);
  }

  listMerchants(adminUser: { tenantId: string | null; role: AdminRole } = { tenantId: null, role: 'platformAdmin' }): Promise<MerchantView[]> {
    return this.adminWorkflow.listMerchants(adminUser);
  }

  listAdminUsers(adminUser: { tenantId: string | null; role: AdminRole } = { tenantId: null, role: 'platformAdmin' }): Promise<AdminUserProfile[]> {
    return this.adminWorkflow.listAdminUsers(adminUser);
  }

  createAdminUser(input: {
    name: string;
    email: string;
    password: string;
    role: AdminRole;
  }): Promise<AdminUserProfile> {
    return this.adminWorkflow.createAdminUser(input);
  }

  updateAdminUser(
    adminUserId: string,
    input: {
      name?: string;
      password?: string;
      role?: AdminUserProfile['role'];
      isActive?: boolean;
    },
  ): Promise<AdminUserProfile> {
    return this.adminWorkflow.updateAdminUser(adminUserId, input);
  }

  createMerchant(adminUser: { tenantId: string | null; role: AdminRole } = { tenantId: null, role: 'platformAdmin' }, input: { tenantId?: string; name: string }): Promise<MerchantProfile> {
    return this.adminWorkflow.createMerchant(adminUser, input);
  }

  createRestaurant(adminUser: { tenantId: string | null; role: AdminRole } = { tenantId: null, role: 'platformAdmin' }, input: { tenantId?: string; merchantId: string; name: string; email: string; password: string; pickupLocation: RestaurantRecord['pickupLocation']; currency?: string; distanceUnit?: DistanceUnit }): Promise<RestaurantProfile> {
    return this.adminWorkflow.createRestaurant(adminUser, input);
  }

  createDriver(adminUser: { tenantId: string | null; role: AdminRole } = { tenantId: null, role: 'platformAdmin' }, input: { tenantId?: string; name: string; email: string; password: string }): Promise<DriverProfile> {
    return this.adminWorkflow.createDriver(adminUser, input);
  }

  listMerchantUsers(merchantId: string): Promise<MerchantUserProfile[]> {
    return this.adminWorkflow.listMerchantUsers(merchantId);
  }

  createMerchantUser(
    merchantId: string,
    input: { name: string; email: string; password: string; role: MerchantUserRole },
  ): Promise<MerchantUserProfile> {
    return this.adminWorkflow.createMerchantUser(merchantId, input);
  }

  updateMerchantUser(
    merchantId: string,
    merchantUserId: string,
    input: { name?: string; password?: string; role?: MerchantUserRole; isActive?: boolean },
  ): Promise<MerchantUserProfile> {
    return this.adminWorkflow.updateMerchantUser(merchantId, merchantUserId, input);
  }

  listRestaurantStaffUsers(restaurantId: string): Promise<RestaurantStaffUserProfile[]> {
    return this.adminWorkflow.listRestaurantStaffUsers(restaurantId);
  }

  createRestaurantStaffUser(
    restaurantId: string,
    input: { name: string; email: string; password: string; role: RestaurantStaffRole },
  ): Promise<RestaurantStaffUserProfile> {
    return this.adminWorkflow.createRestaurantStaffUser(restaurantId, input);
  }

  updateRestaurantStaffUser(
    restaurantId: string,
    staffUserId: string,
    input: { name?: string; password?: string; role?: RestaurantStaffRole; isActive?: boolean },
  ): Promise<RestaurantStaffUserProfile> {
    return this.adminWorkflow.updateRestaurantStaffUser(restaurantId, staffUserId, input);
  }

  updateDriverDispatchPolicy(driverId: string, policy: DriverDispatchPolicy): Promise<DriverProfile> {
    return this.adminWorkflow.updateDriverDispatchPolicy(driverId, policy);
  }

  updateDriverCapacity(driverId: string, maxActiveOrders: number): Promise<DriverProfile> {
    return this.adminWorkflow.updateDriverCapacity(driverId, maxActiveOrders);
  }

  updateRestaurantTrackingSettings(
    restaurantId: string,
    settings: RestaurantTrackingSettings,
  ): Promise<RestaurantProfile> {
    return this.adminWorkflow.updateRestaurantTrackingSettings(restaurantId, settings);
  }

  updateRestaurantDisplaySettings(
    restaurantId: string,
    settings: { currency: string; distanceUnit: DistanceUnit },
  ): Promise<RestaurantProfile> {
    return this.adminWorkflow.updateRestaurantDisplaySettings(restaurantId, settings);
  }

  updateRestaurantDriverOfferSettings(
    restaurantId: string,
    settings: DriverOfferSettings,
  ): Promise<RestaurantProfile> {
    return this.adminWorkflow.updateRestaurantDriverOfferSettings(restaurantId, settings);
  }

  updateRestaurantPricing(
    restaurantId: string,
    pricing: { driverPayoutRule: DistancePricingRule; merchantBillingRule: DistancePricingRule },
  ): Promise<RestaurantProfile> {
    return this.adminWorkflow.updateRestaurantPricing(restaurantId, pricing);
  }

  runDispatchCycle(): Promise<void> {
    return this.driverWorkflow.runDispatchCycle();
  }

  getDriverProfile(driverId: string): Promise<DriverProfile> {
    return this.driverWorkflow.getDriverProfile(driverId);
  }

  getRestaurantProfile(restaurantId: string): Promise<RestaurantPortalProfile> {
    return this.restaurantWorkflow.getRestaurantProfile(restaurantId);
  }

  getMerchantProfile(merchantId: string): Promise<MerchantProfile> {
    return this.merchantWorkflow.getMerchantProfile(merchantId);
  }

  listMerchantRestaurants(merchantId: string): Promise<MerchantRestaurantProfile[]> {
    return this.merchantWorkflow.listMerchantRestaurants(merchantId);
  }

  getMerchantOrders(merchantId: string, range: ReportDateRange = {}) {
    return this.merchantWorkflow.getMerchantOrders(merchantId, range);
  }

  getMerchantReport(merchantId: string, range: ReportDateRange = {}): Promise<MerchantReport> {
    return this.merchantWorkflow.getMerchantReport(merchantId, range);
  }

  listMerchantRestaurantStaffUsers(merchant: MerchantRecord, restaurantId: string): Promise<RestaurantStaffUserProfile[]> {
    return this.merchantWorkflow.listRestaurantStaffUsers(merchant, restaurantId);
  }

  createMerchantRestaurantStaffUser(
    merchant: MerchantRecord,
    restaurantId: string,
    input: { name: string; email: string; password: string; role: RestaurantStaffRole },
  ): Promise<RestaurantStaffUserProfile> {
    return this.merchantWorkflow.createRestaurantStaffUser(merchant, restaurantId, input);
  }

  updateMerchantRestaurantStaffUser(
    merchant: MerchantRecord,
    restaurantId: string,
    staffUserId: string,
    input: { name?: string; password?: string; role?: RestaurantStaffRole; isActive?: boolean },
  ): Promise<RestaurantStaffUserProfile> {
    return this.merchantWorkflow.updateRestaurantStaffUser(merchant, restaurantId, staffUserId, input);
  }

  updateMerchantRestaurantTrackingSettings(
    merchant: MerchantRecord,
    restaurantId: string,
    settings: RestaurantTrackingSettings,
  ): Promise<MerchantRestaurantProfile> {
    return this.merchantWorkflow.updateRestaurantTrackingSettings(merchant, restaurantId, settings);
  }

  updateMerchantRestaurantDriverOfferSettings(
    merchant: MerchantRecord,
    restaurantId: string,
    settings: DriverOfferSettings,
  ): Promise<MerchantRestaurantProfile> {
    return this.merchantWorkflow.updateRestaurantDriverOfferSettings(merchant, restaurantId, settings);
  }

  updateDriverAvailability(driverId: string, isOnline: boolean): Promise<DriverProfile> {
    return this.driverWorkflow.updateDriverAvailability(driverId, isOnline);
  }

  getIncomingOrder(driverId: string): Promise<OrderRecord | null> {
    return this.driverWorkflow.getIncomingOrder(driverId);
  }

  getActiveOrder(driverId: string): Promise<OrderRecord | null> {
    return this.driverWorkflow.getActiveOrder(driverId);
  }

  acceptOrder(driverId: string, orderId: string): Promise<OrderRecord> {
    return this.driverWorkflow.acceptOrder(driverId, orderId);
  }

  rejectOrder(driverId: string, orderId: string, options?: { expired?: boolean }): Promise<void> {
    return this.driverWorkflow.rejectOrder(driverId, orderId, options);
  }

  markArrived(driverId: string, orderId: string): Promise<OrderRecord> {
    return this.driverWorkflow.markArrived(driverId, orderId);
  }

  pickupOrder(driverId: string, orderId: string): Promise<OrderRecord> {
    return this.driverWorkflow.pickupOrder(driverId, orderId);
  }

  completeOrder(driverId: string, orderId: string): Promise<OrderRecord> {
    return this.driverWorkflow.completeOrder(driverId, orderId);
  }

  getDriverEarnings(driverId: string): Promise<{
    daily: number;
    weekly: number;
    total: number;
    completedDeliveries: number;
    distanceTravelledKm: number;
    points: Array<{ label: string; amount: number }>;
  }> {
    return this.driverWorkflow.getDriverEarnings(driverId);
  }

  createRestaurantOrder(
    restaurantId: string,
    input: {
      customerName: string;
      customerAddress: string;
      customerLatitude: number;
      customerLongitude: number;
      deliveryArea: string;
    },
  ): Promise<OrderRecord> {
    return this.restaurantWorkflow.createRestaurantOrder(restaurantId, input);
  }

  getRestaurantOrders(restaurantId: string, range: ReportDateRange = {}): Promise<StoreOrderView[]> {
    return this.restaurantWorkflow.getRestaurantOrders(restaurantId, range);
  }

  getRestaurantReport(restaurantId: string, range: ReportDateRange = {}): Promise<RestaurantReport> {
    return this.restaurantWorkflow.getRestaurantReport(restaurantId, range);
  }
}




