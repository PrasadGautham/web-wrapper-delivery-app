import '../../domain/entities/driver.dart';

class DriverModel {
  factory DriverModel.fromJson(Map<String, dynamic> json) {
    final location = Map<String, dynamic>.from(json['currentLocation'] as Map);
    return DriverModel(
      id: json['id'] as String,
      name: json['name'] as String,
      email: json['email'] as String,
      rating: (json['rating'] as num).toDouble(),
      completedOrders: json['completedOrders'] as int,
      totalDistanceKm: (json['totalDistanceKm'] as num).toDouble(),
      isOnline: json['isOnline'] as bool,
      currentLocation: DriverLocation(
        latitude: (location['latitude'] as num).toDouble(),
        longitude: (location['longitude'] as num).toDouble(),
        accuracyMeters: (location['accuracyMeters'] as num?)?.toDouble(),
        speedMetersPerSecond: (location['speedMetersPerSecond'] as num?)?.toDouble(),
        headingDegrees: (location['headingDegrees'] as num?)?.toDouble(),
        capturedAt: location['capturedAt'] == null ? null : DateTime.parse(location['capturedAt'] as String),
      ),
      maxActiveOrders: json['maxActiveOrders'] as int,
      currentLoad: json['currentLoad'] as int,
      locationFreshness: json['locationFreshness'] as String,
    );
  }

  const DriverModel({
    required this.id,
    required this.name,
    required this.email,
    required this.rating,
    required this.completedOrders,
    required this.totalDistanceKm,
    required this.isOnline,
    required this.currentLocation,
    required this.maxActiveOrders,
    required this.currentLoad,
    required this.locationFreshness,
  });

  final String id;
  final String name;
  final String email;
  final double rating;
  final int completedOrders;
  final double totalDistanceKm;
  final bool isOnline;
  final DriverLocation currentLocation;
  final int maxActiveOrders;
  final int currentLoad;
  final String locationFreshness;

  Driver toEntity() {
    return Driver(
      id: id,
      name: name,
      email: email,
      rating: rating,
      completedOrders: completedOrders,
      totalDistanceKm: totalDistanceKm,
      isOnline: isOnline,
      currentLocation: currentLocation,
      maxActiveOrders: maxActiveOrders,
      currentLoad: currentLoad,
      locationFreshness: locationFreshness,
    );
  }
}
