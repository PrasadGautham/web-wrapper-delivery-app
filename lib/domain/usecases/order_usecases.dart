import '../entities/order.dart';
import '../repositories/order_repository.dart';

class WatchIncomingOrdersUseCase {
  const WatchIncomingOrdersUseCase(this._repository);

  final OrderRepository _repository;

  Stream<List<Order>> call() => _repository.watchIncomingOrders();
}

class GetIncomingOrdersUseCase {
  const GetIncomingOrdersUseCase(this._repository);

  final OrderRepository _repository;

  Future<List<Order>> call() => _repository.getIncomingOrders();
}

class WatchActiveOrdersUseCase {
  const WatchActiveOrdersUseCase(this._repository);

  final OrderRepository _repository;

  Stream<List<Order>> call() => _repository.watchActiveOrders();
}

class GetActiveOrdersUseCase {
  const GetActiveOrdersUseCase(this._repository);

  final OrderRepository _repository;

  Future<List<Order>> call() => _repository.getActiveOrders();
}

class AcceptOrderUseCase {
  const AcceptOrderUseCase(this._repository);

  final OrderRepository _repository;

  Future<Order> call(String orderId) => _repository.acceptOrder(orderId);
}

class RejectOrderUseCase {
  const RejectOrderUseCase(this._repository);

  final OrderRepository _repository;

  Future<void> call(String orderId, {bool expired = false}) =>
      _repository.rejectOrder(orderId, expired: expired);
}

class MarkArrivedUseCase {
  const MarkArrivedUseCase(this._repository);

  final OrderRepository _repository;

  Future<Order> call(String orderId) => _repository.markArrivedAtRestaurant(orderId);
}

class PickupOrderUseCase {
  const PickupOrderUseCase(this._repository);

  final OrderRepository _repository;

  Future<Order> call(String orderId) => _repository.pickupOrder(orderId);
}

class CompleteDeliveryUseCase {
  const CompleteDeliveryUseCase(this._repository);

  final OrderRepository _repository;

  Future<Order> call(String orderId) => _repository.completeDelivery(orderId);
}
