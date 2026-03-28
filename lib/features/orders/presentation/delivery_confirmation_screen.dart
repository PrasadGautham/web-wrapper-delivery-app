import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../core/di/providers.dart';
import '../../../core/utils/formatters.dart';
import '../../../presentation/widgets/app_shell.dart';
import '../../../presentation/widgets/primary_button.dart';

class DeliveryConfirmationScreen extends ConsumerWidget {
  const DeliveryConfirmationScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final order = ref.watch(orderControllerProvider).activeOrder;

    if (order == null) {
      return const AppShell(
        title: 'Delivery Confirmation',
        body: Center(child: Text('No active order available.')),
      );
    }

    return AppShell(
      title: 'Delivery Confirmation',
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
                    order.customer.name,
                    style: Theme.of(context).textTheme.headlineSmall?.copyWith(
                          fontWeight: FontWeight.w700,
                        ),
                  ),
                  const SizedBox(height: 8),
                  Text(order.customer.address),
                  const SizedBox(height: 16),
                  Text('Trip payout: ${Formatters.currency(order.tripEarnings, code: order.displayCurrency)}'),
                  const SizedBox(height: 8),
                  const Text('Confirm the order was delivered successfully.'),
                ],
              ),
            ),
          ),
          const SizedBox(height: 20),
          PrimaryButton(
            label: 'Delivered',
            icon: Icons.check_circle_outline,
            onPressed: () async {
              await ref.read(orderControllerProvider.notifier).deliver();
              await ref.read(backendApiClientProvider).refreshState();
              await ref.read(dashboardControllerProvider.notifier).refresh();
              if (context.mounted) {
                context.go('/home');
              }
            },
          ),
        ],
      ),
    );
  }
}
