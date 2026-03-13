import '../entities/order.dart';

abstract class OrderRepository {
  Stream<Order?> watchIncomingOrder();
  Stream<Order?> watchActiveOrder();
  Future<Order?> getIncomingOrder();
  Future<Order?> getActiveOrder();
  Future<Order> acceptOrder(String orderId);
  Future<void> rejectOrder(String orderId, {bool expired = false});
  Future<Order> markArrivedAtRestaurant(String orderId);
  Future<Order> pickupOrder(String orderId);
  Future<Order> completeDelivery(String orderId);
}
