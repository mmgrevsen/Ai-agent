import 'package:drift/drift.dart' show Value;
import 'package:forma/data/db/app_database.dart';
import 'package:forma/data/repositories/body_repository.dart';
import 'package:forma/data/repositories/nutrition_repository.dart';
import 'package:forma/data/repositories/settings_repository.dart';
import 'package:forma/data/repositories/workout_repository.dart';
import 'package:forma/domain/catalog.dart';
import 'package:forma/domain/dates.dart';
import 'package:forma/domain/nutrition/food.dart';
import 'package:forma/domain/nutrition/nutrients.dart';
import 'package:forma/domain/provenance.dart';

/// Six weeks of plausible, progressing data for screenshots and demos.
Future<void> seedDemoData(AppDatabase db, {required DateTime today}) async {
  final settings = SettingsRepository(db);
  final workouts = WorkoutRepository(db);
  final nutrition = NutritionRepository(db);
  final body = BodyRepository(db);

  await settings.updateProfile(const ProfilesCompanion(
    displayName: Value('Sam'),
    birthYear: Value(1994),
    heightCm: Value(180),
    sex: Value('male'),
    primaryGoal: Value('lose_fat'),
    onboardingCompleted: Value(true),
  ));
  await settings.setEquipmentSet({'barbell', 'rack', 'bench', 'dumbbell', 'cable', 'machine', 'pullup_bar'});

  final upper = await workouts.saveTemplate(name: 'Upper', items: const [
    TemplateItemInput(exerciseId: 'barbell-bench-press', sets: 3, repMin: 6, repMax: 10, targetRpe: 8, warmupSets: 2, restSeconds: 150),
    TemplateItemInput(exerciseId: 'barbell-row', sets: 3, repMin: 6, repMax: 10, targetRpe: 8, restSeconds: 150),
    TemplateItemInput(exerciseId: 'overhead-press', sets: 3, repMin: 6, repMax: 10, targetRpe: 8, restSeconds: 120),
    TemplateItemInput(exerciseId: 'lat-pulldown', sets: 3, repMin: 10, repMax: 15, targetRpe: 9, restSeconds: 90),
  ]);
  final lower = await workouts.saveTemplate(name: 'Lower', items: const [
    TemplateItemInput(exerciseId: 'barbell-back-squat', sets: 3, repMin: 5, repMax: 8, targetRpe: 8, warmupSets: 2, restSeconds: 180),
    TemplateItemInput(exerciseId: 'romanian-deadlift', sets: 3, repMin: 6, repMax: 10, targetRpe: 8, restSeconds: 150),
    TemplateItemInput(exerciseId: 'lying-leg-curl', sets: 3, repMin: 10, repMax: 15, targetRpe: 9, restSeconds: 90),
  ]);
  for (final (d, t) in [(1, upper), (2, lower), (4, upper), (5, lower)]) {
    await workouts.setScheduleDay(d, t);
  }
  await settings.setGoal(kind: 'target_weight', targetValue: 78, unit: 'kg');

  // Training history: progressive loads, 4 sessions/week for 6 weeks.
  final start = addDays(startOfWeek(today), -42);
  var bench = 70.0, squat = 95.0, row = 60.0, ohp = 42.5, rdl = 80.0;
  for (var w = 0; w < 6; w++) {
    for (final (offset, isUpper) in [(0, true), (1, false), (3, true), (4, false)]) {
      final day = addDays(start, w * 7 + offset);
      if (!day.isBefore(today)) continue;
      final at = DateTime(day.year, day.month, day.day, 18);
      final id = await workouts.createWorkout(name: isUpper ? 'Upper' : 'Lower', templateId: isUpper ? upper : lower, startedAt: at);
      final items = isUpper
          ? [('barbell-bench-press', bench, 8), ('barbell-row', row, 9), ('overhead-press', ohp, 8), ('lat-pulldown', 55.0, 12)]
          : [('barbell-back-squat', squat, 6), ('romanian-deadlift', rdl, 8), ('lying-leg-curl', 40.0, 12)];
      for (final (ex, kg, reps) in items) {
        final we = await workouts.addExercise(workoutId: id, exerciseId: ex, repMin: reps - 2, repMax: reps + 2, targetRpe: 8);
        for (var s = 0; s < 3; s++) {
          final set = await workouts.addSet(we, weightKg: kg, reps: reps - (s == 2 ? 1 : 0));
          await workouts.updateSet(set, WorkoutSetsCompanion(rpe: Value(7.5 + s * 0.5), completed: const Value(true)));
        }
      }
      await workouts.finishWorkout(id, endedAt: at.add(const Duration(minutes: 62)));
    }
    bench += 2.5;
    squat += 5;
    row += 2.5;
    if (w.isOdd) ohp += 2.5;
    rdl += 5;
  }

  // Foods and diary: ~2,250 kcal/day.
  Future<Food> food(String name, Nutrients n, {Provenance p = Provenance.verified, String source = 'usda', String? brand}) =>
      nutrition.saveFood(FoodItem(name: name, brand: brand, source: source, provenance: p, per100g: n));
  final oats = await food('Oats, rolled', const Nutrients(kcal: 379, proteinG: 13.2, carbsG: 67.7, fatG: 6.5, fiberG: 10.1));
  final skyr = await food('Skyr natural', const Nutrients(kcal: 63, proteinG: 11, carbsG: 4, fatG: 0.2), p: Provenance.community, source: 'off', brand: 'Arla');
  final chicken = await food('Chicken breast, roasted', const Nutrients(kcal: 165, proteinG: 31, carbsG: 0, fatG: 3.6, fiberG: 0));
  final rice = await food('Rice, white, cooked', const Nutrients(kcal: 130, proteinG: 2.7, carbsG: 28, fatG: 0.3, fiberG: 0.4));
  final salmon = await food('Salmon, baked', const Nutrients(kcal: 206, proteinG: 22, carbsG: 0, fatG: 12, fiberG: 0));
  final potato = await food('Potatoes, boiled', const Nutrients(kcal: 87, proteinG: 1.9, carbsG: 20, fatG: 0.1, fiberG: 1.8));
  final apple = await food('Apple', const Nutrients(kcal: 52, proteinG: 0.3, carbsG: 14, fatG: 0.2, fiberG: 2.4));
  final bar = await food('Protein bar', const Nutrients(kcal: 360, proteinG: 33, carbsG: 30, fatG: 12), p: Provenance.community, source: 'off', brand: 'Barebells');
  for (var i = 28; i >= 0; i--) {
    final day = addDays(today, -i);
    if (i % 9 == 4) continue; // a few unlogged days
    await nutrition.logFood(food: oats, grams: 70, meal: MealSlot.breakfast, day: day);
    await nutrition.logFood(food: skyr, grams: 250, meal: MealSlot.breakfast, day: day);
    if (i == 0) continue; // today: breakfast only so far
    await nutrition.logFood(food: chicken, grams: 180, meal: MealSlot.lunch, day: day);
    await nutrition.logFood(food: rice, grams: 250, meal: MealSlot.lunch, day: day);
    await nutrition.logFood(food: salmon, grams: 160, meal: MealSlot.dinner, day: day);
    await nutrition.logFood(food: potato, grams: 300, meal: MealSlot.dinner, day: day);
    await nutrition.logFood(food: apple, grams: 180, meal: MealSlot.snack, day: day);
    await nutrition.logFood(food: bar, grams: 55, meal: MealSlot.snack, day: day);
  }
  await nutrition.addWater(today, 500);
  await nutrition.addWater(today, 250);

  // Weight trending down ~0.4 kg/week with daily noise.
  for (var i = 42; i >= 0; i--) {
    if (i % 3 == 1) continue;
    final noise = ((i * 37) % 11 - 5) / 10;
    await body.addWeight(84.0 - (42 - i) * 0.058 + noise, at: DateTime(today.year, today.month, today.day - i, 7, 30));
  }
  await settings.setTargets(kcal: 2350, proteinG: 150, carbsG: 255, fatG: 75, fiberG: 33, mode: 'adaptive', from: addDays(today, -21),
      rationale: 'Expenditure ≈ 2,780 kcal (blended, medium confidence).');
  await workouts.saveCheckin(today, energy: 4, soreness: 3, sleepQuality: 4);
}
