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
  Future<Order?> getActiveOrder() async {
    final response = await _apiClient.getActiveOrder();
    return response == null ? null : OrderModel.fromJson(response).toEntity();
  }

  @override
  Future<Order?> getIncomingOrder() async {
    final response = await _apiClient.getOrdersAvailable();
    return response == null ? null : OrderModel.fromJson(response).toEntity();
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
  Stream<Order?> watchActiveOrder() {
    return _apiClient.watchActiveOrder().map((event) {
      if (event == null) {
        return null;
      }
      return OrderModel.fromJson(event).toEntity();
    });
  }

  @override
  Stream<Order?> watchIncomingOrder() {
    return _apiClient.watchIncomingOrder().map((event) {
      if (event == null) {
        return null;
      }
      return OrderModel.fromJson(event).toEntity();
    });
  }
}
