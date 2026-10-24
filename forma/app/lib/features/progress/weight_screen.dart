import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../app/providers.dart';
import '../../core/theme/tokens.dart';
import '../../core/util/format.dart';
import '../../core/widgets/charts.dart';
import '../../core/widgets/inputs.dart';
import '../../core/widgets/primitives.dart';
import '../../core/widgets/states.dart';
import '../../data/db/app_database.dart';
import '../../data/repositories/body_repository.dart';
import '../../domain/body/weight_trend.dart';
import '../../domain/dates.dart';

final weightsProvider = StreamProvider<List<BodyWeight>>((ref) => ref.watch(bodyRepositoryProvider).watchWeights());
final weightTrendProvider = Provider<WeightTrend?>((ref) {
  final rows = ref.watch(weightsProvider).value;
  return rows == null ? null : BodyRepository.trendOf(rows);
});

/// Prompts for a weigh-in and saves it.
Future<void> showLogWeight(BuildContext context, WidgetRef ref, {BodyWeight? existing}) async {
  final units = ref.read(unitsProvider);
  final last = ref.read(weightTrendProvider)?.latest?.scaleKg;
  final controller = TextEditingController(
    text: existing != null ? number(units.toDisplay(existing.weightKg), maxDecimals: 2) : (last == null ? '' : number(units.toDisplay(last), maxDecimals: 1)),
  );
  var day = existing == null ? DateTime.now() : parseDayKey(existing.date);
  final saved = await showModalBottomSheet<bool>(
    context: context,
    isScrollControlled: true,
    useSafeArea: true,
    builder: (c) => StatefulBuilder(
      builder: (c, setState) => Padding(
        padding: EdgeInsets.only(bottom: MediaQuery.viewInsetsOf(c).bottom),
        child: Padding(
          padding: const EdgeInsets.fromLTRB(Space.gutter, 0, Space.gutter, Space.xl),
          child: Column(mainAxisSize: MainAxisSize.min, crossAxisAlignment: CrossAxisAlignment.stretch, children: [
            Text(existing == null ? 'Log weight' : 'Edit weigh-in', style: c.text.titleLarge),
            const SizedBox(height: Space.lg),
            NumberField(controller: controller, label: 'Weight', unit: units.weightLabel, autofocus: true),
            const SizedBox(height: Space.sm),
            if (existing == null)
              TextButton.icon(
                onPressed: () async {
                  final picked = await showDatePicker(context: c, initialDate: day, firstDate: DateTime(2000), lastDate: DateTime.now());
                  if (picked != null) setState(() => day = picked);
                },
                icon: const Icon(Icons.calendar_today_outlined, size: 18),
                label: Text(relativeDay(day)),
              ),
            Text('For a consistent trend, weigh yourself in the morning after the bathroom, before eating.', style: c.text.bodySmall),
            const SizedBox(height: Space.lg),
            Row(children: [
              if (existing != null)
                TextButton(
                  onPressed: () async {
                    await ref.read(bodyRepositoryProvider).deleteWeight(existing.id);
                    if (c.mounted) Navigator.pop(c, false);
                  },
                  style: TextButton.styleFrom(foregroundColor: c.colors.negative),
                  child: const Text('Delete'),
                ),
              const Spacer(),
              FilledButton(onPressed: () => Navigator.pop(c, true), child: const Text('Save')),
            ]),
          ]),
        ),
      ),
    ),
  );
  final v = parseNumber(controller.text);
  controller.dispose();
  if (saved != true || v == null) return;
  final kg = units.fromDisplay(v);
  if (kg < 25 || kg > 350) {
    if (context.mounted) ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('That weight looks out of range — not saved.')));
    return;
  }
  final repo = ref.read(bodyRepositoryProvider);
  if (existing != null) {
    await repo.updateWeight(existing.id, kg);
  } else {
    final now = DateTime.now();
    await repo.addWeight(kg, at: dateOnly(day) == dateOnly(now) ? now : DateTime(day.year, day.month, day.day, 8));
  }
}

class WeightScreen extends ConsumerStatefulWidget {
  const WeightScreen({super.key});

  @override
  ConsumerState<WeightScreen> createState() => _WeightScreenState();
}

class _WeightScreenState extends ConsumerState<WeightScreen> {
  ChartRange _range = ChartRange.quarter;

