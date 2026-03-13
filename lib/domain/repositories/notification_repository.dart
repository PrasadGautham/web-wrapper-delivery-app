import '../entities/app_notification.dart';

abstract class NotificationRepository {
  Future<void> initialize({
    required void Function(String route, Map<String, String> payload) onRouteRequest,
  });

  Future<void> showIncomingOrder(AppNotification notification);
  Future<void> startIncomingOrderAlert();
  Future<void> stopIncomingOrderAlert();
}
