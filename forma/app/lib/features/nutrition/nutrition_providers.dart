import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../app/providers.dart';
import '../../core/config/env.dart';
import '../../data/db/app_database.dart';
import '../../data/remote/food_api.dart';
import '../../data/repositories/nutrition_repository.dart';
import '../../domain/dates.dart';
import '../../services/nutrition_service.dart';

final nutritionServiceProvider = Provider(
  (ref) => NutritionService(
    settings: ref.watch(settingsRepositoryProvider),
    nutrition: ref.watch(nutritionRepositoryProvider),
    body: ref.watch(bodyRepositoryProvider),
  ),
);

/// Server aggregation when signed in; Open Food Facts directly otherwise.
final foodDataSourceProvider = Provider<FoodDataSource>((ref) {
  final backend = ref.watch(backendProvider);
  ref.watch(authUserProvider);
  if (backend.signedIn) return ServerFoodClient(backend);
  return OpenFoodFactsClient(userAgent: Env.offUserAgent);
});

/// The day shown in the diary.
class SelectedDay extends Notifier<DateTime> {
  @override
  DateTime build() => ref.watch(todayProvider);

  void set(DateTime day) => state = dateOnly(day);
  void shift(int days) => state = addDays(state, days);
}

final selectedDayProvider = NotifierProvider<SelectedDay, DateTime>(SelectedDay.new);

final dayLogProvider = StreamProvider.family<DayLog, DateTime>(
  (ref, day) => ref.watch(nutritionRepositoryProvider).watchDay(day),
);

final targetForDayProvider = StreamProvider.family<NutritionTarget?, DateTime>(
  (ref, day) => ref.watch(settingsRepositoryProvider).watchTargetFor(day),
);

final recentFoodsProvider = StreamProvider<List<Food>>((ref) => ref.watch(nutritionRepositoryProvider).watchRecentFoods());
final customFoodsProvider = StreamProvider<List<Food>>((ref) => ref.watch(nutritionRepositoryProvider).watchCustomFoods());
final recipesProvider = StreamProvider<List<RecipeWithIngredients>>((ref) => ref.watch(nutritionRepositoryProvider).watchRecipes());
final savedMealsProvider = StreamProvider<List<SavedMealWithItems>>((ref) => ref.watch(nutritionRepositoryProvider).watchSavedMeals());
