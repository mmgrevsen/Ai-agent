import 'dart:async';

import 'package:drift/drift.dart' show Value;
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:intl/intl.dart';

import '../../../app/providers.dart';
import '../../../core/theme/app_theme.dart';
import '../../../core/theme/tokens.dart';
import '../../../core/util/format.dart';
import '../../../core/widgets/primitives.dart';
import '../../../core/widgets/states.dart';
import '../../../data/db/app_database.dart';
import '../../../data/repositories/exercise_repository.dart';
import '../../../data/repositories/workout_repository.dart';
import '../../../domain/catalog.dart';
import '../../../domain/training/models.dart';
import '../../../services/health_service.dart';
import '../../../services/training_service.dart';
import '../../health/health_providers.dart';
import '../exercise_library_screen.dart';
import '../workout_providers.dart';
import 'rest_timer.dart';
import 'set_editor_sheet.dart';

/// Previous completed session of an exercise, excluding the current workout.
final previousSessionProvider = FutureProvider.family<ExerciseSession?, (String, String)>((ref, key) async {
  final (exerciseId, workoutId) = key;
  final history = await ref.watch(workoutRepositoryProvider).exerciseHistory(exerciseId, limit: 1, excludeWorkoutId: workoutId);
  return history.isEmpty ? null : history.first;
});

class SessionScreen extends ConsumerWidget {
  const SessionScreen({super.key, required this.workoutId});

  final String workoutId;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final detail = ref.watch(workoutDetailProvider(workoutId));
    return detail.when(
      loading: () => const Scaffold(body: LoadingState()),
      error: (e, _) => Scaffold(appBar: AppBar(), body: ErrorState(message: describeError(e))),
      data: (d) {
        if (d == null) {
          return Scaffold(
            appBar: AppBar(),
            body: const EmptyState(icon: Icons.delete_outline_rounded, title: 'Workout not found', message: 'It may have been discarded.'),
          );
        }
        return _SessionView(detail: d);
      },
    );
  }
}

class _SessionView extends ConsumerStatefulWidget {
  const _SessionView({required this.detail});
  final WorkoutDetail detail;

  @override
  ConsumerState<_SessionView> createState() => _SessionViewState();
}

class _SessionViewState extends ConsumerState<_SessionView> {
  Timer? _clock;

  WorkoutDetail get d => widget.detail;
  bool get _active => d.workout.endedAt == null;

  @override
  void initState() {
    super.initState();
    if (_active) _clock = Timer.periodic(const Duration(seconds: 1), (_) => setState(() {}));
  }

  @override
  void dispose() {
    _clock?.cancel();
    super.dispose();
  }

  Future<void> _finish() async {
    final incomplete = d.exercises.fold<int>(0, (a, e) => a + e.sets.where((s) => !s.completed).length);
    if (d.completedSets == 0) {
      final discard = await showDialog<bool>(
        context: context,
        builder: (c) => AlertDialog(
          title: const Text('No sets completed'),
          content: const Text('Complete at least one set to save this workout, or discard it.'),
          actions: [
            TextButton(onPressed: () => Navigator.pop(c, false), child: const Text('Keep logging')),
            TextButton(
              onPressed: () => Navigator.pop(c, true),
              style: TextButton.styleFrom(foregroundColor: context.colors.negative),
              child: const Text('Discard'),
            ),
          ],
        ),
      );
      if (discard == true) await _discard(confirm: false);
      return;
    }
    if (incomplete > 0) {
      final ok = await showDialog<bool>(
        context: context,
        builder: (c) => AlertDialog(
          title: const Text('Finish workout?'),
          content: Text('$incomplete unfinished set${incomplete == 1 ? '' : 's'} will be removed. Completed sets are saved.'),
          actions: [
            TextButton(onPressed: () => Navigator.pop(c, false), child: const Text('Keep logging')),
            FilledButton(onPressed: () => Navigator.pop(c, true), child: const Text('Finish')),
          ],
        ),
      );
      if (ok != true) return;
    }
    ref.read(restTimerProvider.notifier).skip();
    await ref.read(workoutRepositoryProvider).finishWorkout(d.workout.id);
    unawaited(_exportToHealth());
    if (mounted) context.pushReplacement('/session/${d.workout.id}/summary');
  }

