import 'package:collection/collection.dart';
import 'package:drift/drift.dart';

import '../../domain/catalog.dart';
import '../../domain/dates.dart';
import '../../domain/training/analytics.dart';
import '../../domain/training/models.dart';
import '../db/app_database.dart';
import 'base.dart';

class TemplateItem {
  const TemplateItem(this.row, this.exercise);
  final TemplateExercise row;
  final Exercise exercise;
}

class TemplateWithItems {
  const TemplateWithItems(this.template, this.items);
  final WorkoutTemplate template;
  final List<TemplateItem> items;
}

class SessionExercise {
  const SessionExercise({required this.row, required this.exercise, required this.sets});
  final WorkoutExercise row;
  final Exercise exercise;
  final List<WorkoutSet> sets;

  List<WorkoutSet> get completedWorking => [for (final s in sets) if (s.completed && s.kind != 'warmup') s];
}

class WorkoutDetail {
  const WorkoutDetail(this.workout, this.exercises);
  final Workout workout;
  final List<SessionExercise> exercises;

  int get completedSets => exercises.fold(0, (a, e) => a + e.completedWorking.length);
  int get plannedSets => exercises.fold(0, (a, e) => a + e.sets.where((s) => s.kind != 'warmup').length);
  double get volumeKg => exercises.fold(
        0,
        (a, e) => a + e.completedWorking.fold<double>(0, (b, s) => b + (s.weightKg ?? 0) * (s.reps ?? 0)),
      );
}

class WorkoutListItem {
  const WorkoutListItem({
    required this.workout,
    required this.exerciseNames,
    required this.setCount,
    required this.volumeKg,
  });
  final Workout workout;
  final List<String> exerciseNames;
  final int setCount;
  final double volumeKg;
}

class ScheduleWithDays {
  const ScheduleWithDays(this.schedule, this.days);
  final TrainingSchedule schedule;

  /// weekday (1–7) → template id
  final Map<int, String> days;
}

/// A planned template exercise used to create templates in one call.
class TemplateItemInput {
  const TemplateItemInput({
    required this.exerciseId,
    this.sets = 3,
    this.repMin = 8,
    this.repMax = 12,
    this.targetRpe,
    this.restSeconds,
    this.warmupSets = 0,
    this.supersetGroup,
  });

  final String exerciseId;
  final int sets;
  final int repMin;
  final int repMax;
  final double? targetRpe;
  final int? restSeconds;
  final int warmupSets;
  final int? supersetGroup;
}

class WorkoutRepository extends Repository {
  WorkoutRepository(super.db);

  // ------------------------------------------------------------ templates

  Stream<List<TemplateWithItems>> watchTemplates() =>
      watchTables({db.workoutTemplates, db.templateExercises, db.exercises}, templates);

  Future<List<TemplateWithItems>> templates() async {
    final templates = await (db.select(db.workoutTemplates)
          ..where((t) => t.deletedAt.isNull())
          ..orderBy([(t) => OrderingTerm.asc(t.position), (t) => OrderingTerm.asc(t.createdAt)]))
        .get();
    if (templates.isEmpty) return const [];
    final rows = await (db.select(db.templateExercises).join([
      innerJoin(db.exercises, db.exercises.id.equalsExp(db.templateExercises.exerciseId)),
    ])
          ..where(db.templateExercises.deletedAt.isNull() & db.templateExercises.templateId.isIn(templates.map((t) => t.id)))
          ..orderBy([OrderingTerm.asc(db.templateExercises.position)]))
        .get();
    final byTemplate = groupBy(rows, (r) => r.readTable(db.templateExercises).templateId);
    return [
      for (final t in templates)
        TemplateWithItems(t, [
          for (final r in byTemplate[t.id] ?? const <TypedResult>[])
            TemplateItem(r.readTable(db.templateExercises), r.readTable(db.exercises)),
        ]),
    ];
  }

