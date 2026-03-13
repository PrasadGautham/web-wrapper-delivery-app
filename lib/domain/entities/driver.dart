class Driver {
  const Driver({
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

  Driver copyWith({
    String? id,
    String? name,
    String? email,
    double? rating,
    int? completedOrders,
    double? totalDistanceKm,
    bool? isOnline,
  }) {
    return Driver(
      id: id ?? this.id,
      name: name ?? this.name,
      email: email ?? this.email,
      rating: rating ?? this.rating,
      completedOrders: completedOrders ?? this.completedOrders,
      totalDistanceKm: totalDistanceKm ?? this.totalDistanceKm,
      isOnline: isOnline ?? this.isOnline,
    );
  }
}
