import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../app/providers.dart';
import '../../core/theme/tokens.dart';
import '../../core/util/format.dart';
import '../../core/widgets/charts.dart';
import '../../core/widgets/primitives.dart';
import '../../core/widgets/states.dart';
import '../../data/db/app_database.dart';
import '../../domain/catalog.dart';
import '../../domain/dates.dart';
import '../../domain/nutrition/nutrients.dart';
import '../../domain/training/analytics.dart';
import '../workout/workout_providers.dart';
import 'weight_screen.dart';

final _rangeProvider = NotifierProvider<_Range, ChartRange>(_Range.new);

class _Range extends Notifier<ChartRange> {
  @override
  ChartRange build() => ChartRange.quarter;
  void set(ChartRange r) => state = r;
}

final _summaryRowsProvider = FutureProvider<List<WorkoutSummaryRow>>((ref) {
  ref.watch(historyProvider);
  return ref.watch(workoutRepositoryProvider).summaryRows();
});

class _StrengthItem {
  const _StrengthItem(this.exercise, this.trend, this.best);
  final Exercise exercise;
  final List<TrendSample> trend;
  final PersonalRecord? best;
}

final _strengthProvider = FutureProvider<List<_StrengthItem>>((ref) async {
  ref.watch(historyProvider);
  final repo = ref.watch(workoutRepositoryProvider);
  final exercises = await repo.loggedExercises();
  final out = <_StrengthItem>[];
  for (final e in exercises) {
    final t = TrackingType.fromCode(e.trackingType);
    if (!t.usesWeight) continue;
    final sessions = await repo.exerciseHistory(e.id);
    final trend = strengthTrend(sessions);
    if (trend.isEmpty) continue;
    out.add(_StrengthItem(e, trend, personalRecords(sessions).where((p) => p.kind == PrKind.estimatedOneRepMax).firstOrNull));
  }
  out.sort((a, b) => b.trend.last.date.compareTo(a.trend.last.date));
  return out;
});

final _nutritionHistoryProvider = FutureProvider<Map<DateTime, NutrientTotals>>((ref) {
  final today = ref.watch(todayProvider);
  return ref.watch(nutritionRepositoryProvider).dailyTotals(from: addDays(today, -7 * 12), to: today);
});

final _cardioProvider = FutureProvider<List<(DateTime, double)>>((ref) async {
  ref.watch(historyProvider);
  final repo = ref.watch(workoutRepositoryProvider);
  final out = <(DateTime, double)>[];
  for (final e in await repo.loggedExercises()) {
    if (!TrackingType.fromCode(e.trackingType).usesDistance) continue;
    for (final s in await repo.exerciseHistory(e.id)) {
      final km = s.workingSets.fold<double>(0, (a, x) => a + (x.distanceM ?? 0) / 1000);
      if (km > 0) out.add((s.date, km));
    }
  }
  return out;
});

class ProgressScreen extends ConsumerWidget {
  const ProgressScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final range = ref.watch(_rangeProvider);
    final prefs = ref.watch(prefsProvider).value;
    final weeks = (range.days / 7).clamp(4, 52).round();

