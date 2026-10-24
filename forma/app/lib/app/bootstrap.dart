import '../data/db/app_database.dart';
import '../data/repositories/exercise_repository.dart';
import '../data/repositories/settings_repository.dart';

/// First-launch setup shared by the app and tests: singleton rows and the
/// bundled exercise library. Safe to call on every launch.
Future<void> bootstrapData(AppDatabase db, {required String exercisesJson}) async {
  await SettingsRepository(db).ensureSingletons();
  await ExerciseRepository(db).seed(exercisesJson);
}
