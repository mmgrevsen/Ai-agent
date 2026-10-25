import 'package:drift/drift.dart';
import 'package:drift_flutter/drift_flutter.dart';

import 'tables.dart';

export 'tables.dart' show newId, nowUtc;

part 'app_database.g.dart';

@DriftDatabase(
  tables: [
    Profiles,
    UserPreferences,
    UserEquipment,
    ExerciseRestrictions,
    Goals,
    NutritionTargets,
    Exercises,
    WorkoutTemplates,
    TemplateExercises,
    TrainingSchedules,
    ScheduleDays,
    Workouts,
    WorkoutExercises,
    WorkoutSets,
    ReadinessCheckins,
    Foods,
    FoodServings,
    Recipes,
    RecipeIngredients,
    SavedMeals,
    SavedMealItems,
    NutritionEntries,
    WaterEntries,
    BodyWeights,
    BodyMeasurements,
    HealthObservations,
    AiRecommendations,
    CoachMessages,
    Meta,
  ],
)
class AppDatabase extends _$AppDatabase {
  AppDatabase(super.executor);

  /// On-device database in the app's documents directory.
  factory AppDatabase.open() => AppDatabase(driftDatabase(name: 'forma'));

  static const singletonId = 'me';

  @override
  int get schemaVersion => 1;

  @override
  MigrationStrategy get migration => MigrationStrategy(
        onCreate: (m) => m.createAll(),
        beforeOpen: (details) async {
          await customStatement('PRAGMA foreign_keys = ON');
        },
      );

  /// Tables that synchronise with Supabase, parents before children so that
  /// pulled rows always satisfy foreign keys.
  List<TableInfo<Table, Object?>> get syncedTables => [
        profiles,
        userPreferences,
        userEquipment,
        exerciseRestrictions,
        goals,
        nutritionTargets,
        exercises,
        workoutTemplates,
        templateExercises,
        trainingSchedules,
        scheduleDays,
        workouts,
        workoutExercises,
        workoutSets,
        readinessCheckins,
        foods,
        foodServings,
        recipes,
        recipeIngredients,
        savedMeals,
        savedMealItems,
        nutritionEntries,
        waterEntries,
        bodyWeights,
        bodyMeasurements,
        healthObservations,
        aiRecommendations,
        coachMessages,
      ];

  Future<String?> readMeta(String key) async {
    final row = await (select(meta)..where((m) => m.key.equals(key))).getSingleOrNull();
    return row?.value;
  }

  Future<void> writeMeta(String key, String value) =>
      into(meta).insertOnConflictUpdate(MetaCompanion.insert(key: key, value: value));

  Future<void> deleteMeta(String key) => (delete(meta)..where((m) => m.key.equals(key))).go();
}
