import 'package:collection/collection.dart';
import 'package:drift/drift.dart';

import '../../domain/catalog.dart';
import '../../domain/dates.dart';
import '../../domain/nutrition/energy.dart';
import '../../domain/nutrition/food.dart';
import '../../domain/nutrition/nutrients.dart';
import '../../domain/provenance.dart';
import '../db/app_database.dart';
import 'base.dart';

extension NutritionEntryX on NutritionEntry {
  Nutrients get nutrients => Nutrients(kcal: kcal, proteinG: proteinG, carbsG: carbsG, fatG: fatG, fiberG: fiberG);
  Provenance get source => Provenance.fromName(provenance);
}

extension FoodX on Food {
  Nutrients get per100g =>
      Nutrients(kcal: kcal100, proteinG: protein100, carbsG: carbs100, fatG: fat100, fiberG: fiber100);
  Provenance get provenanceValue => Provenance.fromName(provenance, fallback: Provenance.custom);

  FoodItem toItem([List<FoodServing> servings = const []]) => FoodItem(
        localId: id,
        name: name,
        brand: brand,
        source: source,
        sourceRef: sourceRef,
        provenance: provenanceValue,
        per100g: per100g,
        servings: [
          if (servingG != null) ServingOption(servingLabel ?? '1 serving', servingG!),
          for (final s in servings) ServingOption(s.label, s.grams),
        ],
      );
}

class DayLog {
  const DayLog({required this.day, required this.entries, required this.waterMl});

  final DateTime day;
  final List<NutritionEntry> entries;
  final int waterMl;

  Map<MealSlot, List<NutritionEntry>> get byMeal => {
        for (final m in MealSlot.values) m: [for (final e in entries) if (e.meal == m.name) e],
      };

  NutrientTotals get totals => NutrientTotals.of(entries.map((e) => e.nutrients));

  NutrientTotals totalsFor(MealSlot m) =>
      NutrientTotals.of(entries.where((e) => e.meal == m.name).map((e) => e.nutrients));
}

class RecipeWithIngredients {
  const RecipeWithIngredients(this.recipe, this.ingredients);
  final Recipe recipe;
  final List<(RecipeIngredient, Food)> ingredients;

  /// Nutrition for the whole recipe; incomplete if any ingredient is.
  NutrientTotals get total => NutrientTotals.of([for (final (i, f) in ingredients) f.per100g.scale(i.grams / 100)]);

  Nutrients get perServing {
    final t = total;
    final n = recipe.servings <= 0 ? 1 : recipe.servings;
    return Nutrients(
      kcal: t.incompleteFields.contains('kcal') ? null : t.kcal / n,
      proteinG: t.incompleteFields.contains('protein') ? null : t.proteinG / n,
      carbsG: t.incompleteFields.contains('carbs') ? null : t.carbsG / n,
      fatG: t.incompleteFields.contains('fat') ? null : t.fatG / n,
      fiberG: t.incompleteFields.contains('fiber') ? null : t.fiberG / n,
    );
  }
}

class SavedMealWithItems {
  const SavedMealWithItems(this.meal, this.items);
  final SavedMeal meal;
  final List<(SavedMealItem, Food)> items;

  NutrientTotals get totals => NutrientTotals.of([for (final (i, f) in items) f.per100g.scale(i.grams / 100)]);
}

class NutritionRepository extends Repository {
  NutritionRepository(super.db);

  // ------------------------------------------------------------ foods

