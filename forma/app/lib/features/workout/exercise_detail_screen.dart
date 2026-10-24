import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../app/providers.dart';
import '../../core/theme/tokens.dart';
import '../../core/util/format.dart';
import '../../core/widgets/charts.dart';
import '../../core/widgets/primitives.dart';
import '../../core/widgets/states.dart';
import '../../data/repositories/exercise_repository.dart';
import '../../domain/catalog.dart';
import '../../domain/dates.dart';
import '../../domain/training/analytics.dart';
import '../../domain/training/models.dart';
import 'workout_providers.dart';

final _exerciseProvider = StreamProvider.family((ref, String id) => ref.watch(exerciseRepositoryProvider).watchById(id));

class ExerciseDetailScreen extends ConsumerStatefulWidget {
  const ExerciseDetailScreen({super.key, required this.exerciseId});
  final String exerciseId;

  @override
  ConsumerState<ExerciseDetailScreen> createState() => _ExerciseDetailScreenState();
}

class _ExerciseDetailScreenState extends ConsumerState<ExerciseDetailScreen> {
  ChartRange _range = ChartRange.quarter;

  @override
  Widget build(BuildContext context) {
    final exercise = ref.watch(_exerciseProvider(widget.exerciseId));
    final history = ref.watch(exerciseHistoryProvider(widget.exerciseId));
    final units = ref.watch(unitsProvider);
    final ctx = ref.watch(trainingContextProvider);
    final c = context.colors;

    return AsyncView(
      value: exercise,
      data: (e) {
        if (e == null) return const Scaffold(body: EmptyState(icon: Icons.help_outline, title: 'Exercise not found', message: ''));
        final restriction = ctx.restrictions.where((r) => r.kind == 'exercise' && r.value == e.id).firstOrNull;
        return PageScaffold(
          showBack: true,
          title: e.name,
          subtitle: [muscleLabel(e.primaryMuscle), patternLabels[e.pattern] ?? e.pattern].join(' · '),
          slivers: [
            SliverPadding(
              padding: const EdgeInsets.fromLTRB(Space.gutter, Space.md, Space.gutter, 0),
              sliver: SliverToBoxAdapter(
                child: Wrap(spacing: Space.sm, runSpacing: Space.sm, children: [
                  for (final m in [e.primaryMuscle, ...e.secondaryList]) Chip(label: Text(muscleLabel(m))),
                  for (final q in e.equipmentList) Chip(label: Text(equipmentInfo(q)?.label ?? q), avatar: const Icon(Icons.handyman_outlined, size: 16)),
                  if (e.isCustom) const ProvenanceBadge(Provenance.custom),
                ]),
              ),
            ),
            ...history.when(
              loading: () => [const SliverToBoxAdapter(child: LoadingState(compact: true))],
              error: (err, _) => [SliverToBoxAdapter(child: ErrorState(message: describeError(err), compact: true))],
              data: (sessions) => _historySlivers(context, sessions, units, e.tracking),
            ),
            if (e.instructionSteps.isNotEmpty) ...[
              const SliverToBoxAdapter(child: SectionHeader('How to')),
              SliverPadding(
                padding: const EdgeInsets.symmetric(horizontal: Space.gutter),
                sliver: SliverList.list(children: [
                  for (final (i, step) in e.instructionSteps.indexed)
                    Padding(
                      padding: const EdgeInsets.only(bottom: Space.sm),
                      child: Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
                        SizedBox(width: 24, child: Text('${i + 1}', style: context.text.titleSmall?.copyWith(color: c.accent))),
                        Expanded(child: Text(step, style: context.text.bodyLarge)),
                      ]),
                    ),
                ]),
              ),
            ],
            const SliverToBoxAdapter(child: SectionHeader('Alternatives')),
            SliverToBoxAdapter(
              child: Builder(builder: (context) {
                final library = ref.watch(exerciseLibraryProvider).value ?? const [];
                final alts = ref.read(exerciseRepositoryProvider).alternatives(e, library, ctx, limit: 5);
                if (alts.isEmpty) {
                  return const EmptyState(icon: Icons.swap_horiz_rounded, title: 'No alternatives', message: 'Nothing matches your equipment and restrictions.', compact: true);
                }
                return Column(children: [
                  for (final a in alts)
                    ListTile(
                      title: Text(a.name),
                      subtitle: Text(a.pattern == e.pattern ? 'Same movement' : 'Same muscle'),
                      trailing: const Icon(Icons.chevron_right_rounded),
                      onTap: () => context.push(GoRouterState.of(context).matchedLocation.replaceFirst(e.id, a.id)),
                    ),
                ]);
              }),
            ),
            const SliverToBoxAdapter(child: SectionHeader('Programming')),
            SliverToBoxAdapter(
              child: SwitchListTile.adaptive(
                contentPadding: const EdgeInsets.symmetric(horizontal: Space.gutter),
                title: const Text('Avoid this exercise'),
                subtitle: const Text('Excluded from generated plans and substitutions (e.g. because of pain or injury).'),
                value: restriction != null,
                onChanged: (v) {
                  final repo = ref.read(settingsRepositoryProvider);
                  v ? repo.addRestriction('exercise', e.id, note: 'You chose to avoid ${e.name}') : repo.removeRestriction(restriction!.id);
                },
              ),
            ),
            if (e.isCustom)
              SliverToBoxAdapter(
                child: ListTile(
                  title: Text('Archive custom exercise', style: TextStyle(color: c.negative)),
                  subtitle: const Text('Hidden from the library; past workouts keep it.'),
                  onTap: () async {
                    await ref.read(exerciseRepositoryProvider).archiveCustom(e.id);
                    if (context.mounted) context.pop();
                  },
                ),
              ),
          ],
        );
      },
    );
  }

  List<Widget> _historySlivers(BuildContext context, List<ExerciseSession> sessions, Units units, TrackingType tracking) {
    if (sessions.isEmpty) {
      return [
        const SliverToBoxAdapter(
          child: EmptyState(
            icon: Icons.show_chart_rounded,
            title: 'No history yet',
            message: 'Log this exercise to see personal records and your estimated strength trend.',
            compact: true,
          ),
        ),
      ];
    }
    final c = context.colors;
    final today = ref.watch(todayProvider);
    final inRange = [for (final s in sessions) if (daysBetween(dateOnly(s.date), today) <= _range.days) s];
    final trend = strengthTrend(inRange);
    final prs = personalRecords(sessions);
    return [
      if (tracking.usesWeight) ...[
        const SliverToBoxAdapter(
          child: SectionHeader('Estimated 1RM', padding: EdgeInsets.fromLTRB(Space.gutter, Space.xxl, Space.gutter, Space.sm)),
        ),
        SliverPadding(
          padding: const EdgeInsets.symmetric(horizontal: Space.gutter),
          sliver: SliverToBoxAdapter(
            child: FCard(
              child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                Row(children: [
                  const ProvenanceBadge(Provenance.calculated, compact: true),
                  const Spacer(),
                  SegmentedPills<ChartRange>(
                    values: ChartRange.values,
                    selected: _range,
                    labelOf: (r) => r.label,
                    onChanged: (r) => setState(() => _range = r),
                  ),
                ]),
                const SizedBox(height: Space.lg),
                if (trend.length < 2)
                  Padding(
                    padding: const EdgeInsets.symmetric(vertical: Space.xl),
                    child: Text('Log at least two sessions in this range to see a trend.', style: context.text.bodyMedium),
                  )
                else
                  TimeSeriesChart(
                    series: [ChartSeries(points: [for (final t in trend) ChartPoint(t.date, units.toDisplay(t.value))], color: c.accent)],
                    format: (v) => number(v, maxDecimals: 0),
                  ),
                const SizedBox(height: Space.sm),
                Text(
                  'Estimated from your best set each session (Epley formula, adjusted for RPE when logged). Not a tested max.',
                  style: context.text.bodySmall,
                ),
              ]),
            ),
          ),
        ),
      ],
      const SliverToBoxAdapter(child: SectionHeader('Personal records')),
      SliverPadding(
        padding: const EdgeInsets.symmetric(horizontal: Space.gutter),
        sliver: SliverToBoxAdapter(
          child: FCard(
            padding: EdgeInsets.zero,
            child: Column(children: [
              for (final p in prs)
                ListTile(
                  title: Text(p.kind.label),
                  subtitle: Text(shortDate(p.date)),
                  trailing: Text(
                    p.kind == PrKind.estimatedOneRepMax || p.kind == PrKind.heaviestWeight || p.kind == PrKind.bestSessionVolume
                        ? (units.imperial ? p.label.replaceAllMapped(RegExp(r'(\d+(?:\.\d+)?) kg'), (m) => units.weight(double.parse(m[1]!))) : p.label)
                        : p.label,
                    style: context.text.titleSmall,
                  ),
                ),
            ]),
          ),
        ),
      ),
      const SliverToBoxAdapter(child: SectionHeader('History')),
      SliverList.builder(
        itemCount: sessions.length.clamp(0, 20),
        itemBuilder: (context, i) {
          final s = sessions[i];
          return ListTile(
            onTap: () => context.push('/session/${s.workoutId}'),
            title: Text(relativeDay(s.date)),
            subtitle: Text(
              s.workingSets
                  .map((x) => switch (tracking) {
                        TrackingType.duration => '${x.durationS ?? 0}s',
                        TrackingType.distanceDuration => '${number((x.distanceM ?? 0) / 1000, maxDecimals: 2)} km',
                        _ => (x.weightKg ?? 0) > 0 ? '${units.weight(x.weightKg, unit: false)}×${x.reps ?? 0}' : '${x.reps ?? 0}',
                      })
                  .join('  '),
              style: context.text.bodySmall,
            ),
            trailing: s.isDeload ? const Text('Deload') : null,
          );
        },
      ),
    ];
  }
}