  Future<void> _exportToHealth() async {
    final cats = ref.read(healthCategoriesProvider).value ?? const {};
    if (!cats.contains(HealthCategory.workouts)) return;
    try {
      await ref.read(healthPlatformProvider).writeStrengthWorkout(
            start: d.workout.startedAt.toLocal(),
            end: DateTime.now(),
            title: d.workout.name,
          );
    } on Object {
      // Export is best-effort; the workout is already saved locally.
    }
  }

  Future<void> _discard({bool confirm = true}) async {
    if (confirm) {
      final ok = await showDialog<bool>(
        context: context,
        builder: (c) => AlertDialog(
          title: Text(_active ? 'Discard workout?' : 'Delete workout?'),
          content: const Text('All sets in this workout will be deleted. This cannot be undone.'),
          actions: [
            TextButton(onPressed: () => Navigator.pop(c, false), child: const Text('Cancel')),
            TextButton(
              onPressed: () => Navigator.pop(c, true),
              style: TextButton.styleFrom(foregroundColor: context.colors.negative),
              child: Text(_active ? 'Discard' : 'Delete'),
            ),
          ],
        ),
      );
      if (ok != true) return;
    }
    ref.read(restTimerProvider.notifier).skip();
    await ref.read(workoutRepositoryProvider).deleteWorkout(d.workout.id);
    if (mounted) context.pop();
  }

  Future<void> _rename() async {
    final controller = TextEditingController(text: d.workout.name);
    final name = await showDialog<String>(
      context: context,
      builder: (c) => AlertDialog(
        title: const Text('Workout name'),
        content: TextField(controller: controller, autofocus: true, textCapitalization: TextCapitalization.sentences),
        actions: [
          TextButton(onPressed: () => Navigator.pop(c), child: const Text('Cancel')),
          FilledButton(onPressed: () => Navigator.pop(c, controller.text.trim()), child: const Text('Save')),
        ],
      ),
    );
    controller.dispose();
    if (name != null && name.isNotEmpty) {
      await ref.read(workoutRepositoryProvider).updateWorkout(d.workout.id, WorkoutsCompanion(name: Value(name)));
    }
  }

  Future<void> _editNotes() async {
    final controller = TextEditingController(text: d.workout.notes ?? '');
    final notes = await showDialog<String>(
      context: context,
      builder: (c) => AlertDialog(
        title: const Text('Notes'),
        content: TextField(controller: controller, autofocus: true, maxLines: 5, minLines: 3),
        actions: [
          TextButton(onPressed: () => Navigator.pop(c), child: const Text('Cancel')),
          FilledButton(onPressed: () => Navigator.pop(c, controller.text.trim()), child: const Text('Save')),
        ],
      ),
    );
    controller.dispose();
    if (notes != null) {
      await ref.read(workoutRepositoryProvider).updateWorkout(d.workout.id, WorkoutsCompanion(notes: Value(notes.isEmpty ? null : notes)));
    }
  }

  Future<void> _changeDate() async {
    final start = d.workout.startedAt.toLocal();
    final date = await showDatePicker(
      context: context,
      initialDate: start,
      firstDate: DateTime(2000),
      lastDate: DateTime.now(),
    );
    if (date == null || !mounted) return;
    final time = await showTimePicker(context: context, initialTime: TimeOfDay.fromDateTime(start));
    if (time == null) return;
    final newStart = DateTime(date.year, date.month, date.day, time.hour, time.minute);
    final shift = newStart.difference(start);
    await ref.read(workoutRepositoryProvider).updateWorkout(
          d.workout.id,
          WorkoutsCompanion(
            startedAt: Value(newStart.toUtc()),
            endedAt: d.workout.endedAt == null ? const Value.absent() : Value(d.workout.endedAt!.add(shift)),
          ),
        );
  }

  Future<void> _addExercise() async {
    final e = await showExercisePicker(context);
    if (e == null) return;
    await ref.read(trainingServiceProvider).addExerciseToWorkout(
          workoutId: d.workout.id,
          exercise: e,
          deload: d.workout.isDeload,
          lowReadiness: ref.read(lowReadinessProvider),
        );
  }

