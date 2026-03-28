import 'package:intl/intl.dart';

class Formatters {
  const Formatters._();

  static String currency(num value, {String code = 'AED'}) {
    return NumberFormat.simpleCurrency(name: code, decimalDigits: 2).format(value);
  }

  static String distance(num valueKm, {String unit = 'kilometer'}) {
    if (unit == 'mile') {
      return '${(valueKm * 0.621371).toStringAsFixed(1)} mi';
    }
    return '${valueKm.toStringAsFixed(1)} km';
  }

  static String kilometers(num value) {
    return distance(value);
  }

  static String time(DateTime value) {
    return DateFormat('hh:mm a').format(value);
  }

  static String percent(num value) {
    return '${value.toStringAsFixed(0)}%';
  }
}
