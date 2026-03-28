import '../../domain/entities/app_notification.dart';
import '../../domain/repositories/notification_repository.dart';
import '../../services/firebase/fcm_service.dart';

class NotificationRepositoryImpl implements NotificationRepository {
  NotificationRepositoryImpl(this._service);

  final FcmService _service;

  @override
  Future<void> initialize({
    required void Function(String route, Map<String, String> payload) onRouteRequest,
    required Future<void> Function(Map<String, String> payload) onIncomingOrderSignal,
    required Future<void> Function(String token) onTokenAvailable,
  }) {
    return _service.initialize(
      onRouteRequest: onRouteRequest,
      onIncomingOrderSignal: onIncomingOrderSignal,
      onTokenAvailable: onTokenAvailable,
    );
  }

  @override
  Future<void> showIncomingOrder(AppNotification notification) {
    return _service.showIncomingOrder(notification);
  }

  @override
  Future<void> startIncomingOrderAlert() {
    return _service.startIncomingOrderAlert();
  }

  @override
  Future<void> stopIncomingOrderAlert() {
    return _service.stopIncomingOrderAlert();
  }
}
