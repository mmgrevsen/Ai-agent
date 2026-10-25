import 'package:flutter_test/flutter_test.dart';
import 'package:forma/data/db/app_database.dart';
import 'package:forma/data/remote/ai_api.dart';
import 'package:forma/data/repositories/nutrition_repository.dart';
import 'package:forma/domain/catalog.dart';
import 'package:forma/domain/nutrition/nutrients.dart';
import 'package:forma/domain/provenance.dart';

import '../helpers.dart';

void main() {
  group('photo estimate parsing', () {
    test('scale reading and weighed items are read', () {
      final r = parsePhotoEstimate({
        'items': [
          {'name': 'Rice', 'grams': 245, 'gramsLow': 240.1, 'gramsHigh': 249.9, 'kcal': 318.5, 'protein': 6.1, 'carbs': 68.6, 'fat': 1.2, 'fiber': null, 'confidence': 'medium', 'notes': null, 'weighed': true},
          {'name': 'Apple', 'grams': 180, 'gramsLow': 150, 'gramsHigh': 210, 'kcal': 94, 'protein': 0.5, 'carbs': 25, 'fat': 0.3, 'fiber': 4, 'confidence': 'high', 'notes': 'beside the scale', 'weighed': false},
        ],
        'scale': {'grams': 245, 'applied': true},
        'caveats': ['Zero the scale first'],
      });
      expect(r.scaleApplied, isTrue);
      expect(r.scaleGrams, 245);
      expect(r.items.map((i) => i.weighed), [true, false]);
      expect(r.items.first.nutrients.fiberG, isNull);
      expect(r.caveats, ['Zero the scale first']);
    });

    test('replies without scale data (older server) still parse', () {
      final r = parsePhotoEstimate({
        'items': [
          {'name': 'Soup', 'grams': 300, 'kcal': 210, 'confidence': 'low'},
        ],
        'caveats': [],
      });
      expect(r.scaleApplied, isFalse);
      expect(r.scaleGrams, isNull);
      expect(r.items.single.weighed, isFalse);
      expect(r.items.single.gramsLow, closeTo(210, 1e-9)); // default ±30 %
    });

    test('a reading that was not applied is shown but not trusted', () {
      final r = parsePhotoEstimate({'items': [], 'scale': {'grams': 612, 'applied': false}, 'caveats': []});
      expect(r.scaleGrams, 612);
      expect(r.scaleApplied, isFalse);
      final bad = parsePhotoEstimate({'items': [], 'scale': {'grams': -3, 'applied': true}, 'caveats': []});
      expect(bad.scaleGrams, isNull);
      expect(bad.scaleApplied, isFalse);
    });

    test('malformed items are dropped, not guessed', () {
      final r = parsePhotoEstimate({
        'items': [
          {'name': '', 'grams': 100},
          {'name': 'Huge', 'grams': 5000},
          {'name': 'Neg', 'grams': 100, 'kcal': -5, 'confidence': 'certain'},
          'junk',
        ],
      });
      expect(r.items.single.name, 'Neg');
      expect(r.items.single.nutrients.kcal, isNull);
      expect(r.items.single.confidence, 'low');
    });
  });

  group('barcodes', () {
    test('GTIN check digits', () {
      for (final ok in ['5701234567899', '4006381333931', '96385074', '036000291452']) {
        expect(isValidGtin(ok), isTrue, reason: ok);
      }
      for (final bad in ['5701234567890', '12345', '57012345678a9', '', '1234567890123456']) {
        expect(isValidGtin(bad), isFalse, reason: bad);
      }
    });
  });

  group('label reading', () {
    test('values, serving and barcode are read', () {
      final l = parseLabelReading({
        'name': ' Skyr naturel ',
        'brand': 'Arla',
        'per100g': {'kcal': 63, 'protein': 11, 'carbs': 4, 'fat': 0.2, 'fiber': null},
        'serving': {'label': '1 bæger', 'grams': 150},
        'barcode': '5 701234 567899',
        'warnings': [],
        'caveats': [],
      });
      expect(l.name, 'Skyr naturel');
      expect(l.per100g.proteinG, 11);
      expect(l.per100g.fiberG, isNull);
      expect(l.serving!.label, '1 bæger');
      expect(l.serving!.grams, 150);
      expect(l.barcode, '5701234567899');
      expect(l.isEmpty, isFalse);
    });

    test('impossible values are dropped and an empty label is detected', () {
      final l = parseLabelReading({
        'per100g': {'kcal': 2000, 'protein': 120, 'carbs': -1, 'fat': '5'},
        'serving': {'grams': 0},
        'barcode': '123',
        'warnings': ['Calories don\'t match', 4],
      });
      expect(l.isEmpty, isTrue);
      expect(l.serving, isNull);
      expect(l.barcode, isNull);
      expect(l.warnings, ['Calories don\'t match']);
      expect(parseLabelReading(const {}).isEmpty, isTrue);
    });
  });

  group('logging estimates for reuse', () {
    late AppDatabase db;
    late NutritionRepository repo;
    final day = DateTime(2026, 10, 20);
    setUp(() async {
      db = await testDatabase();
      repo = NutritionRepository(db);
    });
    tearDown(() => db.close());

    test('a photo estimate is logged and kept as a food with its portion', () async {
      const n = Nutrients(kcal: 318.5, proteinG: 6.1, carbsG: 68.6, fatG: 1.2, fiberG: null);
      final r = await repo.logEstimate(name: 'Rice', grams: 245, nutrients: n, meal: MealSlot.lunch, day: day, weighed: true);
      final food = r.food!;
      expect(food.source, 'ai');
      expect(food.provenance, Provenance.aiEstimate.name);
      expect(food.kcal100, closeTo(130, 1e-9));
      expect(food.fiber100, isNull, reason: 'unknown stays unknown');
      expect(food.servingG, 245);
      expect(food.servingLabel, 'weighed portion');

      final entry = (await repo.dayLog(day)).entries.single;
      expect(entry.id, r.entryId);
      expect(entry.kcal, closeTo(318.5, 1e-9));
      expect(entry.carbsG, closeTo(68.6, 1e-9));
      expect(entry.fiberG, isNull);
      expect(entry.provenance, Provenance.aiEstimate.name);
      expect(entry.servings, 1);

      final recent = await repo.watchRecentFoods().first;
      expect(recent.map((f) => f.name), contains('Rice'));
    });

    test('re-logging the saved portion reproduces the same nutrition without a photo', () async {
      const n = Nutrients(kcal: 540, proteinG: 38, carbsG: 52, fatG: 18, fiberG: 6);
      final r = await repo.logEstimate(name: 'Chicken curry', grams: 410, nutrients: n, meal: MealSlot.dinner, day: day);
      final item = (await repo.foodItem(r.food!.id))!;
      expect(item.servings.first.label, 'photo portion');
      final next = day.add(const Duration(days: 1));
      final food = (await (db.select(db.foods)..where((f) => f.id.equals(r.food!.id))).getSingle());
      await repo.logFood(food: food, grams: item.servings.first.grams, meal: MealSlot.dinner, day: next, servings: 1);
      final again = (await repo.dayLog(next)).entries.single;
      expect(again.kcal, closeTo(540, 1e-6));
      expect(again.proteinG, closeTo(38, 1e-6));
      expect(again.fiberG, closeTo(6, 1e-6));
      // Half a portion scales correctly too.
      await repo.logFood(food: food, grams: 205, meal: MealSlot.lunch, day: next);
      expect((await repo.dayLog(next)).totals.kcal, closeTo(810, 1e-6));
    });

    test('an estimate without a weight is logged but not kept as a food', () async {
      final r = await repo.logEstimate(name: 'Mystery', grams: null, nutrients: const Nutrients(kcal: 300), meal: MealSlot.snack, day: day);
      expect(r.food, isNull);
      expect((await repo.dayLog(day)).entries.single.kcal, 300);
      expect(await db.select(db.foods).get(), everyElement(predicate<Food>((f) => f.source != 'ai')));
    });

    test('a photographed plate saved as a meal logs again with one tap', () async {
      final rice = await repo.logEstimate(name: 'Rice', grams: 180, nutrients: const Nutrients(kcal: 234, proteinG: 4.3, carbsG: 50, fatG: 0.5), meal: MealSlot.lunch, day: day, weighed: true);
      final chicken = await repo.logEstimate(name: 'Chicken', grams: 120, nutrients: const Nutrients(kcal: 198, proteinG: 37, carbsG: 0, fatG: 4.3), meal: MealSlot.lunch, day: day, weighed: true);
      await repo.saveMealItems('Rice and chicken', [(rice.food!.id, 180), (chicken.food!.id, 120)]);
      final meal = (await repo.savedMeals()).single;
      expect(meal.meal.name, 'Rice and chicken');
      expect(meal.totals.kcal, closeTo(432, 1e-6));

      final next = day.add(const Duration(days: 1));
      await repo.logSavedMeal(meal, slot: MealSlot.dinner, day: next);
      final log = await repo.dayLog(next);
      expect(log.entries.length, 2);
      expect(log.totals.kcal, closeTo(432, 1e-6));
      expect(log.totals.proteinG, closeTo(41.3, 1e-6));
      expect(log.entries.every((e) => e.meal == MealSlot.dinner.name), isTrue);
    });

    test('the same food photographed twice is kept as separate foods', () async {
      await repo.logEstimate(name: 'Rice', grams: 100, nutrients: const Nutrients(kcal: 130), meal: MealSlot.lunch, day: day);
      await repo.logEstimate(name: 'Rice', grams: 300, nutrients: const Nutrients(kcal: 390), meal: MealSlot.dinner, day: day);
      final foods = await (db.select(db.foods)..where((f) => f.source.equals('ai'))).get();
      expect(foods.map((f) => f.servingG), unorderedEquals([100, 300]));
    });
  });
}
