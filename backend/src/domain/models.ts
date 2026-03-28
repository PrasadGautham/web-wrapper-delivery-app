export type UserType = 'driver' | 'restaurant' | 'merchant' | 'admin';

export interface GeoPoint {
  latitude: number;
  longitude: number;
}

export interface LocationSnapshot extends GeoPoint {
  name: string;
  address: string;
}

export type MerchantUserRole = 'merchantOwner' | 'merchantManager' | 'merchantDispatcher' | 'merchantViewer';

export interface MerchantUserRecord {
  id: string;
  name: string;
  email: string;
  password: string;
  role: MerchantUserRole;
  isActive: boolean;
  lastLoginAt: string | null;
}

export interface MerchantUserProfile {
  id: string;
  name: string;
  email: string;
  role: MerchantUserRole;
  isActive: boolean;
  lastLoginAt: string | null;
}

export interface MerchantRecord {
  id: string;
  name: string;
  users: MerchantUserRecord[];
}

export interface MerchantProfile {
  id: string;
  name: string;
}

export interface MerchantView extends MerchantProfile {
  users: MerchantUserProfile[];
}

export type DriverDispatchMode = 'open' | 'allowListOnly' | 'allowListWithFallback';

export interface DriverDispatchPolicy {
  mode: DriverDispatchMode;
  restaurantIds: string[];
  merchantIds: string[];
}

export interface DriverLocationSnapshot extends GeoPoint {
  accuracyMeters: number | null;
  speedMetersPerSecond: number | null;
  headingDegrees: number | null;
  capturedAt: string | null;
}

export interface DriverRecord {
  id: string;
  name: string;
  email: string;
  password: string;
  rating: number;
  completedOrders: number;
  totalDistanceKm: number;
  isOnline: boolean;
  currentLocation: DriverLocationSnapshot;
  deviceToken: string | null;
  dispatchPolicy: DriverDispatchPolicy;
  maxActiveOrders: number;
}

export interface DriverProfile {
  id: string;
  name: string;
  email: string;
  rating: number;
  completedOrders: number;
  totalDistanceKm: number;
  isOnline: boolean;
  currentLocation: DriverLocationSnapshot;
  deviceToken: string | null;
  dispatchPolicy: DriverDispatchPolicy;
  maxActiveOrders: number;
  currentLoad: number;
  locationFreshness: 'fresh' | 'stale' | 'missing';
}

export type RestaurantStaffRole = 'owner' | 'manager' | 'dispatcher' | 'viewer';

export interface RestaurantStaffUserRecord {
  id: string;
  name: string;
  email: string;
  password: string;
  role: RestaurantStaffRole;
  isActive: boolean;
  lastLoginAt: string | null;
}

export interface RestaurantStaffUserProfile {
  id: string;
  name: string;
  email: string;
  role: RestaurantStaffRole;
  isActive: boolean;
  lastLoginAt: string | null;
}

export interface RestaurantTrackingSettings {
  showPickedUpAsInTransit: boolean;
  showDriverEtaToPickup: boolean;
  showDestinationEta: boolean;
}

export type DriverOfferDistanceMode = 'storeToCustomer' | 'includeCommuteToStore';

export interface DriverOfferSettings {
  distanceMode: DriverOfferDistanceMode;
}

export interface DistancePricingRule {
  baseAmount: number;
  includedDistanceKm: number;
  additionalPerKm: number;
}

export interface RestaurantPricingRules {
  driverPayoutRule: DistancePricingRule;
  merchantBillingRule: DistancePricingRule;
}

export interface RestaurantRecord {
  id: string;
  merchantId: string;
  name: string;
  email: string;
  password: string;
  pickupLocation: LocationSnapshot;
  pricing: RestaurantPricingRules;
  currency: string;
  trackingSettings: RestaurantTrackingSettings;
  driverOfferSettings: DriverOfferSettings;
  staffUsers: RestaurantStaffUserRecord[];
}

export interface RestaurantProfile {
  id: string;
  merchantId: string;
  name: string;
  pickupLocation: LocationSnapshot;
  pricing: RestaurantPricingRules;
  currency: string;
  trackingSettings: RestaurantTrackingSettings;
  driverOfferSettings: DriverOfferSettings;
}

export type PlatformAdminRole = 'platformAdmin' | 'opsAdmin' | 'supportAdmin' | 'billingAdmin';

export interface AdminUserRecord {
  id: string;
  name: string;
  email: string;
  password: string;
  role: PlatformAdminRole;
  isActive: boolean;
  lastLoginAt: string | null;
}

export interface AdminUserProfile {
  id: string;
  name: string;
  email: string;
  role: PlatformAdminRole;
  isActive: boolean;
  lastLoginAt: string | null;
}

export type OrderStatus =
  | 'queued'
  | 'pending'
  | 'accepted'
  | 'atRestaurant'
  | 'pickedUp'
  | 'delivered'
  | 'rejected'
  | 'expired';

export interface OrderEvent {
  type: string;
  at: string;
  actorId?: string;
  notes?: string;
}

export interface OrderRecord {
  id: string;
  restaurantId: string;
  restaurant: LocationSnapshot;
  customer: LocationSnapshot;
  deliveryArea: string;
  status: OrderStatus;
  distanceKm: number;
  estimatedKm: number;
  estimatedMinutes: number;
  driverDisplayDistanceKm: number;
  driverDisplayMinutes: number;
  driverDisplayMode: DriverOfferDistanceMode;
  tripEarnings: number;
  companyCharge: number;
  createdAt: string;
  expiresAt: string | null;
  assignedDriverId: string | null;
  rejectedDriverIds: string[];
  deliveredAt: string | null;
  pendingDispatchNotification: boolean;
  events: OrderEvent[];
}

export interface RestaurantOrderTracking {
  displayStatus: string;
  driverEtaToPickupMinutes: number | null;
  destinationEtaMinutes: number | null;
  assignedDriverName: string | null;
  assignedDriverPhoneHint: string | null;
  etaSource: 'google-routes' | 'live-driver-location' | 'static-estimate' | 'not-available';
}

export interface RestaurantOrderView extends OrderRecord {
  tracking: RestaurantOrderTracking;
}

export interface RestaurantReport {
  totalOrders: number;
  activeOrders: number;
  deliveredOrders: number;
  totalDriverPayout: number;
  totalRestaurantCharges: number;
}

export interface MerchantReport {
  totalRestaurants: number;
  totalOrders: number;
  activeOrders: number;
  deliveredOrders: number;
  totalDriverPayout: number;
  totalRestaurantCharges: number;
}

export interface SessionRecord {
  token: string;
  userType: UserType;
  userId: string;
  createdAt: string;
  expiresAt: string;
}

export interface PasswordResetTokenRecord {
  id: string;
  userType: UserType;
  userId: string;
  tokenHash: string;
  createdAt: string;
  expiresAt: string;
}

export interface AuditLogRecord {
  id: string;
  at: string;
  actorType: 'driver' | 'restaurant' | 'admin' | 'system' | 'merchant';
  actorId: string;
  action: string;
  entityType: string;
  entityId: string;
  metadata?: Record<string, unknown>;
}

export interface DatabaseShape {
  merchants: MerchantRecord[];
  drivers: DriverRecord[];
  restaurants: RestaurantRecord[];
  adminUsers: AdminUserRecord[];
  orders: OrderRecord[];
  sessions: SessionRecord[];
  passwordResetTokens: PasswordResetTokenRecord[];
  auditLogs: AuditLogRecord[];
}
