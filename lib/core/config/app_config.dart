import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';

class AppConfig {
  const AppConfig._();

  static const appName = 'Driver App';
  static const mockApiDelay = Duration(milliseconds: 900);
  static const incomingOrderTimeout = Duration(seconds: 30);
  static const defaultLocale = Locale('en');
  static const fallbackLocale = Locale('ar');
  static const defaultMapZoom = 13.5;
  static const restaurantLatLng = LatLngData(25.2048, 55.2708);
  static const customerLatLng = LatLngData(25.2176, 55.2797);

  static String get backendApiBaseUrl {
    if (kIsWeb) {
      return 'http://localhost:8080/api';
    }
    switch (defaultTargetPlatform) {
      case TargetPlatform.android:
        return 'http://10.0.2.2:8080/api';
      default:
        return 'http://127.0.0.1:8080/api';
    }
  }
}

class LatLngData {
  const LatLngData(this.latitude, this.longitude);

  final double latitude;
  final double longitude;
}
