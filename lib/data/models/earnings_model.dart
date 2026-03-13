import '../../domain/entities/earnings.dart';

class EarningsModel {
  factory EarningsModel.fromJson(Map<String, dynamic> json) {
    return EarningsModel(
      daily: (json['daily'] as num).toDouble(),
      weekly: (json['weekly'] as num).toDouble(),
      total: (json['total'] as num).toDouble(),
      completedDeliveries: json['completedDeliveries'] as int,
      distanceTravelledKm: (json['distanceTravelledKm'] as num).toDouble(),
      points: List<Map<String, dynamic>>.from(json['points'] as List),
    );
  }

  const EarningsModel({
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
  final List<Map<String, dynamic>> points;

  Earnings toEntity() {
    return Earnings(
      daily: daily,
      weekly: weekly,
      total: total,
      completedDeliveries: completedDeliveries,
      distanceTravelledKm: distanceTravelledKm,
      points: points
          .map(
            (point) => EarningsPoint(
              label: point['label'] as String,
              amount: (point['amount'] as num).toDouble(),
            ),
          )
          .toList(),
    );
  }
}
