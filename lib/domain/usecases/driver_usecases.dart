import '../entities/driver.dart';
import '../entities/earnings.dart';
import '../repositories/driver_repository.dart';

class WatchDriverUseCase {
  const WatchDriverUseCase(this._repository);

  final DriverRepository _repository;

  Stream<Driver?> call() => _repository.watchDriver();
}

class GetDriverUseCase {
  const GetDriverUseCase(this._repository);

  final DriverRepository _repository;

  Future<Driver?> call() => _repository.getDriver();
}

class UpdateAvailabilityUseCase {
  const UpdateAvailabilityUseCase(this._repository);

  final DriverRepository _repository;

  Future<Driver> call(bool isOnline) => _repository.updateAvailability(isOnline);
}

class GetEarningsUseCase {
  const GetEarningsUseCase(this._repository);

  final DriverRepository _repository;

  Future<Earnings> call() => _repository.getEarnings();
}