  Future<TemplateWithItems?> template(String id) async =>
      (await templates()).firstWhereOrNull((t) => t.template.id == id);

  Future<String> saveTemplate({String? id, required String name, String? notes, required List<TemplateItemInput> items}) {
    return db.transaction(() async {
      final templateId = id ?? newId();
      if (id == null) {
        final count = await db.workoutTemplates.count(where: (t) => t.deletedAt.isNull()).getSingle();
        await db.into(db.workoutTemplates).insert(WorkoutTemplatesCompanion.insert(
              id: Value(templateId),
              name: name.trim(),
              notes: Value(notes),
              position: Value(count),
            ));
      } else {
        await (db.update(db.workoutTemplates)..where((t) => t.id.equals(id))).write(WorkoutTemplatesCompanion(
          name: Value(name.trim()),
          notes: Value(notes),
          updatedAt: Repository.touched,
          dirty: Repository.dirty,
        ));
        await (db.update(db.templateExercises)..where((t) => t.templateId.equals(id) & t.deletedAt.isNull()))
            .write(TemplateExercisesCompanion(
          deletedAt: Value(nowUtc()),
          updatedAt: Repository.touched,
          dirty: Repository.dirty,
        ));
      }
      for (final (i, item) in items.indexed) {
        await db.into(db.templateExercises).insert(TemplateExercisesCompanion.insert(
              templateId: templateId,
              exerciseId: item.exerciseId,
              position: i,
              sets: Value(item.sets),
              repMin: Value(item.repMin),
              repMax: Value(item.repMax),
              targetRpe: Value(item.targetRpe),
              restSeconds: Value(item.restSeconds),
              warmupSets: Value(item.warmupSets),
              supersetGroup: Value(item.supersetGroup),
            ));
      }
      return templateId;
    });
  }

  Future<void> deleteTemplate(String id) => db.transaction(() async {
        final now = nowUtc();
        await (db.update(db.workoutTemplates)..where((t) => t.id.equals(id))).write(WorkoutTemplatesCompanion(
          deletedAt: Value(now),
          updatedAt: Value(now),
          dirty: Repository.dirty,
        ));
        await (db.update(db.scheduleDays)..where((d) => d.templateId.equals(id) & d.deletedAt.isNull())).write(
          ScheduleDaysCompanion(deletedAt: Value(now), updatedAt: Value(now), dirty: Repository.dirty),
        );
      });

  // ------------------------------------------------------------ schedule

  Stream<ScheduleWithDays?> watchActiveSchedule() =>
      watchTables({db.trainingSchedules, db.scheduleDays}, activeSchedule);

  Future<ScheduleWithDays?> activeSchedule() async {
    final s = await (db.select(db.trainingSchedules)
          ..where((s) => s.deletedAt.isNull() & s.isActive.equals(true))
          ..orderBy([(s) => OrderingTerm.desc(s.updatedAt)])
          ..limit(1))
        .getSingleOrNull();
    if (s == null) return null;
    final days = await (db.select(db.scheduleDays)..where((d) => d.scheduleId.equals(s.id) & d.deletedAt.isNull())).get();
    return ScheduleWithDays(s, {for (final d in days) d.weekday: d.templateId});
  }

  Future<String> _ensureSchedule() async {
    final existing = await activeSchedule();
    if (existing != null) return existing.schedule.id;
    final id = newId();
    await db.into(db.trainingSchedules).insert(TrainingSchedulesCompanion.insert(
          id: Value(id),
          name: 'My week',
          startDate: Value(dayKey(startOfWeek(DateTime.now()))),
        ));
    return id;
  }

  /// Assigns [templateId] to [weekday] (or clears it when null).
  Future<void> setScheduleDay(int weekday, String? templateId) => db.transaction(() async {
        final scheduleId = await _ensureSchedule();
        final now = nowUtc();
        await (db.update(db.scheduleDays)
              ..where((d) => d.scheduleId.equals(scheduleId) & d.weekday.equals(weekday) & d.deletedAt.isNull()))
            .write(ScheduleDaysCompanion(deletedAt: Value(now), updatedAt: Value(now), dirty: Repository.dirty));
        if (templateId != null) {
          await db.into(db.scheduleDays).insert(
                ScheduleDaysCompanion.insert(scheduleId: scheduleId, weekday: weekday, templateId: templateId),
              );
        }
      });