  @override
  Widget build(BuildContext context) {
    final rows = ref.watch(weightsProvider);
    final units = ref.watch(unitsProvider);
    final goals = ref.watch(goalsProvider).value ?? const [];
    final goal = goals.where((g) => g.kind == 'target_weight').firstOrNull;
    final c = context.colors;

    return PageScaffold(
      showBack: true,
      title: 'Body weight',
      floating: FloatingActionButton.extended(
        onPressed: () => showLogWeight(context, ref),
        icon: const Icon(Icons.add_rounded),
        label: const Text('Log weight'),
      ),
      slivers: [
        ...rows.when(
          loading: () => [const SliverToBoxAdapter(child: LoadingState())],
          error: (e, _) => [SliverToBoxAdapter(child: ErrorState(message: describeError(e)))],
          data: (list) {
            if (list.isEmpty) {
              return [
                const SliverToBoxAdapter(
                  child: EmptyState(
                    icon: Icons.monitor_weight_outlined,
                    title: 'No weigh-ins yet',
                    message: 'Log your weight a few times a week. Forma smooths daily swings into a trend you can trust.',
                  ),
                ),
              ];
            }
            final trend = BodyRepository.trendOf(list);
            final latest = trend.latest!;
            final today = ref.watch(todayProvider);
            final visible = [for (final p in trend.points) if (daysBetween(p.day, today) <= _range.days) p];
            final week = trend.changeOver(7);
            final month = trend.changeOver(30);
            return [
              SliverPadding(
                padding: const EdgeInsets.fromLTRB(Space.gutter, Space.md, Space.gutter, 0),
                sliver: SliverToBoxAdapter(
                  child: FCard(
                    child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                      const Row(children: [
                        Eyebrow('Trend weight'),
                        Spacer(),
                        ProvenanceBadge(Provenance.calculated, compact: true),
                      ]),
                      const SizedBox(height: Space.xs),
                      MetricValue(value: units.weight(latest.trendKg, unit: false), unit: units.weightLabel, style: context.text.displayMedium),
                      const SizedBox(height: Space.md),
                      Row(children: [
                        Expanded(child: _Change(label: '7 days', kg: week, units: units)),
                        Expanded(child: _Change(label: '30 days', kg: month, units: units)),
                        if (goal != null) Expanded(child: _Stat(label: 'Goal', value: units.weight(goal.targetValue))),
                      ]),
                      const SizedBox(height: Space.xl),
                      Align(
                        alignment: Alignment.centerRight,
                        child: SegmentedPills<ChartRange>(values: ChartRange.values, selected: _range, labelOf: (r) => r.label, onChanged: (r) => setState(() => _range = r)),
                      ),
                      const SizedBox(height: Space.lg),
                      TimeSeriesChart(
                        height: 240,
                        target: goal == null ? null : units.toDisplay(goal.targetValue),
                        format: (v) => number(v, maxDecimals: 1),
                        series: [
                          ChartSeries(
                            label: 'Trend',
                            color: c.accent,
                            points: [for (final p in visible) ChartPoint(p.day, units.toDisplay(p.trendKg))],
                          ),
                          ChartSeries(
                            label: 'Scale',
                            color: c.textSecondary,
                            dotsOnly: true,
                            points: [for (final p in visible) if (p.scaleKg != null) ChartPoint(p.day, units.toDisplay(p.scaleKg!))],
                          ),
                        ],
                      ),
                      const SizedBox(height: Space.sm),
                      Text('Dots are scale readings; the line is the smoothed trend. Day-to-day changes are mostly water and food.', style: context.text.bodySmall),
                    ]),
                  ),
                ),
              ),
              SliverToBoxAdapter(child: SectionHeader('Goal', action: goal == null ? 'Set' : 'Change', onAction: () => _setGoal(context, goal?.targetValue))),
              if (goal != null)
                SliverToBoxAdapter(
                  child: ListTile(
                    title: Text('Target ${units.weight(goal.targetValue)}'),
                    subtitle: Text('${units.delta(goal.targetValue - latest.trendKg)} from your current trend'),
                    trailing: TextButton(onPressed: () => ref.read(settingsRepositoryProvider).clearGoal('target_weight'), child: const Text('Remove')),
                  ),
                ),
              const SliverToBoxAdapter(child: SectionHeader('Weigh-ins')),
              SliverList.builder(
                itemCount: list.length,
                itemBuilder: (context, i) {
                  final w = list[list.length - 1 - i];
                  final imported = w.source == 'imported';
                  return ListTile(
                    onTap: imported ? null : () => showLogWeight(context, ref, existing: w),
                    title: Text(units.weight(w.weightKg)),
                    subtitle: Text(relativeDay(parseDayKey(w.date))),
                    trailing: ProvenanceBadge(imported ? Provenance.imported : Provenance.recorded, compact: true),
                  );
                },
              ),
            ];
          },
        ),
      ],
    );
  }

  Future<void> _setGoal(BuildContext context, double? current) async {
    final units = ref.read(unitsProvider);
    final controller = TextEditingController(text: current == null ? '' : number(units.toDisplay(current)));
    final v = await showDialog<double>(
      context: context,
      builder: (c) => AlertDialog(
        title: const Text('Goal weight'),
        content: NumberField(controller: controller, label: 'Goal', unit: units.weightLabel, autofocus: true),
        actions: [
          TextButton(onPressed: () => Navigator.pop(c), child: const Text('Cancel')),
          FilledButton(onPressed: () => Navigator.pop(c, parseNumber(controller.text)), child: const Text('Save')),
        ],
      ),
    );
    controller.dispose();
    if (v == null) return;
    final kg = units.fromDisplay(v);
    final profile = await ref.read(settingsRepositoryProvider).profile();
    final h = profile.heightCm;
    if (h != null && kg / ((h / 100) * (h / 100)) < 18.5 && context.mounted) {
      await showDialog<void>(
        context: context,
        builder: (c) => AlertDialog(
          title: const Text('Goal below a healthy range'),
          content: const Text(
            'That goal corresponds to a BMI under 18.5, which is considered underweight. Forma won\'t set a target there. '
            'If you\'re unsure what is right for you, a doctor or registered dietitian can help.',
          ),
          actions: [FilledButton(onPressed: () => Navigator.pop(c), child: const Text('OK'))],
        ),
      );
      return;
    }
    await ref.read(settingsRepositoryProvider).setGoal(kind: 'target_weight', targetValue: kg, unit: 'kg');
  }
}

class _Change extends StatelessWidget {
  const _Change({required this.label, required this.kg, required this.units});
  final String label;
  final double? kg;
  final Units units;

  @override
  Widget build(BuildContext context) => _Stat(label: label, value: kg == null ? 'Not enough data' : units.delta(kg!));
}

class _Stat extends StatelessWidget {
  const _Stat({required this.label, required this.value});
  final String label;
  final String value;

  @override
  Widget build(BuildContext context) => Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        Eyebrow(label),
        const SizedBox(height: 2),
        Text(value, style: value.startsWith('Not') ? context.text.bodySmall : context.text.titleSmall),
      ]);
}
