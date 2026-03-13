import 'package:fl_chart/fl_chart.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/di/providers.dart';
import '../../../core/localization/app_localizations.dart';
import '../../../core/utils/formatters.dart';
import '../../../presentation/widgets/app_shell.dart';
import '../../../presentation/widgets/async_state_view.dart';
import '../../../presentation/widgets/metric_card.dart';

class EarningsScreen extends ConsumerWidget {
  const EarningsScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final l10n = AppLocalizations.of(context);
    final state = ref.watch(dashboardControllerProvider);
    final earnings = state.earnings;

    return AppShell(
      title: l10n.text('earnings'),
      body: AsyncStateView(
        isLoading: state.isLoading,
        errorMessage: state.errorMessage,
        onRetry: () => ref.read(dashboardControllerProvider.notifier).refresh(),
        child: ListView(
          children: [
            const SizedBox(height: 12),
            GridView.count(
              crossAxisCount: MediaQuery.of(context).size.width > 700 ? 3 : 2,
              crossAxisSpacing: 12,
              mainAxisSpacing: 12,
              shrinkWrap: true,
              physics: const NeverScrollableScrollPhysics(),
              childAspectRatio: 1.2,
              children: [
                MetricCard(
                  label: l10n.text('dailyEarnings'),
                  value: Formatters.currency(earnings?.daily ?? 0),
                  icon: Icons.today,
                ),
                MetricCard(
                  label: l10n.text('weeklyEarnings'),
                  value: Formatters.currency(earnings?.weekly ?? 0),
                  icon: Icons.calendar_view_week_outlined,
                ),
                MetricCard(
                  label: l10n.text('totalEarnings'),
                  value: Formatters.currency(earnings?.total ?? 0),
                  icon: Icons.savings_outlined,
                ),
                MetricCard(
                  label: l10n.text('completedDeliveries'),
                  value: '${earnings?.completedDeliveries ?? 0}',
                  icon: Icons.task_alt_outlined,
                ),
                MetricCard(
                  label: l10n.text('distanceTravelled'),
                  value: Formatters.kilometers(earnings?.distanceTravelledKm ?? 0),
                  icon: Icons.route_outlined,
                ),
              ],
            ),
            const SizedBox(height: 16),
            Card(
              child: Padding(
                padding: const EdgeInsets.all(20),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      'Weekly performance',
                      style: Theme.of(context).textTheme.titleLarge?.copyWith(
                            fontWeight: FontWeight.w700,
                          ),
                    ),
                    const SizedBox(height: 20),
                    SizedBox(
                      height: 240,
                      child: BarChart(
                        BarChartData(
                          gridData: const FlGridData(show: false),
                          titlesData: FlTitlesData(
                            rightTitles: const AxisTitles(),
                            topTitles: const AxisTitles(),
                            leftTitles: const AxisTitles(),
                            bottomTitles: AxisTitles(
                              sideTitles: SideTitles(
                                showTitles: true,
                                getTitlesWidget: (value, meta) {
                                  final index = value.toInt();
                                  final points = earnings?.points ?? [];
                                  if (index < 0 || index >= points.length) {
                                    return const SizedBox.shrink();
                                  }
                                  return Text(points[index].label);
                                },
                              ),
                            ),
                          ),
                          borderData: FlBorderData(show: false),
                          barGroups: [
                            for (var i = 0; i < (earnings?.points.length ?? 0); i++)
                              BarChartGroupData(
                                x: i,
                                barRods: [
                                  BarChartRodData(
                                    toY: earnings!.points[i].amount,
                                    borderRadius: BorderRadius.circular(8),
                                    width: 18,
                                    color: Theme.of(context).colorScheme.primary,
                                  ),
                                ],
                              ),
                          ],
                        ),
                      ),
                    ),
                  ],
                ),
              ),
            ),
            const SizedBox(height: 16),
          ],
        ),
      ),
    );
  }
}
