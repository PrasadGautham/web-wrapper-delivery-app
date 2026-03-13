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
}

class LatLngData {
  const LatLngData(this.latitude, this.longitude);

  final double latitude;
  final double longitude;
}