  /// Stores a food from a remote source (deduplicated by source + reference)
  /// or a new custom food. Returns the local row.
  Future<Food> saveFood(FoodItem item) => db.transaction(() async {
        Food? existing;
        if (item.localId != null) {
          existing = await (db.select(db.foods)..where((f) => f.id.equals(item.localId!))).getSingleOrNull();
        } else if (item.sourceRef != null) {
          existing = await (db.select(db.foods)
                ..where((f) => f.source.equals(item.source) & f.sourceRef.equals(item.sourceRef!))
                ..limit(1))
              .getSingleOrNull();
        }
        final firstServing = item.servings.firstOrNull;
        final companion = FoodsCompanion(
          name: Value(item.name),
          brand: Value(item.brand),
          source: Value(item.source),
          sourceRef: Value(item.sourceRef),
          provenance: Value(item.provenance.name),
          kcal100: Value(item.per100g.kcal),
          protein100: Value(item.per100g.proteinG),
          carbs100: Value(item.per100g.carbsG),
          fat100: Value(item.per100g.fatG),
          fiber100: Value(item.per100g.fiberG),
          servingG: Value(firstServing?.grams),
          servingLabel: Value(firstServing?.label),
          deletedAt: const Value(null),
          updatedAt: Repository.touched,
          dirty: Repository.dirty,
        );
        final id = existing?.id ?? newId();
        if (existing == null) {
          await db.into(db.foods).insert(companion.copyWith(id: Value(id)));
        } else {
          await (db.update(db.foods)..where((f) => f.id.equals(id))).write(companion);
          await (db.update(db.foodServings)..where((s) => s.foodId.equals(id) & s.deletedAt.isNull()))
              .write(FoodServingsCompanion(deletedAt: Value(nowUtc()), updatedAt: Repository.touched, dirty: Repository.dirty));
        }
        for (final s in item.servings.skip(1)) {
          await db.into(db.foodServings).insert(FoodServingsCompanion.insert(foodId: id, label: s.label, grams: s.grams));
        }
        return (db.select(db.foods)..where((f) => f.id.equals(id))).getSingle();
      });

  Future<FoodItem?> foodItem(String id) async {
    final f = await (db.select(db.foods)..where((f) => f.id.equals(id))).getSingleOrNull();
    if (f == null) return null;
    final servings = await (db.select(db.foodServings)..where((s) => s.foodId.equals(id) & s.deletedAt.isNull())).get();
    return f.toItem(servings);
  }

  Future<FoodItem?> foodByBarcode(String barcode) async {
    final f = await (db.select(db.foods)
          ..where((f) => f.sourceRef.equals(barcode) & f.deletedAt.isNull())
          ..limit(1))
        .getSingleOrNull();
    return f == null ? null : foodItem(f.id);
  }

  Stream<List<Food>> watchRecentFoods({int limit = 30}) => (db.select(db.foods)
        ..where((f) => f.deletedAt.isNull() & f.lastUsedAt.isNotNull())
        ..orderBy([(f) => OrderingTerm.desc(f.lastUsedAt)])
        ..limit(limit))
      .watch();

  Stream<List<Food>> watchCustomFoods() => (db.select(db.foods)
        ..where((f) => f.deletedAt.isNull() & f.source.equals('custom'))
        ..orderBy([(f) => OrderingTerm.asc(f.name)]))
      .watch();

  Future<List<Food>> searchLocal(String query, {int limit = 20}) {
    final q = '%${query.trim().toLowerCase()}%';
    return (db.select(db.foods)
          ..where((f) => f.deletedAt.isNull() & (f.name.lower().like(q) | f.brand.lower().like(q)))
          ..orderBy([(f) => OrderingTerm.desc(f.lastUsedAt)])
          ..limit(limit))
        .get();
  }

  Future<void> setFavorite(String foodId, bool favorite) =>
      (db.update(db.foods)..where((f) => f.id.equals(foodId))).write(
        FoodsCompanion(favorite: Value(favorite), updatedAt: Repository.touched, dirty: Repository.dirty),
      );

  Future<void> deleteFood(String foodId) => (db.update(db.foods)..where((f) => f.id.equals(foodId))).write(
        FoodsCompanion(deletedAt: Value(nowUtc()), updatedAt: Repository.touched, dirty: Repository.dirty),
      );

  // ------------------------------------------------------------ diary

  Stream<DayLog> watchDay(DateTime day) =>
      watchTables({db.nutritionEntries, db.waterEntries}, () => dayLog(day));

