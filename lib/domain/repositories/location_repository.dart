import '../entities/order.dart';

abstract class LocationRepository {
  Future<double> calculateDistanceKm(OrderLocation from, OrderLocation to);
  Future<int> estimateEtaMinutes(OrderLocation from, OrderLocation to);
}
