import 'dart:math';

import '../../domain/entities/order.dart';
import '../../domain/repositories/location_repository.dart';

class MockLocationService implements LocationRepository {
  const MockLocationService();

  @override
  Future<double> calculateDistanceKm(OrderLocation from, OrderLocation to) async {
    const earthRadiusKm = 6371.0;
    final dLat = _degreesToRadians(to.latitude - from.latitude);
    final dLon = _degreesToRadians(to.longitude - from.longitude);
    final lat1 = _degreesToRadians(from.latitude);
    final lat2 = _degreesToRadians(to.latitude);
    final a = sin(dLat / 2) * sin(dLat / 2) +
        sin(dLon / 2) * sin(dLon / 2) * cos(lat1) * cos(lat2);
    final c = 2 * atan2(sqrt(a), sqrt(1 - a));
    return earthRadiusKm * c;
  }

  @override
  Future<int> estimateEtaMinutes(OrderLocation from, OrderLocation to) async {
    final distance = await calculateDistanceKm(from, to);
    return max(5, (distance / 0.42).round());
  }

  double _degreesToRadians(double degrees) => degrees * pi / 180;
}