  Future<DayLog> dayLog(DateTime day) async {
    final key = dayKey(day);
    final entries = await (db.select(db.nutritionEntries)
          ..where((e) => e.date.equals(key) & e.deletedAt.isNull())
          ..orderBy([(e) => OrderingTerm.asc(e.loggedAt)]))
        .get();
    final water = await (db.selectOnly(db.waterEntries)
          ..addColumns([db.waterEntries.ml.sum()])
          ..where(db.waterEntries.date.equals(key) & db.waterEntries.deletedAt.isNull()))
        .getSingle();
    return DayLog(day: dateOnly(day), entries: entries, waterMl: water.read(db.waterEntries.ml.sum()) ?? 0);
  }

  /// Logs [grams] of a saved food. Nutrients are snapshotted.
  Future<String> logFood({
    required Food food,
    required double grams,
    required MealSlot meal,
    required DateTime day,
    double? servings,
    String? servingLabel,
  }) =>
      db.transaction(() async {
        final n = food.per100g.scale(grams / 100);
        final id = newId();
        await db.into(db.nutritionEntries).insert(NutritionEntriesCompanion.insert(
              id: Value(id),
              date: dayKey(day),
              meal: meal.name,
              foodId: Value(food.id),
              name: food.name,
              brand: Value(food.brand),
              grams: Value(grams),
              servings: Value(servings),
              servingLabel: Value(servingLabel),
              kcal: Value(n.kcal),
              proteinG: Value(n.proteinG),
              carbsG: Value(n.carbsG),
              fatG: Value(n.fatG),
              fiberG: Value(n.fiberG),
              provenance: food.provenance,
            ));
        await (db.update(db.foods)..where((f) => f.id.equals(food.id))).write(
          FoodsCompanion(lastUsedAt: Value(nowUtc()), updatedAt: Repository.touched, dirty: Repository.dirty),
        );
        return id;
      });

  /// Logs nutrients directly (quick add / AI estimate) without a food row.
  Future<String> logQuick({
    required String name,
    required Nutrients nutrients,
    required MealSlot meal,
    required DateTime day,
    required Provenance provenance,
    double? grams,
  }) async {
    final id = newId();
    await db.into(db.nutritionEntries).insert(NutritionEntriesCompanion.insert(
          id: Value(id),
          date: dayKey(day),
          meal: meal.name,
          name: name,
          grams: Value(grams),
          kcal: Value(nutrients.kcal),
          proteinG: Value(nutrients.proteinG),
          carbsG: Value(nutrients.carbsG),
          fatG: Value(nutrients.fatG),
          fiberG: Value(nutrients.fiberG),
          provenance: provenance.name,
        ));
    return id;
  }

  /// Logs a reviewed AI estimate and keeps it as a reusable food, so the same
  /// portion can be logged again later without a new photo. Without a
  /// weight the nutrients can't be expressed per 100 g, so the entry is
  /// logged on its own (like a quick add).
  Future<({String entryId, Food? food})> logEstimate({
    required String name,
    required double? grams,
    required Nutrients nutrients,
    required MealSlot meal,
    required DateTime day,
    bool weighed = false,
  }) async {
    if (grams == null || grams <= 0) {
      final id = await logQuick(name: name, nutrients: nutrients, meal: meal, day: day, provenance: Provenance.aiEstimate);
      return (entryId: id, food: null);
    }
    final food = await saveFood(FoodItem(
      name: name,
      source: 'ai',
      provenance: Provenance.aiEstimate,
      per100g: nutrients.scale(100 / grams),
      servings: [ServingOption(weighed ? 'weighed portion' : 'photo portion', grams), const ServingOption('100 g', 100)],
    ));
    final id = await logFood(food: food, grams: grams, meal: meal, day: day, servings: 1, servingLabel: food.servingLabel);
    return (entryId: id, food: food);
  }

  /// Saves foods with fixed amounts as a meal for one-tap reuse.
  Future<String> saveMealItems(String name, List<(String foodId, double grams)> items) => db.transaction(() async {
        final id = newId();
        await db.into(db.savedMeals).insert(SavedMealsCompanion.insert(id: Value(id), name: name.trim()));
        for (final (foodId, grams) in items) {
          await db.into(db.savedMealItems).insert(SavedMealItemsCompanion.insert(mealId: id, foodId: foodId, grams: grams));
        }
        return id;
      });

