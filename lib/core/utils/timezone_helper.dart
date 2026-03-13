import 'package:timezone/data/latest.dart' as tz;
import 'package:timezone/timezone.dart' as tz;

class TimezoneHelper {
  const TimezoneHelper._();

  static bool _initialized = false;

  static void initialize() {
    if (_initialized) {
      return;
    }
    tz.initializeTimeZones();
    _initialized = true;
  }

  static DateTime toLocalTime(DateTime dateTime, {String location = 'Asia/Dubai'}) {
    initialize();
    final tzLocation = tz.getLocation(location);
    return tz.TZDateTime.from(dateTime, tzLocation);
  }
}