    return PageScaffold(
      title: 'Progress',
      actions: [IconButton(tooltip: 'Settings', onPressed: () => context.push('/settings'), icon: const Icon(Icons.settings_outlined))],
      slivers: [
        SliverToBoxAdapter(
          child: Padding(
            padding: const EdgeInsets.fromLTRB(Space.gutter, Space.md, Space.gutter, 0),
            child: SegmentedPills<ChartRange>(
              values: const [ChartRange.month, ChartRange.quarter, ChartRange.half, ChartRange.year],
              selected: range == ChartRange.all ? ChartRange.year : range,
              expand: true,
              labelOf: (r) => r.label,
              onChanged: ref.read(_rangeProvider.notifier).set,
            ),
          ),
        ),
        if (prefs?.weightTrackingEnabled ?? true) ...[
          SliverToBoxAdapter(child: SectionHeader('Body weight', action: 'Details', onAction: () => context.go('/progress/weight'))),
          SliverPadding(padding: const EdgeInsets.symmetric(horizontal: Space.gutter), sliver: SliverToBoxAdapter(child: _WeightCard(range: range))),
        ],
        const SliverToBoxAdapter(child: SectionHeader('Training')),
        SliverPadding(
          padding: const EdgeInsets.symmetric(horizontal: Space.gutter),
          sliver: SliverToBoxAdapter(child: _TrainingCards(weeks: weeks, target: prefs?.weeklyWorkoutTarget ?? 3)),
        ),
        const SliverToBoxAdapter(child: SectionHeader('Strength (estimated 1RM)')),
        _StrengthList(range: range),
        if (prefs?.nutritionEnabled ?? true) ...[
          const SliverToBoxAdapter(child: SectionHeader('Nutrition')),
          SliverPadding(
            padding: const EdgeInsets.symmetric(horizontal: Space.gutter),
            sliver: SliverToBoxAdapter(child: _NutritionCard(weeks: weeks.clamp(4, 12), showCalories: prefs?.calorieTrackingEnabled ?? true)),
          ),
        ],
        const SliverToBoxAdapter(child: SectionHeader('Cardio')),
        SliverPadding(padding: const EdgeInsets.symmetric(horizontal: Space.gutter), sliver: SliverToBoxAdapter(child: _CardioCard(range: range))),
        SliverToBoxAdapter(
          child: Padding(
            padding: const EdgeInsets.only(top: Space.lg),
            child: ListTile(
              leading: const Icon(Icons.straighten_rounded),
              title: const Text('Body measurements'),
              subtitle: const Text('Waist, chest, arms, body fat…'),
              trailing: const Icon(Icons.chevron_right_rounded),
              onTap: () => context.go('/progress/measurements'),
            ),
          ),
        ),
      ],
    );
  }
}

class _WeightCard extends ConsumerWidget {
  const _WeightCard({required this.range});
  final ChartRange range;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final trend = ref.watch(weightTrendProvider);
    final units = ref.watch(unitsProvider);
    final c = context.colors;
    if (trend == null) return const LoadingState(compact: true);
    if (trend.isEmpty) {
      return FCard(
        onTap: () => showLogWeight(context, ref),
        child: Row(children: [
          Expanded(child: Text('No weigh-ins yet. Tap to log your weight.', style: context.text.bodyMedium)),
          Icon(Icons.add_rounded, color: c.accent),
        ]),
      );
    }
    final today = ref.watch(todayProvider);
    final pts = [for (final p in trend.points) if (daysBetween(p.day, today) <= range.days) p];
    final change = trend.changeOver(range.days.clamp(7, 365));
    return FCard(
      onTap: () => context.go('/progress/weight'),
      child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        Row(crossAxisAlignment: CrossAxisAlignment.end, children: [
          MetricValue(value: units.weight(trend.latest!.trendKg, unit: false), unit: units.weightLabel),
          const Spacer(),
          if (change != null) Text('${units.delta(change)} · ${range.label}', style: context.text.labelMedium),
        ]),
        const SizedBox(height: Space.md),
        if (pts.length > 1)
          TimeSeriesChart(
            height: 160,
            format: (v) => number(v, maxDecimals: 1),
            series: [
              ChartSeries(color: c.accent, label: 'Trend', points: [for (final p in pts) ChartPoint(p.day, units.toDisplay(p.trendKg))]),
              ChartSeries(color: c.textSecondary, dotsOnly: true, label: 'Scale', points: [for (final p in pts) if (p.scaleKg != null) ChartPoint(p.day, units.toDisplay(p.scaleKg!))]),
            ],
          ),
      ]),
    );
  }
}