  Future<void> setDeloadFrequency(int? everyWeeks) async {
    final id = await _ensureSchedule();
    await (db.update(db.trainingSchedules)..where((s) => s.id.equals(id))).write(TrainingSchedulesCompanion(
      deloadEveryWeeks: Value(everyWeeks),
      updatedAt: Repository.touched,
      dirty: Repository.dirty,
    ));
  }

  /// Whether [day] falls in a scheduled deload week.
  static bool isDeloadWeek(TrainingSchedule s, DateTime day) {
    final every = s.deloadEveryWeeks;
    if (every == null || every < 2 || s.startDate == null) return false;
    final weeks = daysBetween(startOfWeek(parseDayKey(s.startDate!)), startOfWeek(day)) ~/ 7;
    return weeks >= 0 && weeks % every == every - 1;
  }

  // ------------------------------------------------------------ sessions

  Stream<Workout?> watchActiveWorkout() => (db.select(db.workouts)
        ..where((w) => w.endedAt.isNull() & w.deletedAt.isNull())
        ..orderBy([(w) => OrderingTerm.desc(w.startedAt)])
        ..limit(1))
      .watchSingleOrNull();

  Stream<WorkoutDetail?> watchWorkout(String id) =>
      watchTables({db.workouts, db.workoutExercises, db.workoutSets, db.exercises}, () => workout(id));

  Future<WorkoutDetail?> workout(String id) async {
    final w = await (db.select(db.workouts)..where((w) => w.id.equals(id) & w.deletedAt.isNull())).getSingleOrNull();
    if (w == null) return null;
    final exRows = await (db.select(db.workoutExercises).join([
      innerJoin(db.exercises, db.exercises.id.equalsExp(db.workoutExercises.exerciseId)),
    ])
          ..where(db.workoutExercises.workoutId.equals(id) & db.workoutExercises.deletedAt.isNull())
          ..orderBy([OrderingTerm.asc(db.workoutExercises.position)]))
        .get();
    final weIds = exRows.map((r) => r.readTable(db.workoutExercises).id).toList();
    final sets = weIds.isEmpty
        ? const <WorkoutSet>[]
        : await (db.select(db.workoutSets)
              ..where((s) => s.workoutExerciseId.isIn(weIds) & s.deletedAt.isNull())
              ..orderBy([(s) => OrderingTerm.asc(s.position)]))
            .get();
    final byWe = groupBy(sets, (s) => s.workoutExerciseId);
    return WorkoutDetail(w, [
      for (final r in exRows)
        SessionExercise(
          row: r.readTable(db.workoutExercises),
          exercise: r.readTable(db.exercises),
          sets: byWe[r.readTable(db.workoutExercises).id] ?? const [],
        ),
    ]);
  }

  Future<String> createWorkout({required String name, String? templateId, bool isDeload = false, DateTime? startedAt}) async {
    final id = newId();
    await db.into(db.workouts).insert(WorkoutsCompanion.insert(
          id: Value(id),
          name: name,
          templateId: Value(templateId),
          startedAt: (startedAt ?? DateTime.now()).toUtc(),
          isDeload: Value(isDeload),
        ));
    return id;
  }

