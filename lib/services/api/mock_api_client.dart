import 'dart:async';

import '../../core/config/app_config.dart';
import '../../data/mock/mock_seed.dart';
import '../../data/models/driver_model.dart';
import '../../data/models/order_model.dart';

class MockApiClient {
  MockApiClient() {
    _driver = DriverModel.fromJson(MockSeed.driver());
    _orderQueue = MockSeed.orders().map(OrderModel.fromJson).toList();
    _driverController.add(_driver);
    _scheduleNextOrder(force: true);
  }

  late DriverModel _driver;
  late List<OrderModel> _orderQueue;
  OrderModel? _incomingOrder;
  OrderModel? _activeOrder;

  final _driverController = StreamController<DriverModel?>.broadcast();
  final _incomingOrderController = StreamController<OrderModel?>.broadcast();
  final _activeOrderController = StreamController<OrderModel?>.broadcast();
  Timer? _dispatchTimer;

  Stream<DriverModel?> watchDriver() => _driverController.stream;
  Stream<OrderModel?> watchIncomingOrder() => _incomingOrderController.stream;
  Stream<OrderModel?> watchActiveOrder() => _activeOrderController.stream;

  Future<Map<String, dynamic>> postLogin({
    required String email,
    required String password,
  }) async {
    await Future<void>.delayed(AppConfig.mockApiDelay);
    if (email == 'driver@demo.com' && password == 'Password123') {
      return {
        'token': 'mock-jwt-token',
        'driver': MockSeed.driver()..['isOnline'] = _driver.isOnline,
      };
    }
    throw Exception('Invalid credentials');
  }

  Future<Map<String, dynamic>> getDriver() async {
    await Future<void>.delayed(AppConfig.mockApiDelay);
    return MockSeed.driver()
      ..['completedOrders'] = _driver.completedOrders
      ..['totalDistanceKm'] = _driver.totalDistanceKm
      ..['isOnline'] = _driver.isOnline;
  }

  Future<Map<String, dynamic>> patchDriverAvailability(bool isOnline) async {
    await Future<void>.delayed(AppConfig.mockApiDelay);
    _driver = DriverModel(
      id: _driver.id,
      name: _driver.name,
      email: _driver.email,
      rating: _driver.rating,
      completedOrders: _driver.completedOrders,
      totalDistanceKm: _driver.totalDistanceKm,
      isOnline: isOnline,
      currentLocation: _driver.currentLocation,
      maxActiveOrders: _driver.maxActiveOrders,
      currentLoad: _driver.currentLoad,
      locationFreshness: _driver.locationFreshness,
      displayCurrency: _driver.displayCurrency,
      timeZone: _driver.timeZone,
    );
    _driverController.add(_driver);
    if (isOnline) {
      _scheduleNextOrder(force: true);
    } else {
      _dispatchTimer?.cancel();
      _incomingOrder = null;
      _incomingOrderController.add(null);
    }
    return getDriver();
  }

  Future<Map<String, dynamic>?> getOrdersAvailable() async {
    await Future<void>.delayed(AppConfig.mockApiDelay);
    return _incomingOrder == null ? null : _toMap(_incomingOrder!);
  }

  Future<Map<String, dynamic>?> getActiveOrder() async {
    await Future<void>.delayed(AppConfig.mockApiDelay);
    return _activeOrder == null ? null : _toMap(_activeOrder!);
  }

  Future<Map<String, dynamic>> postAccept(String orderId) async {
    await Future<void>.delayed(AppConfig.mockApiDelay);
    final order = _incomingOrder;
    if (order == null || order.id != orderId) {
      throw Exception('Order not available');
    }
    _activeOrder = _copyOrder(order, status: 'accepted');
    _incomingOrder = null;
    _incomingOrderController.add(null);
    _activeOrderController.add(_activeOrder);
    return _toMap(_activeOrder!);
  }

  Future<void> postReject(String orderId, {bool expired = false}) async {
    await Future<void>.delayed(AppConfig.mockApiDelay);
    if (_incomingOrder?.id == orderId) {
      _incomingOrder = null;
      _incomingOrderController.add(null);
      _scheduleNextOrder(force: true);
    }
  }

  Future<Map<String, dynamic>> postArrived(String orderId) async {
    return _updateActiveOrder(orderId, 'atRestaurant');
  }

  Future<Map<String, dynamic>> postPickup(String orderId) async {
    return _updateActiveOrder(orderId, 'pickedUp');
  }

