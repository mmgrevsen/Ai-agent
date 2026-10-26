import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../app/providers.dart';
import '../../content/content_providers.dart';
import '../../core/theme/tokens.dart';
import '../../core/util/format.dart';
import '../../core/widgets/primitives.dart';
import '../../core/widgets/states.dart';
import '../../data/repositories/settings_repository.dart';
import '../../domain/dates.dart';
import '../../domain/recovery/recovery.dart';
import '../../domain/training/analytics.dart';
import '../../services/insights_service.dart';
import '../coach/coach_providers.dart';
import '../health/health_providers.dart';
import '../nutrition/nutrition_providers.dart';
import '../nutrition/nutrition_screen.dart' show DaySummaryCard;
import '../progress/weight_screen.dart';
import '../workout/plan_widgets.dart';
import '../workout/workout_home_screen.dart' show startWorkout;
import '../workout/workout_providers.dart';

/// Dashboard cards the user can show, hide and reorder.
enum DashboardCard {
  workout('Today\'s workout'),
  nutrition('Nutrition'),
  weight('Weight trend'),
  recovery('Recovery'),
  consistency('Weekly consistency'),
  insights('Recommendations');

  const DashboardCard(this.label);
  final String label;
}

final _weekRowsProvider = FutureProvider<List<WorkoutSummaryRow>>((ref) {
  ref.watch(historyProvider);
  return ref.watch(workoutRepositoryProvider).summaryRows(since: addDays(ref.watch(todayProvider), -70));
});

class OverviewScreen extends ConsumerWidget {
  const OverviewScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final prefs = ref.watch(prefsProvider).value;
    final profile = ref.watch(profileProvider).value;
    final today = ref.watch(todayProvider);
    final names = prefs == null ? DashboardCard.values.map((c) => c.name).toList() : SettingsRepository.dashboardCardsOf(prefs);
    final cards = [
      for (final n in names)
        ?DashboardCard.values.where((c) => c.name == n).firstOrNull,
    ].where((c) {
      if (prefs == null) return true;
      return switch (c) {
        DashboardCard.nutrition => prefs.nutritionEnabled,
        DashboardCard.weight => prefs.weightTrackingEnabled,
        _ => true,
      };
    }).toList();

    final hour = DateTime.now().hour;
    final greeting = hour < 5 ? 'Good night' : hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening';

    return PageScaffold(
      subtitle: relativeDay(today) == 'Today' ? weekdayLong(today.weekday) : relativeDay(today),
      title: profile?.displayName == null ? greeting : '$greeting, ${profile!.displayName}',
      actions: [
        IconButton(tooltip: 'Customise', onPressed: () => context.push('/settings/dashboard'), icon: const Icon(Icons.tune_rounded)),
        IconButton(tooltip: 'Settings', onPressed: () => context.push('/settings'), icon: const Icon(Icons.settings_outlined)),
      ],
      slivers: [
        const SliverToBoxAdapter(child: AnnouncementCard()),
        if (cards.isEmpty)
          SliverToBoxAdapter(
            child: EmptyState(
              icon: Icons.dashboard_customize_outlined,
              title: 'Your dashboard is empty',
              message: 'Choose which cards to show.',
              actionLabel: 'Customise',
              onAction: () => context.push('/settings/dashboard'),
            ),
          ),
        for (final card in cards)
          SliverPadding(
            padding: const EdgeInsets.fromLTRB(Space.gutter, Space.md, Space.gutter, 0),
            sliver: SliverToBoxAdapter(
              child: switch (card) {
                DashboardCard.workout => const _WorkoutCard(),
                DashboardCard.nutrition => const _NutritionCard(),
                DashboardCard.weight => const _WeightCard(),
                DashboardCard.recovery => const _RecoveryCard(),
                DashboardCard.consistency => const _ConsistencyCard(),
                DashboardCard.insights => const _InsightsCard(),
              },
            ),
          ),
      ],
    );
  }
}

class _WorkoutCard extends ConsumerWidget {
  const _WorkoutCard();

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final c = context.colors;
    final active = ref.watch(activeWorkoutProvider).value;
    final template = ref.watch(todaysTemplateProvider);
    final history = ref.watch(historyProvider).value ?? const [];
    final today = ref.watch(todayProvider);
    final doneToday = [for (final h in history) if (dateOnly(h.workout.startedAt.toLocal()) == today) h];

