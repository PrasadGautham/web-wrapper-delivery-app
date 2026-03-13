import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../core/di/providers.dart';
import '../../../presentation/widgets/app_shell.dart';
import '../../../presentation/widgets/primary_button.dart';

class ProfileScreen extends ConsumerWidget {
  const ProfileScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final auth = ref.watch(authControllerProvider);
    final dashboard = ref.watch(dashboardControllerProvider);
    final fcmToken = ref.watch(fcmTokenProvider);
    final driver = dashboard.driver ?? auth.driver;

    return AppShell(
      title: 'Profile',
      body: ListView(
        children: [
          const SizedBox(height: 12),
          Card(
            child: Padding(
              padding: const EdgeInsets.all(20),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  CircleAvatar(
                    radius: 30,
                    child: Text(driver?.name.substring(0, 1) ?? 'D'),
                  ),
                  const SizedBox(height: 16),
                  Text(
                    driver?.name ?? 'Driver',
                    style: Theme.of(context).textTheme.headlineSmall?.copyWith(
                          fontWeight: FontWeight.w700,
                        ),
                  ),
                  const SizedBox(height: 8),
                  Text(driver?.email ?? ''),
                  const SizedBox(height: 16),
                  Text('Rating: ${driver?.rating.toStringAsFixed(1) ?? '0.0'}'),
                  Text('Completed orders: ${driver?.completedOrders ?? 0}'),
                  Text('Total distance: ${driver?.totalDistanceKm.toStringAsFixed(1) ?? '0.0'} km'),
                  const SizedBox(height: 16),
                  Text(
                    'FCM Token',
                    style: Theme.of(context).textTheme.titleMedium?.copyWith(
                          fontWeight: FontWeight.w700,
                        ),
                  ),
                  const SizedBox(height: 8),
                  fcmToken.when(
                    data: (token) => SelectableText(token ?? 'Token not available yet'),
                    loading: () => const Text('Fetching token...'),
                    error: (error, _) => Text('Token error: $error'),
                  ),
                ],
              ),
            ),
          ),
          const SizedBox(height: 20),
          PrimaryButton(
            label: 'Logout',
            icon: Icons.logout,
            onPressed: () async {
              await ref.read(orderControllerProvider.notifier).resetForLogout();
              await ref.read(dashboardControllerProvider.notifier).resetForLogout();
              await ref.read(authControllerProvider.notifier).logout();
              if (context.mounted) {
                context.go('/login');
              }
            },
          ),
        ],
      ),
    );
  }
}
