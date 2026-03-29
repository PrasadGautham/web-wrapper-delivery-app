class DriverLocation {
  const DriverLocation({
    required this.latitude,
    required this.longitude,
    required this.accuracyMeters,
    required this.speedMetersPerSecond,
    required this.headingDegrees,
    required this.capturedAt,
  });

  final double latitude;
  final double longitude;
  final double? accuracyMeters;
  final double? speedMetersPerSecond;
  final double? headingDegrees;
  final DateTime? capturedAt;
}

class Driver {
  const Driver({
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
    required this.displayCurrency,
    required this.timeZone,
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
  final String displayCurrency;
  final String timeZone;

  Driver copyWith({
    String? id,
    String? name,
    String? email,
    double? rating,
    int? completedOrders,
    double? totalDistanceKm,
    bool? isOnline,
    DriverLocation? currentLocation,
    int? maxActiveOrders,
    int? currentLoad,
    String? locationFreshness,
    String? displayCurrency,
    String? timeZone,
  }) {
    return Driver(
      id: id ?? this.id,
      name: name ?? this.name,
      email: email ?? this.email,
      rating: rating ?? this.rating,
      completedOrders: completedOrders ?? this.completedOrders,
      totalDistanceKm: totalDistanceKm ?? this.totalDistanceKm,
      isOnline: isOnline ?? this.isOnline,
      currentLocation: currentLocation ?? this.currentLocation,
      maxActiveOrders: maxActiveOrders ?? this.maxActiveOrders,
      currentLoad: currentLoad ?? this.currentLoad,
      locationFreshness: locationFreshness ?? this.locationFreshness,
      displayCurrency: displayCurrency ?? this.displayCurrency,
      timeZone: timeZone ?? this.timeZone,
    );
  }
}
