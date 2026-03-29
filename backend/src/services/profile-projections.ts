import {
  DriverLocationSnapshot,
  DriverProfile,
  DriverRecord,
  MerchantProfile,
  MerchantRecord,
  MerchantRestaurantProfile,
  MerchantUserProfile,
  MerchantView,
  OrderStatus,
  RestaurantPortalProfile,
  RestaurantProfile,
  RestaurantRecord,
  RestaurantStaffUserProfile,
  TenantRecord,
} from '../domain/models.js';
import { defaultTenantCurrency, defaultTenantTimeZone, normalizeTenantCurrency, normalizeTenantTimeZone } from '../utils/timezones.js';

const locationMaxAgeMinutes = Number(process.env.STALE_LOCATION_MINUTES ?? '5');

export function countsTowardDriverCapacity(status: OrderStatus): boolean {
  return status === 'pending' || status === 'accepted' || status === 'atRestaurant' || status === 'pickedUp';
}

export function getDriverLocationFreshness(
  location: DriverLocationSnapshot,
): 'fresh' | 'stale' | 'missing' {
  if (!location.capturedAt) {
    return 'missing';
  }

  const ageMs = Date.now() - new Date(location.capturedAt).getTime();
  return ageMs <= locationMaxAgeMinutes * 60 * 1000 ? 'fresh' : 'stale';
}

function tenantCurrency(tenant?: TenantRecord | null): string {
  return normalizeTenantCurrency(tenant?.currency ?? defaultTenantCurrency);
}

function tenantTimeZone(tenant?: TenantRecord | null): string {
  return normalizeTenantTimeZone(tenant?.timeZone ?? defaultTenantTimeZone);
}

export function toDriverProfile(driver: DriverRecord, currentLoad: number, tenant?: TenantRecord | null): DriverProfile {
  const { password: _password, ...profile } = driver;
  return {
    ...profile,
    currentLoad,
    locationFreshness: getDriverLocationFreshness(driver.currentLocation),
    displayCurrency: tenantCurrency(tenant),
    timeZone: tenantTimeZone(tenant),
  };
}

export function toRestaurantProfile(restaurant: RestaurantRecord, tenant?: TenantRecord | null): RestaurantProfile {
  const { password: _password, email: _email, staffUsers: _staffUsers, ...profile } = restaurant;
  return {
    ...profile,
    currency: tenantCurrency(tenant),
    timeZone: tenantTimeZone(tenant),
  };
}

export function toRestaurantPortalProfile(restaurant: RestaurantRecord, tenant?: TenantRecord | null): RestaurantPortalProfile {
  const profile = toRestaurantProfile(restaurant, tenant);
  const { pricing: _pricing, ...storeProfile } = profile;
  return storeProfile;
}

export function toMerchantRestaurantProfile(restaurant: RestaurantRecord, tenant?: TenantRecord | null): MerchantRestaurantProfile {
  const profile = toRestaurantProfile(restaurant, tenant);
  return {
    ...profile,
    pricing: {
      merchantBillingRule: profile.pricing.merchantBillingRule,
    },
  };
}

export function toMerchantProfile(merchant: MerchantRecord, tenant?: TenantRecord | null): MerchantProfile {
  const { users: _users, ...profile } = merchant;
  return {
    ...profile,
    currency: tenantCurrency(tenant),
    timeZone: tenantTimeZone(tenant),
  };
}

export function toMerchantUserProfile(user: MerchantRecord['users'][number]): MerchantUserProfile {
  const { password: _password, ...profile } = user;
  return profile;
}

export function toMerchantView(merchant: MerchantRecord, tenant?: TenantRecord | null): MerchantView {
  return {
    ...toMerchantProfile(merchant, tenant),
    users: merchant.users.map((user) => toMerchantUserProfile(user)),
  };
}

export function toRestaurantStaffProfile(user: RestaurantRecord['staffUsers'][number]): RestaurantStaffUserProfile {
  const { password: _password, ...profile } = user;
  return profile;
}
