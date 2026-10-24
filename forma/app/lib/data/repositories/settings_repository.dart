import 'dart:convert';

import 'package:drift/drift.dart';

import '../../domain/catalog.dart';
import '../../domain/dates.dart';
import '../../domain/training/models.dart';
import '../db/app_database.dart';
import 'base.dart';

/// Profile, preferences, equipment, restrictions, goals and nutrition targets.
class SettingsRepository extends Repository {
  SettingsRepository(super.db);

  static const _me = AppDatabase.singletonId;

  /// Creates the singleton profile and preference rows on first launch.
  Future<void> ensureSingletons() async {
    await db.into(db.profiles).insert(
          ProfilesCompanion.insert(id: const Value(_me)),
          mode: InsertMode.insertOrIgnore,
        );
    await db.into(db.userPreferences).insert(
          UserPreferencesCompanion.insert(id: const Value(_me)),
          mode: InsertMode.insertOrIgnore,
        );
  }

  // ------------------------------------------------------------ profile

  Stream<Profile> watchProfile() =>
      (db.select(db.profiles)..where((p) => p.id.equals(_me))).watchSingle();

  Future<Profile> profile() => (db.select(db.profiles)..where((p) => p.id.equals(_me))).getSingle();

  Future<void> updateProfile(ProfilesCompanion changes) =>
      (db.update(db.profiles)..where((p) => p.id.equals(_me))).write(
        changes.copyWith(updatedAt: Repository.touched, dirty: Repository.dirty),
      );

  // ------------------------------------------------------------ preferences

  Stream<UserPrefs> watchPrefs() =>
      (db.select(db.userPreferences)..where((p) => p.id.equals(_me))).watchSingle();

  Future<UserPrefs> prefs() => (db.select(db.userPreferences)..where((p) => p.id.equals(_me))).getSingle();

  Future<void> updatePrefs(UserPreferencesCompanion changes) =>
      (db.update(db.userPreferences)..where((p) => p.id.equals(_me))).write(
        changes.copyWith(updatedAt: Repository.touched, dirty: Repository.dirty),
      );

  static SafetyLimits limitsOf(UserPrefs p) => SafetyLimits(
        maxIncreasePct: p.maxIncreasePct,
        maxIncreaseUpperKg: p.maxIncreaseUpperKg,
        maxIncreaseLowerKg: p.maxIncreaseLowerKg,
      );

  static List<String> dashboardCardsOf(UserPrefs p) => _stringList(p.dashboardCards);
  static List<String> coachScopesOf(UserPrefs p) => _stringList(p.coachScopes);

  static List<String> _stringList(String json) {
    try {
      return (jsonDecode(json) as List<dynamic>).cast<String>();
    } on Object {
      return const [];
    }
  }

  // ------------------------------------------------------------ equipment

  Stream<List<EquipmentItem>> watchEquipment() =>
      (db.select(db.userEquipment)..where((e) => e.deletedAt.isNull())).watch();

  Future<List<EquipmentItem>> equipment() =>
      (db.select(db.userEquipment)..where((e) => e.deletedAt.isNull())).get();

  Future<void> setEquipmentAvailable(String code, {required bool available, double? incrementKg}) async {
    final existing = await (db.select(db.userEquipment)..where((e) => e.equipment.equals(code))).getSingleOrNull();
    if (existing == null) {
      if (!available) return;
      await db.into(db.userEquipment).insert(UserEquipmentCompanion.insert(
            equipment: code,
            incrementKg: Value(incrementKg ?? equipmentInfo(code)?.defaultIncrementKg),
          ));
      return;
    }
    await (db.update(db.userEquipment)..where((e) => e.id.equals(existing.id))).write(UserEquipmentCompanion(
      deletedAt: Value(available ? null : nowUtc()),
      incrementKg: incrementKg == null ? const Value.absent() : Value(incrementKg),
      updatedAt: Repository.touched,
      dirty: Repository.dirty,
    ));
  }

  Future<void> setEquipmentIncrement(String code, double incrementKg) async {
    await (db.update(db.userEquipment)..where((e) => e.equipment.equals(code))).write(UserEquipmentCompanion(
      incrementKg: Value(incrementKg),
      updatedAt: Repository.touched,
      dirty: Repository.dirty,
    ));
  }

  /// Applies an onboarding preset (e.g. full gym) in one transaction.
  Future<void> setEquipmentSet(Set<String> codes) => db.transaction(() async {
        for (final info in equipmentCatalog) {
          await setEquipmentAvailable(info.code, available: codes.contains(info.code));
        }
      });

