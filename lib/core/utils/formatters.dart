import 'package:intl/intl.dart';

class Formatters {
  const Formatters._();

  static String currency(num value) {
    return NumberFormat.simpleCurrency(decimalDigits: 2).format(value);
  }

  static String kilometers(num value) {
    return '${value.toStringAsFixed(1)} km';
  }

  static String time(DateTime value) {
    return DateFormat('hh:mm a').format(value);
  }

  static String percent(num value) {
    return '${value.toStringAsFixed(0)}%';
  }
}
