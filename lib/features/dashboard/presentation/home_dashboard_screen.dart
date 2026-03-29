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
    final isLoading = ref.watch(dashboardControllerProvider.select((state) => state.isLoading));
    final errorMessage =
        ref.watch(dashboardControllerProvider.select((state) => state.errorMessage));

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
        isLoading: isLoading,
        errorMessage: errorMessage,
        onRetry: () => ref.read(dashboardControllerProvider.notifier).refresh(),
        child: ListView(
          children: const [
            SizedBox(height: 12),
            _DriverStatusCard(),
            _IncomingOrderCard(),
            _MetricsGrid(),
            _ActiveOrderCard(),
            _EarningsButtonRow(),
            SizedBox(height: 16),
          ],
        ),
      ),
    );
  }
}

class _DriverStatusCard extends ConsumerWidget {
  const _DriverStatusCard();

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final driver = ref.watch(dashboardControllerProvider.select((state) => state.driver));
    final l10n = AppLocalizations.of(context);

    return Card(
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
                      driver?.name ?? 'Driver',
                      style: Theme.of(context).textTheme.headlineSmall?.copyWith(
                            fontWeight: FontWeight.w700,
                          ),
                    ),
                    const SizedBox(height: 4),
                    Text(driver?.email ?? ''),
                  ],
                ),
                StatusChip(
                  label: driver?.isOnline == true ? l10n.text('online') : l10n.text('offline'),
                  color: driver?.isOnline == true ? Colors.green : Colors.grey,
                ),
              ],
            ),
            const SizedBox(height: 16),
            SwitchListTile.adaptive(
              value: driver?.isOnline ?? false,
              onChanged: (value) =>
                  ref.read(dashboardControllerProvider.notifier).toggleOnline(value),
              title: Text(
                driver?.isOnline == true
                    ? 'Available to receive orders'
                    : 'Go online to receive new orders',
              ),
              contentPadding: EdgeInsets.zero,
            ),
          ],
        ),
      ),
    );
  }
}

class _IncomingOrderCard extends ConsumerWidget {
  const _IncomingOrderCard();

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final orderState = ref.watch(
      orderControllerProvider.select(
        (state) => (
          incomingOrder: state.incomingOrder,
          secondsRemaining: state.secondsRemaining,
        ),
      ),
    );
    final incomingOrder = orderState.incomingOrder;
    if (incomingOrder == null) {
      return const SizedBox.shrink();
    }
    final secondsRemaining =
        orderState.secondsRemaining == null ? 0 : (orderState.secondsRemaining! < 0 ? 0 : orderState.secondsRemaining!);

    return Padding(
      padding: const EdgeInsets.only(top: 16),
      child: Card(
        color: Theme.of(context).colorScheme.primaryContainer,
        child: ListTile(
          title: Text(incomingOrder.restaurant.name),
          subtitle: Text('Incoming delivery request - ${secondsRemaining}s remaining'),
          trailing: FilledButton(
            onPressed: () => context.push('/incoming-order'),
            child: const Text('Open'),
          ),
        ),
      ),
    );
  }
}

class _MetricsGrid extends ConsumerWidget {
  const _MetricsGrid();

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final dashboard = ref.watch(dashboardControllerProvider);
    final l10n = AppLocalizations.of(context);
    final currencyCode = dashboard.driver?.displayCurrency ?? AppDefaults.tenantCurrencyCode;

    return Padding(
      padding: const EdgeInsets.only(top: 16),
      child: GridView.count(
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
    );
  }
}

class _ActiveOrderCard extends ConsumerWidget {
  const _ActiveOrderCard();

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final activeOrder = ref.watch(orderControllerProvider.select((state) => state.activeOrder));
    final l10n = AppLocalizations.of(context);

    return Padding(
      padding: const EdgeInsets.only(top: 16),
      child: Card(
        child: ListTile(
          title: Text(l10n.text('activeOrder')),
          subtitle: Text(
            activeOrder == null
                ? l10n.text('noActiveOrder')
                : '${activeOrder.restaurant.name} to ${activeOrder.customer.address}${activeOrder.tripOrderCount > 1 ? ' - ${activeOrder.tripOrderCount} orders in this trip' : ''}',
          ),
          trailing: activeOrder == null
              ? null
              : FilledButton(
                  onPressed: () => context.push('/navigation'),
                  child: const Text('Open trip'),
                ),
        ),
      ),
    );
  }
}

class _EarningsButtonRow extends StatelessWidget {
  const _EarningsButtonRow();

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context);

    return Padding(
      padding: const EdgeInsets.only(top: 12),
      child: Row(
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
    );
  }
}