  @override
  Widget build(BuildContext context) {
    final c = context.colors;
    final elapsed = (d.workout.endedAt ?? DateTime.now().toUtc()).difference(d.workout.startedAt);
    final progress = d.plannedSets == 0 ? 0.0 : d.completedSets / d.plannedSets;

    return Scaffold(
      appBar: AppBar(
        leading: IconButton(
          tooltip: _active ? 'Minimise' : 'Close',
          icon: Icon(_active ? Icons.keyboard_arrow_down_rounded : Icons.close_rounded),
          onPressed: () => context.pop(),
        ),
        titleSpacing: 0,
        title: GestureDetector(
          onTap: _rename,
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(d.workout.name, style: context.text.titleMedium, maxLines: 1, overflow: TextOverflow.ellipsis),
              Text(
                _active
                    ? '${clock(elapsed)} · ${d.completedSets}/${d.plannedSets} sets${d.workout.isDeload ? ' · Deload' : ''}'
                    : DateFormat('EEE d MMM y · HH:mm').format(d.workout.startedAt.toLocal()),
                style: context.text.labelMedium?.copyWith(fontFeatures: tabularFigures),
              ),
            ],
          ),
        ),
        actions: [
          PopupMenuButton<String>(
            tooltip: 'Workout options',
            onSelected: (v) => switch (v) {
              'rename' => _rename(),
              'notes' => _editNotes(),
              'date' => _changeDate(),
              'deload' => ref.read(workoutRepositoryProvider).updateWorkout(d.workout.id, WorkoutsCompanion(isDeload: Value(!d.workout.isDeload))),
              'discard' => _discard(),
              _ => null,
            },
            itemBuilder: (_) => [
              const PopupMenuItem(value: 'rename', child: Text('Rename')),
              const PopupMenuItem(value: 'notes', child: Text('Notes')),
              if (!_active) const PopupMenuItem(value: 'date', child: Text('Change date & time')),
              PopupMenuItem(value: 'deload', child: Text(d.workout.isDeload ? 'Unmark deload' : 'Mark as deload')),
              PopupMenuItem(value: 'discard', child: Text(_active ? 'Discard workout' : 'Delete workout', style: TextStyle(color: c.negative))),
            ],
          ),
          Padding(
            padding: const EdgeInsets.only(right: Space.md),
            child: FilledButton(
              onPressed: _active ? _finish : () => context.pop(),
              style: FilledButton.styleFrom(minimumSize: const Size(0, 40), padding: const EdgeInsets.symmetric(horizontal: 18)),
              child: Text(_active ? 'Finish' : 'Done'),
            ),
          ),
        ],
        bottom: PreferredSize(
          preferredSize: const Size.fromHeight(2),
          child: LinearProgressIndicator(value: _active ? progress : 1, minHeight: 2),
        ),
      ),
      body: Column(
        children: [
          Expanded(
            child: d.exercises.isEmpty
                ? EmptyState(
                    icon: Icons.fitness_center_rounded,
                    title: 'Add your first exercise',
                    message: 'Pick from the library or create your own. Previous results and suggestions appear as you log.',
                    actionLabel: 'Add exercise',
                    onAction: _addExercise,
                  )
                : ListView(
                    padding: const EdgeInsets.fromLTRB(Space.md, Space.md, Space.md, 140),
                    children: [
                      if (d.workout.notes != null)
                        Padding(
                          padding: const EdgeInsets.fromLTRB(Space.sm, 0, Space.sm, Space.md),
                          child: Text(d.workout.notes!, style: context.text.bodyMedium),
                        ),
                      for (final (i, e) in d.exercises.indexed) ...[
                        _ExerciseCard(
                          key: ValueKey(e.row.id),
                          workout: d.workout,
                          item: e,
                          isFirst: i == 0,
                          isLast: i == d.exercises.length - 1,
                          nextInSuperset: i + 1 < d.exercises.length &&
                              e.row.supersetGroup != null &&
                              d.exercises[i + 1].row.supersetGroup == e.row.supersetGroup,
                        ),
                        const SizedBox(height: Space.md),
                      ],
                      OutlinedButton.icon(
                        onPressed: _addExercise,
                        icon: const Icon(Icons.add_rounded),
                        label: const Text('Add exercise'),
                      ),
                    ],
                  ),
          ),
          if (_active) const RestTimerBar(),
        ],
      ),
    );
  }
}

class _ExerciseCard extends ConsumerWidget {
  const _ExerciseCard({
    super.key,
    required this.workout,
    required this.item,
    required this.isFirst,
    required this.isLast,
    required this.nextInSuperset,
  });

  final Workout workout;
  final SessionExercise item;
  final bool isFirst;
  final bool isLast;

