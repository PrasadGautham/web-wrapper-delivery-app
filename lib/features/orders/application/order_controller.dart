import 'dart:async';

import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/utils/timezone_helper.dart';
import '../../../domain/entities/app_notification.dart';
import '../../../domain/entities/order.dart';
import '../../../domain/repositories/notification_repository.dart';
import '../../../domain/usecases/order_usecases.dart';

class OrderState {
  const OrderState({
    this.incomingOrder,
    this.activeOrder,
    this.secondsRemaining,
    this.isLoading = true,
    this.errorMessage,
  });

  final Order? incomingOrder;
  final Order? activeOrder;
  final int? secondsRemaining;
  final bool isLoading;
  final String? errorMessage;

  OrderState copyWith({
    Order? incomingOrder,
    Order? activeOrder,
    int? secondsRemaining,
    bool? isLoading,
    String? errorMessage,
    bool clearIncoming = false,
    bool clearActive = false,
    bool clearError = false,
  }) {
    return OrderState(
      incomingOrder: clearIncoming ? null : incomingOrder ?? this.incomingOrder,
      activeOrder: clearActive ? null : activeOrder ?? this.activeOrder,
      secondsRemaining: secondsRemaining ?? this.secondsRemaining,
      isLoading: isLoading ?? this.isLoading,
      errorMessage: clearError ? null : errorMessage ?? this.errorMessage,
    );
  }
}

class OrderController extends StateNotifier<OrderState> {
  OrderController(
    this._watchIncomingOrder,
    this._getIncomingOrder,
    this._watchActiveOrder,
    this._getActiveOrder,
    this._acceptOrder,
    this._rejectOrder,
    this._markArrived,
    this._pickupOrder,
    this._completeDelivery,
    this._notificationRepository,
  ) : super(const OrderState());

  final WatchIncomingOrderUseCase _watchIncomingOrder;
  final GetIncomingOrderUseCase _getIncomingOrder;
  final WatchActiveOrderUseCase _watchActiveOrder;
  final GetActiveOrderUseCase _getActiveOrder;
  final AcceptOrderUseCase _acceptOrder;
  final RejectOrderUseCase _rejectOrder;
  final MarkArrivedUseCase _markArrived;
  final PickupOrderUseCase _pickupOrder;
  final CompleteDeliveryUseCase _completeDelivery;
  final NotificationRepository _notificationRepository;

  StreamSubscription<Order?>? _incomingSubscription;
  StreamSubscription<Order?>? _activeSubscription;
  Timer? _countdownTimer;
  bool _notificationsInitialized = false;

  Future<void> initialize() async {
    _incomingSubscription ??= _watchIncomingOrder().listen(_handleIncomingOrder);
    _activeSubscription ??= _watchActiveOrder().listen((order) {
      if (order != null) {
        _notificationRepository.stopIncomingOrderAlert();
      }

      state = state.copyWith(
        activeOrder: order,
        isLoading: false,
        clearError: true,
        clearActive: order == null,
      );
    });

    try {
      final incomingOrder = await _getIncomingOrder();
      final activeOrder = await _getActiveOrder();

      if (incomingOrder != null) {
        _handleIncomingOrder(incomingOrder);
      }

      if (activeOrder != null) {
        await _notificationRepository.stopIncomingOrderAlert();
      }

      state = state.copyWith(
        activeOrder: activeOrder,
        isLoading: false,
        clearError: true,
        clearActive: activeOrder == null,
      );
    } catch (error) {
      state = state.copyWith(isLoading: false, errorMessage: error.toString());
    }
  }

  Future<void> initializeNotifications({
    required void Function(String route, Map<String, String> payload) onRouteRequest,
    required Future<void> Function(Map<String, String> payload) onIncomingOrderSignal,
    required Future<void> Function(String token) onTokenAvailable,
  }) {
    if (_notificationsInitialized) {
      return Future<void>.value();
    }
    _notificationsInitialized = true;
    return _notificationRepository.initialize(
      onRouteRequest: onRouteRequest,
      onIncomingOrderSignal: onIncomingOrderSignal,
      onTokenAvailable: onTokenAvailable,
    );
  }

  Future<bool> accept() async {
    final order = state.incomingOrder;
    if (order == null) {
      return false;
    }
    state = state.copyWith(isLoading: true, clearError: true);
    try {
      final accepted = await _acceptOrder(order.id);
      _cancelTimer();
      await _notificationRepository.stopIncomingOrderAlert();
      state = state.copyWith(
        incomingOrder: null,
        activeOrder: accepted,
        secondsRemaining: null,
        isLoading: false,
      );
      return true;
    } catch (error) {
      state = state.copyWith(isLoading: false, errorMessage: error.toString());
      return false;
    }
  }

