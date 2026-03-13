import '../../domain/entities/driver.dart';

class DriverModel {
  factory DriverModel.fromJson(Map<String, dynamic> json) {
    return DriverModel(
      id: json['id'] as String,
      name: json['name'] as String,
      email: json['email'] as String,
      rating: (json['rating'] as num).toDouble(),
      completedOrders: json['completedOrders'] as int,
      totalDistanceKm: (json['totalDistanceKm'] as num).toDouble(),
      isOnline: json['isOnline'] as bool,
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
  });

  final String id;
  final String name;
  final String email;
  final double rating;
  final int completedOrders;
  final double totalDistanceKm;
  final bool isOnline;

  Driver toEntity() {
    return Driver(
      id: id,
      name: name,
      email: email,
      rating: rating,
      completedOrders: completedOrders,
      totalDistanceKm: totalDistanceKm,
      isOnline: isOnline,
    );
  }
}
