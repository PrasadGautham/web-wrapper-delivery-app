import '../entities/order.dart';
import '../repositories/order_repository.dart';

class WatchIncomingOrderUseCase {
  const WatchIncomingOrderUseCase(this._repository);

  final OrderRepository _repository;

  Stream<Order?> call() => _repository.watchIncomingOrder();
}

class GetIncomingOrderUseCase {
  const GetIncomingOrderUseCase(this._repository);

  final OrderRepository _repository;

  Future<Order?> call() => _repository.getIncomingOrder();
}

class WatchActiveOrderUseCase {
  const WatchActiveOrderUseCase(this._repository);

  final OrderRepository _repository;

  Stream<Order?> call() => _repository.watchActiveOrder();
}

class GetActiveOrderUseCase {
  const GetActiveOrderUseCase(this._repository);

  final OrderRepository _repository;

  Future<Order?> call() => _repository.getActiveOrder();
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
