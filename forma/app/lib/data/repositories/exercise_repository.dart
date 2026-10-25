import 'dart:convert';

import 'package:drift/drift.dart';

import '../../domain/catalog.dart';
import '../db/app_database.dart';
import 'base.dart';

extension ExerciseX on Exercise {
  List<String> get equipmentList => equipment.isEmpty ? const [] : equipment.split(',');
  List<String> get secondaryList => secondaryMuscles.isEmpty ? const [] : secondaryMuscles.split(',');
  List<String> get instructionSteps => instructions.isEmpty ? const [] : instructions.split('\n');
  TrackingType get tracking => TrackingType.fromCode(trackingType);
  bool get lowerBody => isLowerBody(primaryMuscle: primaryMuscle, pattern: pattern);
}

/// Equipment and restriction context used to filter and substitute exercises.
class TrainingContext {
  const TrainingContext({required this.available, required this.restrictions, required this.increments});

  /// Equipment codes the user has. Empty set means "not configured" → no
  /// equipment filtering.
  final Set<String> available;
  final List<Restriction> restrictions;
  final Map<String, double?> increments;

  bool hasEquipmentFor(Exercise e) =>
      available.isEmpty || e.equipmentList.every(available.contains);

  /// The reason [e] is restricted, or `null` if allowed.
  String? restrictionFor(Exercise e) {
    for (final r in restrictions) {
      final hit = switch (r.kind) {
        'exercise' => r.value == e.id,
        'muscle' => r.value == e.primaryMuscle,
        'pattern' => r.value == e.pattern,
        'equipment' => e.equipmentList.contains(r.value),
        _ => false,
      };
      if (hit) return r.note?.isNotEmpty == true ? r.note : 'Restricted (${r.kind}: ${r.value})';
    }
    return null;
  }

  /// Smallest load jump for [e]: the largest increment among its loaded
  /// equipment (a barbell on a bench progresses by barbell plates).
  double? incrementFor(Exercise e) {
    double? best;
    for (final code in e.equipmentList) {
      final inc = increments.containsKey(code) ? increments[code] : equipmentInfo(code)?.defaultIncrementKg;
      if (inc != null && (best == null || inc > best)) best = inc;
    }
    if (best == null && e.tracking == TrackingType.bodyweightReps) return 2.5;
    return best;
  }
}

class ExerciseRepository extends Repository {
  ExerciseRepository(super.db);

  static const _seedKey = 'exercise_seed_version';

  /// Loads the bundled library. Idempotent: re-runs only when the bundled
  /// version is newer than the stored one.
  Future<void> seed(String json) async {
    final data = jsonDecode(json) as Map<String, dynamic>;
    final version = data['version'] as int;
    final current = int.tryParse(await db.readMeta(_seedKey) ?? '') ?? 0;
    if (current >= version) return;
    final items = (data['exercises'] as List<dynamic>).cast<Map<String, dynamic>>();
    await db.transaction(() async {
      await upsertLibrary(items);
      await db.writeMeta(_seedKey, '$version');
    });
  }

  /// Inserts or updates library exercises (the `assets/exercises.json` item
  /// format). A true upsert: rows that workouts reference are updated in
  /// place, never deleted and re-inserted, and exercises that are no longer
  /// listed are kept. A custom exercise with the same id is left alone.
  Future<void> upsertLibrary(List<Map<String, dynamic>> items) => db.transaction(() async {
        for (final e in items) {
          final row = ExercisesCompanion(
            name: Value(e['name'] as String),
            primaryMuscle: Value(e['primary'] as String),
            secondaryMuscles: Value((e['secondary'] as List<dynamic>).join(',')),
            equipment: Value((e['equipment'] as List<dynamic>).join(',')),
            pattern: Value(e['pattern'] as String),
            mechanic: Value(e['mechanic'] as String),
            trackingType: Value(e['tracking'] as String),
            instructions: Value((e['instructions'] as List<dynamic>).join('\n')),
          );
          await db.into(db.exercises).insert(
                row.copyWith(id: Value(e['id'] as String), isCustom: const Value(false), dirty: const Value(false)),
                onConflict: DoUpdate((_) => row, where: (old) => old.isCustom.equals(false)),
              );
        }
      });

