import 'dart:io';

import 'package:drift/drift.dart' show QueryRow, Variable;
import 'package:flutter_test/flutter_test.dart';
import 'package:forma/data/db/app_database.dart';
import 'package:forma/data/repositories/nutrition_repository.dart';
import 'package:forma/domain/catalog.dart';
import 'package:forma/domain/nutrition/nutrients.dart';

import '../helpers.dart';

/// The Siri / Apple Watch actions (ios/Runner/FormaIntents.swift) write to
/// the database with plain SQL. These tests run that exact SQL, read from
/// the Swift file, against the app's real schema.
final _swift = File('ios/Runner/FormaIntents.swift').readAsStringSync();

String sql(String name) {
  final m = RegExp('static let $name = (?:"""\\n(.*?)\\n\\s*"""|"(.*?)")', dotAll: true).firstMatch(_swift);
  if (m == null) fail('SQL $name not found in FormaIntents.swift');
  return (m.group(1) ?? m.group(2))!;
}

void main() {
  late AppDatabase db;
  late NutritionRepository repo;
  final day = DateTime.now();
  setUp(() async {
    db = await testDatabase();
    repo = NutritionRepository(db);
  });
  tearDown(() => db.close());

  Future<List<QueryRow>> select(String name, [List<Variable> vars = const []]) => db.customSelect(sql(name), variables: vars).get();

  Future<(String, String)> seedMeal() async {
    final rice = await repo.logEstimate(name: 'Rice', grams: 180, nutrients: const Nutrients(kcal: 234, proteinG: 4.3, carbsG: 50, fatG: 0.5), meal: MealSlot.lunch, day: day, weighed: true);
    final chicken = await repo.logEstimate(name: 'Chicken', grams: 120, nutrients: const Nutrients(kcal: 198, proteinG: 37, carbsG: 0, fatG: 4.3), meal: MealSlot.lunch, day: day);
    final mealId = await repo.saveMealItems('Rice and chicken', [(rice.food!.id, 180), (chicken.food!.id, 120)]);
    return (mealId, rice.food!.id);
  }

  test('saved meals are listed with item count and calories', () async {
    final (mealId, _) = await seedMeal();
    final rows = await select('sqlSavedMeals');
    expect(rows.single.data.values.toList(), [mealId, 'Rice and chicken', 2, closeTo(432, 1e-6)]);
  });

  test('recent foods list their saved portion', () async {
    await seedMeal();
    final rows = await select('sqlRecentFoods');
    final rice = rows.firstWhere((r) => r.data.values.elementAt(1) == 'Rice').data.values.toList();
    expect(rice.sublist(2), [180, 'weighed portion', closeTo(234, 1e-6)]);
  });

  test('logging from the watch matches logging in the app', () async {
    final (mealId, riceId) = await seedMeal();
    final items = await select('sqlMealItems', [Variable.withString(mealId)]);
    expect(items.length, 2);
    const now = '2026-10-26T12:00:00.000Z';
    final today = '${day.year}-${day.month.toString().padLeft(2, '0')}-${day.day.toString().padLeft(2, '0')}';
    for (final (i, item) in items.indexed) {
      final foodId = item.read<String>('food_id');
      final grams = item.read<double>('grams');
      final changed = await db.customUpdate(sql('sqlLogFood'), variables: [
        Variable.withString('watch-$i'), Variable.withString(now), Variable.withString(now), Variable.withString(today),
        Variable.withString('dinner'), Variable.withReal(grams), const Variable(null), const Variable(null),
        Variable.withString(now), Variable.withString(foodId),
      ], updates: {db.nutritionEntries});
      expect(changed, 1);
      await db.customUpdate(sql('sqlTouchFood'), variables: [Variable.withString(now), Variable.withString(foodId)], updates: {db.foods});
    }
    // Drift reads the rows written by the shortcut like its own.
    final log = await repo.dayLog(day);
    final watch = log.entries.where((e) => e.id.startsWith('watch-')).toList();
    expect(watch.length, 2);
    expect(watch.every((e) => e.meal == 'dinner' && e.dirty && e.deletedAt == null), isTrue);
    expect(watch.map((e) => e.kcal!).reduce((a, b) => a + b), closeTo(432, 1e-6));
    expect(watch.firstWhere((e) => e.foodId == riceId).fiberG, isNull, reason: 'unknown stays unknown');
    expect(watch.first.createdAt.toUtc(), DateTime.utc(2026, 10, 26, 12));
    final rice = await (db.select(db.foods)..where((f) => f.id.equals(riceId))).getSingle();
    expect(rice.lastUsedAt!.toUtc(), DateTime.utc(2026, 10, 26, 12));
  });

  test('a deleted food is not logged', () async {
    final (_, riceId) = await seedMeal();
    await repo.deleteFood(riceId);
    final changed = await db.customUpdate(sql('sqlLogFood'), variables: [
      Variable.withString('x'), Variable.withString('n'), Variable.withString('n'), Variable.withString('2026-10-26'),
      Variable.withString('lunch'), Variable.withReal(100), const Variable(null), const Variable(null), Variable.withString('n'), Variable.withString(riceId),
    ]);
    expect(changed, 0);
  });

  test('the meal-of-day rules match the app', () {
    for (final (h, slot) in [(7, 'breakfast'), (12, 'lunch'), (16, 'snack'), (19, 'dinner'), (23, 'snack')]) {
      expect(MealSlot.forTime(DateTime(2026, 1, 1, h)).name, slot);
    }
    expect(_swift, contains('if h < 10 { return "breakfast" }'));
    expect(_swift, contains('if h < 15 { return "lunch" }'));
    expect(_swift, contains('if h >= 17 && h < 22 { return "dinner" }'));
  });
}