  /// True when the next exercise belongs to the same superset: rest is
  /// deferred until the last exercise of the group.
  final bool nextInSuperset;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final c = context.colors;
    final e = item.exercise;
    final rec = StoredRecommendation.parse(item.row.recommendation);
    final previous = ref.watch(previousSessionProvider((e.id, workout.id))).value;
    final prefs = ref.watch(prefsProvider).value;
    final units = ref.watch(unitsProvider);
    final ctx = ref.watch(trainingContextProvider);
    final inc = ctx.incrementFor(e) ?? 2.5;
    final previousWorking = previous?.workingSets ?? const <SetRecord>[];
    final active = workout.endedAt == null;

    var workingIndex = 0;
    final rows = <Widget>[];
    for (final s in item.sets) {
      final isWarmup = s.kind == 'warmup';
      final prev = isWarmup || workingIndex >= previousWorking.length ? null : previousWorking[workingIndex];
      final label = isWarmup ? 'W' : SetKind.fromName(s.kind) == SetKind.working ? '${workingIndex + 1}' : SetKind.fromName(s.kind).short;
      final fallback = isWarmup ? null : _fallback(rec, prev, autoFill: prefs?.autoFillSuggestions ?? true);
      rows.add(_SetRow(
        set: s,
        label: label,
        tracking: e.tracking,
        previous: prev,
        fallback: fallback,
        units: units,
        onEdit: () => _edit(context, ref, s, label, inc, fallback),
        onToggle: () => _toggle(context, ref, s, label, inc, fallback, prefs),
      ));
      if (!isWarmup) workingIndex++;
    }

