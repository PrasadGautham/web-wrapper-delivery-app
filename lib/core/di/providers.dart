import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:go_router/go_router.dart';
import 'package:logger/logger.dart';

import '../../data/repositories/auth_repository_impl.dart';
import '../../data/repositories/driver_repository_impl.dart';
import '../../data/repositories/notification_repository_impl.dart';
import '../../data/repositories/order_repository_impl.dart';
import '../../domain/repositories/auth_repository.dart';
import '../../domain/repositories/driver_repository.dart';
import '../../domain/repositories/location_repository.dart';
import '../../domain/repositories/notification_repository.dart';
import '../../domain/repositories/order_repository.dart';
import '../../domain/usecases/auth_usecases.dart';
import '../../domain/usecases/driver_usecases.dart';
import '../../domain/usecases/order_usecases.dart';
import '../../features/authentication/application/auth_controller.dart';
import '../../features/dashboard/application/dashboard_controller.dart';
import '../../features/orders/application/order_controller.dart';
import '../../routes/app_router.dart';
import '../../services/api/mock_api_client.dart';
import '../../services/audio/looping_alert_player.dart';
import '../../services/firebase/fcm_service.dart';
import '../../services/location/mock_location_service.dart';

final loggerProvider = Provider<Logger>((ref) => Logger());
final loopingAlertPlayerProvider = Provider<LoopingAlertPlayer>((ref) {
  final player = LoopingAlertPlayer(ref.watch(loggerProvider));
  ref.onDispose(() {
    player.dispose();
  });
  return player;
});
final secureStorageProvider =
    Provider<FlutterSecureStorage>((ref) => const FlutterSecureStorage());
final mockApiClientProvider = Provider<MockApiClient>((ref) {
  final client = MockApiClient();
  ref.onDispose(() {
    client.dispose();
  });
  return client;
});

final authRepositoryProvider = Provider<AuthRepository>(
  (ref) => AuthRepositoryImpl(ref.watch(mockApiClientProvider), ref.watch(secureStorageProvider)),
);
final orderRepositoryProvider = Provider<OrderRepository>(
  (ref) => OrderRepositoryImpl(ref.watch(mockApiClientProvider)),
);
final driverRepositoryProvider = Provider<DriverRepository>(
  (ref) => DriverRepositoryImpl(ref.watch(mockApiClientProvider)),
);
final locationRepositoryProvider = Provider<LocationRepository>(
  (ref) => const MockLocationService(),
);
final fcmServiceProvider = Provider<FcmService>(
  (ref) => FcmService(
    ref.watch(loggerProvider),
    ref.watch(loopingAlertPlayerProvider),
  ),
);
final notificationRepositoryProvider = Provider<NotificationRepository>(
  (ref) => NotificationRepositoryImpl(ref.watch(fcmServiceProvider)),
);
final fcmTokenProvider = FutureProvider<String?>(
  (ref) => ref.watch(fcmServiceProvider).getToken(),
);

final loginUseCaseProvider =
    Provider<LoginUseCase>((ref) => LoginUseCase(ref.watch(authRepositoryProvider)));
final restoreSessionUseCaseProvider = Provider<RestoreSessionUseCase>(
  (ref) => RestoreSessionUseCase(ref.watch(authRepositoryProvider)),
);
final logoutUseCaseProvider =
    Provider<LogoutUseCase>((ref) => LogoutUseCase(ref.watch(authRepositoryProvider)));