  /// Changes the amount of an entry by scaling its snapshot proportionally.
  Future<void> updateEntryAmount(NutritionEntry e, {double? grams, double? servings}) {
    final ratio = grams != null && e.grams != null && e.grams! > 0
        ? grams / e.grams!
        : servings != null && e.servings != null && e.servings! > 0
            ? servings / e.servings!
            : 1.0;
    final n = e.nutrients.scale(ratio);
    return (db.update(db.nutritionEntries)..where((x) => x.id.equals(e.id))).write(NutritionEntriesCompanion(
      grams: grams != null ? Value(grams) : (e.grams == null ? const Value.absent() : Value(e.grams! * ratio)),
      servings: servings != null ? Value(servings) : (e.servings == null ? const Value.absent() : Value(e.servings! * ratio)),
      kcal: Value(n.kcal),
      proteinG: Value(n.proteinG),
      carbsG: Value(n.carbsG),
      fatG: Value(n.fatG),
      fiberG: Value(n.fiberG),
      updatedAt: Repository.touched,
      dirty: Repository.dirty,
    ));
  }

  Future<void> moveEntry(String id, MealSlot meal) =>
      (db.update(db.nutritionEntries)..where((x) => x.id.equals(id))).write(
        NutritionEntriesCompanion(meal: Value(meal.name), updatedAt: Repository.touched, dirty: Repository.dirty),
      );

  /// Replaces an entry's nutrients (manual correction of an estimate).
  Future<void> correctEntry(String id, Nutrients n, {String? name}) =>
      (db.update(db.nutritionEntries)..where((x) => x.id.equals(id))).write(NutritionEntriesCompanion(
        name: name == null ? const Value.absent() : Value(name),
        kcal: Value(n.kcal),
        proteinG: Value(n.proteinG),
        carbsG: Value(n.carbsG),
        fatG: Value(n.fatG),
        fiberG: Value(n.fiberG),
        updatedAt: Repository.touched,
        dirty: Repository.dirty,
      ));

  Future<void> deleteEntry(String id) => (db.update(db.nutritionEntries)..where((x) => x.id.equals(id))).write(
        NutritionEntriesCompanion(deletedAt: Value(nowUtc()), updatedAt: Repository.touched, dirty: Repository.dirty),
      );

  /// Copies a meal from one day to another (e.g. "same breakfast as yesterday").
  Future<int> copyMeal({required DateTime from, required MealSlot meal, required DateTime to, MealSlot? toMeal}) =>
      db.transaction(() async {
        final source = (await dayLog(from)).byMeal[meal] ?? const [];
        for (final e in source) {
          await db.into(db.nutritionEntries).insert(e.toCompanion(true).copyWith(
                id: Value(newId()),
                date: Value(dayKey(to)),
                meal: Value((toMeal ?? meal).name),
                loggedAt: Value(nowUtc()),
                createdAt: Value(nowUtc()),
                updatedAt: Value(nowUtc()),
                dirty: const Value(true),
              ));
        }
        return source.length;
      });

  /// Distinct days with entries in [since, today], newest first.
  Future<List<DateTime>> loggedDays({required DateTime since}) async {
    final rows = await (db.selectOnly(db.nutritionEntries, distinct: true)
          ..addColumns([db.nutritionEntries.date])
          ..where(db.nutritionEntries.deletedAt.isNull() & db.nutritionEntries.date.isBiggerOrEqualValue(dayKey(since)))
          ..orderBy([OrderingTerm.desc(db.nutritionEntries.date)]))
        .get();
    return [for (final r in rows) parseDayKey(r.read(db.nutritionEntries.date)!)];
  }