    return Container(
      decoration: BoxDecoration(
        color: c.surface,
        borderRadius: BorderRadius.circular(Radii.lg),
        border: Border.all(color: item.row.supersetGroup != null ? c.accent.withValues(alpha: 0.5) : c.outline),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Padding(
            padding: const EdgeInsets.fromLTRB(Space.lg, Space.md, Space.xs, 0),
            child: Row(
              children: [
                Expanded(
                  child: GestureDetector(
                    onTap: () => _showInfo(context, ref, e),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        if (item.row.supersetGroup != null) Eyebrow('Superset ${String.fromCharCode(64 + item.row.supersetGroup!)}', color: c.accent),
                        Text(e.name, style: context.text.titleMedium?.copyWith(color: c.accent)),
                        Text(
                          [
                            muscleLabel(e.primaryMuscle),
                            if (item.row.repMin != null && e.tracking.usesReps) '${item.row.repMin}–${item.row.repMax} reps',
                            if (item.row.targetRpe != null) 'RPE ${number(item.row.targetRpe!)}',
                          ].join(' · '),
                          style: context.text.bodySmall,
                        ),
                      ],
                    ),
                  ),
                ),
                PopupMenuButton<String>(
                  tooltip: 'Exercise options',
                  onSelected: (v) => _menu(context, ref, v),
                  itemBuilder: (_) => [
                    const PopupMenuItem(value: 'swap', child: Text('Substitute exercise')),
                    const PopupMenuItem(value: 'warmup', child: Text('Add warm-up set')),
                    const PopupMenuItem(value: 'rest', child: Text('Rest timer')),
                    const PopupMenuItem(value: 'superset', child: Text('Superset with next')),
                    if (!isFirst) const PopupMenuItem(value: 'up', child: Text('Move up')),
                    if (!isLast) const PopupMenuItem(value: 'down', child: Text('Move down')),
                    PopupMenuItem(value: 'remove', child: Text('Remove', style: TextStyle(color: c.negative))),
                  ],
                ),
              ],
            ),
          ),
          if (rec != null && active) _RecommendationChip(rec: rec, units: units),
          Padding(
            padding: const EdgeInsets.fromLTRB(Space.md, Space.sm, Space.md, 0),
            child: _SetHeader(tracking: e.tracking, units: units),
          ),
          ...rows,
          Padding(
            padding: const EdgeInsets.fromLTRB(Space.sm, Space.xs, Space.sm, Space.sm),
            child: TextButton.icon(
              onPressed: () => ref.read(workoutRepositoryProvider).addSet(item.row.id),
              icon: const Icon(Icons.add_rounded, size: 20),
              label: const Text('Add set'),
              style: TextButton.styleFrom(foregroundColor: c.textSecondary, minimumSize: const Size.fromHeight(44)),
            ),
          ),
        ],
      ),
    );
  }

  /// What the set would be logged as with a single tap. Suggestions come
  /// from the progression engine; otherwise the previous session's value.
  SetRecord? _fallback(StoredRecommendation? rec, SetRecord? prev, {required bool autoFill}) {
    if (autoFill && rec != null && !rec.isBaseline && (rec.weightKg != null || rec.reps != null || rec.durationS != null)) {
      return SetRecord(weightKg: rec.weightKg ?? prev?.weightKg, reps: rec.reps ?? prev?.reps, durationS: rec.durationS ?? prev?.durationS);
    }
    if (prev != null) return SetRecord(weightKg: prev.weightKg, reps: prev.reps, durationS: prev.durationS, distanceM: prev.distanceM);
    return null;
  }

  bool _hasData(WorkoutSet s, SetRecord? f, TrackingType t) {
    final reps = s.reps ?? f?.reps;
    final weight = s.weightKg ?? f?.weightKg;
    final dur = s.durationS ?? f?.durationS;
    final dist = s.distanceM ?? f?.distanceM;
    return switch (t) {
      TrackingType.weightReps => reps != null && reps > 0 && weight != null,
      TrackingType.bodyweightReps => reps != null && reps > 0,
      TrackingType.duration => dur != null && dur > 0,
      TrackingType.distanceDuration => dur != null || dist != null,
      TrackingType.weightDistance => weight != null && dist != null,
    };
  }

  Future<void> _toggle(BuildContext context, WidgetRef ref, WorkoutSet s, String label, double inc, SetRecord? fallback, UserPrefs? prefs) async {
    final repo = ref.read(workoutRepositoryProvider);
    if (s.completed) {
      await repo.uncompleteSet(s.id);
      return;
    }
    if (!_hasData(s, fallback, item.exercise.tracking)) {
      await _edit(context, ref, s, label, inc, fallback);
      return;
    }
    unawaited(HapticFeedback.mediumImpact());
    await repo.completeSet(s, fallback: fallback);
    _startRest(ref, s, prefs);
  }

  void _startRest(WidgetRef ref, WorkoutSet s, UserPrefs? prefs) {
    if (workout.endedAt != null || nextInSuperset) return;
    final seconds = s.kind == 'warmup' ? 60 : item.row.restSeconds ?? prefs?.defaultRestSeconds ?? 120;
    ref.read(restTimerProvider.notifier).start(seconds);
  }

  Future<void> _edit(BuildContext context, WidgetRef ref, WorkoutSet s, String label, double inc, SetRecord? fallback) async {
    final units = ref.read(unitsProvider);
    final r = await showSetEditor(
      context,
      title: '${item.exercise.name} · Set $label',
      tracking: item.exercise.tracking,
      units: units,
      incrementKg: inc,
      kind: SetKind.fromName(s.kind),
      weightKg: s.weightKg ?? fallback?.weightKg,
      reps: s.reps ?? fallback?.reps,
      durationS: s.durationS ?? fallback?.durationS,
      distanceM: s.distanceM ?? fallback?.distanceM,
      rpe: s.rpe,
      completed: s.completed,
    );
    if (r == null) return;
    final repo = ref.read(workoutRepositoryProvider);
    if (r.delete) {
      await repo.deleteSet(s.id);
      return;
    }
    final becameComplete = r.complete && !s.completed;
    await repo.updateSet(
      s.id,
      WorkoutSetsCompanion(
        kind: Value(r.kind.name),
        weightKg: Value(r.weightKg),
        reps: Value(r.reps),
        durationS: Value(r.durationS),
        distanceM: Value(r.distanceM),
        rpe: Value(r.rpe),
        completed: r.complete ? const Value(true) : const Value.absent(),
        completedAt: becameComplete ? Value(nowUtc()) : const Value.absent(),
      ),
    );
    if (becameComplete) {
      unawaited(HapticFeedback.mediumImpact());
      _startRest(ref, s, ref.read(prefsProvider).value);
    }
  }

  Future<void> _menu(BuildContext context, WidgetRef ref, String action) async {
    final repo = ref.read(workoutRepositoryProvider);
    switch (action) {
      case 'swap':
        final replacement = await _pickSubstitute(context, ref);
        if (replacement != null) {
          await ref.read(trainingServiceProvider).substitute(current: item, replacement: replacement, workoutId: workout.id);
        }
      case 'warmup':
        await repo.addSet(item.row.id, kind: SetKind.warmup);
      case 'rest':
        final seconds = await _pickRest(context, item.row.restSeconds ?? ref.read(prefsProvider).value?.defaultRestSeconds ?? 120);
        if (seconds != null) await repo.updateWorkoutExercise(item.row.id, WorkoutExercisesCompanion(restSeconds: Value(seconds)));
      case 'superset':
        final detail = await repo.workout(workout.id);
        if (detail == null) return;
        final i = detail.exercises.indexWhere((x) => x.row.id == item.row.id);
        if (i < 0 || i + 1 >= detail.exercises.length) return;
        final used = detail.exercises.map((x) => x.row.supersetGroup).whereType<int>().toSet();
        final group = item.row.supersetGroup ?? (used.isEmpty ? 1 : used.reduce((a, b) => a > b ? a : b) + 1);
        await repo.updateWorkoutExercise(item.row.id, WorkoutExercisesCompanion(supersetGroup: Value(group)));
        await repo.updateWorkoutExercise(detail.exercises[i + 1].row.id, WorkoutExercisesCompanion(supersetGroup: Value(group)));
      case 'up':
        await repo.moveExercise(workout.id, item.row.id, -1);
      case 'down':
        await repo.moveExercise(workout.id, item.row.id, 1);
      case 'remove':
        await repo.removeExercise(item.row.id);
    }
  }

  Future<Exercise?> _pickSubstitute(BuildContext context, WidgetRef ref) async {
    final library = ref.read(exerciseLibraryProvider).value ?? await ref.read(exerciseRepositoryProvider).all();
    final ctx = ref.read(trainingContextProvider);
    final options = ref.read(exerciseRepositoryProvider).alternatives(item.exercise, library, ctx);
    if (!context.mounted) return null;
    return showModalBottomSheet<Exercise>(
      context: context,
      isScrollControlled: true,
      useSafeArea: true,
      builder: (c) => DraggableScrollableSheet(
        expand: false,
        initialChildSize: 0.6,
        builder: (c, scroll) => ListView(
          controller: scroll,
          children: [
            Padding(
              padding: const EdgeInsets.fromLTRB(Space.gutter, 0, Space.gutter, Space.sm),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text('Substitute ${item.exercise.name}', style: c.text.titleLarge),
                  const SizedBox(height: Space.xs),
                  Text(
                    'Same movement or muscle, filtered by your equipment and restrictions. '
                    'Suggestions for the new exercise use its own history.',
                    style: c.text.bodySmall,
                  ),
                ],
              ),
            ),
            if (options.isEmpty)
              const EmptyState(icon: Icons.swap_horiz_rounded, title: 'No alternatives', message: 'Nothing matches your equipment and restrictions.', compact: true),
            for (final o in options)
              ListTile(
                title: Text(o.name),
                subtitle: Text(
                  [
                    if (o.pattern == item.exercise.pattern) 'Same movement' else 'Same muscle',
                    o.equipmentList.isEmpty ? 'Bodyweight' : o.equipmentList.map((x) => equipmentInfo(x)?.label ?? x).join(' + '),
                  ].join(' · '),
                ),
                onTap: () => Navigator.pop(c, o),
              ),
            ListTile(
              leading: const Icon(Icons.search_rounded),
              title: const Text('Search all exercises'),
              onTap: () async {
                final picked = await showExercisePicker(c, title: 'Substitute');
                if (c.mounted) Navigator.pop(c, picked);
              },
            ),
          ],
        ),
      ),
    );
  }

  Future<int?> _pickRest(BuildContext context, int current) => showModalBottomSheet<int>(
        context: context,
        builder: (c) => SafeArea(
          child: Padding(
            padding: const EdgeInsets.fromLTRB(Space.gutter, 0, Space.gutter, Space.lg),
            child: Column(
              mainAxisSize: MainAxisSize.min,
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text('Rest timer', style: c.text.titleLarge),
                const SizedBox(height: Space.lg),
                Wrap(
                  spacing: Space.sm,
                  runSpacing: Space.sm,
                  children: [
                    for (final s in const [0, 45, 60, 90, 120, 150, 180, 240, 300])
                      ChoiceChip(
                        label: Text(s == 0 ? 'Off' : clock(Duration(seconds: s))),
                        selected: s == current,
                        onSelected: (_) => Navigator.pop(c, s),
                      ),
                  ],
                ),
              ],
            ),
          ),
        ),
      );

  void _showInfo(BuildContext context, WidgetRef ref, Exercise e) {
    final rec = StoredRecommendation.parse(item.row.recommendation);
    showModalBottomSheet<void>(
      context: context,
      isScrollControlled: true,
      useSafeArea: true,
      builder: (c) => DraggableScrollableSheet(
        expand: false,
        initialChildSize: 0.6,
        builder: (c, scroll) => ListView(
          controller: scroll,
          padding: const EdgeInsets.fromLTRB(Space.gutter, 0, Space.gutter, Space.xxl),
          children: [
            Text(e.name, style: c.text.headlineMedium),
            const SizedBox(height: Space.xs),
            Text(
              [muscleLabel(e.primaryMuscle), ...e.secondaryList.map(muscleLabel)].join(' · '),
              style: c.text.bodyMedium,
            ),
            if (rec != null) ...[
              const SizedBox(height: Space.xl),
              const Eyebrow('Why this suggestion'),
              const SizedBox(height: Space.sm),
              Text(rec.headline, style: c.text.titleSmall),
              const SizedBox(height: Space.xs),
              for (final r in rec.reasons)
                Padding(padding: const EdgeInsets.only(bottom: 4), child: Text('• $r', style: c.text.bodyMedium)),
              Text('Suggestions are a starting point — adjust any value to how you feel today.', style: c.text.bodySmall),
            ],
            if (e.instructionSteps.isNotEmpty) ...[
              const SizedBox(height: Space.xl),
              const Eyebrow('How to'),
              const SizedBox(height: Space.sm),
              for (final (i, step) in e.instructionSteps.indexed)
                Padding(padding: const EdgeInsets.only(bottom: 6), child: Text('${i + 1}. $step', style: c.text.bodyLarge)),
            ],
          ],
        ),
      ),
    );
  }
}