  Future<String> addExercise({
    required String workoutId,
    required String exerciseId,
    int? repMin,
    int? repMax,
    double? targetRpe,
    int? restSeconds,
    int? supersetGroup,
    String? recommendation,
    String? substitutedFromId,
    int? position,
  }) async {
    final pos = position ??
        await db.workoutExercises
            .count(where: (e) => e.workoutId.equals(workoutId) & e.deletedAt.isNull())
            .getSingle();
    final id = newId();
    await db.into(db.workoutExercises).insert(WorkoutExercisesCompanion.insert(
          id: Value(id),
          workoutId: workoutId,
          exerciseId: exerciseId,
          position: pos,
          repMin: Value(repMin),
          repMax: Value(repMax),
          targetRpe: Value(targetRpe),
          restSeconds: Value(restSeconds),
          supersetGroup: Value(supersetGroup),
          recommendation: Value(recommendation),
          substitutedFromId: Value(substitutedFromId),
        ));
    return id;
  }

  Future<String> addSet(String workoutExerciseId, {SetKind kind = SetKind.working, double? weightKg, int? reps, int? durationS}) async {
    final existing = await (db.select(db.workoutSets)
          ..where((s) => s.workoutExerciseId.equals(workoutExerciseId) & s.deletedAt.isNull()))
        .get();
    // Warm-ups go before working sets.
    final pos = kind == SetKind.warmup
        ? existing.where((s) => s.kind == 'warmup').length
        : (existing.isEmpty ? 0 : existing.map((s) => s.position).reduce((a, b) => a > b ? a : b) + 1);
    if (kind == SetKind.warmup) {
      for (final s in existing.where((s) => s.position >= pos)) {
        await (db.update(db.workoutSets)..where((x) => x.id.equals(s.id))).write(WorkoutSetsCompanion(
          position: Value(s.position + 1),
          updatedAt: Repository.touched,
          dirty: Repository.dirty,
        ));
      }
    }
    final id = newId();
    await db.into(db.workoutSets).insert(WorkoutSetsCompanion.insert(
          id: Value(id),
          workoutExerciseId: workoutExerciseId,
          position: pos,
          kind: Value(kind.name),
          weightKg: Value(weightKg),
          reps: Value(reps),
          durationS: Value(durationS),
        ));
    return id;
  }

  Future<void> updateSet(String id, WorkoutSetsCompanion changes) =>
      (db.update(db.workoutSets)..where((s) => s.id.equals(id))).write(
        changes.copyWith(updatedAt: Repository.touched, dirty: Repository.dirty),
      );

  /// Marks a set done. Empty fields are filled from [fallback] — the value
  /// shown as a placeholder (suggestion or previous session) — so a set can
  /// be logged with a single tap.
  Future<void> completeSet(WorkoutSet set, {SetRecord? fallback}) => updateSet(
        set.id,
        WorkoutSetsCompanion(
          completed: const Value(true),
          completedAt: Value(nowUtc()),
          weightKg: set.weightKg == null && fallback?.weightKg != null ? Value(fallback!.weightKg) : const Value.absent(),
          reps: set.reps == null && fallback?.reps != null ? Value(fallback!.reps) : const Value.absent(),
          durationS: set.durationS == null && fallback?.durationS != null ? Value(fallback!.durationS) : const Value.absent(),
          distanceM: set.distanceM == null && fallback?.distanceM != null ? Value(fallback!.distanceM) : const Value.absent(),
        ),
      );

  Future<void> uncompleteSet(String id) =>
      updateSet(id, const WorkoutSetsCompanion(completed: Value(false), completedAt: Value(null)));

  Future<void> deleteSet(String id) =>
      updateSet(id, WorkoutSetsCompanion(deletedAt: Value(nowUtc())));

  Future<void> updateWorkoutExercise(String id, WorkoutExercisesCompanion changes) =>
      (db.update(db.workoutExercises)..where((e) => e.id.equals(id))).write(
        changes.copyWith(updatedAt: Repository.touched, dirty: Repository.dirty),
      );

  Future<void> removeExercise(String workoutExerciseId) => db.transaction(() async {
        final now = nowUtc();
        await updateWorkoutExercise(workoutExerciseId, WorkoutExercisesCompanion(deletedAt: Value(now)));
        await (db.update(db.workoutSets)..where((s) => s.workoutExerciseId.equals(workoutExerciseId)))
            .write(WorkoutSetsCompanion(deletedAt: Value(now), updatedAt: Value(now), dirty: Repository.dirty));
      });

