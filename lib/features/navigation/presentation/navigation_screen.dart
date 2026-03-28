import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:url_launcher/url_launcher.dart';

import '../../../core/di/providers.dart';
import '../../../core/localization/app_localizations.dart';
import '../../../core/utils/formatters.dart';
import '../../../domain/entities/order.dart';
import '../../../presentation/widgets/app_shell.dart';
import '../../../presentation/widgets/primary_button.dart';
import '../../../presentation/widgets/status_chip.dart';

class NavigationScreen extends ConsumerWidget {
  const NavigationScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final l10n = AppLocalizations.of(context);
    final state = ref.watch(orderControllerProvider);
    final order = state.activeOrder;

    if (order == null) {
      return AppShell(
        title: 'Navigation',
        body: const Center(child: Text('Accept an order to start navigation.')),
      );
    }

    final toCustomer =
        order.status == OrderStatus.pickedUp || order.status == OrderStatus.delivering;
    final target = toCustomer ? order.customer : order.restaurant;

    return AppShell(
      title: 'Navigation',
      body: ListView(
        children: [
          const SizedBox(height: 12),
          Container(
            height: 260,
            decoration: BoxDecoration(
              borderRadius: BorderRadius.circular(24),
              gradient: LinearGradient(
                colors: [
                  Theme.of(context).colorScheme.primaryContainer,
                  Theme.of(context).colorScheme.surfaceContainerHighest,
                ],
                begin: Alignment.topLeft,
                end: Alignment.bottomRight,
              ),
            ),
            child: Padding(
              padding: const EdgeInsets.all(24),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Icon(
                    toCustomer ? Icons.location_on_outlined : Icons.storefront_outlined,
                    size: 40,
                  ),
                  const Spacer(),
                  Text(
                    toCustomer ? 'Navigate to customer' : 'Navigate to restaurant',
                    style: Theme.of(context).textTheme.headlineSmall?.copyWith(
                          fontWeight: FontWeight.w800,
                        ),
                  ),
                  const SizedBox(height: 8),
                  Text(target.address, style: Theme.of(context).textTheme.bodyLarge),
                  const SizedBox(height: 20),
                  FilledButton.icon(
                    onPressed: () => _openGoogleMaps(target),
                    icon: const Icon(Icons.map_outlined),
                    label: const Text('Open route in Google Maps'),
                  ),
                ],
              ),
            ),
          ),
          const SizedBox(height: 16),
          Card(
            child: Padding(
              padding: const EdgeInsets.all(20),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Row(
                    mainAxisAlignment: MainAxisAlignment.spaceBetween,
                    children: [
                      Text(
                        target.name,
                        style: Theme.of(context).textTheme.titleLarge?.copyWith(
                              fontWeight: FontWeight.w700,
                            ),
                      ),
                      StatusChip(
                        label: order.status.name,
                        color: Theme.of(context).colorScheme.primary,
                      ),
                    ],
                  ),
                  const SizedBox(height: 8),
                  Text(target.address),
                  const SizedBox(height: 16),
                  Row(
                    mainAxisAlignment: MainAxisAlignment.spaceBetween,
                    children: [
                      _Metric(label: l10n.text('distance'), value: Formatters.kilometers(order.driverDisplayDistanceKm)),
                      _Metric(label: l10n.text('eta'), value: '${order.driverDisplayMinutes} min'),
                      _Metric(label: l10n.text('earningsTrip'), value: Formatters.currency(order.tripEarnings)),
                    ],
                  ),
                ],
              ),
            ),
          ),
          const SizedBox(height: 16),
          Card(
            child: Padding(
              padding: const EdgeInsets.all(20),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    'Trip summary',
                    style: Theme.of(context).textTheme.titleLarge?.copyWith(
                          fontWeight: FontWeight.w700,
                        ),
                  ),
                  const SizedBox(height: 8),
                  Text(
                    order.driverDisplayMode == 'includeCommuteToStore'
                        ? 'This offer view includes your commute to the pickup store and the delivery leg.'
                        : 'This offer view shows only the delivery leg from the store to the customer.',
                  ),
                ],
              ),
            ),
          ),
          const SizedBox(height: 16),
          if (order.status == OrderStatus.accepted) ...[
            PrimaryButton(
              label: l10n.text('arrivedAtRestaurant'),
              icon: Icons.store_mall_directory_outlined,
              onPressed: () => ref.read(orderControllerProvider.notifier).markArrivedAtRestaurant(),
            ),
          ] else if (order.status == OrderStatus.atRestaurant) ...[
            PrimaryButton(
              label: l10n.text('pickupOrder'),
              icon: Icons.shopping_bag_outlined,
              onPressed: () => context.push('/pickup-confirmation'),
            ),
          ] else if (order.status == OrderStatus.pickedUp) ...[
            PrimaryButton(
              label: l10n.text('deliverOrder'),
              icon: Icons.check_circle_outline,
              onPressed: () => context.push('/delivery-confirmation'),
            ),
          ],
          const SizedBox(height: 16),
        ],
      ),
    );
  }

  Future<void> _openGoogleMaps(OrderLocation target) async {
    final uri = Uri.parse(
      'https://www.google.com/maps/dir/?api=1&destination=${target.latitude},${target.longitude}&travelmode=driving',
    );
    await launchUrl(uri, mode: LaunchMode.externalApplication);
  }
}

class _Metric extends StatelessWidget {
  const _Metric({required this.label, required this.value});

  final String label;
  final String value;

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(label, style: Theme.of(context).textTheme.bodySmall),
        const SizedBox(height: 4),
        Text(
          value,
          style: Theme.of(context).textTheme.titleMedium?.copyWith(fontWeight: FontWeight.w700),
        ),
      ],
    );
  }
}