final watchDriverUseCaseProvider = Provider<WatchDriverUseCase>(
  (ref) => WatchDriverUseCase(ref.watch(driverRepositoryProvider)),
);
final getDriverUseCaseProvider = Provider<GetDriverUseCase>(
  (ref) => GetDriverUseCase(ref.watch(driverRepositoryProvider)),
);
final updateAvailabilityUseCaseProvider = Provider<UpdateAvailabilityUseCase>(
  (ref) => UpdateAvailabilityUseCase(ref.watch(driverRepositoryProvider)),
);
final getEarningsUseCaseProvider = Provider<GetEarningsUseCase>(
  (ref) => GetEarningsUseCase(ref.watch(driverRepositoryProvider)),
);
final watchIncomingOrderUseCaseProvider = Provider<WatchIncomingOrderUseCase>(
  (ref) => WatchIncomingOrderUseCase(ref.watch(orderRepositoryProvider)),
);
final getIncomingOrderUseCaseProvider = Provider<GetIncomingOrderUseCase>(
  (ref) => GetIncomingOrderUseCase(ref.watch(orderRepositoryProvider)),
);
final watchActiveOrderUseCaseProvider = Provider<WatchActiveOrderUseCase>(
  (ref) => WatchActiveOrderUseCase(ref.watch(orderRepositoryProvider)),
);
final getActiveOrderUseCaseProvider = Provider<GetActiveOrderUseCase>(
  (ref) => GetActiveOrderUseCase(ref.watch(orderRepositoryProvider)),
);
final acceptOrderUseCaseProvider = Provider<AcceptOrderUseCase>(
  (ref) => AcceptOrderUseCase(ref.watch(orderRepositoryProvider)),
);
final rejectOrderUseCaseProvider = Provider<RejectOrderUseCase>(
  (ref) => RejectOrderUseCase(ref.watch(orderRepositoryProvider)),
);
final markArrivedUseCaseProvider = Provider<MarkArrivedUseCase>(
  (ref) => MarkArrivedUseCase(ref.watch(orderRepositoryProvider)),
);
final pickupOrderUseCaseProvider = Provider<PickupOrderUseCase>(
  (ref) => PickupOrderUseCase(ref.watch(orderRepositoryProvider)),
);
final completeDeliveryUseCaseProvider = Provider<CompleteDeliveryUseCase>(
  (ref) => CompleteDeliveryUseCase(ref.watch(orderRepositoryProvider)),
);

final localeProvider = StateProvider<Locale>((ref) => const Locale('en'));

final authControllerProvider =
    StateNotifierProvider<AuthController, AuthState>((ref) {
  return AuthController(
    ref.watch(loginUseCaseProvider),
    ref.watch(restoreSessionUseCaseProvider),
    ref.watch(logoutUseCaseProvider),
  );
});

final dashboardControllerProvider =
    StateNotifierProvider<DashboardController, DashboardState>((ref) {
  final controller = DashboardController(
    ref.watch(watchDriverUseCaseProvider),
    ref.watch(getDriverUseCaseProvider),
    ref.watch(getEarningsUseCaseProvider),
    ref.watch(updateAvailabilityUseCaseProvider),
  );
  ref.onDispose(controller.disposeResources);
  return controller;
});

final orderControllerProvider =
    StateNotifierProvider<OrderController, OrderState>((ref) {
  final controller = OrderController(
    ref.watch(watchIncomingOrderUseCaseProvider),
    ref.watch(getIncomingOrderUseCaseProvider),
    ref.watch(watchActiveOrderUseCaseProvider),
    ref.watch(getActiveOrderUseCaseProvider),
    ref.watch(acceptOrderUseCaseProvider),
    ref.watch(rejectOrderUseCaseProvider),
    ref.watch(markArrivedUseCaseProvider),
    ref.watch(pickupOrderUseCaseProvider),
    ref.watch(completeDeliveryUseCaseProvider),
    ref.watch(notificationRepositoryProvider),
  );
  ref.onDispose(controller.disposeResources);
  return controller;
});

final appRouterProvider = Provider<GoRouter>((ref) => buildAppRouter(ref));
final appStartupProvider = Provider<AppStartup>((ref) => AppStartup(ref));

class AppStartup {
  AppStartup(this._ref);

  final Ref _ref;
  bool _initialized = false;

  Future<void> initialize() async {
    if (_initialized) {
      return;
    }
    await _ref.read(authControllerProvider.notifier).restoreSession();
    _ref.read(dashboardControllerProvider.notifier).initialize();
    _ref.read(orderControllerProvider.notifier).initialize();
    _initialized = true;
  }
}