  Stream<List<Exercise>> watchAll() => (db.select(db.exercises)
        ..where((e) => e.deletedAt.isNull() & e.archived.equals(false))
        ..orderBy([(e) => OrderingTerm.asc(e.name)]))
      .watch();

  Future<List<Exercise>> all() => (db.select(db.exercises)
        ..where((e) => e.deletedAt.isNull() & e.archived.equals(false))
        ..orderBy([(e) => OrderingTerm.asc(e.name)]))
      .get();

  Future<Exercise?> byId(String id) => (db.select(db.exercises)..where((e) => e.id.equals(id))).getSingleOrNull();

  Stream<Exercise?> watchById(String id) =>
      (db.select(db.exercises)..where((e) => e.id.equals(id))).watchSingleOrNull();

  Future<String> createCustom({
    required String name,
    required String primaryMuscle,
    required String pattern,
    required TrackingType tracking,
    List<String> equipment = const [],
    List<String> secondary = const [],
    String instructions = '',
  }) async {
    final id = newId();
    await db.into(db.exercises).insert(ExercisesCompanion.insert(
          id: Value(id),
          name: name.trim(),
          primaryMuscle: primaryMuscle,
          pattern: pattern,
          trackingType: Value(tracking.code),
          equipment: Value(equipment.join(',')),
          secondaryMuscles: Value(secondary.join(',')),
          instructions: Value(instructions.trim()),
          isCustom: const Value(true),
          mechanic: Value(const {'squat', 'hinge', 'lunge', 'horizontal_push', 'vertical_push', 'horizontal_pull', 'vertical_pull'}
                  .contains(pattern)
              ? 'compound'
              : 'isolation'),
        ));
    return id;
  }

  Future<void> archiveCustom(String id) =>
      (db.update(db.exercises)..where((e) => e.id.equals(id) & e.isCustom.equals(true))).write(ExercisesCompanion(
        archived: const Value(true),
        updatedAt: Repository.touched,
        dirty: Repository.dirty,
      ));

  /// Ranks substitutes for [e]: same movement pattern first, then same
  /// primary muscle; excludes restricted exercises and those needing
  /// equipment the user lacks.
  List<Exercise> alternatives(Exercise e, List<Exercise> library, TrainingContext ctx, {int limit = 8}) {
    int score(Exercise x) {
      var s = 0;
      if (x.pattern == e.pattern) s += 4;
      if (x.primaryMuscle == e.primaryMuscle) s += 3;
      if (x.mechanic == e.mechanic) s += 1;
      if (x.tracking == e.tracking) s += 1;
      return s;
    }

    final candidates = [
      for (final x in library)
        if (x.id != e.id &&
            (x.pattern == e.pattern || x.primaryMuscle == e.primaryMuscle) &&
            ctx.hasEquipmentFor(x) &&
            ctx.restrictionFor(x) == null)
          x,
    ]..sort((a, b) => score(b).compareTo(score(a)));
    return candidates.take(limit).toList();
  }

  static List<Exercise> search(List<Exercise> library, String query, {String? muscle}) {
    final q = query.trim().toLowerCase();
    final terms = q.split(RegExp(r'\s+')).where((t) => t.isNotEmpty).toList();
    final filtered = [
      for (final e in library)
        if ((muscle == null || e.primaryMuscle == muscle || e.secondaryList.contains(muscle)) &&
            terms.every((t) =>
                e.name.toLowerCase().contains(t) ||
                muscleLabel(e.primaryMuscle).toLowerCase().contains(t) ||
                e.equipmentList.any((x) => x.contains(t))))
          e,
    ];
    if (q.isEmpty) return filtered;
    // Prefix matches first.
    filtered.sort((a, b) {
      final ap = a.name.toLowerCase().startsWith(q) ? 0 : 1;
      final bp = b.name.toLowerCase().startsWith(q) ? 0 : 1;
      return ap != bp ? ap - bp : a.name.compareTo(b.name);
    });
    return filtered;
  }
}
