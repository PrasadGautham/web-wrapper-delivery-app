import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../core/di/providers.dart';
import '../../../core/localization/app_localizations.dart';
import '../../../core/utils/formatters.dart';
import '../../../presentation/widgets/app_shell.dart';
import '../../../presentation/widgets/primary_button.dart';

class IncomingOrderScreen extends ConsumerWidget {
  const IncomingOrderScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final l10n = AppLocalizations.of(context);
    final state = ref.watch(orderControllerProvider);
    final order = state.incomingOrder;

    if (order == null) {
      return AppShell(
        title: l10n.text('incomingOrder'),
        body: const Center(child: Text('No pending order request right now.')),
      );
    }

    return AppShell(
      title: l10n.text('incomingOrder'),
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
                  LinearProgressIndicator(
                    value: ((state.secondsRemaining ?? 0) / 30).clamp(0, 1).toDouble(),
                    minHeight: 12,
                    borderRadius: BorderRadius.circular(99),
                  ),
                  const SizedBox(height: 8),
                  Text('Offer expires in ${state.secondsRemaining ?? 0} seconds'),
                ],
              ),
            ),
          ),
          const SizedBox(height: 16),
          Wrap(
            runSpacing: 12,
            spacing: 12,
            children: [
              _InfoTile(label: 'Delivery area', value: order.deliveryArea),
              _InfoTile(label: 'Distance shown', value: order.driverDisplayMode == 'includeCommuteToStore' ? 'Commute to store + delivery' : 'Store to customer only'),
              _InfoTile(label: l10n.text('distance'), value: Formatters.distance(order.driverDisplayDistanceKm, unit: order.driverDisplayDistanceUnit)),
              _InfoTile(label: l10n.text('eta'), value: '${order.driverDisplayMinutes} min'),
              _InfoTile(
                label: l10n.text('earningsTrip'),
                value: Formatters.currency(order.tripEarnings, code: order.displayCurrency),
              ),
            ],
          ),
          const SizedBox(height: 24),
          Row(
            children: [
              Expanded(
                child: OutlinedButton.icon(
                  onPressed: () async {
                    await ref.read(orderControllerProvider.notifier).reject();
                    if (context.mounted) {
                      context.pop();
                    }
                  },
                  icon: const Icon(Icons.close),
                  label: Text(l10n.text('reject')),
                ),
              ),
              const SizedBox(width: 12),
              Expanded(
                child: PrimaryButton(
                  label: l10n.text('accept'),
                  icon: Icons.check_circle_outline,
                  onPressed: () async {
                    final accepted = await ref.read(orderControllerProvider.notifier).accept();
                    if (accepted && context.mounted) {
                      context.go('/navigation');
                    }
                  },
                ),
              ),
            ],
          ),
        ],
      ),
    );
  }
}

class _InfoTile extends StatelessWidget {
  const _InfoTile({required this.label, required this.value});

  final String label;
  final String value;

  @override
  Widget build(BuildContext context) {
    return SizedBox(
      width: 170,
      child: Card(
        child: Padding(
          padding: const EdgeInsets.all(16),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(label, style: Theme.of(context).textTheme.bodySmall),
              const SizedBox(height: 8),
              Text(
                value,
                style: Theme.of(context).textTheme.titleMedium?.copyWith(
                      fontWeight: FontWeight.w700,
                    ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