  Future<Map<String, dynamic>> postDeliver(String orderId) async {
    final delivered = await _updateActiveOrder(orderId, 'delivered');
    _activeOrder = null;
    _activeOrderController.add(null);
    _driver = DriverModel(
      id: _driver.id,
      name: _driver.name,
      email: _driver.email,
      rating: _driver.rating,
      completedOrders: _driver.completedOrders + 1,
      totalDistanceKm: _driver.totalDistanceKm + 6.5,
      isOnline: _driver.isOnline,
      currentLocation: _driver.currentLocation,
      maxActiveOrders: _driver.maxActiveOrders,
      currentLoad: _driver.currentLoad,
      locationFreshness: _driver.locationFreshness,
      displayCurrency: _driver.displayCurrency,
      timeZone: _driver.timeZone,
    );
    _driverController.add(_driver);
    _scheduleNextOrder(force: true);
    return delivered;
  }

  Future<Map<String, dynamic>> getDriverEarnings() async {
    await Future<void>.delayed(AppConfig.mockApiDelay);
    final response = MockSeed.earnings();
    response['completedDeliveries'] = _driver.completedOrders;
    response['distanceTravelledKm'] = _driver.totalDistanceKm;
    return response;
  }

  Future<Map<String, dynamic>> _updateActiveOrder(String orderId, String status) async {
    await Future<void>.delayed(AppConfig.mockApiDelay);
    final order = _activeOrder;
    if (order == null || order.id != orderId) {
      throw Exception('No active order');
    }
    _activeOrder = _copyOrder(order, status: status);
    _activeOrderController.add(_activeOrder);
    return _toMap(_activeOrder!);
  }

  void _scheduleNextOrder({bool force = false}) {
    if (!_driver.isOnline || _activeOrder != null) {
      return;
    }
    if (_incomingOrder != null && !force) {
      return;
    }

    _dispatchTimer?.cancel();
    _dispatchTimer = Timer(const Duration(seconds: 4), () {
      if (!_driver.isOnline || _activeOrder != null || _orderQueue.isEmpty) {
        return;
      }
      final next = _orderQueue.removeAt(0);
      final refreshed = _copyOrder(
        next,
        status: 'pending',
        createdAt: DateTime.now().toUtc(),
        expiresAt: DateTime.now().toUtc().add(AppConfig.incomingOrderTimeout),
      );
      _orderQueue.add(next);
      _incomingOrder = refreshed;
      _incomingOrderController.add(_incomingOrder);
    });
  }

  OrderModel _copyOrder(
    OrderModel source, {
    required String status,
    DateTime? createdAt,
    DateTime? expiresAt,
  }) {
    return OrderModel(
      id: source.id,
      tripId: source.tripId,
      tripOrderCount: source.tripOrderCount,
      restaurant: source.restaurant,
      customer: source.customer,
      status: status,
      deliveryArea: source.deliveryArea,
      distanceKm: source.distanceKm,
      estimatedKm: source.estimatedKm,
      estimatedMinutes: source.estimatedMinutes,
      driverDisplayDistanceKm: source.driverDisplayDistanceKm,
      driverDisplayMinutes: source.driverDisplayMinutes,
      driverDisplayMode: source.driverDisplayMode,
      driverDisplayDistanceUnit: source.driverDisplayDistanceUnit,
      displayCurrency: source.displayCurrency,
      tripEarnings: source.tripEarnings,
      createdAt: (createdAt ?? DateTime.parse(source.createdAt)).toUtc().toIso8601String(),
      expiresAt: (expiresAt ?? (source.expiresAt == null ? null : DateTime.parse(source.expiresAt!)))?.toUtc().toIso8601String(),
    );
  }

  Map<String, dynamic> _toMap(OrderModel order) {
    return {
      'id': order.id,
      'tripId': order.tripId,
      'tripOrderCount': order.tripOrderCount,
      'restaurant': order.restaurant,
      'customer': order.customer,
      'status': order.status,
      'deliveryArea': order.deliveryArea,
      'distanceKm': order.distanceKm,
      'estimatedKm': order.estimatedKm,
      'estimatedMinutes': order.estimatedMinutes,
      'driverDisplayDistanceKm': order.driverDisplayDistanceKm,
      'driverDisplayMinutes': order.driverDisplayMinutes,
      'driverDisplayMode': order.driverDisplayMode,
      'driverDisplayDistanceUnit': order.driverDisplayDistanceUnit,
      'displayCurrency': order.displayCurrency,
      'tripEarnings': order.tripEarnings,
      'createdAt': order.createdAt,
      'expiresAt': order.expiresAt,
    };
  }

  Future<void> dispose() async {
    _dispatchTimer?.cancel();
    await _driverController.close();
    await _incomingOrderController.close();
    await _activeOrderController.close();
  }
}