  Future<void> reject({bool expired = false}) async {
    final order = state.incomingOrder;
    if (order == null) {
      return;
    }
    state = state.copyWith(isLoading: true, clearError: true);
    try {
      await _rejectOrder(order.id, expired: expired);
      _cancelTimer();
      await _notificationRepository.stopIncomingOrderAlert();
      state = state.copyWith(
        clearIncoming: true,
        secondsRemaining: null,
        isLoading: false,
      );
    } catch (error) {
      state = state.copyWith(isLoading: false, errorMessage: error.toString());
    }
  }

  Future<void> markArrivedAtRestaurant() async {
    final order = state.activeOrder;
    if (order == null) {
      return;
    }
    state = state.copyWith(isLoading: true, clearError: true);
    try {
      final updated = await _markArrived(order.id);
      state = state.copyWith(activeOrder: updated, isLoading: false);
    } catch (error) {
      state = state.copyWith(isLoading: false, errorMessage: error.toString());
    }
  }

  Future<void> pickup() async {
    final order = state.activeOrder;
    if (order == null) {
      return;
    }
    state = state.copyWith(isLoading: true, clearError: true);
    try {
      final updated = await _pickupOrder(order.id);
      state = state.copyWith(activeOrder: updated, isLoading: false);
    } catch (error) {
      state = state.copyWith(isLoading: false, errorMessage: error.toString());
    }
  }

  Future<void> deliver() async {
    final order = state.activeOrder;
    if (order == null) {
      return;
    }
    state = state.copyWith(isLoading: true, clearError: true);
    try {
      await _completeDelivery(order.id);
      await _notificationRepository.stopIncomingOrderAlert();
      state = state.copyWith(clearActive: true, isLoading: false);
    } catch (error) {
      state = state.copyWith(isLoading: false, errorMessage: error.toString());
    }
  }

  Future<void> _handleIncomingOrder(Order? order) async {
    _cancelTimer();
    if (order == null) {
      await _notificationRepository.stopIncomingOrderAlert();
      state = state.copyWith(clearIncoming: true, secondsRemaining: null, isLoading: false);
      return;
    }

    final expiry = order.expiresAt;
    if (expiry == null) {
      state = state.copyWith(isLoading: false, errorMessage: 'Incoming order is missing an expiry time.');
      return;
    }

    final localizedExpiry = TimezoneHelper.toLocalTime(expiry);
    final now = TimezoneHelper.toLocalTime(DateTime.now().toUtc());
    final secondsRemaining = localizedExpiry.difference(now).inSeconds;

    state = state.copyWith(
      incomingOrder: order,
      secondsRemaining: secondsRemaining,
      isLoading: false,
      clearError: true,
    );

    await _notificationRepository.showIncomingOrder(
      AppNotification(
        title: order.restaurant.name,
        body:
            '${order.deliveryArea} | ${order.driverDisplayDistanceUnit == 'mile' ? '${(order.driverDisplayDistanceKm * 0.621371).toStringAsFixed(1)} mi' : '${order.driverDisplayDistanceKm.toStringAsFixed(1)} km'} | ${order.displayCurrency} ${order.tripEarnings.toStringAsFixed(2)}',
        route: '/incoming-order',
        payload: {'orderId': order.id, 'route': '/incoming-order'},
      ),
    );
    await _notificationRepository.startIncomingOrderAlert();

    _countdownTimer = Timer.periodic(const Duration(seconds: 1), (timer) {
      final remaining = expiry.difference(DateTime.now().toUtc()).inSeconds;
      if (remaining <= 0) {
        timer.cancel();
        reject(expired: true);
      } else {
        state = state.copyWith(secondsRemaining: remaining);
      }
    });
  }

  void _cancelTimer() {
    _countdownTimer?.cancel();
    _countdownTimer = null;
  }

  Future<void> resetForLogout() async {
    _cancelTimer();
    await _notificationRepository.stopIncomingOrderAlert();
    state = const OrderState(
      isLoading: false,
    );
  }

  void disposeResources() {
    _cancelTimer();
    _notificationRepository.stopIncomingOrderAlert();
    _incomingSubscription?.cancel();
    _activeSubscription?.cancel();
  }
}
