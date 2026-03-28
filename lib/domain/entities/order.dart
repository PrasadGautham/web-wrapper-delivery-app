enum OrderStatus {
  pending,
  accepted,
  atRestaurant,
  pickedUp,
  delivering,
  delivered,
  rejected,
  expired,
}

class OrderLocation {
  const OrderLocation({
    required this.name,
    required this.address,
    required this.latitude,
    required this.longitude,
  });

  final String name;
  final String address;
  final double latitude;
  final double longitude;
}

class Order {
  const Order({
    required this.id,
    required this.restaurant,
    required this.customer,
    required this.status,
    required this.deliveryArea,
    required this.distanceKm,
    required this.estimatedKm,
    required this.estimatedMinutes,
    required this.driverDisplayDistanceKm,
    required this.driverDisplayMinutes,
    required this.driverDisplayMode,
    required this.driverDisplayDistanceUnit,
    required this.displayCurrency,
    required this.tripEarnings,
    required this.createdAt,
    required this.expiresAt,
  });

  final String id;
  final OrderLocation restaurant;
  final OrderLocation customer;
  final OrderStatus status;
  final String deliveryArea;
  final double distanceKm;
  final double estimatedKm;
  final int estimatedMinutes;
  final double driverDisplayDistanceKm;
  final int driverDisplayMinutes;
  final String driverDisplayMode;
  final String driverDisplayDistanceUnit;
  final String displayCurrency;
  final double tripEarnings;
  final DateTime createdAt;
  final DateTime? expiresAt;

  bool get isIncoming => status == OrderStatus.pending;

  Order copyWith({
    OrderStatus? status,
    DateTime? expiresAt,
    bool clearExpiresAt = false,
  }) {
    return Order(
      id: id,
      restaurant: restaurant,
      customer: customer,
      status: status ?? this.status,
      deliveryArea: deliveryArea,
      distanceKm: distanceKm,
      estimatedKm: estimatedKm,
      estimatedMinutes: estimatedMinutes,
      driverDisplayDistanceKm: driverDisplayDistanceKm,
      driverDisplayMinutes: driverDisplayMinutes,
      driverDisplayMode: driverDisplayMode,
      driverDisplayDistanceUnit: driverDisplayDistanceUnit,
      displayCurrency: displayCurrency,
      tripEarnings: tripEarnings,
      createdAt: createdAt,
      expiresAt: clearExpiresAt ? null : expiresAt ?? this.expiresAt,
    );
  }
}
