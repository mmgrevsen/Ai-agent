@Tags(['screenshots'])
library;

import 'dart:async';
import 'dart:io';
import 'dart:ui' as ui;

import 'package:drift/drift.dart' show Value;
import 'package:flutter/material.dart';
import 'package:flutter/rendering.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:forma/app/app.dart';
import 'package:forma/app/providers.dart';
import 'package:forma/app/router.dart';
import 'package:forma/data/db/app_database.dart';
import 'package:forma/data/repositories/exercise_repository.dart';
import 'package:forma/data/repositories/settings_repository.dart';
import 'package:forma/data/repositories/workout_repository.dart';
import 'package:forma/features/health/health_providers.dart';
import 'package:forma/services/health_service.dart';
import 'package:forma/services/training_service.dart';

import '../demo_data.dart';
import '../helpers.dart';

/// Renders the main screens with demo data to PNG for visual review.
/// Run: flutter test test/screenshots --run-skipped --dart-define=SHOT_DIR=/path
void main() {
  const outDir = String.fromEnvironment('SHOT_DIR', defaultValue: 'build/screenshots');
  final today = DateTime(2026, 10, 22, 9); // Thursday
  final boundary = GlobalKey();

  Future<void> shoot(WidgetTester tester, String name) async {
    for (var i = 0; i < 20; i++) {
      await tester.runAsync(() => Future<void>.delayed(const Duration(milliseconds: 5)));
      await tester.pump(const Duration(milliseconds: 50));
    }
    final render = boundary.currentContext!.findRenderObject()! as RenderRepaintBoundary;
    await tester.runAsync(() async {
      final image = await render.toImage(pixelRatio: 2);
      final bytes = await image.toByteData(format: ui.ImageByteFormat.png);
      await Directory(outDir).create(recursive: true);
      await File('$outDir/$name.png').writeAsBytes(bytes!.buffer.asUint8List());
    });
  }

  String? sessionId;

  Future<(AppDatabase, ProviderContainer)> boot(WidgetTester tester, {String theme = 'dark', bool withSession = false}) async {
    tester.view.physicalSize = const Size(393 * 3, 852 * 3);
    tester.view.devicePixelRatio = 3;
    addTearDown(tester.view.reset);
    final db = (await tester.runAsync(() async {
      final db = await testDatabase();
      await seedDemoData(db, today: today);
      await SettingsRepository(db).updatePrefs(UserPreferencesCompanion(themeMode: Value(theme)));
      if (withSession) sessionId = await _startDemoSession(db, today);
      return db;
    }))!;
    final container = ProviderContainer(
      retry: (_, _) => null,
      overrides: [
        databaseProvider.overrideWithValue(db),
        healthPlatformProvider.overrideWithValue(const UnsupportedHealthPlatform()),
        clockProvider.overrideWithValue(() => today),
      ],
    );
    await tester.pumpWidget(UncontrolledProviderScope(
      container: container,
      child: RepaintBoundary(key: boundary, child: const FormaApp()),
    ));
    return (db, container);
  }

  Future<void> go(WidgetTester tester, ProviderContainer c, String path) async {
    c.read(routerProvider).go(path);
    await tester.pump();
  }

  testWidgets('capture dark screens', (tester) async {
    final (db, c) = await boot(tester, withSession: true);
    await shoot(tester, '01_overview');
    await go(tester, c, '/workout');
    await shoot(tester, '02_workout');
    await go(tester, c, '/nutrition');
    await shoot(tester, '03_nutrition');
    await go(tester, c, '/progress');
    await shoot(tester, '04_progress');
    await go(tester, c, '/progress/exercise/barbell-bench-press');
    await shoot(tester, '05_exercise_detail');
    await go(tester, c, '/progress/weight');
    await shoot(tester, '06_weight');
    await go(tester, c, '/coach');
    await shoot(tester, '07_coach');

    final id = sessionId!;
    unawaited(c.read(routerProvider).push('/session/$id'));
    await tester.pump();
    await shoot(tester, '08_session');
    c.read(routerProvider).pop();
    await tester.pump();

    await go(tester, c, '/settings/training');
    await shoot(tester, '09_settings_training');

    await tester.pumpWidget(const SizedBox());
    await tester.pump(const Duration(seconds: 2));
    c.dispose();
    unawaited(db.close());
    await tester.pump(const Duration(seconds: 2));
  });

  testWidgets('capture light overview', (tester) async {
    final (db, c) = await boot(tester, theme: 'light');
    await shoot(tester, '10_overview_light');
    await go(tester, c, '/nutrition');
    await shoot(tester, '11_nutrition_light');
    await tester.pumpWidget(const SizedBox());
    await tester.pump(const Duration(seconds: 2));
    c.dispose();
    unawaited(db.close());
    await tester.pump(const Duration(seconds: 2));
  });
}

/// Starts the Upper template and logs the first sets, before the UI mounts.
Future<String> _startDemoSession(AppDatabase db, DateTime today) async {
  final repo = WorkoutRepository(db);
  final service = TrainingService(workouts: repo, exercises: ExerciseRepository(db), settings: SettingsRepository(db));
  final t = (await repo.templates()).firstWhere((t) => t.template.name == 'Upper');
  final id = await service.startWorkout(templateId: t.template.id, now: today.subtract(const Duration(minutes: 14)));
  final bench = (await repo.workout(id))!.exercises.first;
  for (final s in bench.sets.where((s) => s.kind == 'warmup')) {
    await repo.completeSet(s);
  }
  final rec = StoredRecommendation.parse(bench.row.recommendation)!;
  final working = bench.sets.firstWhere((s) => s.kind == 'working');
  await repo.updateSet(working.id, WorkoutSetsCompanion(weightKg: Value(rec.weightKg), reps: Value(rec.reps), rpe: const Value(8), completed: const Value(true)));
  return id;
}
