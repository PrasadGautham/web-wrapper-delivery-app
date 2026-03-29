import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../core/config/app_defaults.dart';
import '../../../core/di/providers.dart';
import '../../../core/localization/app_localizations.dart';
import '../../../core/utils/formatters.dart';
import '../../../presentation/widgets/app_shell.dart';
import '../../../presentation/widgets/async_state_view.dart';
import '../../../presentation/widgets/metric_card.dart';
import '../../../presentation/widgets/status_chip.dart';

class HomeDashboardScreen extends ConsumerWidget {
  const HomeDashboardScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final l10n = AppLocalizations.of(context);
    final dashboard = ref.watch(dashboardControllerProvider);
    final orders = ref.watch(orderControllerProvider);
    final secondsRemaining = orders.secondsRemaining == null
        ? 0
        : (orders.secondsRemaining! < 0 ? 0 : orders.secondsRemaining!);
    final currencyCode = dashboard.driver?.displayCurrency ?? AppDefaults.tenantCurrencyCode;

    return AppShell(
      title: l10n.text('dashboard'),
      actions: [
        IconButton(
          onPressed: () {
            final current = ref.read(localeProvider);
            ref.read(localeProvider.notifier).state =
                current.languageCode == 'en' ? const Locale('ar') : const Locale('en');
          },
          icon: const Icon(Icons.language),
        ),
        IconButton(
          onPressed: () => context.push('/profile'),
          icon: const Icon(Icons.person_outline),
        ),
      ],
      body: AsyncStateView(
        isLoading: dashboard.isLoading,
        errorMessage: dashboard.errorMessage,
        onRetry: () => ref.read(dashboardControllerProvider.notifier).refresh(),
        child: ListView(
          children: [
            const SizedBox(height: 12),
            Card(
              child: Padding(
                padding: const EdgeInsets.all(20),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Row(
                      mainAxisAlignment: MainAxisAlignment.spaceBetween,
                      children: [
                        Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Text(
                              dashboard.driver?.name ?? 'Driver',
                              style: Theme.of(context).textTheme.headlineSmall?.copyWith(
                                    fontWeight: FontWeight.w700,
                                  ),
                            ),
                            const SizedBox(height: 4),
                            Text(dashboard.driver?.email ?? ''),
                          ],
                        ),
                        StatusChip(
                          label: dashboard.driver?.isOnline == true
                              ? l10n.text('online')
                              : l10n.text('offline'),
                          color: dashboard.driver?.isOnline == true ? Colors.green : Colors.grey,
                        ),
                      ],
                    ),
                    const SizedBox(height: 16),
                    SwitchListTile.adaptive(
                      value: dashboard.driver?.isOnline ?? false,
                      onChanged: (value) =>
                          ref.read(dashboardControllerProvider.notifier).toggleOnline(value),
                      title: Text(
                        dashboard.driver?.isOnline == true
                            ? 'Available to receive orders'
                            : 'Go online to receive new orders',
                      ),
                      contentPadding: EdgeInsets.zero,
                    ),
                  ],
                ),
              ),
            ),
            if (orders.incomingOrder != null) ...[
              const SizedBox(height: 16),
              Card(
                color: Theme.of(context).colorScheme.primaryContainer,
                child: ListTile(
                  title: Text(orders.incomingOrder!.restaurant.name),
                  subtitle: Text(
                    'Incoming delivery request • ${secondsRemaining}s remaining',
                  ),
                  trailing: FilledButton(
                    onPressed: () => context.push('/incoming-order'),
                    child: const Text('Open'),
                  ),
                ),
              ),
            ],
            const SizedBox(height: 16),
            GridView.count(
              crossAxisCount: MediaQuery.of(context).size.width > 700 ? 4 : 2,
              shrinkWrap: true,
              physics: const NeverScrollableScrollPhysics(),
              crossAxisSpacing: 12,
              mainAxisSpacing: 12,
              childAspectRatio: 1.15,
              children: [
                MetricCard(
                  label: l10n.text('todaysEarnings'),
                  value: Formatters.currency(dashboard.earnings?.daily ?? 0, code: currencyCode),
                  icon: Icons.wallet_outlined,
                ),
                MetricCard(
                  label: l10n.text('completedDeliveries'),
                  value: '${dashboard.earnings?.completedDeliveries ?? 0}',
                  icon: Icons.local_shipping_outlined,
                ),
                MetricCard(
                  label: l10n.text('distanceTravelled'),
                  value: Formatters.kilometers(dashboard.earnings?.distanceTravelledKm ?? 0),
                  icon: Icons.route_outlined,
                ),
                MetricCard(
                  label: l10n.text('rating'),
                  value: '${dashboard.driver?.rating.toStringAsFixed(1) ?? '0.0'} / 5',
                  icon: Icons.star_border,
                ),
              ],
            ),
            const SizedBox(height: 16),
            Card(
              child: ListTile(
                title: Text(l10n.text('activeOrder')),
                subtitle: Text(
                  orders.activeOrder == null
                      ? l10n.text('noActiveOrder')
                      : '${orders.activeOrder!.restaurant.name} to ${orders.activeOrder!.customer.address}',
                ),
                trailing: orders.activeOrder == null
                    ? null
                    : FilledButton(
                        onPressed: () => context.push('/navigation'),
                        child: const Text('Open trip'),
                      ),
              ),
            ),
            const SizedBox(height: 12),
            Row(
              children: [
                Expanded(
                  child: OutlinedButton.icon(
                    onPressed: () => context.push('/earnings'),
                    icon: const Icon(Icons.bar_chart),
                    label: Text(l10n.text('earnings')),
                  ),
                ),
              ],
            ),
            const SizedBox(height: 16),
          ],
        ),
      ),
    );
  }
}