  Future<void> moveExercise(String workoutId, String workoutExerciseId, int delta) => db.transaction(() async {
        final rows = await (db.select(db.workoutExercises)
              ..where((e) => e.workoutId.equals(workoutId) & e.deletedAt.isNull())
              ..orderBy([(e) => OrderingTerm.asc(e.position)]))
            .get();
        final i = rows.indexWhere((r) => r.id == workoutExerciseId);
        final j = i + delta;
        if (i < 0 || j < 0 || j >= rows.length) return;
        final list = [...rows];
        final item = list.removeAt(i);
        list.insert(j, item);
        for (final (k, r) in list.indexed) {
          if (r.position != k) await updateWorkoutExercise(r.id, WorkoutExercisesCompanion(position: Value(k)));
        }
      });

  Future<void> updateWorkout(String id, WorkoutsCompanion changes) =>
      (db.update(db.workouts)..where((w) => w.id.equals(id))).write(
        changes.copyWith(updatedAt: Repository.touched, dirty: Repository.dirty),
      );

  /// Ends the session. Sets that were never completed are removed so the
  /// history only contains work that was actually done.
  Future<void> finishWorkout(String id, {DateTime? endedAt}) => db.transaction(() async {
        final detail = await workout(id);
        if (detail == null) return;
        final now = nowUtc();
        for (final e in detail.exercises) {
          for (final s in e.sets.where((s) => !s.completed)) {
            await (db.update(db.workoutSets)..where((x) => x.id.equals(s.id)))
                .write(WorkoutSetsCompanion(deletedAt: Value(now), updatedAt: Value(now), dirty: Repository.dirty));
          }
          if (e.sets.every((s) => !s.completed)) {
            await updateWorkoutExercise(e.row.id, WorkoutExercisesCompanion(deletedAt: Value(now)));
          }
        }
        await updateWorkout(id, WorkoutsCompanion(endedAt: Value((endedAt ?? DateTime.now()).toUtc())));
      });

  Future<void> deleteWorkout(String id) => db.transaction(() async {
        final now = nowUtc();
        await updateWorkout(id, WorkoutsCompanion(deletedAt: Value(now)));
        final we = await (db.select(db.workoutExercises)..where((e) => e.workoutId.equals(id))).get();
        for (final e in we) {
          await updateWorkoutExercise(e.id, WorkoutExercisesCompanion(deletedAt: Value(now)));
          await (db.update(db.workoutSets)..where((s) => s.workoutExerciseId.equals(e.id)))
              .write(WorkoutSetsCompanion(deletedAt: Value(now), updatedAt: Value(now), dirty: Repository.dirty));
        }
      });

  // ------------------------------------------------------------ history

  Stream<List<WorkoutListItem>> watchHistory({int limit = 100}) =>
      watchTables({db.workouts, db.workoutExercises, db.workoutSets}, () => history(limit: limit));

