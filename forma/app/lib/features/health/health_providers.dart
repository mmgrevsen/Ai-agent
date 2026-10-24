import 'dart:convert';

import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../app/providers.dart';
import '../../data/repositories/health_repository.dart';
import '../../domain/dates.dart';
import '../../domain/recovery/recovery.dart';
import '../../services/health_service.dart';
import '../workout/workout_providers.dart';

final healthPlatformProvider = Provider<HealthPlatform>((ref) => HealthKitPlatform.create());
final healthRepositoryProvider = Provider((ref) => HealthRepository(ref.watch(databaseProvider)));

const _categoriesKey = 'health_categories';
const _lastImportKey = 'health_last_import';

/// Categories the user has enabled on this device (local, not synced:
/// permissions are per device).
class HealthCategories extends AsyncNotifier<Set<HealthCategory>> {
  @override
  Future<Set<HealthCategory>> build() async {
    final raw = await ref.watch(databaseProvider).readMeta(_categoriesKey);
    if (raw == null) return {};
    final names = (jsonDecode(raw) as List<dynamic>).cast<String>();
    return {for (final c in HealthCategory.values) if (names.contains(c.name)) c};
  }

  /// Requests platform access for [category] and enables it. Returns false if
  /// the platform has no health store.
  Future<bool> enable(HealthCategory category) async {
    final platform = ref.read(healthPlatformProvider);
    if (!platform.isSupported) return false;
    await platform.requestAccess({category});
    await _save({...?state.value, category});
    await ref.read(healthImportProvider.notifier).importRecent(force: true);
    return true;
  }

  Future<void> disable(HealthCategory category) => _save({...?state.value}..remove(category));

  Future<void> _save(Set<HealthCategory> cats) async {
    await ref.read(databaseProvider).writeMeta(_categoriesKey, jsonEncode([for (final c in cats) c.name]));
    state = AsyncData(cats);
  }
}

final healthCategoriesProvider = AsyncNotifierProvider<HealthCategories, Set<HealthCategory>>(HealthCategories.new);

class HealthImportState {
  const HealthImportState({this.running = false, this.lastImport, this.lastResult, this.error});
  final bool running;
  final DateTime? lastImport;
  final String? lastResult;
  final String? error;
}

/// Pulls recent samples from the platform into the local database.
class HealthImport extends Notifier<HealthImportState> {
  @override
  HealthImportState build() => const HealthImportState();

  Future<void> importRecent({bool force = false, int days = 35}) async {
    if (state.running) return;
    final prefs = ref.read(prefsProvider).value;
    final Set<HealthCategory> cats = await ref.read(healthCategoriesProvider.future);
    final platform = ref.read(healthPlatformProvider);
    if (!platform.isSupported || cats.isEmpty || (prefs != null && !prefs.healthEnabled)) return;

    final db = ref.read(databaseProvider);
    final last = DateTime.tryParse(await db.readMeta(_lastImportKey) ?? '');
    if (!force && last != null && DateTime.now().difference(last) < const Duration(minutes: 30)) return;

    state = HealthImportState(running: true, lastImport: last);
    try {
      final now = DateTime.now();
      final from = last == null || force ? now.subtract(Duration(days: days)) : last.subtract(const Duration(days: 2));
      final repo = ref.read(healthRepositoryProvider);
      final samples = await platform.readSamples(cats, from, now);
      final weights = [for (final s in samples) if (s.type == 'weight') s];
      final others = [for (final s in samples) if (s.type != 'weight') s];
      final added = await repo.importSamples(others, syncToServer: prefs?.syncHealthData ?? false);
      var weighIns = 0;
      for (final w in weights) {
        if (await ref.read(bodyRepositoryProvider).importWeight(kg: w.value, at: w.end, externalId: w.id)) weighIns++;
      }
      var workouts = 0;
      if (cats.contains(HealthCategory.workouts)) {
        for (final w in await platform.readWorkouts(from, now)) {
          // Skip workouts Forma itself wrote to Health.
          if (w.sourceName?.toLowerCase().contains('forma') ?? false) continue;
          if (await repo.importWorkout(w)) workouts++;
        }
      }
      await db.writeMeta(_lastImportKey, now.toIso8601String());
      state = HealthImportState(
        lastImport: now,
        lastResult: '$added samples, $weighIns weigh-ins, $workouts workouts imported',
      );
    } catch (e) {
      state = HealthImportState(lastImport: last, error: 'Apple Health import failed: $e');
    }
  }
}

final healthImportProvider = NotifierProvider<HealthImport, HealthImportState>(HealthImport.new);

/// Daily aggregates for the last 35 days.
final healthDailyProvider = FutureProvider<Map<String, Map<DateTime, double>>>((ref) async {
  ref.watch(healthImportProvider);
  final today = ref.watch(todayProvider);
  return ref.watch(healthRepositoryProvider).daily(since: addDays(today, -35));
});

final todayCheckinProvider = StreamProvider((ref) => ref.watch(workoutRepositoryProvider).watchCheckin(ref.watch(todayProvider)));

/// Recovery status from available data. Missing metrics are reported, never
/// assumed.
final recoveryStatusProvider = FutureProvider<RecoveryStatus>((ref) async {
  final today = ref.watch(todayProvider);
  final daily = await ref.watch(healthDailyProvider.future);
  final checkin = ref.watch(todayCheckinProvider).value;
  ref.watch(historyProvider);
  final rows = await ref.watch(workoutRepositoryProvider).summaryRows(since: addDays(today, -30));

  List<DailyMetric> series(String type) => [for (final e in (daily[type] ?? const {}).entries) DailyMetric(e.key, e.value)];
  final load = <DateTime, double>{};
  for (final r in rows) {
    final d = dateOnly(r.date);
    load[d] = (load[d] ?? 0) + r.workingSets;
  }

  return const RecoveryEngine().evaluate(
    today: today,
    hrvMs: series('hrv_sdnn'),
    restingHr: series('resting_hr'),
    sleepMinutes: series('sleep'),
    checkin: checkin == null
        ? null
        : SubjectiveCheckin(day: parseDayKey(checkin.date), energy: checkin.energy, soreness: checkin.soreness, sleepQuality: checkin.sleepQuality),
    trainingLoad: [for (final e in load.entries) DailyMetric(e.key, e.value)],
  );
});

/// True when recovery signals suggest holding loads today.
final lowReadinessProvider = Provider<bool>(
  (ref) => ref.watch(recoveryStatusProvider).value?.band == ReadinessBand.strained,
);
