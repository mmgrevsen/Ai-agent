import 'dart:async';
import 'dart:io';

import 'package:drift/drift.dart' show Value, driftRuntimeOptions;
import 'package:drift/native.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:forma/app/bootstrap.dart';
import 'package:forma/app/providers.dart';
import 'package:forma/content/content_providers.dart';
import 'package:forma/core/theme/app_theme.dart';
import 'package:forma/core/util/format.dart';
import 'package:forma/data/db/app_database.dart';
import 'package:forma/data/repositories/exercise_repository.dart';
import 'package:forma/data/repositories/settings_repository.dart';
import 'package:forma/data/repositories/workout_repository.dart';
import 'package:forma/domain/catalog.dart';
import 'package:forma/domain/training/models.dart';
import 'package:forma/domain/training/progression_engine.dart';
import 'package:forma/features/workout/plan_widgets.dart';
import 'package:forma/services/training_service.dart';

import '../helpers.dart';

void main() {
  const limits = SafetyLimits(maxIncreasePct: 5, maxIncreaseUpperKg: 2.5, maxIncreaseLowerKg: 5);
  const rx = Prescription(sets: 3, repMin: 8, repMax: 10, targetRpe: 8);
  const engine = ProgressionEngine();

  ProgressionInput input({TrackingType tracking = TrackingType.weightReps, List<ExerciseSession> history = const [], double? start}) => ProgressionInput(
        tracking: tracking,
        lowerBody: false,
        prescription: rx,
        history: history,
        limits: limits,
        incrementKg: 2.5,
        startWeightKg: start,
      );

  group('starting weight in the engine', () {
    test('used while there is no history', () {
      final r = engine.recommend(input(start: 40));
      expect(r.action, ProgressionAction.startingWeight);
      expect(r.weightKg, 40);
      expect(r.reps, 10);
      expect(r.headline, 'Starting weight from your plan: 40 kg × 10');
    });

    test('ignored once sets are logged: progression uses the history', () {
      final history = [
        ExerciseSession(workoutId: 'w1', date: DateTime(2026, 10, 1), sets: const [
          SetRecord(weightKg: 60, reps: 10, rpe: 8),
          SetRecord(weightKg: 60, reps: 10, rpe: 8),
          SetRecord(weightKg: 60, reps: 10, rpe: 8),
        ]),
      ];
      final r = engine.recommend(input(history: history, start: 40));
      expect(r.action, ProgressionAction.increaseLoad);
      expect(r.weightKg, 62.5);
    });

    test('no starting weight (or 0) still never invents one', () {
      expect(engine.recommend(input()).weightKg, isNull);
      expect(engine.recommend(input(start: 0)).action, ProgressionAction.baseline);
    });

    test('not used for bodyweight or timed exercises', () {
      expect(engine.recommend(input(tracking: TrackingType.bodyweightReps, start: 20)).action, ProgressionAction.baseline);
      expect(engine.recommend(input(tracking: TrackingType.duration, start: 20)).weightKg, isNull);
    });
  });

  group('plan with weights', () {
    late AppDatabase db;
    late WorkoutRepository workouts;
    late TrainingService training;

    setUp(() async {
      db = await testDatabase();
      workouts = WorkoutRepository(db);
      final settings = SettingsRepository(db);
      await settings.setEquipmentSet({'barbell', 'rack', 'bench'});
      training = TrainingService(workouts: workouts, exercises: ExerciseRepository(db), settings: settings);
    });
    tearDown(() => db.close());

    test('the starting weight is saved with the template and used by the first workout', () async {
      final id = await workouts.saveTemplate(name: 'Push', items: const [
        TemplateItemInput(exerciseId: 'barbell-bench-press', sets: 3, repMin: 8, repMax: 10, warmupSets: 2, startWeightKg: 40),
        TemplateItemInput(exerciseId: 'barbell-back-squat', sets: 3, repMin: 5, repMax: 8),
      ]);
      final t = (await workouts.template(id))!;
      expect(t.items.map((i) => i.row.startWeightKg), [40, null]);

      final next = await training.nextLoad(exercise: t.items.first.exercise, prescription: rx, startWeightKg: 40);
      expect(next.weightKg, 40);

      final w = await training.startWorkout(templateId: id, now: DateTime(2026, 10, 1, 18));
      final d = (await workouts.workout(w))!;
      final bench = d.exercises.first;
      final rec = StoredRecommendation.parse(bench.row.recommendation)!;
      expect(rec.action, 'startingWeight');
      expect(rec.isBaseline, isFalse, reason: 'the logger pre-fills the weight');
      expect(rec.weightKg, 40);
      // Warm-ups ramp up to the starting weight.
      final warmups = bench.sets.where((s) => s.kind == 'warmup').toList();
      expect(warmups, hasLength(2));
      expect(warmups.every((s) => s.weightKg! < 40), isTrue);
      // No starting weight: still a baseline without a weight.
      expect(StoredRecommendation.parse(d.exercises.last.row.recommendation)!.weightKg, isNull);
    });
  });

  test('upgrading a schema-1 database keeps every row and adds the starting weight', () async {
    driftRuntimeOptions.dontWarnAboutMultipleDatabases = true;
    final dir = await Directory.systemTemp.createTemp('forma_migration');
    final file = File('${dir.path}/forma.sqlite');
    try {
      // A database as schema 1 left it: no start_weight_kg column.
      var db = AppDatabase(NativeDatabase(file));
      await bootstrapData(db, exercisesJson: File('assets/exercises.json').readAsStringSync());
      final id = await WorkoutRepository(db).saveTemplate(name: 'Old plan', items: const [
        TemplateItemInput(exerciseId: 'barbell-bench-press', sets: 4, repMin: 6, repMax: 8, targetRpe: 8),
      ]);
      await db.customStatement('ALTER TABLE template_exercises DROP COLUMN start_weight_kg');
      await db.customStatement('PRAGMA user_version = 1');
      await db.close();

      db = AppDatabase(NativeDatabase(file));
      final t = (await WorkoutRepository(db).template(id))!;
      expect(t.template.name, 'Old plan');
      expect(t.items.single.row.sets, 4);
      expect(t.items.single.row.repMin, 6);
      expect(t.items.single.row.startWeightKg, isNull);
      final version = await db.customSelect('PRAGMA user_version').getSingle();
      expect(version.data.values.first, 2);
      // The new column works after the upgrade.
      await (db.update(db.templateExercises)..where((r) => r.templateId.equals(id))).write(const TemplateExercisesCompanion(startWeightKg: Value(50)));
      expect((await WorkoutRepository(db).template(id))!.items.single.row.startWeightKg, 50);
      await db.close();
    } finally {
      await dir.delete(recursive: true);
    }
  });

  testWidgets('a plan row shows the weight, reps and direction', (tester) async {
    final db = (await tester.runAsync(testDatabase))!;
    final workouts = WorkoutRepository(db);
    late String id;
    await tester.runAsync(() async {
      await SettingsRepository(db).setEquipmentSet({'barbell', 'rack', 'bench'});
      id = await workouts.saveTemplate(name: 'Push', items: const [
        TemplateItemInput(exerciseId: 'barbell-bench-press', sets: 3, repMin: 8, repMax: 10, startWeightKg: 40),
        TemplateItemInput(exerciseId: 'barbell-back-squat', sets: 3, repMin: 5, repMax: 8),
      ]);
    });
    final t = (await tester.runAsync(() => workouts.template(id)))!;
    final content = (await tester.runAsync(() => testContentService(db)))!;
    await tester.pumpWidget(ProviderScope(
      overrides: [databaseProvider.overrideWithValue(db), contentServiceProvider.overrideWithValue(content)],
      child: MaterialApp(theme: AppTheme.dark(), home: Scaffold(body: Column(children: [for (final i in t.items) PlanExerciseRow(i)]))),
    ));
    for (var i = 0; i < 10; i++) {
      await tester.runAsync(() => Future<void>.delayed(const Duration(milliseconds: 20)));
      await tester.pump();
    }
    expect(find.text('Bench Press'), findsOneWidget);
    expect(find.text('3 × 8–10'), findsOneWidget);
    expect(find.text('40 kg'), findsOneWidget);
    expect(find.text('× 10 · start'), findsOneWidget);
    // No history and no starting weight: asks for one instead of inventing it.
    expect(find.text('Set weight'), findsOneWidget);
    // Close like the app does on exit: unmount first, then let drift finish.
    await tester.pumpWidget(const SizedBox());
    await tester.pump(const Duration(seconds: 1));
    unawaited(db.close());
    await tester.pump(const Duration(seconds: 1));
  });

  test('load text per tracking type', () {
    const units = Units();
    Recommendation r({double? kg, int? s}) =>
        Recommendation(action: ProgressionAction.maintain, headline: '', reasons: const [], sets: 3, weightKg: kg, durationS: s);
    expect(loadText(r(kg: 82.5), TrackingType.weightReps, units), '82.5 kg');
    expect(loadText(r(), TrackingType.weightReps, units), isNull);
    expect(loadText(r(kg: 10), TrackingType.bodyweightReps, units), 'BW + 10 kg');
    expect(loadText(r(), TrackingType.bodyweightReps, units), 'Bodyweight');
    expect(loadText(r(s: 45), TrackingType.duration, units), '45 s');
    expect(loadText(r(kg: 100), TrackingType.weightReps, const Units(imperial: true)), '220.5 lb');
    expect(schemeText(3, 8, 8, TrackingType.weightReps), '3 × 8');
    expect(schemeText(4, 1, 1, TrackingType.duration), '4 sets');
  });
}
