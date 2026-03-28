import '../../domain/entities/order.dart';

class OrderModel {
  factory OrderModel.fromJson(Map<String, dynamic> json) {
    return OrderModel(
      id: json['id'] as String,
      restaurant: Map<String, dynamic>.from(json['restaurant'] as Map),
      customer: Map<String, dynamic>.from(json['customer'] as Map),
      status: json['status'] as String,
      deliveryArea: json['deliveryArea'] as String,
      distanceKm: (json['distanceKm'] as num).toDouble(),
      estimatedKm: (json['estimatedKm'] as num).toDouble(),
      estimatedMinutes: json['estimatedMinutes'] as int,
      driverDisplayDistanceKm: ((json['driverDisplayDistanceKm'] ?? json['estimatedKm']) as num).toDouble(),
      driverDisplayMinutes: (json['driverDisplayMinutes'] ?? json['estimatedMinutes']) as int,
      driverDisplayMode: (json['driverDisplayMode'] ?? 'storeToCustomer') as String,
      tripEarnings: (json['tripEarnings'] as num).toDouble(),
      createdAt: json['createdAt'] as String,
      expiresAt: json['expiresAt'] as String?,
    );
  }

  const OrderModel({
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
    required this.tripEarnings,
    required this.createdAt,
    required this.expiresAt,
  });

  final String id;
  final Map<String, dynamic> restaurant;
  final Map<String, dynamic> customer;
  final String status;
  final String deliveryArea;
  final double distanceKm;
  final double estimatedKm;
  final int estimatedMinutes;
  final double driverDisplayDistanceKm;
  final int driverDisplayMinutes;
  final String driverDisplayMode;
  final double tripEarnings;
  final String createdAt;
  final String? expiresAt;

  Order toEntity() {
    return Order(
      id: id,
      restaurant: _mapLocation(restaurant),
      customer: _mapLocation(customer),
      status: OrderStatus.values.firstWhere((value) => value.name == status),
      deliveryArea: deliveryArea,
      distanceKm: distanceKm,
      estimatedKm: estimatedKm,
      estimatedMinutes: estimatedMinutes,
      driverDisplayDistanceKm: driverDisplayDistanceKm,
      driverDisplayMinutes: driverDisplayMinutes,
      driverDisplayMode: driverDisplayMode,
      tripEarnings: tripEarnings,
      createdAt: DateTime.parse(createdAt),
      expiresAt: expiresAt == null ? null : DateTime.parse(expiresAt!),
    );
  }

  static OrderLocation _mapLocation(Map<String, dynamic> source) {
    return OrderLocation(
      name: source['name'] as String,
      address: source['address'] as String,
      latitude: (source['latitude'] as num).toDouble(),
      longitude: (source['longitude'] as num).toDouble(),
    );
  }
}
