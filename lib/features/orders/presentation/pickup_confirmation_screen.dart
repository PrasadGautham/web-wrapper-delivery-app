import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../core/di/providers.dart';
import '../../../presentation/widgets/app_shell.dart';
import '../../../presentation/widgets/primary_button.dart';

class PickupConfirmationScreen extends ConsumerWidget {
  const PickupConfirmationScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final order = ref.watch(orderControllerProvider).activeOrder;

    if (order == null) {
      return const AppShell(
        title: 'Pickup Confirmation',
        body: Center(child: Text('No active order available.')),
      );
    }

    return AppShell(
      title: 'Pickup Confirmation',
      body: ListView(
        children: [
          const SizedBox(height: 12),
          Card(
            child: Padding(
              padding: const EdgeInsets.all(20),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    order.restaurant.name,
                    style: Theme.of(context).textTheme.headlineSmall?.copyWith(
                          fontWeight: FontWeight.w700,
                        ),
                  ),
                  const SizedBox(height: 8),
                  Text(order.restaurant.address),
                  const SizedBox(height: 16),
                  const Text('Confirm the order has been collected from the restaurant.'),
                ],
              ),
            ),
          ),
          const SizedBox(height: 20),
          PrimaryButton(
            label: 'Pickup Order',
            icon: Icons.shopping_bag_outlined,
            onPressed: () async {
              await ref.read(orderControllerProvider.notifier).pickup(order.id);
              if (context.mounted) {
                context.go('/navigation');
              }
            },
          ),
        ],
      ),
    );
  }
}