  Future<List<WorkoutListItem>> history({int limit = 100, DateTime? since}) async {
    final ws = await (db.select(db.workouts)
          ..where((w) {
            var c = w.endedAt.isNotNull() & w.deletedAt.isNull();
            if (since != null) c = c & w.startedAt.isBiggerOrEqualValue(since.toUtc());
            return c;
          })
          ..orderBy([(w) => OrderingTerm.desc(w.startedAt)])
          ..limit(limit))
        .get();
    if (ws.isEmpty) return const [];
    final rows = await (db.select(db.workoutExercises).join([
      innerJoin(db.exercises, db.exercises.id.equalsExp(db.workoutExercises.exerciseId)),
      leftOuterJoin(
        db.workoutSets,
        db.workoutSets.workoutExerciseId.equalsExp(db.workoutExercises.id) &
            db.workoutSets.deletedAt.isNull() &
            db.workoutSets.completed.equals(true),
      ),
    ])
          ..where(db.workoutExercises.workoutId.isIn(ws.map((w) => w.id)) & db.workoutExercises.deletedAt.isNull())
          ..orderBy([OrderingTerm.asc(db.workoutExercises.position)]))
        .get();
    final byWorkout = groupBy(rows, (r) => r.readTable(db.workoutExercises).workoutId);
    return [
      for (final w in ws)
        () {
          final rs = byWorkout[w.id] ?? const <TypedResult>[];
          final names = <String>[];
          var sets = 0;
          var volume = 0.0;
          for (final r in rs) {
            final name = r.readTable(db.exercises).name;
            if (!names.contains(name)) names.add(name);
            final s = r.readTableOrNull(db.workoutSets);
            if (s != null && s.kind != 'warmup') {
              sets++;
              volume += (s.weightKg ?? 0) * (s.reps ?? 0);
            }
          }
          return WorkoutListItem(workout: w, exerciseNames: names, setCount: sets, volumeKg: volume);
        }(),
    ];
  }

  /// Completed sessions of [exerciseId], newest first.
  Future<List<ExerciseSession>> exerciseHistory(String exerciseId, {int limit = 50, String? excludeWorkoutId}) async {
    final rows = await (db.select(db.workoutSets).join([
      innerJoin(db.workoutExercises, db.workoutExercises.id.equalsExp(db.workoutSets.workoutExerciseId)),
      innerJoin(db.workouts, db.workouts.id.equalsExp(db.workoutExercises.workoutId)),
    ])
          ..where(db.workoutExercises.exerciseId.equals(exerciseId) &
              db.workouts.endedAt.isNotNull() &
              db.workouts.deletedAt.isNull() &
              db.workoutExercises.deletedAt.isNull() &
              db.workoutSets.deletedAt.isNull() &
              (excludeWorkoutId == null ? const Constant(true) : db.workouts.id.equals(excludeWorkoutId).not()))
          ..orderBy([
            OrderingTerm.desc(db.workouts.startedAt),
            OrderingTerm.asc(db.workoutExercises.position),
            OrderingTerm.asc(db.workoutSets.position),
          ]))
        .get();
    final sessions = <ExerciseSession>[];
    String? current;
    var sets = <SetRecord>[];
    Workout? w;
    WorkoutExercise? we;
    void flush() {
      final ws = w, wex = we;
      if (ws != null && wex != null) {
        sessions.add(ExerciseSession(
          workoutId: ws.id,
          date: ws.startedAt.toLocal(),
          sets: sets,
          repMin: wex.repMin,
          repMax: wex.repMax,
          targetRpe: wex.targetRpe,
          isDeload: ws.isDeload,
        ));
      }
    }

    for (final r in rows) {
      final rw = r.readTable(db.workouts);
      if (rw.id != current) {
        flush();
        if (sessions.length >= limit) return sessions;
        current = rw.id;
        w = rw;
        we = r.readTable(db.workoutExercises);
        sets = [];
      }
      sets.add(toSetRecord(r.readTable(db.workoutSets)));
    }
    flush();
    return sessions.take(limit).toList();
  }

  static SetRecord toSetRecord(WorkoutSet s) => SetRecord(
        kind: SetKind.fromName(s.kind),
        weightKg: s.weightKg,
        reps: s.reps,
        durationS: s.durationS,
        distanceM: s.distanceM,
        rpe: s.rpe,
        completed: s.completed,
      );

