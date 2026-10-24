import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../app/providers.dart';
import '../../data/db/app_database.dart';
import '../../data/repositories/workout_repository.dart';
import '../../domain/training/models.dart';
import '../../services/training_service.dart';

final trainingServiceProvider = Provider(
  (ref) => TrainingService(
    workouts: ref.watch(workoutRepositoryProvider),
    exercises: ref.watch(exerciseRepositoryProvider),
    settings: ref.watch(settingsRepositoryProvider),
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
