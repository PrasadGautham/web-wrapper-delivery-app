import '../../domain/entities/driver.dart';
import '../../domain/entities/earnings.dart';
import '../../domain/repositories/driver_repository.dart';
import '../../services/api/mock_api_client.dart';
import '../models/driver_model.dart';
import '../models/earnings_model.dart';

class DriverRepositoryImpl implements DriverRepository {
  DriverRepositoryImpl(this._apiClient);

  final MockApiClient _apiClient;

  @override
  Future<Driver?> getDriver() async {
    final response = await _apiClient.getDriver();
    return DriverModel.fromJson(response).toEntity();
  }

  @override
  Future<Earnings> getEarnings() async {
    final response = await _apiClient.getDriverEarnings();
    return EarningsModel.fromJson(response).toEntity();
  }

  @override
  Future<Driver> updateAvailability(bool isOnline) async {
    final response = await _apiClient.patchDriverAvailability(isOnline);
    return DriverModel.fromJson(response).toEntity();
  }

  @override
  Stream<Driver?> watchDriver() {
    return _apiClient.watchDriver().map((event) => event?.toEntity());
  }
}