class _TrainingCards extends ConsumerWidget {
  const _TrainingCards({required this.weeks, required this.target});
  final int weeks;
  final int target;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final rows = ref.watch(_summaryRowsProvider);
    final units = ref.watch(unitsProvider);
    final c = context.colors;
    return AsyncView(
      value: rows,
      compact: true,
      data: (rows) {
        if (rows.isEmpty) {
          return const FCard(child: Text('Finish a workout to see volume, frequency and muscle balance.'));
        }
        final today = ref.watch(todayProvider);
        final buckets = weeklyBuckets(rows, today: today, weeks: weeks);
        final muscles = setsPerMuscle(rows, today: today).entries.toList()..sort((a, b) => b.value.compareTo(a.value));
        String wk(DateTime d) => '${d.day}/${d.month}';
        final step = (buckets.length / 8).ceil();
        String label(int i) => i % step == 0 ? wk(buckets[i].weekStart) : '';
        return Column(children: [
          FCard(
            child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
              Row(children: [const Eyebrow('Workouts per week'), const Spacer(), Text('Target $target', style: context.text.labelMedium)]),
              const SizedBox(height: Space.lg),
              SimpleBarChart(
                target: target.toDouble(),
                format: (v) => number(v, maxDecimals: 0),
                data: [for (final (i, b) in buckets.indexed) BarDatum(label(i), b.workouts.toDouble(), highlight: b.workouts >= target)],
              ),
            ]),
          ),
          const SizedBox(height: Space.md),
          FCard(
            child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
              const Row(children: [Eyebrow('Weekly volume'), Spacer(), ProvenanceBadge(Provenance.calculated, compact: true)]),
              const SizedBox(height: Space.lg),
              SimpleBarChart(
                color: c.protein,
                format: (v) => units.volume(units.fromDisplay(v)),
                data: [for (final (i, b) in buckets.indexed) BarDatum(label(i), units.toDisplay(b.volumeKg), highlight: true)],
              ),
              const SizedBox(height: Space.sm),
              Text('Load × reps of completed working sets. Bodyweight and cardio work are not included.', style: context.text.bodySmall),
            ]),
          ),
          const SizedBox(height: Space.md),
          FCard(
            child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
              const Eyebrow('Working sets per muscle · last 7 days'),
              const SizedBox(height: Space.md),
              if (muscles.isEmpty) Text('No sets in the last 7 days.', style: context.text.bodyMedium),
              for (final m in muscles.take(10)) ...[
                LabeledBar(label: muscleLabel(m.key), value: m.value.toDouble(), target: 10, unit: ' sets', color: c.accent),
                const SizedBox(height: Space.sm),
              ],
              if (muscles.isNotEmpty) Text('About 10–20 hard sets per muscle per week is a common range for muscle growth.', style: context.text.bodySmall),
            ]),
          ),
        ]);
      },
    );
  }
}

class _StrengthList extends ConsumerWidget {
  const _StrengthList({required this.range});
  final ChartRange range;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final data = ref.watch(_strengthProvider);
    final units = ref.watch(unitsProvider);
    final today = ref.watch(todayProvider);
    return data.when(
      loading: () => const SliverToBoxAdapter(child: LoadingState(compact: true)),
      error: (e, _) => SliverToBoxAdapter(child: ErrorState(message: describeError(e), compact: true)),
      data: (items) => items.isEmpty
          ? const SliverToBoxAdapter(
              child: EmptyState(icon: Icons.show_chart_rounded, title: 'No strength data yet', message: 'Log weighted exercises to see estimated strength trends.', compact: true),
            )
          : SliverList.builder(
              itemCount: items.length,
              itemBuilder: (context, i) {
                final it = items[i];
                final pts = [for (final t in it.trend) if (daysBetween(dateOnly(t.date), today) <= range.days) t.value];
                final change = pts.length > 1 ? pts.last - pts.first : null;
                return ListTile(
                  onTap: () => context.go('/progress/exercise/${it.exercise.id}'),
                  title: Text(it.exercise.name),
                  subtitle: Text(
                    [
                      units.weight(it.trend.last.value),
                      if (change != null) '${units.delta(change)} in ${range.label}',
                      if (it.best != null) 'best ${units.weight(it.best!.value)}',
                    ].join(' · '),
                  ),
                  trailing: SizedBox(width: 72, child: Sparkline(values: pts, height: 28)),
                );
              },
            ),
    );
  }
}

