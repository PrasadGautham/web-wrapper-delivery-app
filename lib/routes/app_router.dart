import 'package:flutter/widgets.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../core/di/providers.dart';
import '../features/authentication/presentation/login_screen.dart';
import '../features/dashboard/presentation/home_dashboard_screen.dart';
import '../features/earnings/presentation/earnings_screen.dart';
import '../features/navigation/presentation/navigation_screen.dart';
import '../features/orders/presentation/delivery_confirmation_screen.dart';
import '../features/orders/presentation/incoming_order_screen.dart';
import '../features/orders/presentation/pickup_confirmation_screen.dart';
import '../features/profile/presentation/profile_screen.dart';

class RouterRefreshListenable extends ChangeNotifier {
  RouterRefreshListenable(Ref ref) {
    ref.listen(authControllerProvider, (_, __) => notifyListeners());
  }
}

GoRouter buildAppRouter(Ref ref) {
  final refreshListenable = RouterRefreshListenable(ref);
  final router = GoRouter(
    initialLocation: '/home',
    refreshListenable: refreshListenable,
    redirect: (context, state) {
      final auth = ref.read(authControllerProvider);
      final isLoggingIn = state.fullPath == '/login';
      if (!auth.isAuthenticated && !isLoggingIn) {
        return '/login';
      }
      if (auth.isAuthenticated && isLoggingIn) {
        return '/home';
      }
      return null;
    },
    routes: [
      GoRoute(path: '/login', builder: (_, __) => const LoginScreen()),
      GoRoute(path: '/home', builder: (_, __) => const HomeDashboardScreen()),
      GoRoute(path: '/incoming-order', builder: (_, __) => const IncomingOrderScreen()),
      GoRoute(path: '/navigation', builder: (_, __) => const NavigationScreen()),
      GoRoute(
        path: '/pickup-confirmation',
        builder: (_, __) => const PickupConfirmationScreen(),
      ),
      GoRoute(
        path: '/delivery-confirmation',
        builder: (_, __) => const DeliveryConfirmationScreen(),
      ),
      GoRoute(path: '/earnings', builder: (_, __) => const EarningsScreen()),
      GoRoute(path: '/profile', builder: (_, __) => const ProfileScreen()),
    ],
  );

  ref.read(orderControllerProvider.notifier).initializeNotifications(
    onRouteRequest: (route, payload) {
      router.go(route);
    },
  );

  return router;
}