    if (active != null) {
      return FCard(
        borderColor: c.accent,
        onTap: () => context.push('/session/${active.id}'),
        child: Row(children: [
          Expanded(
            child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
              Eyebrow('In progress', color: c.accent),
              const SizedBox(height: Space.xs),
              Text(active.name, style: context.text.titleLarge),
            ]),
          ),
          FilledButton(onPressed: () => context.push('/session/${active.id}'), child: const Text('Resume')),
        ]),
      );
    }
    if (doneToday.isNotEmpty) {
      final w = doneToday.first;
      return FCard(
        onTap: () => context.push('/session/${w.workout.id}'),
        child: Row(children: [
          Icon(Icons.check_circle_rounded, color: c.positive),
          const SizedBox(width: Space.md),
          Expanded(
            child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
              const Eyebrow('Done today'),
              Text(w.workout.name, style: context.text.titleMedium),
              Text('${w.setCount} sets · ${ref.watch(unitsProvider).volume(w.volumeKg)}', style: context.text.bodySmall),
            ]),
          ),
        ]),
      );
    }
    if (template == null) {
      return FCard(
        onTap: () => context.go('/workout'),
        child: Row(children: [
          Expanded(
            child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
              const Eyebrow('Today'),
              Text('Rest day', style: context.text.titleLarge),
              Text('No workout scheduled. Recovery days help you progress.', style: context.text.bodySmall),
            ]),
          ),
          const Icon(Icons.chevron_right_rounded),
        ]),
      );
    }
    return FCard(
      child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        Eyebrow('Today\'s workout', color: c.accent),
        const SizedBox(height: Space.xs),
        Text(template.template.name, style: context.text.headlineMedium),
        const SizedBox(height: Space.xs),
        const SizedBox(height: Space.sm),
        for (final item in template.items.take(4)) PlanExerciseRow(item, dense: true),
        if (template.items.length > 4)
          Text('+ ${template.items.length - 4} more', style: context.text.labelSmall?.copyWith(color: c.textSecondary)),
        const SizedBox(height: Space.lg),
        SizedBox(
          width: double.infinity,
          child: FilledButton.icon(
            onPressed: () => startWorkout(context, ref, templateId: template.template.id),
            icon: const Icon(Icons.play_arrow_rounded),
            label: const Text('Start'),
          ),
        ),
      ]),
    );
  }
}

class _NutritionCard extends ConsumerWidget {
  const _NutritionCard();

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final today = ref.watch(todayProvider);
    final log = ref.watch(dayLogProvider(today));
    final target = ref.watch(targetForDayProvider(today)).value;
    final prefs = ref.watch(prefsProvider).value;
    return AsyncView(
      value: log,
      compact: true,
      data: (log) => log.entries.isEmpty
          ? FCard(
              onTap: () => context.go('/nutrition'),
              child: Row(children: [
                Expanded(
                  child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                    const Eyebrow('Nutrition'),
                    Text('Nothing logged today', style: context.text.titleMedium),
                    if (target?.kcal != null && (prefs?.calorieTrackingEnabled ?? true))
                      Text('Target ${kcal(target!.kcal)} kcal · ${number(target.proteinG ?? 0, maxDecimals: 0)} g protein', style: context.text.bodySmall),
                  ]),
                ),
                FilledButton.tonal(onPressed: () => context.go('/nutrition/add'), child: const Text('Log food')),
              ]),
            )
          : DaySummaryCard(log: log, target: target, showCalories: prefs?.calorieTrackingEnabled ?? true, onTap: () => context.go('/nutrition')),
    );
  }
}

class _WeightCard extends ConsumerWidget {
  const _WeightCard();

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final trend = ref.watch(weightTrendProvider);
    final units = ref.watch(unitsProvider);
    final c = context.colors;
    if (trend == null) return const LoadingState(compact: true);
    final latest = trend.latest;
    final change = trend.changeOver(7);
    final last30 = trend.points.length > 30 ? trend.points.sublist(trend.points.length - 30) : trend.points;
    return FCard(
      onTap: () => context.go('/progress/weight'),
      child: Row(children: [
        Expanded(
          child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
            const Eyebrow('Weight trend'),
            const SizedBox(height: Space.xs),
            if (latest == null)
              Text('No weigh-ins yet', style: context.text.titleMedium)
            else
              MetricValue(value: units.weight(latest.trendKg, unit: false), unit: units.weightLabel),
            Text(change == null ? (latest == null ? 'Log a few weigh-ins to see a trend' : 'Weekly change needs 7+ days of data') : '${units.delta(change)} this week', style: context.text.bodySmall),
            if (last30.length > 2) ...[
              const SizedBox(height: Space.sm),
              Sparkline(values: [for (final p in last30) p.trendKg], color: c.accent),
            ],
          ]),
        ),
        const SizedBox(width: Space.md),
        IconButton.filledTonal(tooltip: 'Log weight', onPressed: () => showLogWeight(context, ref), icon: const Icon(Icons.add_rounded)),
      ]),
    );
  }
}

