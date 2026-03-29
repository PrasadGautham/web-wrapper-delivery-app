import 'dart:async';

import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/utils/formatters.dart';
import '../../../domain/entities/app_notification.dart';
import '../../../domain/entities/order.dart';
import '../../../domain/repositories/notification_repository.dart';
import '../../../domain/usecases/order_usecases.dart';

class OrderState {
  const OrderState({
    this.incomingOrders = const [],
    this.activeOrders = const [],
    this.secondsRemainingByOrder = const {},
    this.selectedIncomingOrderId,
    this.selectedActiveOrderId,
    this.isLoading = true,
    this.errorMessage,
  });

  final List<Order> incomingOrders;
  final List<Order> activeOrders;
  final Map<String, int> secondsRemainingByOrder;
  final String? selectedIncomingOrderId;
  final String? selectedActiveOrderId;
  final bool isLoading;
  final String? errorMessage;

  Order? get incomingOrder => _resolveSelected(incomingOrders, selectedIncomingOrderId);
  Order? get activeOrder => _resolveSelected(activeOrders, selectedActiveOrderId);
  int? get secondsRemaining {
    final order = incomingOrder;
    if (order == null) {
      return null;
    }
    return secondsRemainingByOrder[order.id];
  }

  OrderState copyWith({
    List<Order>? incomingOrders,
    List<Order>? activeOrders,
    Map<String, int>? secondsRemainingByOrder,
    String? selectedIncomingOrderId,
    String? selectedActiveOrderId,
    bool? isLoading,
    String? errorMessage,
    bool clearError = false,
  }) {
    return OrderState(
      incomingOrders: incomingOrders ?? this.incomingOrders,
      activeOrders: activeOrders ?? this.activeOrders,
      secondsRemainingByOrder: secondsRemainingByOrder ?? this.secondsRemainingByOrder,
      selectedIncomingOrderId: selectedIncomingOrderId ?? this.selectedIncomingOrderId,
      selectedActiveOrderId: selectedActiveOrderId ?? this.selectedActiveOrderId,
      isLoading: isLoading ?? this.isLoading,
      errorMessage: clearError ? null : errorMessage ?? this.errorMessage,
    );
  }

  static Order? _resolveSelected(List<Order> orders, String? selectedId) {
    if (orders.isEmpty) {
      return null;
    }
    if (selectedId == null) {
      return orders.first;
    }
    return orders.where((order) => order.id == selectedId).cast<Order?>().firstWhere(
          (order) => order != null,
          orElse: () => orders.first,
        );
  }
}

class OrderController extends StateNotifier<OrderState> {
  OrderController(
    this._watchIncomingOrders,
    this._getIncomingOrders,
    this._watchActiveOrders,
    this._getActiveOrders,
    this._acceptOrder,
    this._rejectOrder,
    this._markArrived,
    this._pickupOrder,
    this._completeDelivery,
    this._notificationRepository,
  ) : super(const OrderState());

  final WatchIncomingOrdersUseCase _watchIncomingOrders;
  final GetIncomingOrdersUseCase _getIncomingOrders;
  final WatchActiveOrdersUseCase _watchActiveOrders;
  final GetActiveOrdersUseCase _getActiveOrders;
  final AcceptOrderUseCase _acceptOrder;
  final RejectOrderUseCase _rejectOrder;
  final MarkArrivedUseCase _markArrived;
  final PickupOrderUseCase _pickupOrder;
  final CompleteDeliveryUseCase _completeDelivery;
  final NotificationRepository _notificationRepository;

  StreamSubscription<List<Order>>? _incomingSubscription;
  StreamSubscription<List<Order>>? _activeSubscription;
  Timer? _countdownTimer;
  bool _notificationsInitialized = false;
  bool _initialized = false;
  bool _bootRefreshInFlight = false;

