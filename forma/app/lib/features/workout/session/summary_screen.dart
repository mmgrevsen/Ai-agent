import 'package:drift/drift.dart' show Value;
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../app/providers.dart';
import '../../../core/theme/tokens.dart';
import '../../../core/util/format.dart';
import '../../../core/widgets/inputs.dart';
import '../../../core/widgets/primitives.dart';
import '../../../core/widgets/states.dart';
import '../../../data/db/app_database.dart';
import '../../../data/repositories/workout_repository.dart';
import '../../../domain/training/analytics.dart';
import '../../../domain/training/models.dart';
import '../../../domain/training/progression_engine.dart';
import '../../../domain/training/strength.dart';
import '../workout_providers.dart';

class ExerciseOutcome {
  const ExerciseOutcome({required this.item, required this.session, required this.previous, required this.records, required this.next});
  final SessionExercise item;
  final ExerciseSession session;
  final ExerciseSession? previous;
  final List<PersonalRecord> records;
  final Recommendation next;
}

final _summaryProvider = FutureProvider.family<(WorkoutDetail, List<ExerciseOutcome>)?, String>((ref, id) async {
  final repo = ref.watch(workoutRepositoryProvider);
  final detail = await repo.workout(id);
  if (detail == null) return null;
  final service = ref.watch(trainingServiceProvider);
  final outcomes = <ExerciseOutcome>[];
  for (final e in detail.exercises) {
    final sets = [for (final s in e.sets) WorkoutRepository.toSetRecord(s)];
    final session = ExerciseSession(workoutId: id, date: detail.workout.startedAt.toLocal(), sets: sets);
    final earlier = await repo.exerciseHistory(e.exercise.id, excludeWorkoutId: id);
    final before = [for (final s in earlier) if (s.date.isBefore(session.date)) s];
    final next = await service.recommend(
      exercise: e.exercise,
      prescription: Prescription(sets: e.completedWorking.length.clamp(1, 10), repMin: e.row.repMin ?? 8, repMax: e.row.repMax ?? 12, targetRpe: e.row.targetRpe),
    );
    outcomes.add(ExerciseOutcome(
      item: e,
      session: session,
      previous: before.isEmpty ? null : before.first,
      records: newRecordsIn(session, before),
      next: next,
    ));
  }
  return (detail, outcomes);
});