class _RecoveryCard extends ConsumerWidget {
  const _RecoveryCard();

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final status = ref.watch(recoveryStatusProvider);
    final checkin = ref.watch(todayCheckinProvider).value;
    final prefs = ref.watch(prefsProvider).value;
    final c = context.colors;
    return AsyncView(
      value: status,
      compact: true,
      data: (s) {
        final color = switch (s.band) {
          ReadinessBand.ready => c.positive,
          ReadinessBand.strained => c.caution,
          _ => c.textSecondary,
        };
        return FCard(
          child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
            Row(children: [
              const Eyebrow('Recovery'),
              const Spacer(),
              if (s.factors.any((f) => f.imported)) const ProvenanceBadge(Provenance.imported, compact: true),
            ]),
            const SizedBox(height: Space.xs),
            Text(s.band.label, style: context.text.headlineMedium?.copyWith(color: color)),
            const SizedBox(height: Space.xs),
            Text(s.band.message, style: context.text.bodySmall),
            if (s.factors.isNotEmpty) ...[
              const SizedBox(height: Space.md),
              for (final f in s.factors)
                Padding(
                  padding: const EdgeInsets.only(bottom: 6),
                  child: Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
                    SizedBox(width: 130, child: Text(f.name, style: context.text.labelMedium)),
                    Expanded(child: Text(f.detail, style: context.text.bodySmall?.copyWith(color: f.signal == Signal.worse ? c.caution : null))),
                  ]),
                ),
            ],
            if (s.missing.isNotEmpty) ...[
              const SizedBox(height: Space.xs),
              Text('No data: ${s.missing.join(', ')}', style: context.text.bodySmall?.copyWith(color: c.textTertiary)),
            ],
            const SizedBox(height: Space.md),
            Wrap(spacing: Space.sm, runSpacing: Space.xs, crossAxisAlignment: WrapCrossAlignment.center, children: [
              if (checkin == null) FilledButton.tonal(onPressed: () => showCheckin(context, ref), child: const Text('Daily check-in')),
              if (checkin != null) TextButton(onPressed: () => showCheckin(context, ref), child: const Text('Update check-in')),
              if (!(prefs?.healthEnabled ?? false)) TextButton(onPressed: () => context.push('/settings/health'), child: const Text('Connect Apple Health')),
            ]),
            Text(RecoveryStatus.disclaimer, style: context.text.bodySmall?.copyWith(color: c.textTertiary, fontSize: 11)),
          ]),
        );
      },
    );
  }
}

/// Quick 3-question subjective check-in.
Future<void> showCheckin(BuildContext context, WidgetRef ref) async {
  var energy = 3, soreness = 3, sleep = 3;
  final save = await showModalBottomSheet<bool>(
    context: context,
    useSafeArea: true,
    isScrollControlled: true,
    builder: (c) => StatefulBuilder(
      builder: (c, set) {
        Widget row(String label, String low, String high, int value, ValueChanged<int> onChanged) => Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
              const SizedBox(height: Space.lg),
              Text(label, style: c.text.titleSmall),
              const SizedBox(height: Space.sm),
              SegmentedPills<int>(values: const [1, 2, 3, 4, 5], selected: value, expand: true, labelOf: (v) => '$v', onChanged: (v) => set(() => onChanged(v))),
              const SizedBox(height: 4),
              Row(children: [Text(low, style: c.text.bodySmall), const Spacer(), Text(high, style: c.text.bodySmall)]),
            ]);
        return Padding(
          padding: const EdgeInsets.fromLTRB(Space.gutter, 0, Space.gutter, Space.xl),
          child: Column(mainAxisSize: MainAxisSize.min, crossAxisAlignment: CrossAxisAlignment.stretch, children: [
            Text('How are you today?', style: c.text.titleLarge),
            row('Energy', 'Drained', 'Great', energy, (v) => energy = v),
            row('Muscle soreness', 'Very sore', 'Not sore', soreness, (v) => soreness = v),
            row('Sleep quality', 'Poor', 'Great', sleep, (v) => sleep = v),
            const SizedBox(height: Space.xl),
            FilledButton(onPressed: () => Navigator.pop(c, true), child: const Text('Save')),
          ]),
        );
      },
    ),
  );
  if (save == true) {
    await ref.read(workoutRepositoryProvider).saveCheckin(ref.read(todayProvider), energy: energy, soreness: soreness, sleepQuality: sleep);
  }
}

