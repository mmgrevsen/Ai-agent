import 'package:drift/drift.dart' show Value;
import 'package:flutter_test/flutter_test.dart';
import 'package:forma/data/db/app_database.dart';
import 'package:forma/data/remote/food_api.dart';
import 'package:forma/data/repositories/body_repository.dart';
import 'package:forma/data/repositories/exercise_repository.dart';
import 'package:forma/data/repositories/nutrition_repository.dart';
import 'package:forma/data/repositories/settings_repository.dart';
import 'package:forma/data/repositories/workout_repository.dart';
import 'package:forma/domain/catalog.dart';
import 'package:forma/domain/dates.dart';
import 'package:forma/domain/nutrition/food.dart';
import 'package:forma/domain/nutrition/nutrients.dart';
import 'package:forma/domain/provenance.dart';
import 'package:forma/domain/training/models.dart';
import 'package:forma/domain/training/progression_engine.dart';
import 'package:forma/services/program_generator.dart';
import 'package:forma/services/training_service.dart';

import '../helpers.dart';

void main() {
  late AppDatabase db;
  late SettingsRepository settings;
  late ExerciseRepository exercises;
  late WorkoutRepository workouts;
  late TrainingService training;

  setUp(() async {
    db = await testDatabase();
    settings = SettingsRepository(db);
    exercises = ExerciseRepository(db);
    workouts = WorkoutRepository(db);
    training = TrainingService(workouts: workouts, exercises: exercises, settings: settings);
  });
  tearDown(() => db.close());

  test('exercise library is seeded once and searchable', () async {
    final all = await exercises.all();
    expect(all.length, greaterThan(70));
    await ExerciseRepository(db).seed('{"version": 1, "exercises": []}'); // same version → no-op
    expect((await exercises.all()).length, all.length);
    final hits = ExerciseRepository.search(all, 'bench');
    expect(hits.first.name, startsWith('Bench'));
  });

  test('alternatives respect equipment and restrictions', () async {
    await settings.setEquipmentSet({'dumbbell', 'bench'});
    await settings.addRestriction('pattern', 'vertical_push');
    final ctx = TrainingContext(
      available: {for (final e in await settings.equipment()) e.equipment},
      restrictions: await settings.restrictions(),
      increments: const {},
    );
    final bench = (await exercises.byId('barbell-bench-press'))!;
    final alts = exercises.alternatives(bench, await exercises.all(), ctx);
    expect(alts.map((e) => e.id), contains('dumbbell-bench-press'));
    expect(alts.every(ctx.hasEquipmentFor), isTrue);
    expect(alts.any((e) => e.pattern == 'vertical_push'), isFalse);
  });

  test('program generator only uses available, unrestricted exercises', () async {
    final library = await exercises.all();
    const ctx = TrainingContext(available: {'dumbbell', 'bench', 'pullup_bar'}, restrictions: [], increments: {});
    final program = ProgramGenerator(testContentBundle().programs).generate(library: library, context: ctx, daysPerWeek: 3, goal: TrainingGoal.muscle, experience: 'beginner');
    expect(program.templates, hasLength(2));
    expect(program.templates.expand((t) => t.weekdays).toList()..sort(), [1, 3, 5]);
    final byId = {for (final e in library) e.id: e};
    for (final t in program.templates) {
      for (final i in t.items) {
        expect(ctx.hasEquipmentFor(byId[i.exerciseId]!), isTrue, reason: i.exerciseId);
      }
    }
  });

  test('full workout lifecycle: template → log → finish → history → next recommendation', () async {
    await settings.setEquipmentSet({'barbell', 'rack', 'bench'});
    final templateId = await workouts.saveTemplate(name: 'Push', items: const [
      TemplateItemInput(exerciseId: 'barbell-bench-press', sets: 3, repMin: 8, repMax: 10, targetRpe: 8, warmupSets: 2),
    ]);

    // First session: no history → baseline, no invented load, no warm-ups.
    final w1 = await training.startWorkout(templateId: templateId, now: DateTime(2026, 10, 1, 18));
    var d1 = (await workouts.workout(w1))!;
    final rec1 = StoredRecommendation.parse(d1.exercises.single.row.recommendation)!;
    expect(rec1.action, ProgressionAction.baseline.name);
    expect(rec1.weightKg, isNull);
    expect(d1.exercises.single.sets.where((s) => s.kind == 'warmup'), isEmpty);
    expect(d1.exercises.single.sets, hasLength(3));
    for (final s in d1.exercises.single.sets) {
      await workouts.updateSet(s.id, const WorkoutSetsCompanion(weightKg: Value(60), reps: Value(10), rpe: Value(8)));
      await workouts.completeSet((await workouts.workout(w1))!.exercises.single.sets.firstWhere((x) => x.id == s.id));
    }
    await workouts.addSet(d1.exercises.single.row.id); // left incomplete → removed on finish
    await workouts.finishWorkout(w1, endedAt: DateTime(2026, 10, 1, 19));
    d1 = (await workouts.workout(w1))!;
    expect(d1.exercises.single.sets, hasLength(3));
    expect(d1.volumeKg, 1800);

    final history = await workouts.history();
    expect(history.single.setCount, 3);
    final ex = await workouts.exerciseHistory('barbell-bench-press');
    expect(ex.single.workingSets, hasLength(3));

    // Second session: engine suggests +2.5 kg with warm-ups toward it.
    final w2 = await training.startWorkout(templateId: templateId, now: DateTime(2026, 10, 4, 18));
    final d2 = (await workouts.workout(w2))!;
    final rec2 = StoredRecommendation.parse(d2.exercises.single.row.recommendation)!;
    expect(rec2.action, ProgressionAction.increaseLoad.name);
    expect(rec2.weightKg, 62.5);
    final warmups = d2.exercises.single.sets.where((s) => s.kind == 'warmup').toList();
    expect(warmups, hasLength(2));
    expect(warmups.every((s) => s.weightKg! < 62.5), isTrue);

    // One-tap completion fills the suggested values.
    final first = d2.exercises.single.sets.firstWhere((s) => s.kind == 'working');
    await workouts.completeSet(first, fallback: const SetRecord(weightKg: 62.5, reps: 8));
    final done = (await workouts.workout(w2))!.exercises.single.sets.firstWhere((s) => s.id == first.id);
    expect(done.weightKg, 62.5);
    expect(done.reps, 8);
    expect(done.completed, isTrue);
  });

  test('substitution keeps position and starts fresh history', () async {
    final w = await workouts.createWorkout(name: 'Test');
    final bench = (await exercises.byId('barbell-bench-press'))!;
    final row = (await exercises.byId('barbell-row'))!;
    await training.addExerciseToWorkout(workoutId: w, exercise: bench);
    await training.addExerciseToWorkout(workoutId: w, exercise: row);
    var d = (await workouts.workout(w))!;
    await training.substitute(current: d.exercises.first, replacement: (await exercises.byId('dumbbell-bench-press'))!, workoutId: w);
    d = (await workouts.workout(w))!;
    expect(d.exercises.map((e) => e.exercise.id), ['dumbbell-bench-press', 'barbell-row']);
    expect(d.exercises.first.row.substitutedFromId, 'barbell-bench-press');
  });

  test('deload week detection from schedule', () {
    final s = TrainingSchedule(
      id: 's',
      createdAt: DateTime(2026),
      updatedAt: DateTime(2026),
      dirty: true,
      name: 'x',
      isActive: true,
      startDate: '2026-09-07', // Monday
      deloadEveryWeeks: 4,
    );
    expect(WorkoutRepository.isDeloadWeek(s, DateTime(2026, 9, 8)), isFalse);
    expect(WorkoutRepository.isDeloadWeek(s, DateTime(2026, 9, 29)), isTrue); // week 4
    expect(WorkoutRepository.isDeloadWeek(s, DateTime(2026, 10, 6)), isFalse);
  });

  group('nutrition', () {
    late NutritionRepository nutrition;
    setUp(() => nutrition = NutritionRepository(db));

    test('logging snapshots nutrients and keeps unknowns unknown', () async {
      final food = await nutrition.saveFood(const FoodItem(
        name: 'Skyr',
        brand: 'Test',
        source: 'off',
        sourceRef: '5701234567890',
        provenance: Provenance.community,
        per100g: Nutrients(kcal: 60, proteinG: 11, carbsG: 4, fatG: 0.2),
        servings: [ServingOption('1 cup', 170)],
      ));
      final day = DateTime(2026, 10, 2);
      await nutrition.logFood(food: food, grams: 170, meal: MealSlot.breakfast, day: day);
      final log = await nutrition.dayLog(day);
      expect(log.entries.single.kcal, closeTo(102, 0.001));
      expect(log.entries.single.fiberG, isNull);
      expect(log.totals.incompleteFields, {'fiber'});

      // Saving the same barcode again updates rather than duplicates.
      await nutrition.saveFood(const FoodItem(name: 'Skyr v2', source: 'off', sourceRef: '5701234567890', provenance: Provenance.community, per100g: Nutrients(kcal: 62)));
      expect((await nutrition.searchLocal('skyr')).length, 1);
      // History is not rewritten by the food update.
      expect((await nutrition.dayLog(day)).entries.single.kcal, closeTo(102, 0.001));

      await nutrition.updateEntryAmount(log.entries.single, grams: 340);
      expect((await nutrition.dayLog(day)).entries.single.kcal, closeTo(204, 0.001));
    });

    test('recipes, saved meals, copy meal and water', () async {
      final oats = await nutrition.saveFood(const FoodItem(name: 'Oats', source: 'custom', provenance: Provenance.custom, per100g: Nutrients(kcal: 380, proteinG: 13, carbsG: 60, fatG: 7, fiberG: 10)));
      final milk = await nutrition.saveFood(const FoodItem(name: 'Milk', source: 'custom', provenance: Provenance.custom, per100g: Nutrients(kcal: 64, proteinG: 3.4, carbsG: 4.8, fatG: 3.5, fiberG: 0)));
      final id = await nutrition.saveRecipe(name: 'Porridge', servings: 2, ingredients: [(oats.id, 100), (milk.id, 400)]);
      final recipe = (await nutrition.recipes()).firstWhere((r) => r.recipe.id == id);
      expect(recipe.perServing.kcal, closeTo((380 + 256) / 2, 0.01));
      final day = DateTime(2026, 10, 3);
      await nutrition.logRecipe(recipe: recipe, servings: 1, meal: MealSlot.breakfast, day: day);
      final log = await nutrition.dayLog(day);
      expect(log.entries.single.provenance, Provenance.calculated.name);

      await nutrition.logFood(food: oats, grams: 50, meal: MealSlot.snack, day: day);
      final n = await nutrition.saveMeal('Snack', (await nutrition.dayLog(day)).byMeal[MealSlot.snack]!);
      expect(n, 1);
      final next = addDays(day, 1);
      expect(await nutrition.copyMeal(from: day, meal: MealSlot.breakfast, to: next), 1);
      await nutrition.logSavedMeal((await nutrition.savedMeals()).single, slot: MealSlot.lunch, day: next);
      await nutrition.addWater(next, 500);
      await nutrition.addWater(next, 250);
      await nutrition.undoWater(next);
      final l2 = await nutrition.dayLog(next);
      expect(l2.entries, hasLength(2));
      expect(l2.waterMl, 500);
    });

    test('daily intake marks partial days incomplete', () async {
      final f = await nutrition.saveFood(const FoodItem(name: 'X', source: 'custom', provenance: Provenance.custom, per100g: Nutrients(kcal: 100)));
      await nutrition.logFood(food: f, grams: 2000, meal: MealSlot.lunch, day: DateTime(2026, 1, 1));
      await nutrition.logFood(food: f, grams: 100, meal: MealSlot.lunch, day: DateTime(2026, 1, 2));
      final intake = await nutrition.dailyIntake(from: DateTime(2026, 1, 1), to: DateTime(2026, 1, 2));
      expect(intake.firstWhere((d) => d.day.day == 1).complete, isTrue);
      expect(intake.firstWhere((d) => d.day.day == 2).complete, isFalse);
    });
  });

  test('body weights: import is idempotent and trend computes', () async {
    final body = BodyRepository(db);
    await body.addWeight(80, at: DateTime(2026, 1, 1, 8));
    expect(await body.importWeight(kg: 79.5, at: DateTime(2026, 1, 2, 8), externalId: 'hk-1'), isTrue);
    expect(await body.importWeight(kg: 79.5, at: DateTime(2026, 1, 2, 8), externalId: 'hk-1'), isFalse);
    final trend = BodyRepository.trendOf(await body.weights());
    expect(trend.weighInCount, 2);
    expect(trend.latest!.trendKg, closeTo(79.95, 1e-9));
  });

  test('targets: latest effective target applies and same-day replaces', () async {
    await settings.setTargets(kcal: 2500, from: DateTime(2026, 1, 1));
    await settings.setTargets(kcal: 2300, from: DateTime(2026, 2, 1));
    await settings.setTargets(kcal: 2200, from: DateTime(2026, 2, 1));
    expect((await settings.targetFor(DateTime(2026, 1, 15)))!.kcal, 2500);
    expect((await settings.targetFor(DateTime(2026, 3, 1)))!.kcal, 2200);
    expect(await settings.targetFor(DateTime(2025, 12, 31)), isNull);
  });

  test('Open Food Facts parsing never invents values', () {
    final item = parseOffProduct({
      'code': '123456789',
      'product_name': 'Crisp bread',
      'brands': 'Brand A, Brand B',
      'serving_quantity': 12,
      'serving_size': '1 slice (12 g)',
      'nutriments': {'energy-kj_100g': 1500, 'proteins_100g': 10, 'carbohydrates_100g': '60,5'},
    })!;
    expect(item.brand, 'Brand A');
    expect(item.per100g.kcal, closeTo(358.5, 0.1)); // converted from kJ
    expect(item.per100g.carbsG, 60.5);
    expect(item.per100g.fatG, isNull);
    expect(item.per100g.fiberG, isNull);
    expect(item.provenance, Provenance.community);
    expect(item.servings.first.grams, 12);
    expect(parseOffProduct({'product_name': 'No data', 'nutriments': <String, dynamic>{}}), isNull);
    expect(parseOffProduct({'nutriments': {'energy-kcal_100g': 100}}), isNull);
  });
}

