import '../entities/driver.dart';
import '../entities/earnings.dart';

abstract class DriverRepository {
  Stream<Driver?> watchDriver();
  Future<Driver?> getDriver();
  Future<Driver> updateAvailability(bool isOnline);
  Future<Earnings> getEarnings();
}