  /// Per-day totals between [from] and [to] inclusive.
  Future<Map<DateTime, NutrientTotals>> dailyTotals({required DateTime from, required DateTime to}) async {
    final entries = await (db.select(db.nutritionEntries)
          ..where((e) =>
              e.deletedAt.isNull() & e.date.isBiggerOrEqualValue(dayKey(from)) & e.date.isSmallerOrEqualValue(dayKey(to))))
        .get();
    final byDay = groupBy(entries, (e) => e.date);
    return {for (final e in byDay.entries) parseDayKey(e.key): NutrientTotals.of(e.value.map((x) => x.nutrients))};
  }

  /// Daily intake for the energy model. A day counts as complete when every
  /// entry has calories and the total is plausible for a full day's log.
  Future<List<DailyIntake>> dailyIntake({required DateTime from, required DateTime to}) async {
    final totals = await dailyTotals(from: from, to: to);
    return [
      for (final e in totals.entries)
        DailyIntake(e.key, e.value.kcal, complete: !e.value.incompleteFields.contains('kcal') && e.value.kcal >= 800),
    ];
  }

  // ------------------------------------------------------------ water

  Future<void> addWater(DateTime day, int ml) =>
      db.into(db.waterEntries).insert(WaterEntriesCompanion.insert(date: dayKey(day), ml: ml));

  Future<void> undoWater(DateTime day) async {
    final last = await (db.select(db.waterEntries)
          ..where((w) => w.date.equals(dayKey(day)) & w.deletedAt.isNull())
          ..orderBy([(w) => OrderingTerm.desc(w.loggedAt)])
          ..limit(1))
        .getSingleOrNull();
    if (last == null) return;
    await (db.update(db.waterEntries)..where((w) => w.id.equals(last.id))).write(
      WaterEntriesCompanion(deletedAt: Value(nowUtc()), updatedAt: Repository.touched, dirty: Repository.dirty),
    );
  }

  // ------------------------------------------------------------ recipes

  Stream<List<RecipeWithIngredients>> watchRecipes() =>
      watchTables({db.recipes, db.recipeIngredients, db.foods}, recipes);

  Future<List<RecipeWithIngredients>> recipes() async {
    final rs = await (db.select(db.recipes)
          ..where((r) => r.deletedAt.isNull())
          ..orderBy([(r) => OrderingTerm.asc(r.name)]))
        .get();
    if (rs.isEmpty) return const [];
    final rows = await (db.select(db.recipeIngredients).join([
      innerJoin(db.foods, db.foods.id.equalsExp(db.recipeIngredients.foodId)),
    ])
          ..where(db.recipeIngredients.deletedAt.isNull() & db.recipeIngredients.recipeId.isIn(rs.map((r) => r.id)))
          ..orderBy([OrderingTerm.asc(db.recipeIngredients.position)]))
        .get();
    final by = groupBy(rows, (r) => r.readTable(db.recipeIngredients).recipeId);
    return [
      for (final r in rs)
        RecipeWithIngredients(r, [
          for (final row in by[r.id] ?? const <TypedResult>[]) (row.readTable(db.recipeIngredients), row.readTable(db.foods)),
        ]),
    ];
  }

  Future<String> saveRecipe({
    String? id,
    required String name,
    required double servings,
    required List<(String foodId, double grams)> ingredients,
    String? notes,
  }) =>
      db.transaction(() async {
        final recipeId = id ?? newId();
        if (id == null) {
          await db.into(db.recipes).insert(RecipesCompanion.insert(
                id: Value(recipeId),
                name: name.trim(),
                servings: Value(servings),
                notes: Value(notes),
              ));
        } else {
          await (db.update(db.recipes)..where((r) => r.id.equals(id))).write(RecipesCompanion(
            name: Value(name.trim()),
            servings: Value(servings),
            notes: Value(notes),
            updatedAt: Repository.touched,
            dirty: Repository.dirty,
          ));
          await (db.update(db.recipeIngredients)..where((i) => i.recipeId.equals(id) & i.deletedAt.isNull())).write(
            RecipeIngredientsCompanion(deletedAt: Value(nowUtc()), updatedAt: Repository.touched, dirty: Repository.dirty),
          );
        }
        for (final (i, (foodId, grams)) in ingredients.indexed) {
          await db.into(db.recipeIngredients).insert(
                RecipeIngredientsCompanion.insert(recipeId: recipeId, foodId: foodId, grams: grams, position: Value(i)),
              );
        }
        return recipeId;
      });