class WorkoutSummaryScreen extends ConsumerWidget {
  const WorkoutSummaryScreen({super.key, required this.workoutId});
  final String workoutId;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final data = ref.watch(_summaryProvider(workoutId));
    final units = ref.watch(unitsProvider);
    return Scaffold(
      body: AsyncView(
        value: data,
        data: (result) {
          if (result == null) return const EmptyState(icon: Icons.help_outline, title: 'Workout not found', message: '');
          final (detail, outcomes) = result;
          final w = detail.workout;
          final duration = (w.endedAt ?? DateTime.now().toUtc()).difference(w.startedAt);
          final prs = outcomes.expand((o) => o.records.map((r) => (o.item.exercise.name, r))).toList();
          final c = context.colors;
          return CustomScrollView(
            slivers: [
              SliverSafeArea(
                bottom: false,
                sliver: SliverPadding(
                  padding: const EdgeInsets.fromLTRB(Space.gutter, Space.xxl, Space.gutter, 0),
                  sliver: SliverList.list(children: [
                    Eyebrow('Workout complete', color: c.positive),
                    const SizedBox(height: Space.sm),
                    Text(w.name, style: context.text.headlineLarge),
                    const SizedBox(height: Space.xl),
                    Row(children: [
                      Expanded(child: _Stat(label: 'Duration', value: duration.inMinutes.toString(), unit: 'min')),
                      Expanded(child: _Stat(label: 'Sets', value: '${detail.completedSets}')),
                      Expanded(child: _Stat(label: 'Volume', value: units.volume(detail.volumeKg).split(' ').first, unit: units.volume(detail.volumeKg).split(' ').skip(1).join(' '))),
                    ]),
                    if (prs.isNotEmpty) ...[
                      const SizedBox(height: Space.xl),
                      FCard(
                        borderColor: c.accent,
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Row(children: [
                              Icon(Icons.emoji_events_outlined, color: c.accent, size: 20),
                              const SizedBox(width: Space.sm),
                              Text('${prs.length} personal record${prs.length == 1 ? '' : 's'}', style: context.text.titleMedium),
                            ]),
                            const SizedBox(height: Space.sm),
                            for (final (name, r) in prs)
                              Padding(
                                padding: const EdgeInsets.only(top: 4),
                                child: Text('$name — ${r.kind.label}: ${r.label}', style: context.text.bodyMedium),
                              ),
                          ],
                        ),
                      ),
                    ],
                    const SizedBox(height: Space.xl),
                    const Eyebrow('How hard was this session?'),
                    const SizedBox(height: Space.sm),
                    Wrap(spacing: Space.sm, runSpacing: Space.sm, children: [
                      for (final (v, l) in const [(5.0, 'Easy'), (6.5, 'Moderate'), (8.0, 'Hard'), (9.5, 'Very hard')])
                        ToggleChip(
                          label: l,
                          selected: w.sessionRpe == v,
                          onTap: () => ref.read(workoutRepositoryProvider).updateWorkout(w.id, WorkoutsCompanion(sessionRpe: Value(v))),
                        ),
                    ]),
                    const SizedBox(height: Space.xl),
                    const Eyebrow('Exercises'),
                    const SizedBox(height: Space.sm),
                  ]),
                ),
              ),
              SliverPadding(
                padding: const EdgeInsets.symmetric(horizontal: Space.gutter),
                sliver: SliverList.separated(
                  itemCount: outcomes.length,
                  separatorBuilder: (_, _) => const SizedBox(height: Space.sm),
                  itemBuilder: (context, i) => _OutcomeCard(outcome: outcomes[i], units: units),
                ),
              ),
              SliverSafeArea(
                top: false,
                sliver: SliverPadding(
                  padding: const EdgeInsets.all(Space.gutter),
                  sliver: SliverToBoxAdapter(
                    child: FilledButton(onPressed: () => context.go('/workout'), child: const Text('Done')),
                  ),
                ),
              ),
            ],
          );
        },
      ),
    );
  }
}

class _Stat extends StatelessWidget {
  const _Stat({required this.label, required this.value, this.unit});
  final String label;
  final String value;
  final String? unit;

  @override
  Widget build(BuildContext context) => Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [Eyebrow(label), const SizedBox(height: 4), MetricValue(value: value, unit: unit)],
      );
}

class _OutcomeCard extends StatelessWidget {
  const _OutcomeCard({required this.outcome, required this.units});
  final ExerciseOutcome outcome;
  final Units units;

  @override
  Widget build(BuildContext context) {
    final c = context.colors;
    final e1 = bestOneRepMax(outcome.session);
    final prevE1 = outcome.previous == null ? null : bestOneRepMax(outcome.previous!);
    final working = outcome.session.workingSets;
    final top = working.isEmpty ? null : working.reduce((a, b) => (a.weightKg ?? 0) * (a.reps ?? 0) >= (b.weightKg ?? 0) * (b.reps ?? 0) ? a : b);
    return FCard(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(outcome.item.exercise.name, style: context.text.titleMedium),
          const SizedBox(height: 4),
          Text(
            [
              '${working.length} sets',
              if (top != null && (top.weightKg ?? 0) > 0) 'best ${units.weight(top.weightKg)} × ${top.reps}',
              if (top != null && (top.weightKg ?? 0) == 0 && top.reps != null) 'best ${top.reps} reps',
            ].join(' · '),
            style: context.text.bodyMedium,
          ),
          if (e1 != null) ...[
            const SizedBox(height: 4),
            Row(children: [
              Text('Est. 1RM ${units.weight(e1)}', style: context.text.bodySmall),
              if (prevE1 != null) ...[
                const SizedBox(width: Space.sm),
                Text(
                  units.delta(e1 - prevE1),
                  style: context.text.bodySmall?.copyWith(color: e1 >= prevE1 ? c.positive : c.caution),
                ),
                Text(' vs last time', style: context.text.bodySmall),
              ],
              const SizedBox(width: Space.sm),
              const ProvenanceBadge(Provenance.calculated, compact: true),
            ]),
          ],
          const SizedBox(height: Space.sm),
          Text('Next time: ${outcome.next.headline}', style: context.text.labelMedium?.copyWith(color: c.accent)),
        ],
      ),
    );
  }
}
