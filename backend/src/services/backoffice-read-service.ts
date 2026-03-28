import {
  DriverProfile,
  MerchantReport,
  MerchantView,
  RestaurantProfile,
  RestaurantReport,
} from '../domain/models.js';

export interface BackofficeReadService {
  listDrivers(): Promise<DriverProfile[]>;
  listRestaurants(): Promise<RestaurantProfile[]>;
  listMerchants(): Promise<MerchantView[]>;
  getRestaurantReport(restaurantId: string): Promise<RestaurantReport>;
  getMerchantReport(merchantId: string): Promise<MerchantReport>;
}
