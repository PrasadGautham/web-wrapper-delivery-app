import 'dart:async';

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
import '../../services/api/backend_api_client.dart';
import '../../services/audio/looping_alert_player.dart';
import '../../services/firebase/fcm_service.dart';
import '../../services/location/driver_location_sync_service.dart';
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
final backendApiClientProvider = Provider<BackendApiClient>((ref) {
  final client = BackendApiClient();
  ref.onDispose(() {
    client.dispose();
  });
  return client;
});

final driverLocationSyncServiceProvider = Provider<DriverLocationSyncService>((ref) {
  final service = DriverLocationSyncService(
    ref.watch(backendApiClientProvider),
    ref.watch(loggerProvider),
  );
  ref.onDispose(() {
    service.dispose();
  });
  return service;
});

final authRepositoryProvider = Provider<AuthRepository>(
  (ref) => AuthRepositoryImpl(ref.watch(backendApiClientProvider), ref.watch(secureStorageProvider)),
);
final orderRepositoryProvider = Provider<OrderRepository>(
  (ref) => OrderRepositoryImpl(ref.watch(backendApiClientProvider)),
);
final driverRepositoryProvider = Provider<DriverRepository>(
  (ref) => DriverRepositoryImpl(ref.watch(backendApiClientProvider)),
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
final requestPasswordResetUseCaseProvider = Provider<RequestPasswordResetUseCase>(
  (ref) => RequestPasswordResetUseCase(ref.watch(authRepositoryProvider)),
);
final confirmPasswordResetUseCaseProvider = Provider<ConfirmPasswordResetUseCase>(
  (ref) => ConfirmPasswordResetUseCase(ref.watch(authRepositoryProvider)),
);
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
    ref.watch(requestPasswordResetUseCaseProvider),
    ref.watch(confirmPasswordResetUseCaseProvider),
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
    _ref.read(backendApiClientProvider).configureAuthLifecycle(
      onSessionExpired: () => _ref.read(authControllerProvider.notifier).clearSession(),
    );
    await _ref.read(authControllerProvider.notifier).restoreSession();
    _ref.read(dashboardControllerProvider.notifier).initialize();
    _ref.read(orderControllerProvider.notifier).initialize();
    _setupLocationSync();
    _initialized = true;
  }

  void _setupLocationSync() {
    Future<void> syncLocation() {
      final auth = _ref.read(authControllerProvider);
      final dashboard = _ref.read(dashboardControllerProvider);
      final orders = _ref.read(orderControllerProvider);
      return _ref.read(driverLocationSyncServiceProvider).sync(
        isAuthenticated: auth.isAuthenticated,
        shouldTrack: (dashboard.driver?.isOnline ?? false) || orders.activeOrder != null,
        highFrequencyMode: orders.activeOrder != null,
      );
    }

    _ref.listen<AuthState>(authControllerProvider, (_, __) {
      unawaited(syncLocation());
    });
    _ref.listen<DashboardState>(dashboardControllerProvider, (_, __) {
      unawaited(syncLocation());
    });
    _ref.listen<OrderState>(orderControllerProvider, (_, __) {
      unawaited(syncLocation());
    });
    unawaited(syncLocation());
  }
}