class _RecommendationChip extends StatelessWidget {
  const _RecommendationChip({required this.rec, required this.units});
  final StoredRecommendation rec;
  final Units units;

  @override
  Widget build(BuildContext context) {
    final c = context.colors;
    final (icon, color) = switch (rec.action) {
      'increaseLoad' => (Icons.trending_up_rounded, c.positive),
      'reduceLoad' || 'deload' => (Icons.trending_down_rounded, c.caution),
      'baseline' => (Icons.flag_outlined, c.textSecondary),
      _ => (Icons.trending_flat_rounded, c.textSecondary),
    };
    var headline = rec.headline;
    // Headlines are written in kg; show the user's unit for loads.
    if (units.imperial && rec.weightKg != null) {
      headline = headline.replaceAllMapped(RegExp(r'(\d+(?:\.\d+)?) kg'), (m) => units.weight(double.parse(m[1]!)));
    }
    return Padding(
      padding: const EdgeInsets.fromLTRB(Space.lg, Space.sm, Space.lg, 0),
      child: Row(
        children: [
          Icon(icon, size: 16, color: color),
          const SizedBox(width: 6),
          Expanded(child: Text(headline, style: context.text.labelMedium?.copyWith(color: color))),
          if (rec.safetyCapped) Tooltip(message: 'Limited by your safety settings', child: Icon(Icons.shield_outlined, size: 16, color: c.textTertiary)),
        ],
      ),
    );
  }
}

