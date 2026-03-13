class EarningsPoint {
  const EarningsPoint({
    required this.label,
    required this.amount,
  });

  final String label;
  final double amount;
}

class Earnings {
  const Earnings({
    required this.daily,
    required this.weekly,
    required this.total,
    required this.completedDeliveries,
    required this.distanceTravelledKm,
    required this.points,
  });

  final double daily;
  final double weekly;
  final double total;
  final int completedDeliveries;
  final double distanceTravelledKm;
  final List<EarningsPoint> points;
}
