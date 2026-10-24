import 'package:drift/drift.dart';

import '../../domain/dates.dart';
import '../../services/health_service.dart';
import '../db/app_database.dart';
import 'base.dart';

class HealthRepository extends Repository {
  HealthRepository(super.db);

  /// Stores samples; existing ones (same platform id) are skipped.
  Future<int> importSamples(List<HealthSample> samples, {required bool syncToServer}) async {
    if (samples.isEmpty) return 0;
    final count = db.healthObservations.count();
    final before = await count.getSingle();
    await db.batch((b) {
      for (final s in samples) {
        b.insert(
          db.healthObservations,
          HealthObservationsCompanion.insert(
            type: s.type,
            startAt: s.start.toUtc(),
            endAt: s.end.toUtc(),
            value: s.value,
            unit: s.unit,
            sourceName: Value(s.sourceName),
            externalId: Value(s.id),
            dirty: Value(syncToServer),
          ),
          mode: InsertMode.insertOrIgnore,
        );
      }
    });
    return await count.getSingle() - before;
  }

  Future<List<HealthSample>> samples({required DateTime since, Set<String>? types}) async {
    final rows = await (db.select(db.healthObservations)
          ..where((o) {
            var c = o.deletedAt.isNull() & o.endAt.isBiggerOrEqualValue(since.toUtc());
            if (types != null) c = c & o.type.isIn(types);
            return c;
          }))
        .get();
    return [
      for (final r in rows)
        HealthSample(
          id: r.externalId ?? r.id,
          type: r.type,
          start: r.startAt,
          end: r.endAt,
          value: r.value,
          unit: r.unit,
          sourceName: r.sourceName,
        ),
    ];
  }

  Stream<int> watchCount() => (db.selectOnly(db.healthObservations)..addColumns([db.healthObservations.id.count()]))
      .map((r) => r.read(db.healthObservations.id.count()) ?? 0)
      .watchSingle();

  Future<Map<String, Map<DateTime, double>>> daily({required DateTime since}) async =>
      aggregateDaily(await samples(since: since));

  Future<bool> importWorkout(HealthWorkoutSample w) async {
    final existing = await (db.select(db.workouts)..where((x) => x.externalId.equals(w.id))).getSingleOrNull();
    if (existing != null) return false;
    await db.into(db.workouts).insert(WorkoutsCompanion.insert(
          name: _activityLabel(w.activity),
          startedAt: w.start.toUtc(),
          endedAt: Value(w.end.toUtc()),
          source: const Value('imported'),
          externalId: Value(w.id),
          activityType: Value(w.activity),
          energyKcal: Value(w.energyKcal),
          distanceM: Value(w.distanceM),
          notes: Value(w.sourceName == null ? null : 'Imported from ${w.sourceName}'),
        ));
    return true;
  }

  /// Deletes all imported health data from this device.
  Future<void> deleteImported() => db.transaction(() async {
        final now = nowUtc();
        await db.delete(db.healthObservations).go();
        await (db.update(db.workouts)..where((w) => w.source.equals('imported')))
            .write(WorkoutsCompanion(deletedAt: Value(now), updatedAt: Value(now), dirty: Repository.dirty));
        await (db.update(db.bodyWeights)..where((w) => w.source.equals('imported')))
            .write(BodyWeightsCompanion(deletedAt: Value(now), updatedAt: Value(now), dirty: Repository.dirty));
      });

  static String _activityLabel(String a) {
    final words = a.toLowerCase().split('_');
    final s = words.join(' ');
    return s.isEmpty ? 'Workout' : s[0].toUpperCase() + s.substring(1);
  }

  /// Latest day with any sample of [type], for "last synced" displays.
  Future<DateTime?> latestDay(String type) async {
    final row = await (db.select(db.healthObservations)
          ..where((o) => o.type.equals(type))
          ..orderBy([(o) => OrderingTerm.desc(o.endAt)])
          ..limit(1))
        .getSingleOrNull();
    return row == null ? null : dateOnly(row.endAt.toLocal());
  }
}
