import 'package:drift/drift.dart';

import '../../domain/body/weight_trend.dart';
import '../../domain/dates.dart';
import '../db/app_database.dart';
import 'base.dart';

const measurementKinds = <String, (String label, String unit)>{
  'waist': ('Waist', 'cm'),
  'chest': ('Chest', 'cm'),
  'hips': ('Hips', 'cm'),
  'arm': ('Upper arm', 'cm'),
  'thigh': ('Thigh', 'cm'),
  'neck': ('Neck', 'cm'),
  'body_fat': ('Body fat', '%'),
};

class BodyRepository extends Repository {
  BodyRepository(super.db);

  Stream<List<BodyWeight>> watchWeights({DateTime? since}) => (db.select(db.bodyWeights)
        ..where((w) {
          var c = w.deletedAt.isNull();
          if (since != null) c = c & w.date.isBiggerOrEqualValue(dayKey(since));
          return c;
        })
        ..orderBy([(w) => OrderingTerm.asc(w.measuredAt)]))
      .watch();

  Future<List<BodyWeight>> weights({DateTime? since}) => (db.select(db.bodyWeights)
        ..where((w) {
          var c = w.deletedAt.isNull();
          if (since != null) c = c & w.date.isBiggerOrEqualValue(dayKey(since));
          return c;
        })
        ..orderBy([(w) => OrderingTerm.asc(w.measuredAt)]))
      .get();

  static WeightTrend trendOf(List<BodyWeight> rows) =>
      WeightTrend.compute([for (final r in rows) WeighIn(parseDayKey(r.date), r.weightKg)]);

  Future<String> addWeight(double kg, {DateTime? at}) async {
    final when = at ?? DateTime.now();
    final id = newId();
    await db.into(db.bodyWeights).insert(BodyWeightsCompanion.insert(
          id: Value(id),
          date: dayKey(when),
          measuredAt: when.toUtc(),
          weightKg: kg,
        ));
    return id;
  }

  /// Imports a weigh-in from Apple Health; idempotent by [externalId].
  Future<bool> importWeight({required double kg, required DateTime at, required String externalId}) async {
    final existing = await (db.select(db.bodyWeights)..where((w) => w.externalId.equals(externalId))).getSingleOrNull();
    if (existing != null) return false;
    await db.into(db.bodyWeights).insert(BodyWeightsCompanion.insert(
          date: dayKey(at.toLocal()),
          measuredAt: at.toUtc(),
          weightKg: kg,
          source: const Value('imported'),
          externalId: Value(externalId),
        ));
    return true;
  }

  Future<void> updateWeight(String id, double kg) => (db.update(db.bodyWeights)..where((w) => w.id.equals(id))).write(
        BodyWeightsCompanion(weightKg: Value(kg), updatedAt: Repository.touched, dirty: Repository.dirty),
      );

  Future<void> deleteWeight(String id) => (db.update(db.bodyWeights)..where((w) => w.id.equals(id))).write(
        BodyWeightsCompanion(deletedAt: Value(nowUtc()), updatedAt: Repository.touched, dirty: Repository.dirty),
      );

  Stream<List<BodyMeasurement>> watchMeasurements() => (db.select(db.bodyMeasurements)
        ..where((m) => m.deletedAt.isNull())
        ..orderBy([(m) => OrderingTerm.asc(m.date)]))
      .watch();

  Future<void> addMeasurement(String kind, double value, {DateTime? day}) {
    final unit = measurementKinds[kind]?.$2 ?? 'cm';
    return db.into(db.bodyMeasurements).insert(
          BodyMeasurementsCompanion.insert(date: dayKey(day ?? DateTime.now()), kind: kind, value: value, unit: unit),
        );
  }

  Future<void> deleteMeasurement(String id) =>
      (db.update(db.bodyMeasurements)..where((m) => m.id.equals(id))).write(
        BodyMeasurementsCompanion(deletedAt: Value(nowUtc()), updatedAt: Repository.touched, dirty: Repository.dirty),
      );
}