  /// Per-workout rows for analytics (volume, sets per muscle, frequency).
  Future<List<WorkoutSummaryRow>> summaryRows({DateTime? since}) async {
    final rows = await (db.select(db.workoutSets).join([
      innerJoin(db.workoutExercises, db.workoutExercises.id.equalsExp(db.workoutSets.workoutExerciseId)),
      innerJoin(db.workouts, db.workouts.id.equalsExp(db.workoutExercises.workoutId)),
      innerJoin(db.exercises, db.exercises.id.equalsExp(db.workoutExercises.exerciseId)),
    ])
          ..where(db.workouts.endedAt.isNotNull() &
              db.workouts.deletedAt.isNull() &
              db.workoutExercises.deletedAt.isNull() &
              db.workoutSets.deletedAt.isNull() &
              db.workoutSets.completed.equals(true) &
              (since == null ? const Constant(true) : db.workouts.startedAt.isBiggerOrEqualValue(since.toUtc()))))
        .get();
    final byWorkout = groupBy(rows, (r) => r.readTable(db.workouts).id);
    // Include imported/empty workouts for frequency.
    final allWorkouts = await (db.select(db.workouts)
          ..where((w) {
            var c = w.endedAt.isNotNull() & w.deletedAt.isNull();
            if (since != null) c = c & w.startedAt.isBiggerOrEqualValue(since.toUtc());
            return c;
          }))
        .get();
    return [
      for (final w in allWorkouts)
        () {
          final rs = byWorkout[w.id] ?? const <TypedResult>[];
          var volume = 0.0;
          var sets = 0;
          final muscles = <String, int>{};
          for (final r in rs) {
            final s = r.readTable(db.workoutSets);
            if (s.kind == 'warmup') continue;
            sets++;
            volume += (s.weightKg ?? 0) * (s.reps ?? 0);
            final m = r.readTable(db.exercises).primaryMuscle;
            muscles[m] = (muscles[m] ?? 0) + 1;
          }
          final end = w.endedAt ?? w.startedAt;
          return WorkoutSummaryRow(
            date: w.startedAt.toLocal(),
            volumeKg: volume,
            workingSets: sets,
            durationMin: end.difference(w.startedAt).inSeconds / 60,
            setsByMuscle: muscles,
          );
        }(),
    ];
  }

  /// Exercises the user has logged, most recent first (for progress views).
  Future<List<Exercise>> loggedExercises() async {
    final rows = await (db.selectOnly(db.workoutExercises, distinct: true)
          ..addColumns([db.workoutExercises.exerciseId])
          ..join([innerJoin(db.workouts, db.workouts.id.equalsExp(db.workoutExercises.workoutId))])
          ..where(db.workouts.endedAt.isNotNull() & db.workouts.deletedAt.isNull() & db.workoutExercises.deletedAt.isNull()))
        .get();
    final ids = rows.map((r) => r.read(db.workoutExercises.exerciseId)!).toSet();
    if (ids.isEmpty) return const [];
    return (db.select(db.exercises)..where((e) => e.id.isIn(ids))..orderBy([(e) => OrderingTerm.asc(e.name)])).get();
  }

  // ------------------------------------------------------------ readiness

  Stream<ReadinessCheckin?> watchCheckin(DateTime day) => (db.select(db.readinessCheckins)
        ..where((c) => c.date.equals(dayKey(day)) & c.deletedAt.isNull())
        ..orderBy([(c) => OrderingTerm.desc(c.updatedAt)])
        ..limit(1))
      .watchSingleOrNull();

  Future<List<ReadinessCheckin>> checkins({required DateTime since}) => (db.select(db.readinessCheckins)
        ..where((c) => c.date.isBiggerOrEqualValue(dayKey(since)) & c.deletedAt.isNull()))
      .get();

  Future<void> saveCheckin(DateTime day, {required int energy, required int soreness, required int sleepQuality}) =>
      db.transaction(() async {
        final key = dayKey(day);
        final now = nowUtc();
        await (db.update(db.readinessCheckins)..where((c) => c.date.equals(key) & c.deletedAt.isNull()))
            .write(ReadinessCheckinsCompanion(deletedAt: Value(now), updatedAt: Value(now), dirty: Repository.dirty));
        await db.into(db.readinessCheckins).insert(ReadinessCheckinsCompanion.insert(
              date: key,
              energy: energy,
              soreness: soreness,
              sleepQuality: sleepQuality,
            ));
      });
}
