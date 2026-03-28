import {
  DriverProfile,
  MerchantReport,
  MerchantView,
  RestaurantProfile,
  RestaurantReport,
} from '../domain/models.js';
import { ReportDateRange } from '../utils/reporting.js';

export interface BackofficeReadService {
  listDrivers(): Promise<DriverProfile[]>;
  listRestaurants(): Promise<RestaurantProfile[]>;
  listMerchants(): Promise<MerchantView[]>;
  getRestaurantReport(restaurantId: string, range?: ReportDateRange): Promise<RestaurantReport>;
  getMerchantReport(merchantId: string, range?: ReportDateRange): Promise<MerchantReport>;
}
