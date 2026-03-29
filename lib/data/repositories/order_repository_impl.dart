import '../../domain/entities/order.dart';
import '../../domain/repositories/order_repository.dart';
import '../../services/api/backend_api_client.dart';
import '../models/order_model.dart';

class OrderRepositoryImpl implements OrderRepository {
  OrderRepositoryImpl(this._apiClient);

  final BackendApiClient _apiClient;

  @override
  Future<Order> acceptOrder(String orderId) async {
    final response = await _apiClient.postAccept(orderId);
    return OrderModel.fromJson(response).toEntity();
  }

  @override
  Future<Order> completeDelivery(String orderId) async {
    final response = await _apiClient.postDeliver(orderId);
    return OrderModel.fromJson(response).toEntity();
  }

  @override
  Future<List<Order>> getActiveOrders() async {
    final response = await _apiClient.getActiveOrdersList();
    return response.map((item) => OrderModel.fromJson(item).toEntity()).toList();
  }

  @override
  Future<List<Order>> getIncomingOrders() async {
    final response = await _apiClient.getOrdersAvailableList();
    return response.map((item) => OrderModel.fromJson(item).toEntity()).toList();
  }

  @override
  Future<Order> markArrivedAtRestaurant(String orderId) async {
    final response = await _apiClient.postArrived(orderId);
    return OrderModel.fromJson(response).toEntity();
  }

  @override
  Future<Order> pickupOrder(String orderId) async {
    final response = await _apiClient.postPickup(orderId);
    return OrderModel.fromJson(response).toEntity();
  }

  @override
  Future<void> rejectOrder(String orderId, {bool expired = false}) {
    return _apiClient.postReject(orderId, expired: expired);
  }

  @override
  Stream<List<Order>> watchActiveOrders() {
    return _apiClient.watchActiveOrders().map((events) => events.map((event) => OrderModel.fromJson(event).toEntity()).toList());
  }

  @override
  Stream<List<Order>> watchIncomingOrders() {
    return _apiClient.watchIncomingOrders().map((events) => events.map((event) => OrderModel.fromJson(event).toEntity()).toList());
  }
}