class _NutritionCard extends ConsumerWidget {
  const _NutritionCard({required this.weeks, required this.showCalories});
  final int weeks;
  final bool showCalories;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final data = ref.watch(_nutritionHistoryProvider);
    final c = context.colors;
    return AsyncView(
      value: data,
      compact: true,
      data: (byDay) {
        if (byDay.isEmpty) return const FCard(child: Text('Log food to see daily and weekly averages.'));
        final today = ref.watch(todayProvider);
        final weekStarts = [for (var i = weeks - 1; i >= 0; i--) addDays(startOfWeek(today), -7 * i)];
        final bars = <BarDatum>[];
        final protein = <BarDatum>[];
        for (final (i, ws) in weekStarts.indexed) {
          final days = [for (final e in byDay.entries) if (!e.key.isBefore(ws) && e.key.isBefore(addDays(ws, 7))) e.value];
          final avgK = days.isEmpty ? 0.0 : days.fold<double>(0, (a, t) => a + t.kcal) / days.length;
          final avgP = days.isEmpty ? 0.0 : days.fold<double>(0, (a, t) => a + t.proteinG) / days.length;
          final lbl = i % 2 == 0 ? '${ws.day}/${ws.month}' : '';
          bars.add(BarDatum(lbl, avgK, highlight: days.length >= 4));
          protein.add(BarDatum(lbl, avgP, highlight: days.length >= 4));
        }
        final last7 = [for (final e in byDay.entries) if (daysBetween(e.key, today) < 7) e.value];
        final avg7k = last7.isEmpty ? null : last7.fold<double>(0, (a, t) => a + t.kcal) / last7.length;
        final avg7p = last7.isEmpty ? null : last7.fold<double>(0, (a, t) => a + t.proteinG) / last7.length;
        final incomplete = last7.any((t) => t.isIncomplete);
        return FCard(
          child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
            const Eyebrow('Last 7 days · daily average'),
            const SizedBox(height: Space.sm),
            Row(children: [
              if (showCalories) Expanded(child: MetricValue(value: kcal(avg7k), unit: 'kcal')),
              Expanded(child: MetricValue(value: avg7p == null ? '—' : number(avg7p, maxDecimals: 0), unit: 'g protein', color: c.protein)),
            ]),
            Text('${last7.length} of 7 days logged${incomplete ? ' · some values incomplete' : ''}. Unlogged days are excluded, not counted as zero.', style: context.text.bodySmall),
            const SizedBox(height: Space.lg),
            Eyebrow(showCalories ? 'Weekly average calories' : 'Weekly average protein'),
            const SizedBox(height: Space.md),
            SimpleBarChart(data: showCalories ? bars : protein, color: showCalories ? c.carbs : c.protein, format: (v) => number(v, maxDecimals: 0)),
            const SizedBox(height: Space.xs),
            Text('Faded bars: fewer than 4 days logged that week.', style: context.text.bodySmall),
          ]),
        );
      },
    );
  }
}

class _CardioCard extends ConsumerWidget {
  const _CardioCard({required this.range});
  final ChartRange range;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final data = ref.watch(_cardioProvider);
    final c = context.colors;
    return AsyncView(
      value: data,
      compact: true,
      data: (sessions) {
        final today = ref.watch(todayProvider);
        final inRange = [for (final s in sessions) if (daysBetween(dateOnly(s.$1), today) <= range.days) s]..sort((a, b) => a.$1.compareTo(b.$1));
        if (inRange.isEmpty) return const FCard(child: Text('Log running, cycling or rowing with distance to see cardio progress here.'));
        final total = inRange.fold<double>(0, (a, s) => a + s.$2);
        return FCard(
          child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
            MetricValue(value: number(total, maxDecimals: 1), unit: 'km in ${range.label}'),
            const SizedBox(height: Space.md),
            if (inRange.length > 1)
              TimeSeriesChart(height: 150, series: [ChartSeries(color: c.water, label: 'km', points: [for (final s in inRange) ChartPoint(s.$1, s.$2)])]),
          ]),
        );
      },
    );
  }
}

