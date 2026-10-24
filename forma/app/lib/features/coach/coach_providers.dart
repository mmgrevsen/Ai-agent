import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../app/providers.dart';
import '../../data/repositories/settings_repository.dart';
import '../../services/coach_service.dart';
import '../../services/insights_service.dart';
import '../health/health_providers.dart';
import '../nutrition/nutrition_providers.dart';
import '../workout/workout_providers.dart';

final coachServiceProvider = Provider(
  (ref) => CoachService(
    api: ref.watch(aiApiProvider),
    coach: ref.watch(coachRepositoryProvider),
    workouts: ref.watch(workoutRepositoryProvider),
    exercises: ref.watch(exerciseRepositoryProvider),
    nutrition: ref.watch(nutritionRepositoryProvider),
    body: ref.watch(bodyRepositoryProvider),
    settings: ref.watch(settingsRepositoryProvider),
    nutritionService: ref.watch(nutritionServiceProvider),
  ),
);

final coachThreadProvider = StreamProvider((ref) => ref.watch(coachRepositoryProvider).watchThread());

final coachScopesProvider = Provider<Set<CoachScope>>((ref) {
  final prefs = ref.watch(prefsProvider).value;
  if (prefs == null) return {};
  final names = SettingsRepository.coachScopesOf(prefs);
  return {for (final s in CoachScope.values) if (names.contains(s.name)) s};
});

final insightsProvider = FutureProvider<List<Insight>>((ref) async {
  ref.watch(historyProvider);
  ref.watch(prefsProvider);
  ref.watch(dayLogProvider(ref.watch(todayProvider)));
  final recovery = await ref.watch(recoveryStatusProvider.future);
  return InsightsService(
    workouts: ref.watch(workoutRepositoryProvider),
    nutrition: ref.watch(nutritionRepositoryProvider),
    body: ref.watch(bodyRepositoryProvider),
    settings: ref.watch(settingsRepositoryProvider),
  ).compute(today: ref.watch(todayProvider), units: ref.watch(unitsProvider), recovery: recovery);
});