  Future<void> initialize() async {
    if (_initialized) {
      return;
    }
    _initialized = true;
    _incomingSubscription ??= _watchIncomingOrders().listen(_syncIncomingOrders);
    _activeSubscription ??= _watchActiveOrders().listen((orders) {
      final sortedOrders = _sortActiveOrders(orders);
      state = state.copyWith(
        activeOrders: sortedOrders,
        selectedActiveOrderId: _resolveSelectedActiveId(sortedOrders, state.selectedActiveOrderId),
        isLoading: false,
        clearError: true,
      );
    });

    if (_bootRefreshInFlight) {
      return;
    }
    _bootRefreshInFlight = true;
    try {
      final incomingOrders = await _getIncomingOrders();
      final activeOrders = await _getActiveOrders();
      await _syncIncomingOrders(incomingOrders);
      final sortedActiveOrders = _sortActiveOrders(activeOrders);
      state = state.copyWith(
        activeOrders: sortedActiveOrders,
        selectedActiveOrderId: _resolveSelectedActiveId(sortedActiveOrders, state.selectedActiveOrderId),
        isLoading: false,
        clearError: true,
      );
    } catch (error) {
      state = state.copyWith(
        isLoading: false,
        errorMessage: state.incomingOrders.isEmpty && state.activeOrders.isEmpty ? null : error.toString(),
      );
    } finally {
      _bootRefreshInFlight = false;
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

  void selectIncomingOrder(String orderId) {
    state = state.copyWith(selectedIncomingOrderId: orderId);
  }

  void selectActiveOrder(String orderId) {
    state = state.copyWith(selectedActiveOrderId: orderId);
  }

  Future<bool> accept([String? orderId]) async {
    final order = _incomingOrderById(orderId);
    if (order == null) {
      return false;
    }
    state = state.copyWith(isLoading: true, clearError: true);
    try {
      final accepted = await _acceptOrder(order.id);
      final remainingIncoming = state.incomingOrders.where((item) => item.id != order.id).toList();
      final nextActiveOrders = _sortActiveOrders(_upsertOrder(state.activeOrders, accepted));
      await _syncIncomingOrders(remainingIncoming);
      state = state.copyWith(
        activeOrders: nextActiveOrders,
        selectedActiveOrderId: accepted.id,
        isLoading: false,
        clearError: true,
      );
      return true;
    } catch (error) {
      state = state.copyWith(isLoading: false, errorMessage: error.toString());
      return false;
    }
  }

  Future<void> reject({String? orderId, bool expired = false}) async {
    final order = _incomingOrderById(orderId);
    if (order == null) {
      return;
    }
    state = state.copyWith(isLoading: true, clearError: true);
    try {
      await _rejectOrder(order.id, expired: expired);
      final remainingIncoming = state.incomingOrders.where((item) => item.id != order.id).toList();
      await _syncIncomingOrders(remainingIncoming);
      state = state.copyWith(isLoading: false, clearError: true);
    } catch (error) {
      state = state.copyWith(isLoading: false, errorMessage: error.toString());
    }
  }

  Future<void> markArrivedAtRestaurant([String? orderId]) async {
    final order = _activeOrderById(orderId);
    if (order == null) {
      return;
    }
    state = state.copyWith(isLoading: true, clearError: true);
    try {
      final updated = await _markArrived(order.id);
      final nextActiveOrders = _sortActiveOrders(_upsertOrder(state.activeOrders, updated));
      state = state.copyWith(
        activeOrders: nextActiveOrders,
        selectedActiveOrderId: updated.id,
        isLoading: false,
      );
    } catch (error) {
      state = state.copyWith(isLoading: false, errorMessage: error.toString());
    }
  }

  Future<void> pickup([String? orderId]) async {
    final order = _activeOrderById(orderId);
    if (order == null) {
      return;
    }
    state = state.copyWith(isLoading: true, clearError: true);
    try {
      final updated = await _pickupOrder(order.id);
      final nextActiveOrders = _sortActiveOrders(_upsertOrder(state.activeOrders, updated));
      state = state.copyWith(
        activeOrders: nextActiveOrders,
        selectedActiveOrderId: updated.id,
        isLoading: false,
      );
    } catch (error) {
      state = state.copyWith(isLoading: false, errorMessage: error.toString());
    }
  }

  Future<bool> deliver([String? orderId]) async {
    final order = _activeOrderById(orderId);
    if (order == null) {
      return false;
    }
    state = state.copyWith(isLoading: true, clearError: true);
    try {
      await _completeDelivery(order.id);
      await _notificationRepository.stopIncomingOrderAlert();
      final remainingActive = _sortActiveOrders(state.activeOrders.where((item) => item.id != order.id).toList());
      state = state.copyWith(
        activeOrders: remainingActive,
        selectedActiveOrderId: _resolveSelectedActiveId(remainingActive, state.selectedActiveOrderId == order.id ? null : state.selectedActiveOrderId),
        isLoading: false,
      );
      return remainingActive.isNotEmpty;
    } catch (error) {
      state = state.copyWith(isLoading: false, errorMessage: error.toString());
      return false;
    }
  }

  Future<void> _syncIncomingOrders(List<Order> orders) async {
    final previousPrimaryId = state.incomingOrder?.id;
    final nextSelectedIncomingId = _resolveSelectedIncomingId(orders, state.selectedIncomingOrderId);
    final nextSeconds = {
      for (final order in orders)
        order.id: _secondsUntilExpiry(order),
    };

    state = state.copyWith(
      incomingOrders: orders,
      secondsRemainingByOrder: nextSeconds,
      selectedIncomingOrderId: nextSelectedIncomingId,
      isLoading: false,
      clearError: true,
    );

    if (orders.isEmpty) {
      _cancelTimer();
      await _notificationRepository.stopIncomingOrderAlert();
      return;
    }

    _ensureCountdownTimer();
    final primaryOrder = state.incomingOrder;
    if (primaryOrder != null && primaryOrder.id != previousPrimaryId) {
      await _notificationRepository.showIncomingOrder(
        AppNotification(
          title: primaryOrder.restaurant.name,
          body: '${primaryOrder.deliveryArea} | ${Formatters.distance(primaryOrder.driverDisplayDistanceKm, unit: primaryOrder.driverDisplayDistanceUnit)} | ${primaryOrder.displayCurrency} ${primaryOrder.tripEarnings.toStringAsFixed(2)}',
          route: '/incoming-order',
          payload: {'orderId': primaryOrder.id, 'route': '/incoming-order'},
        ),
      );
      await _notificationRepository.startIncomingOrderAlert();
    }
  }

  void _ensureCountdownTimer() {
    _countdownTimer ??= Timer.periodic(const Duration(seconds: 1), (timer) {
      final orders = state.incomingOrders;
      if (orders.isEmpty) {
        _cancelTimer();
        return;
      }
      final nextSeconds = <String, int>{};
      final expiredIds = <String>[];
      for (final order in orders) {
        final remaining = _secondsUntilExpiry(order);
        if (remaining <= 0) {
          expiredIds.add(order.id);
        } else {
          nextSeconds[order.id] = remaining;
        }
      }
      state = state.copyWith(secondsRemainingByOrder: nextSeconds);
      for (final orderId in expiredIds) {
        unawaited(reject(orderId: orderId, expired: true));
      }
    });
  }

  int _secondsUntilExpiry(Order order) {
    final expiry = order.expiresAt;
    if (expiry == null) {
      return 0;
    }
    return expiry.difference(DateTime.now().toUtc()).inSeconds;
  }

  Order? _incomingOrderById(String? orderId) {
    if (orderId == null) {
      return state.incomingOrder;
    }
    return state.incomingOrders.where((order) => order.id == orderId).cast<Order?>().firstWhere(
          (order) => order != null,
          orElse: () => null,
        );
  }

  Order? _activeOrderById(String? orderId) {
    if (orderId == null) {
      return state.activeOrder;
    }
    return state.activeOrders.where((order) => order.id == orderId).cast<Order?>().firstWhere(
          (order) => order != null,
          orElse: () => null,
        );
  }

  String? _resolveSelectedIncomingId(List<Order> orders, String? preferredId) {
    if (orders.isEmpty) {
      return null;
    }
    if (preferredId != null && orders.any((order) => order.id == preferredId)) {
      return preferredId;
    }
    return orders.first.id;
  }

  String? _resolveSelectedActiveId(List<Order> orders, String? preferredId) {
    if (orders.isEmpty) {
      return null;
    }
    if (preferredId != null && orders.any((order) => order.id == preferredId)) {
      return preferredId;
    }
    return _sortActiveOrders(List<Order>.from(orders)).first.id;
  }

  List<Order> _sortActiveOrders(List<Order> orders) {
    final sorted = List<Order>.from(orders);
    sorted.sort((left, right) {
      final priorityCompare = _activeOrderPriority(left).compareTo(_activeOrderPriority(right));
      if (priorityCompare != 0) {
        return priorityCompare;
      }
      return left.createdAt.compareTo(right.createdAt);
    });
    return sorted;
  }

  int _activeOrderPriority(Order order) {
    switch (order.status) {
      case OrderStatus.pickedUp:
      case OrderStatus.delivering:
        return 0;
      case OrderStatus.atRestaurant:
        return 1;
      case OrderStatus.accepted:
        return 2;
      case OrderStatus.pending:
        return 3;
      default:
        return 4;
    }
  }

  List<Order> _upsertOrder(List<Order> orders, Order next) {
    final updated = orders.where((order) => order.id != next.id).toList();
    updated.add(next);
    updated.sort((left, right) => left.createdAt.compareTo(right.createdAt));
    return updated;
  }

  void _cancelTimer() {
    _countdownTimer?.cancel();
    _countdownTimer = null;
  }

  Future<void> resetForLogout() async {
    _cancelTimer();
    await _notificationRepository.stopIncomingOrderAlert();
    state = const OrderState(isLoading: false);
    _initialized = false;
    _bootRefreshInFlight = false;
  }

  void disposeResources() {
    _cancelTimer();
    _notificationRepository.stopIncomingOrderAlert();
    _incomingSubscription?.cancel();
    _activeSubscription?.cancel();
  }
}
