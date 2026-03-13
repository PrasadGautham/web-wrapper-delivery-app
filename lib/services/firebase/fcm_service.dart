import 'package:firebase_core/firebase_core.dart';
import 'package:firebase_messaging/firebase_messaging.dart';
import 'package:flutter_local_notifications/flutter_local_notifications.dart';
import 'package:logger/logger.dart';

import '../../core/constants/app_constants.dart';
import '../../domain/entities/app_notification.dart';
import '../audio/looping_alert_player.dart';
import 'firebase_bootstrap_options.dart';

@pragma('vm:entry-point')
Future<void> firebaseMessagingBackgroundHandler(RemoteMessage message) async {}

class FcmService {
  FcmService(this._logger, this._loopingAlertPlayer);

  final Logger _logger;
  final LoopingAlertPlayer _loopingAlertPlayer;
  final FlutterLocalNotificationsPlugin _localNotifications =
      FlutterLocalNotificationsPlugin();

  bool _initialized = false;
  bool _localNotificationsAvailable = false;
  String? _token;

  String? get token => _token;

  Future<void> initialize({
    required void Function(String route, Map<String, String> payload) onRouteRequest,
  }) async {
    if (_initialized) {
      return;
    }

    final options = FirebaseBootstrapOptions.currentPlatform;
    if (options != null) {
      await Firebase.initializeApp(options: options);
      FirebaseMessaging.onBackgroundMessage(firebaseMessagingBackgroundHandler);
      final settings = await FirebaseMessaging.instance.requestPermission();
      _logger.i('Notification permission status: ${settings.authorizationStatus.name}');
      await FirebaseMessaging.instance.setForegroundNotificationPresentationOptions(
        alert: true,
        badge: true,
        sound: true,
      );
      _token = await FirebaseMessaging.instance.getToken();
      _logger.i('FCM token: $_token');

      FirebaseMessaging.instance.onTokenRefresh.listen((token) {
        _token = token;
        _logger.i('FCM token refreshed: $token');
      });

      FirebaseMessaging.onMessage.listen((message) async {
        final data = message.data.map((key, value) => MapEntry(key, '$value'));
        await showIncomingOrder(
          AppNotification(
            title: message.notification?.title ?? 'Incoming order',
            body: message.notification?.body ?? 'A new delivery request arrived.',
            route: data['route'] ?? '/incoming-order',
            payload: data,
          ),
        );
      });
      FirebaseMessaging.onMessageOpenedApp.listen((message) {
        final data = message.data.map((key, value) => MapEntry(key, '$value'));
        onRouteRequest(data['route'] ?? '/incoming-order', data);
      });
    } else {
      _logger.i('Firebase not configured. Notifications run in mock mode.');
    }

    try {
      const androidSettings = AndroidInitializationSettings('@mipmap/ic_launcher');
      const iosSettings = DarwinInitializationSettings();
      await _localNotifications.initialize(
        const InitializationSettings(android: androidSettings, iOS: iosSettings),
        onDidReceiveNotificationResponse: (response) {
          final route = response.payload ?? '/incoming-order';
          onRouteRequest(route, {'route': route});
        },
      );

      const channel = AndroidNotificationChannel(
        AppConstants.notificationChannelId,
        AppConstants.notificationChannelName,
        importance: Importance.max,
        playSound: false,
        enableVibration: true,
      );
      await _localNotifications
          .resolvePlatformSpecificImplementation<AndroidFlutterLocalNotificationsPlugin>()
          ?.createNotificationChannel(channel);
      _localNotificationsAvailable = true;
    } catch (error, stackTrace) {
      _logger.w(
        'Local notifications unavailable. Continuing without native notification display.',
        error: error,
        stackTrace: stackTrace,
      );
    }

    _initialized = true;
  }

  Future<String?> getToken() async {
    if (_token != null) {
      return _token;
    }
    try {
      _token = await FirebaseMessaging.instance.getToken();
    } catch (_) {
      return null;
    }
    return _token;
  }

  Future<void> showIncomingOrder(AppNotification notification) async {
    if (!_localNotificationsAvailable) {
      _logger.i('Notification: ${notification.title} - ${notification.body}');
      return;
    }

    await _localNotifications.show(
        notification.hashCode,
        notification.title,
        notification.body,
        const NotificationDetails(
          android: AndroidNotificationDetails(
            AppConstants.notificationChannelId,
            AppConstants.notificationChannelName,
            importance: Importance.max,
            priority: Priority.high,
            playSound: false,
            enableVibration: true,
          ),
          iOS: DarwinNotificationDetails(
            presentAlert: true,
            presentBadge: true,
            presentSound: false,
          ),
        ),
        payload: notification.route,
      );
  }

  Future<void> startIncomingOrderAlert() {
    return _loopingAlertPlayer.start();
  }

  Future<void> stopIncomingOrderAlert() {
    return _loopingAlertPlayer.stop();
  }
}