  Future<void> deleteRecipe(String id) => (db.update(db.recipes)..where((r) => r.id.equals(id))).write(
        RecipesCompanion(deletedAt: Value(nowUtc()), updatedAt: Repository.touched, dirty: Repository.dirty),
      );

  Future<String> logRecipe({
    required RecipeWithIngredients recipe,
    required double servings,
    required MealSlot meal,
    required DateTime day,
  }) async {
    final n = recipe.perServing.scale(servings);
    final anyAi = recipe.ingredients.any((x) => x.$2.provenance == Provenance.aiEstimate.name);
    final anyCommunity = recipe.ingredients.any((x) => x.$2.provenance == Provenance.community.name);
    final id = newId();
    await db.into(db.nutritionEntries).insert(NutritionEntriesCompanion.insert(
          id: Value(id),
          date: dayKey(day),
          meal: meal.name,
          recipeId: Value(recipe.recipe.id),
          name: recipe.recipe.name,
          servings: Value(servings),
          servingLabel: const Value('serving'),
          kcal: Value(n.kcal),
          proteinG: Value(n.proteinG),
          carbsG: Value(n.carbsG),
          fatG: Value(n.fatG),
          fiberG: Value(n.fiberG),
          provenance: (anyAi ? Provenance.aiEstimate : anyCommunity ? Provenance.community : Provenance.calculated).name,
        ));
    return id;
  }

  // ------------------------------------------------------------ saved meals

  Stream<List<SavedMealWithItems>> watchSavedMeals() =>
      watchTables({db.savedMeals, db.savedMealItems, db.foods}, savedMeals);

  Future<List<SavedMealWithItems>> savedMeals() async {
    final ms = await (db.select(db.savedMeals)
          ..where((m) => m.deletedAt.isNull())
          ..orderBy([(m) => OrderingTerm.asc(m.name)]))
        .get();
    if (ms.isEmpty) return const [];
    final rows = await (db.select(db.savedMealItems).join([
      innerJoin(db.foods, db.foods.id.equalsExp(db.savedMealItems.foodId)),
    ])
          ..where(db.savedMealItems.deletedAt.isNull() & db.savedMealItems.mealId.isIn(ms.map((m) => m.id))))
        .get();
    final by = groupBy(rows, (r) => r.readTable(db.savedMealItems).mealId);
    return [
      for (final m in ms)
        SavedMealWithItems(m, [
          for (final row in by[m.id] ?? const <TypedResult>[]) (row.readTable(db.savedMealItems), row.readTable(db.foods)),
        ]),
    ];
  }

  /// Saves the food-based entries of a meal for one-tap reuse. Returns how
  /// many items were saved (quick-add entries without a food are skipped).
  Future<int> saveMeal(String name, List<NutritionEntry> entries) => db.transaction(() async {
        final items = [for (final e in entries) if (e.foodId != null && e.grams != null) e];
        if (items.isEmpty) return 0;
        final id = newId();
        await db.into(db.savedMeals).insert(SavedMealsCompanion.insert(id: Value(id), name: name.trim()));
        for (final e in items) {
          await db.into(db.savedMealItems).insert(SavedMealItemsCompanion.insert(mealId: id, foodId: e.foodId!, grams: e.grams!));
        }
        return items.length;
      });

  Future<void> logSavedMeal(SavedMealWithItems meal, {required MealSlot slot, required DateTime day}) =>
      db.transaction(() async {
        for (final (item, food) in meal.items) {
          await logFood(food: food, grams: item.grams, meal: slot, day: day);
        }
      });

  Future<void> deleteSavedMeal(String id) => (db.update(db.savedMeals)..where((m) => m.id.equals(id))).write(
        SavedMealsCompanion(deletedAt: Value(nowUtc()), updatedAt: Repository.touched, dirty: Repository.dirty),
      );
}
