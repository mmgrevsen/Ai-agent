import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../app/providers.dart';
import '../../content/content_providers.dart';
import '../../data/db/app_database.dart';
import '../../data/repositories/exercise_repository.dart';
import '../../data/repositories/workout_repository.dart';
import '../../domain/training/models.dart';
import '../../domain/training/progression_engine.dart';
import '../../services/training_service.dart';

final trainingServiceProvider = Provider(
  (ref) => TrainingService(
    workouts: ref.watch(workoutRepositoryProvider),
    exercises: ref.watch(exerciseRepositoryProvider),
    settings: ref.watch(settingsRepositoryProvider),
    engine: ProgressionEngine(tuning: ref.watch(progressionTuningProvider)),
  ),
);

final activeWorkoutProvider = StreamProvider<Workout?>((ref) => ref.watch(workoutRepositoryProvider).watchActiveWorkout());

final templatesProvider = StreamProvider<List<TemplateWithItems>>((ref) => ref.watch(workoutRepositoryProvider).watchTemplates());

final scheduleProvider = StreamProvider<ScheduleWithDays?>((ref) => ref.watch(workoutRepositoryProvider).watchActiveSchedule());

final historyProvider = StreamProvider<List<WorkoutListItem>>((ref) => ref.watch(workoutRepositoryProvider).watchHistory());

final workoutDetailProvider = StreamProvider.family<WorkoutDetail?, String>(
  (ref, id) => ref.watch(workoutRepositoryProvider).watchWorkout(id),
);

/// Completed sessions of an exercise (newest first). Refreshes when history changes.
final exerciseHistoryProvider = FutureProvider.family<List<ExerciseSession>, String>((ref, exerciseId) {
  ref.watch(historyProvider);
  return ref.watch(workoutRepositoryProvider).exerciseHistory(exerciseId);
});

/// What to ask [nextLoadProvider] for: an exercise with its prescription.
class NextLoadQuery {
  const NextLoadQuery(this.exercise, this.prescription, {this.startWeightKg});

  NextLoadQuery.of(TemplateItem item)
      : exercise = item.exercise,
        prescription = Prescription(sets: item.row.sets, repMin: item.row.repMin, repMax: item.row.repMax, targetRpe: item.row.targetRpe),
        startWeightKg = item.row.startWeightKg;

  final Exercise exercise;
  final Prescription prescription;
  final double? startWeightKg;

  @override
  bool operator ==(Object other) =>
      other is NextLoadQuery &&
      other.exercise.id == exercise.id &&
      other.exercise.tracking == exercise.tracking &&
      other.prescription.sets == prescription.sets &&
      other.prescription.repMin == prescription.repMin &&
      other.prescription.repMax == prescription.repMax &&
      other.prescription.targetRpe == prescription.targetRpe &&
      other.startWeightKg == startWeightKg;

  @override
  int get hashCode =>
      Object.hash(exercise.id, exercise.tracking, prescription.sets, prescription.repMin, prescription.repMax, prescription.targetRpe, startWeightKg);
}

/// The load the next session will suggest for an exercise, so the plan can
/// show kilos before a workout starts. Refreshes when workouts change.
final nextLoadProvider = FutureProvider.family<Recommendation, NextLoadQuery>((ref, q) {
  ref.watch(historyProvider);
  ref.watch(scheduleProvider);
  return ref.watch(trainingServiceProvider).nextLoad(
        exercise: q.exercise,
        prescription: q.prescription,
        startWeightKg: q.startWeightKg,
        now: ref.watch(clockProvider)(),
      );
});

/// Today's scheduled template, if any.
final todaysTemplateProvider = Provider<TemplateWithItems?>((ref) {
  final schedule = ref.watch(scheduleProvider).value;
  final templates = ref.watch(templatesProvider).value ?? const [];
  final id = schedule?.days[ref.watch(todayProvider).weekday];
  if (id == null) return null;
  for (final t in templates) {
    if (t.template.id == id) return t;
  }
  return null;
});
