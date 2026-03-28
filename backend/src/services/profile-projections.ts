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
} from '../domain/models.js';

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

export function toDriverProfile(driver: DriverRecord, currentLoad: number): DriverProfile {
  const { password: _password, ...profile } = driver;
  return {
    ...profile,
    currentLoad,
    locationFreshness: getDriverLocationFreshness(driver.currentLocation),
  };
}

export function toRestaurantProfile(restaurant: RestaurantRecord): RestaurantProfile {
  const { password: _password, email: _email, staffUsers: _staffUsers, ...profile } = restaurant;
  return profile;
}

export function toRestaurantPortalProfile(restaurant: RestaurantRecord): RestaurantPortalProfile {
  const profile = toRestaurantProfile(restaurant);
  const { pricing: _pricing, ...storeProfile } = profile;
  return storeProfile;
}

export function toMerchantRestaurantProfile(restaurant: RestaurantRecord): MerchantRestaurantProfile {
  const profile = toRestaurantProfile(restaurant);
  return {
    ...profile,
    pricing: {
      merchantBillingRule: profile.pricing.merchantBillingRule,
    },
  };
}

export function toMerchantProfile(merchant: MerchantRecord): MerchantProfile {
  const { users: _users, ...profile } = merchant;
  return profile;
}

export function toMerchantUserProfile(user: MerchantRecord['users'][number]): MerchantUserProfile {
  const { password: _password, ...profile } = user;
  return profile;
}

export function toMerchantView(merchant: MerchantRecord): MerchantView {
  return {
    ...toMerchantProfile(merchant),
    users: merchant.users.map((user) => toMerchantUserProfile(user)),
  };
}

export function toRestaurantStaffProfile(user: RestaurantRecord['staffUsers'][number]): RestaurantStaffUserProfile {
  const { password: _password, ...profile } = user;
  return profile;
}
