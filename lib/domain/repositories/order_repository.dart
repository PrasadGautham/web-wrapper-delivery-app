import '../entities/order.dart';

abstract class OrderRepository {
  Stream<List<Order>> watchIncomingOrders();
  Stream<List<Order>> watchActiveOrders();
  Future<List<Order>> getIncomingOrders();
  Future<List<Order>> getActiveOrders();
  Future<Order> acceptOrder(String orderId);
  Future<void> rejectOrder(String orderId, {bool expired = false});
  Future<Order> markArrivedAtRestaurant(String orderId);
  Future<Order> pickupOrder(String orderId);
  Future<Order> completeDelivery(String orderId);
}