class _ConsistencyCard extends ConsumerWidget {
  const _ConsistencyCard();

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final rows = ref.watch(_weekRowsProvider);
    final target = ref.watch(prefsProvider).value?.weeklyWorkoutTarget ?? 3;
    final today = ref.watch(todayProvider);
    final c = context.colors;
    return AsyncView(
      value: rows,
      compact: true,
      data: (rows) {
        final cons = consistency(rows, today: today, target: target);
        final weekStart = startOfWeek(today);
        final trainedDays = {for (final r in rows) if (!dateOnly(r.date).isBefore(weekStart)) dateOnly(r.date).weekday};
        return FCard(
          onTap: () => context.go('/progress'),
          child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
            Row(children: [
              const Eyebrow('This week'),
              const Spacer(),
              Text('${cons.thisWeek} / ${cons.target} workouts', style: context.text.labelMedium),
            ]),
            const SizedBox(height: Space.md),
            Row(mainAxisAlignment: MainAxisAlignment.spaceBetween, children: [
              for (var d = 1; d <= 7; d++)
                Column(children: [
                  AnimatedContainer(
                    duration: Motion.medium,
                    width: 30,
                    height: 30,
                    decoration: BoxDecoration(
                      shape: BoxShape.circle,
                      color: trainedDays.contains(d) ? c.accent : Colors.transparent,
                      border: Border.all(color: d == today.weekday ? c.textPrimary : c.outlineStrong),
                    ),
                    child: trainedDays.contains(d) ? Icon(Icons.check_rounded, size: 16, color: c.onAccent) : null,
                  ),
                  const SizedBox(height: 4),
                  Text(weekdayShort(d).substring(0, 1), style: context.text.labelSmall),
                ]),
            ]),
            const SizedBox(height: Space.md),
            Text(
              cons.streakWeeks > 0
                  ? '${cons.streakWeeks} week${cons.streakWeeks == 1 ? '' : 's'} in a row on target · ${(cons.hitRate * 100).round()}% of the last 8 weeks'
                  : '${(cons.hitRate * 100).round()}% of the last 8 weeks on target',
              style: context.text.bodySmall,
            ),
          ]),
        );
      },
    );
  }
}

class _InsightsCard extends ConsumerWidget {
  const _InsightsCard();

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final insights = ref.watch(insightsProvider);
    final c = context.colors;
    return AsyncView(
      value: insights,
      compact: true,
      data: (list) {
        if (list.isEmpty) return const SizedBox.shrink();
        return FCard(
          padding: const EdgeInsets.fromLTRB(Space.lg, Space.lg, Space.lg, Space.sm),
          child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
            const Row(children: [Eyebrow('Recommendations'), Spacer(), ProvenanceBadge(Provenance.calculated, compact: true)]),
            for (final i in list.take(2))
              InkWell(
                onTap: i.route == null ? null : () => context.go(i.route!),
                child: Padding(
                  padding: const EdgeInsets.symmetric(vertical: Space.sm),
                  child: Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
                    Container(
                      width: 6,
                      height: 6,
                      margin: const EdgeInsets.only(top: 7, right: Space.md),
                      decoration: BoxDecoration(
                        shape: BoxShape.circle,
                        color: switch (i.tone) {
                          InsightTone.positive => c.positive,
                          InsightTone.attention => c.caution,
                          InsightTone.neutral => c.textSecondary,
                        },
                      ),
                    ),
                    Expanded(
                      child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                        Text(i.title, style: context.text.titleSmall),
                        Text(i.body, style: context.text.bodySmall),
                      ]),
                    ),
                  ]),
                ),
              ),
          ]),
        );
      },
    );
  }
}


final _dismissedAnnouncementProvider = FutureProvider<String?>((ref) => ref.watch(databaseProvider).readMeta('announcement.dismissed'));

/// A message published with the content (e.g. "New: photo logging"),
/// shown until it expires or is dismissed.
class AnnouncementCard extends ConsumerWidget {
  const AnnouncementCard({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final a = ref.watch(appConfigProvider).announcement;
    final dismissed = ref.watch(_dismissedAnnouncementProvider);
    if (a == null || !dismissed.hasValue || dismissed.value == a.id) return const SizedBox.shrink();
    if (a.until != null && ref.watch(clockProvider)().isAfter(a.until!)) return const SizedBox.shrink();
    return Padding(
      padding: const EdgeInsets.fromLTRB(Space.gutter, Space.md, Space.gutter, 0),
      child: FCard(
        color: context.colors.accentMuted,
        child: Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
          Icon(Icons.campaign_outlined, color: context.colors.accent),
          const SizedBox(width: Space.md),
          Expanded(
            child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
              Text(a.title, style: context.text.titleSmall),
              if (a.body.isNotEmpty) ...[const SizedBox(height: Space.xs), Text(a.body, style: context.text.bodySmall)],
            ]),
          ),
          IconButton(
            tooltip: 'Dismiss',
            icon: const Icon(Icons.close_rounded, size: 18),
            onPressed: () async {
              await ref.read(databaseProvider).writeMeta('announcement.dismissed', a.id);
              ref.invalidate(_dismissedAnnouncementProvider);
            },
          ),
        ]),
      ),
    );
  }
}
