import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../data/remote/ai_api.dart';
import '../features/auth/account_screen.dart';
import '../features/coach/coach_screen.dart';
import '../features/nutrition/add_food_screen.dart';
import '../features/nutrition/custom_food_screen.dart';
import '../features/nutrition/nutrition_screen.dart';
import '../features/nutrition/photo_log_screen.dart';
import '../features/nutrition/recipe_editor_screen.dart';
import '../features/nutrition/targets_screen.dart';
import '../features/onboarding/onboarding_screen.dart';
import '../features/overview/overview_screen.dart';
import '../features/progress/measurements_screen.dart';
import '../features/progress/progress_screen.dart';
import '../features/progress/weight_screen.dart';
import '../features/settings/settings_screen.dart';
import '../features/workout/exercise_detail_screen.dart';
import '../features/workout/exercise_library_screen.dart';
import '../features/workout/schedule_screen.dart';
import '../features/workout/session/session_screen.dart';
import '../features/workout/session/summary_screen.dart';
import '../features/workout/template_editor_screen.dart';
import '../features/workout/workout_home_screen.dart';
import 'providers.dart';
import 'shell.dart';

final rootNavigatorKey = GlobalKey<NavigatorState>();

/// Re-evaluates redirects when onboarding status changes.
class _RouterRefresh extends ChangeNotifier {
  _RouterRefresh(Ref ref) {
    ref.listen(profileProvider, (prev, next) {
      if (prev?.value?.onboardingCompleted != next.value?.onboardingCompleted) notifyListeners();
    });
  }
}

final routerProvider = Provider<GoRouter>((ref) {
  final refresh = _RouterRefresh(ref);
  ref.onDispose(refresh.dispose);

  return GoRouter(
    navigatorKey: rootNavigatorKey,
    initialLocation: '/overview',
    refreshListenable: refresh,
    redirect: (context, state) {
      final profile = ref.read(profileProvider).value;
      if (profile == null) return null;
      final onboarding = state.matchedLocation == '/onboarding';
      final account = state.matchedLocation.startsWith('/settings/account');
      if (!profile.onboardingCompleted && !onboarding && !account) return '/onboarding';
      if (profile.onboardingCompleted && onboarding) return '/overview';
      return null;
    },
    routes: [
      GoRoute(path: '/onboarding', builder: (_, _) => const OnboardingScreen()),
      GoRoute(
        path: '/session/:id',
        parentNavigatorKey: rootNavigatorKey,
        pageBuilder: (_, s) => MaterialPage(fullscreenDialog: true, child: SessionScreen(workoutId: s.pathParameters['id']!)),
        routes: [
          GoRoute(
            path: 'summary',
            parentNavigatorKey: rootNavigatorKey,
            builder: (_, s) => WorkoutSummaryScreen(workoutId: s.pathParameters['id']!),
          ),
        ],
      ),
      GoRoute(
        path: '/settings',
        parentNavigatorKey: rootNavigatorKey,
        builder: (_, _) => const SettingsScreen(),
        routes: [
          GoRoute(path: 'account', builder: (_, _) => const AccountScreen()),
          for (final page in SettingsPage.values)
            GoRoute(path: page.path, builder: (_, _) => SettingsDetailScreen(page: page)),
        ],
      ),
      StatefulShellRoute.indexedStack(
        builder: (context, state, shell) => AppShell(shell: shell),
        branches: [
          StatefulShellBranch(routes: [
            GoRoute(path: '/overview', builder: (_, _) => const OverviewScreen()),
          ]),
          StatefulShellBranch(routes: [
            GoRoute(
              path: '/workout',
              builder: (_, _) => const WorkoutHomeScreen(),
              routes: [
                GoRoute(path: 'exercises', builder: (_, _) => const ExerciseLibraryScreen()),
                GoRoute(
                  path: 'exercises/:id',
                  builder: (_, s) => ExerciseDetailScreen(exerciseId: s.pathParameters['id']!),
                ),
                GoRoute(path: 'templates/new', builder: (_, _) => const TemplateEditorScreen()),
                GoRoute(
                  path: 'templates/:id',
                  builder: (_, s) => TemplateEditorScreen(templateId: s.pathParameters['id']),
                ),
                GoRoute(path: 'schedule', builder: (_, _) => const ScheduleScreen()),
              ],
            ),
          ]),
          StatefulShellBranch(routes: [
            GoRoute(
              path: '/nutrition',
              builder: (_, _) => const NutritionScreen(),
              routes: [
                GoRoute(
                  path: 'add',
                  builder: (_, s) => AddFoodScreen(
                    meal: s.uri.queryParameters['meal'],
                    day: s.uri.queryParameters['day'],
                  ),
                ),
                GoRoute(
                  path: 'custom',
                  builder: (_, s) => CustomFoodScreen(barcode: s.uri.queryParameters['barcode'], label: s.extra is LabelReading ? s.extra! as LabelReading : null),
                ),
                GoRoute(path: 'recipes/new', builder: (_, _) => const RecipeEditorScreen()),
                GoRoute(path: 'recipes/:id', builder: (_, s) => RecipeEditorScreen(recipeId: s.pathParameters['id'])),
                GoRoute(
                  path: 'photo',
                  builder: (_, s) => PhotoLogScreen(meal: s.uri.queryParameters['meal'], day: s.uri.queryParameters['day']),
                ),
                GoRoute(path: 'targets', builder: (_, _) => const NutritionTargetsScreen()),
              ],
            ),
          ]),
          StatefulShellBranch(routes: [
            GoRoute(
              path: '/progress',
              builder: (_, _) => const ProgressScreen(),
              routes: [
                GoRoute(path: 'weight', builder: (_, _) => const WeightScreen()),
                GoRoute(path: 'measurements', builder: (_, _) => const MeasurementsScreen()),
                GoRoute(
                  path: 'exercise/:id',
                  builder: (_, s) => ExerciseDetailScreen(exerciseId: s.pathParameters['id']!),
                ),
              ],
            ),
          ]),
          StatefulShellBranch(routes: [
            GoRoute(path: '/coach', builder: (_, _) => const CoachScreen()),
          ]),
        ],
      ),
    ],
  );
});
