import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../core/util/format.dart';
import '../data/db/app_database.dart';
import '../data/remote/ai_api.dart';
import '../data/remote/backend.dart';
import '../data/repositories/body_repository.dart';
import '../data/repositories/coach_repository.dart';
import '../data/repositories/exercise_repository.dart';
import '../data/repositories/nutrition_repository.dart';
import '../data/repositories/settings_repository.dart';
import '../data/repositories/workout_repository.dart';
import '../domain/dates.dart';

/// Overridden in `main` (on-device database) and in tests (in-memory).
final databaseProvider = Provider<AppDatabase>((ref) => throw UnimplementedError('databaseProvider must be overridden'));

/// Overridden in `main`. Defaults to local-only mode.
final backendProvider = Provider<Backend>((ref) => Backend(null));

/// Injectable clock so tests can pin "today".
final clockProvider = Provider<DateTime Function()>((ref) => DateTime.now);

final todayProvider = Provider<DateTime>((ref) => dateOnly(ref.watch(clockProvider)()));

final settingsRepositoryProvider = Provider((ref) => SettingsRepository(ref.watch(databaseProvider)));
final exerciseRepositoryProvider = Provider((ref) => ExerciseRepository(ref.watch(databaseProvider)));
final workoutRepositoryProvider = Provider((ref) => WorkoutRepository(ref.watch(databaseProvider)));
final nutritionRepositoryProvider = Provider((ref) => NutritionRepository(ref.watch(databaseProvider)));
final bodyRepositoryProvider = Provider((ref) => BodyRepository(ref.watch(databaseProvider)));
final coachRepositoryProvider = Provider((ref) => CoachRepository(ref.watch(databaseProvider)));

final profileProvider = StreamProvider<Profile>((ref) => ref.watch(settingsRepositoryProvider).watchProfile());
final prefsProvider = StreamProvider<UserPrefs>((ref) => ref.watch(settingsRepositoryProvider).watchPrefs());

/// Unit formatter for the current preferences (metric until loaded).
final unitsProvider = Provider<Units>((ref) {
  final prefs = ref.watch(prefsProvider).value;
  return Units.of(prefs?.unitSystem ?? 'metric');
});

final aiApiProvider = Provider((ref) => AiApi(ref.watch(backendProvider)));

final authUserProvider = StreamProvider((ref) => ref.watch(backendProvider).authChanges());

final exerciseLibraryProvider = StreamProvider<List<Exercise>>((ref) => ref.watch(exerciseRepositoryProvider).watchAll());

/// Equipment + restrictions. Before they load, nothing is filtered.
final trainingContextProvider = Provider<TrainingContext>((ref) {
  final equipment = ref.watch(equipmentProvider).value ?? const [];
  final restrictions = ref.watch(restrictionsProvider).value ?? const [];
  return TrainingContext(
    available: {for (final e in equipment) e.equipment},
    restrictions: restrictions,
    increments: {for (final e in equipment) e.equipment: e.incrementKg},
  );
});

final equipmentProvider = StreamProvider((ref) => ref.watch(settingsRepositoryProvider).watchEquipment());
final restrictionsProvider = StreamProvider((ref) => ref.watch(settingsRepositoryProvider).watchRestrictions());
final goalsProvider = StreamProvider((ref) => ref.watch(settingsRepositoryProvider).watchGoals());