class _SetHeader extends StatelessWidget {
  const _SetHeader({required this.tracking, required this.units});
  final TrackingType tracking;
  final Units units;

  @override
  Widget build(BuildContext context) {
    final style = context.text.labelSmall;
    return Row(
      children: [
        SizedBox(width: 32, child: Text('SET', style: style)),
        Expanded(flex: 3, child: Text('PREVIOUS', style: style)),
        if (tracking.usesWeight) Expanded(flex: 2, child: Text(units.weightLabel.toUpperCase(), style: style, textAlign: TextAlign.center)),
        if (tracking.usesReps) Expanded(flex: 2, child: Text('REPS', style: style, textAlign: TextAlign.center)),
        if (tracking.usesDistance) Expanded(flex: 2, child: Text('KM', style: style, textAlign: TextAlign.center)),
        if (tracking.usesDuration) Expanded(flex: 2, child: Text('TIME', style: style, textAlign: TextAlign.center)),
        if (tracking.usesReps) Expanded(flex: 1, child: Text('RPE', style: style, textAlign: TextAlign.center)),
        const SizedBox(width: kWorkoutHitTarget),
      ],
    );
  }
}

class _SetRow extends StatelessWidget {
  const _SetRow({
    required this.set,
    required this.label,
    required this.tracking,
    required this.previous,
    required this.fallback,
    required this.units,
    required this.onEdit,
    required this.onToggle,
  });

