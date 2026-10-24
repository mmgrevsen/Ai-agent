import 'package:collection/collection.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../app/providers.dart';
import '../../core/theme/tokens.dart';
import '../../core/util/format.dart';
import '../../core/widgets/charts.dart';
import '../../core/widgets/inputs.dart';
import '../../core/widgets/primitives.dart';
import '../../core/widgets/prompts.dart';
import '../../core/widgets/states.dart';
import '../../data/repositories/body_repository.dart';
import '../../domain/dates.dart';

final measurementsProvider = StreamProvider((ref) => ref.watch(bodyRepositoryProvider).watchMeasurements());

class MeasurementsScreen extends ConsumerStatefulWidget {
  const MeasurementsScreen({super.key});

  @override
  ConsumerState<MeasurementsScreen> createState() => _MeasurementsScreenState();
}

class _MeasurementsScreenState extends ConsumerState<MeasurementsScreen> {
  String _kind = 'waist';

  Future<void> _add() async {
    final (label, unit) = measurementKinds[_kind]!;
    final v = await promptNumber(context, title: 'Log $label', label: label, unit: unit);
    if (v == null || v <= 0 || (unit == '%' && v > 75) || (unit == 'cm' && v > 250)) return;
    await ref.read(bodyRepositoryProvider).addMeasurement(_kind, v);
  }

  @override
  Widget build(BuildContext context) {
    final data = ref.watch(measurementsProvider);
    final c = context.colors;
    return PageScaffold(
      showBack: true,
      title: 'Measurements',
      floating: FloatingActionButton.extended(onPressed: _add, icon: const Icon(Icons.add_rounded), label: Text('Log ${measurementKinds[_kind]!.$1.toLowerCase()}')),
      slivers: [
        SliverToBoxAdapter(
          child: SizedBox(
            height: 52,
            child: ListView(
              scrollDirection: Axis.horizontal,
              padding: const EdgeInsets.symmetric(horizontal: Space.gutter, vertical: Space.sm),
              children: [
                for (final k in measurementKinds.entries) ...[
                  ToggleChip(label: k.value.$1, selected: _kind == k.key, onTap: () => setState(() => _kind = k.key)),
                  const SizedBox(width: Space.sm),
                ],
              ],
            ),
          ),
        ),
        ...data.when(
          loading: () => [const SliverToBoxAdapter(child: LoadingState())],
          error: (e, _) => [SliverToBoxAdapter(child: ErrorState(message: describeError(e)))],
          data: (all) {
            final rows = all.where((m) => m.kind == _kind).sortedBy((m) => m.date);
            final (label, unit) = measurementKinds[_kind]!;
            if (rows.isEmpty) {
              return [
                SliverToBoxAdapter(
                  child: EmptyState(
                    icon: Icons.straighten_rounded,
                    title: 'No $label measurements',
                    message: 'Measurements are optional. Tracking waist alongside weight can show changes the scale misses.',
                  ),
                ),
              ];
            }
            final change = rows.length > 1 ? rows.last.value - rows.first.value : null;
            return [
              SliverPadding(
                padding: const EdgeInsets.all(Space.gutter),
                sliver: SliverToBoxAdapter(
                  child: FCard(
                    child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                      Eyebrow(label),
                      MetricValue(value: number(rows.last.value), unit: unit),
                      if (change != null)
                        Text('${change >= 0 ? '+' : '−'}${number(change.abs())} $unit since ${shortDate(parseDayKey(rows.first.date))}', style: context.text.bodySmall),
                      if (rows.length > 1) ...[
                        const SizedBox(height: Space.lg),
                        TimeSeriesChart(series: [ChartSeries(points: [for (final r in rows) ChartPoint(parseDayKey(r.date), r.value)], color: c.accent)]),
                      ],
                    ]),
                  ),
                ),
              ),
              SliverList.builder(
                itemCount: rows.length,
                itemBuilder: (context, i) {
                  final m = rows[rows.length - 1 - i];
                  return ListTile(
                    title: Text('${number(m.value)} $unit'),
                    subtitle: Text(relativeDay(parseDayKey(m.date))),
                    trailing: IconButton(tooltip: 'Delete', icon: const Icon(Icons.delete_outline_rounded), onPressed: () => ref.read(bodyRepositoryProvider).deleteMeasurement(m.id)),
                  );
                },
              ),
            ];
          },
        ),
      ],
    );
  }
}
