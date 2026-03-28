import '../entities/app_notification.dart';

abstract class NotificationRepository {
  Future<void> initialize({
    required void Function(String route, Map<String, String> payload) onRouteRequest,
    required Future<void> Function(Map<String, String> payload) onIncomingOrderSignal,
    required Future<void> Function(String token) onTokenAvailable,
  });

  Future<void> showIncomingOrder(AppNotification notification);
  Future<void> startIncomingOrderAlert();
  Future<void> stopIncomingOrderAlert();
}