  final WorkoutSet set;
  final String label;
  final TrackingType tracking;
  final SetRecord? previous;
  final SetRecord? fallback;
  final Units units;
  final VoidCallback onEdit;
  final VoidCallback onToggle;

  String _prev() {
    final p = previous;
    if (p == null) return '—';
    return switch (tracking) {
      TrackingType.weightReps || TrackingType.bodyweightReps =>
        (p.weightKg ?? 0) > 0 ? '${units.weight(p.weightKg, unit: false)} × ${p.reps ?? 0}' : '${p.reps ?? 0} reps',
      TrackingType.duration => clock(Duration(seconds: p.durationS ?? 0)),
      TrackingType.distanceDuration => '${number((p.distanceM ?? 0) / 1000, maxDecimals: 2)} km',
      TrackingType.weightDistance => '${units.weight(p.weightKg, unit: false)} · ${number(p.distanceM ?? 0)} m',
    };
  }

  @override
  Widget build(BuildContext context) {
    final c = context.colors;
    final done = set.completed;
    final warm = set.kind == 'warmup';

    Widget cell(String? value, String? hint, {int flex = 2}) => Expanded(
          flex: flex,
          child: GestureDetector(
            behavior: HitTestBehavior.opaque,
            onTap: onEdit,
            child: Container(
              height: 40,
              margin: const EdgeInsets.symmetric(horizontal: 3),
              alignment: Alignment.center,
              decoration: BoxDecoration(
                color: done ? Colors.transparent : c.surfaceRaised,
                borderRadius: BorderRadius.circular(Radii.sm),
              ),
              child: Text(
                value ?? hint ?? '—',
                style: context.text.titleSmall?.copyWith(
                  fontFeatures: tabularFigures,
                  color: value != null ? c.textPrimary : c.textTertiary,
                ),
              ),
            ),
          ),
        );

    final f = fallback;
    return AnimatedContainer(
      duration: Motion.fast,
      color: done ? c.positive.withValues(alpha: 0.08) : Colors.transparent,
      padding: const EdgeInsets.symmetric(horizontal: Space.md, vertical: 3),
      child: Row(
        children: [
          SizedBox(
            width: 32,
            child: Text(
              label,
              style: context.text.titleSmall?.copyWith(color: warm ? c.caution : c.textSecondary),
            ),
          ),
          Expanded(
            flex: 3,
            child: GestureDetector(
              onTap: onEdit,
              child: Text(_prev(), style: context.text.bodySmall?.copyWith(fontFeatures: tabularFigures), maxLines: 1, overflow: TextOverflow.ellipsis),
            ),
          ),
          if (tracking.usesWeight)
            cell(
              set.weightKg == null ? null : units.weight(set.weightKg, unit: false),
              f?.weightKg == null ? (tracking == TrackingType.bodyweightReps ? 'BW' : null) : units.weight(f!.weightKg, unit: false),
            ),
          if (tracking.usesReps) cell(set.reps?.toString(), f?.reps?.toString()),
          if (tracking.usesDistance)
            cell(set.distanceM == null ? null : number(set.distanceM! / 1000, maxDecimals: 2), f?.distanceM == null ? null : number(f!.distanceM! / 1000, maxDecimals: 2)),
          if (tracking.usesDuration)
            cell(set.durationS == null ? null : clock(Duration(seconds: set.durationS!)), f?.durationS == null ? null : clock(Duration(seconds: f!.durationS!))),
          if (tracking.usesReps) cell(set.rpe == null ? null : number(set.rpe!), null, flex: 1),
          SizedBox(
            width: kWorkoutHitTarget,
            height: 48,
            child: Semantics(
              button: true,
              label: done ? 'Mark set $label as not done' : 'Complete set $label',
              child: InkWell(
                borderRadius: BorderRadius.circular(Radii.sm),
                onTap: onToggle,
                child: Center(
                  child: AnimatedContainer(
                    duration: Motion.fast,
                    width: 36,
                    height: 36,
                    decoration: BoxDecoration(
                      color: done ? c.positive : c.surfaceRaised,
                      borderRadius: BorderRadius.circular(Radii.sm),
                      border: Border.all(color: done ? c.positive : c.outlineStrong),
                    ),
                    child: Icon(Icons.check_rounded, size: 22, color: done ? c.background : c.textTertiary),
                  ),
                ),
              ),
            ),
          ),
        ],
      ),
    );
  }
}
