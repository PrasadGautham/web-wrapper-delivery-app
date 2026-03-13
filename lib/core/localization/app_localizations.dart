import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'package:flutter_localizations/flutter_localizations.dart';

class AppLocalizations {
  AppLocalizations(this.locale);

  final Locale locale;

  static const supportedLocales = <Locale>[
    Locale('en'),
    Locale('ar'),
  ];

  static const localizationsDelegates = <LocalizationsDelegate<dynamic>>[
    _AppLocalizationsDelegate(),
    GlobalMaterialLocalizations.delegate,
    GlobalWidgetsLocalizations.delegate,
    GlobalCupertinoLocalizations.delegate,
  ];

  static const _localizedValues = <String, Map<String, String>>{
    'en': {
      'appTitle': 'Driver App',
      'email': 'Email',
      'password': 'Password',
      'login': 'Login',
      'logout': 'Logout',
      'dashboard': 'Dashboard',
      'incomingOrder': 'Incoming Order',
      'accept': 'Accept',
      'reject': 'Reject',
      'arrivedAtRestaurant': 'Arrived at Restaurant',
      'pickupOrder': 'Pickup Order',
      'deliverOrder': 'Delivered',
      'earnings': 'Earnings',
      'profile': 'Profile',
      'online': 'Online',
      'offline': 'Offline',
      'todaysEarnings': "Today's Earnings",
      'completedDeliveries': 'Completed Deliveries',
      'distanceTravelled': 'Distance Travelled',
      'rating': 'Rating',
      'eta': 'ETA',
      'distance': 'Distance',
      'earningsTrip': 'Trip Earnings',
      'retry': 'Retry',
      'activeOrder': 'Active Order',
      'noActiveOrder': 'No active order',
      'switchLanguage': 'Switch Language',
      'dailyEarnings': 'Daily Earnings',
      'weeklyEarnings': 'Weekly Earnings',
      'totalEarnings': 'Total Earnings',
    },
    'ar': {
      'appTitle': 'تطبيق السائق',
      'email': 'البريد الإلكتروني',
      'password': 'كلمة المرور',
      'login': 'تسجيل الدخول',
      'logout': 'تسجيل الخروج',
      'dashboard': 'لوحة التحكم',
      'incomingOrder': 'طلب جديد',
      'accept': 'قبول',
      'reject': 'رفض',
      'arrivedAtRestaurant': 'وصلت إلى المطعم',
      'pickupOrder': 'استلام الطلب',
      'deliverOrder': 'تم التسليم',
      'earnings': 'الأرباح',
      'profile': 'الملف الشخصي',
      'online': 'متصل',
      'offline': 'غير متصل',
      'todaysEarnings': 'أرباح اليوم',
      'completedDeliveries': 'الطلبات المكتملة',
      'distanceTravelled': 'المسافة المقطوعة',
      'rating': 'التقييم',
      'eta': 'الوقت المتوقع',
      'distance': 'المسافة',
      'earningsTrip': 'ربح الرحلة',
      'retry': 'إعادة المحاولة',
      'activeOrder': 'الطلب الحالي',
      'noActiveOrder': 'لا يوجد طلب نشط',
      'switchLanguage': 'تغيير اللغة',
      'dailyEarnings': 'الأرباح اليومية',
      'weeklyEarnings': 'الأرباح الأسبوعية',
      'totalEarnings': 'إجمالي الأرباح',
    },
  };

  static AppLocalizations of(BuildContext context) {
    return Localizations.of<AppLocalizations>(context, AppLocalizations)!;
  }

  String text(String key) {
    return _localizedValues[locale.languageCode]?[key] ??
        _localizedValues['en']![key] ??
        key;
  }
}

class _AppLocalizationsDelegate extends LocalizationsDelegate<AppLocalizations> {
  const _AppLocalizationsDelegate();

  @override
  bool isSupported(Locale locale) => ['en', 'ar'].contains(locale.languageCode);

  @override
  Future<AppLocalizations> load(Locale locale) {
    return SynchronousFuture<AppLocalizations>(AppLocalizations(locale));
  }

  @override
  bool shouldReload(covariant LocalizationsDelegate<AppLocalizations> old) => false;
}