  // ------------------------------------------------------------ restrictions

  Stream<List<Restriction>> watchRestrictions() =>
      (db.select(db.exerciseRestrictions)..where((r) => r.deletedAt.isNull())).watch();

  Future<List<Restriction>> restrictions() =>
      (db.select(db.exerciseRestrictions)..where((r) => r.deletedAt.isNull())).get();

  Future<void> addRestriction(String kind, String value, {String? note}) =>
      db.into(db.exerciseRestrictions).insert(
            ExerciseRestrictionsCompanion.insert(kind: kind, value: value, note: Value(note)),
          );

  Future<void> removeRestriction(String id) =>
      (db.update(db.exerciseRestrictions)..where((r) => r.id.equals(id))).write(ExerciseRestrictionsCompanion(
        deletedAt: Value(nowUtc()),
        updatedAt: Repository.touched,
        dirty: Repository.dirty,
      ));

  // ------------------------------------------------------------ goals

  Stream<List<Goal>> watchGoals() =>
      (db.select(db.goals)..where((g) => g.deletedAt.isNull() & g.active.equals(true))).watch();

  Future<List<Goal>> goals() =>
      (db.select(db.goals)..where((g) => g.deletedAt.isNull() & g.active.equals(true))).get();

  /// Replaces the active goal of [kind].
  Future<void> setGoal({
    required String kind,
    required double targetValue,
    String? unit,
    String? exerciseId,
    String? targetDate,
    double? weeklyRateKg,
  }) =>
      db.transaction(() async {
        await (db.update(db.goals)..where((g) => g.kind.equals(kind) & g.active.equals(true))).write(GoalsCompanion(
          active: const Value(false),
          updatedAt: Repository.touched,
          dirty: Repository.dirty,
        ));
        await db.into(db.goals).insert(GoalsCompanion.insert(
              kind: kind,
              targetValue: targetValue,
              unit: Value(unit),
              exerciseId: Value(exerciseId),
              targetDate: Value(targetDate),
              weeklyRateKg: Value(weeklyRateKg),
            ));
      });

  Future<void> clearGoal(String kind) =>
      (db.update(db.goals)..where((g) => g.kind.equals(kind) & g.active.equals(true))).write(GoalsCompanion(
        active: const Value(false),
        updatedAt: Repository.touched,
        dirty: Repository.dirty,
      ));

  // ------------------------------------------------------------ nutrition targets

  /// Target in effect on [day].
  Stream<NutritionTarget?> watchTargetFor(DateTime day) {
    final key = dayKey(day);
    return (db.select(db.nutritionTargets)
          ..where((t) => t.deletedAt.isNull() & t.effectiveFrom.isSmallerOrEqualValue(key))
          ..orderBy([(t) => OrderingTerm.desc(t.effectiveFrom), (t) => OrderingTerm.desc(t.updatedAt)])
          ..limit(1))
        .watchSingleOrNull();
  }

  Future<NutritionTarget?> targetFor(DateTime day) {
    final key = dayKey(day);
    return (db.select(db.nutritionTargets)
          ..where((t) => t.deletedAt.isNull() & t.effectiveFrom.isSmallerOrEqualValue(key))
          ..orderBy([(t) => OrderingTerm.desc(t.effectiveFrom), (t) => OrderingTerm.desc(t.updatedAt)])
          ..limit(1))
        .getSingleOrNull();
  }

  /// Sets targets effective from [from] (default today). Replaces a target
  /// that already starts on that day.
  Future<void> setTargets({
    double? kcal,
    double? proteinG,
    double? carbsG,
    double? fatG,
    double? fiberG,
    String mode = 'manual',
    String? rationale,
    DateTime? from,
  }) =>
      db.transaction(() async {
        final key = dayKey(from ?? DateTime.now());
        await (db.update(db.nutritionTargets)..where((t) => t.effectiveFrom.equals(key) & t.deletedAt.isNull()))
            .write(NutritionTargetsCompanion(
          deletedAt: Value(nowUtc()),
          updatedAt: Repository.touched,
          dirty: Repository.dirty,
        ));
        await db.into(db.nutritionTargets).insert(NutritionTargetsCompanion.insert(
              effectiveFrom: key,
              kcal: Value(kcal),
              proteinG: Value(proteinG),
              carbsG: Value(carbsG),
              fatG: Value(fatG),
              fiberG: Value(fiberG),
              mode: Value(mode),
              rationale: Value(rationale),
            ));
      });
}
