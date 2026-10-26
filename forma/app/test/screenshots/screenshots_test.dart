@Tags(['screenshots'])
library;

import 'dart:async';
import 'dart:io';
import 'dart:typed_data';
import 'dart:ui' as ui;

import 'package:drift/drift.dart' show Value;
import 'package:flutter/material.dart';
import 'package:flutter/rendering.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_riverpod/misc.dart' show Override;
import 'package:flutter_test/flutter_test.dart';
import 'package:forma/app/app.dart';
import 'package:forma/app/providers.dart';
import 'package:forma/app/router.dart';
import 'package:forma/content/content_providers.dart';
import 'package:forma/data/db/app_database.dart';
import 'package:forma/data/repositories/exercise_repository.dart';
import 'package:forma/data/repositories/settings_repository.dart';
import 'package:forma/data/repositories/workout_repository.dart';
import 'package:forma/features/health/health_providers.dart';
import 'package:forma/features/nutrition/device_photo_log.dart';
import 'package:forma/features/nutrition/photo_input.dart';
import 'package:forma/features/nutrition/vision/label_reader.dart';
import 'package:forma/features/nutrition/vision/on_device_vision.dart';
import 'package:forma/features/nutrition/vision/vision_result.dart';
import 'package:forma/services/health_service.dart';
import 'package:forma/services/training_service.dart';
import 'package:image_picker/image_picker.dart';

import '../demo_data.dart';
import '../helpers.dart';
import '../vision/vision_test_helpers.dart';

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

  Future<(AppDatabase, ProviderContainer)> boot(
    WidgetTester tester, {
    String theme = 'dark',
    bool withSession = false,
    List<Override> extra = const [],
  }) async {
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
    final content = (await tester.runAsync(() => testContentService(db)))!;
    final container = ProviderContainer(
      retry: (_, _) => null,
      overrides: [
        databaseProvider.overrideWithValue(db),
        healthPlatformProvider.overrideWithValue(const UnsupportedHealthPlatform()),
        clockProvider.overrideWithValue(() => today),
        contentServiceProvider.overrideWithValue(content),
        ...extra,
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

  testWidgets('capture photo recognition', (tester) async {
    final (db, c) = await boot(tester, extra: [
      photoPickerProvider.overrideWithValue(_ShotPicker()),
      onDeviceVisionProvider.overrideWithValue(_ShotVision()),
      photoAiAvailableProvider.overrideWithValue(false),
    ]);
    Future<void> settle() async {
      for (var i = 0; i < 10; i++) {
        await tester.runAsync(() => Future<void>.delayed(const Duration(milliseconds: 5)));
        await tester.pump(const Duration(milliseconds: 50));
      }
    }

    await go(tester, c, '/nutrition/photo?meal=breakfast');
    await shoot(tester, '12_photo_start');
    await tester.tap(find.text('Take photo'));
    await settle();
    await shoot(tester, '13_photo_suggestions');
    await tester.tap(find.byType(Switch).first);
    await tester.tap(find.text('Æg og bacon (2 spejlæg, 3 skiver bacon)'));
    await settle();
    final list = find.descendant(of: find.byType(DevicePhotoLogScreen), matching: find.byType(Scrollable)).first;
    await tester.scrollUntilVisible(find.text('ON YOUR PLATE'), 300, scrollable: list);
    await tester.drag(list, const Offset(0, -200));
    await shoot(tester, '14_photo_plate');

    final label = readNutritionLabel(table([
      [null, 'pr. 100 g', 'pr. portion (40 g)'],
      ['Energi', '1431 kJ / 342 kcal', '572 kJ / 137 kcal'],
      ['Fedt', '2,1 g', '0,8 g'],
      ['Kulhydrat', '64 g', '26 g'],
      ['Kostfibre', '9,5 g', '3,8 g'],
      ['Protein', '12 g', '4,8 g'],
    ]));
    unawaited(c.read(routerProvider).push('/nutrition/custom?barcode=5701234567899', extra: label));
    await tester.pump();
    await shoot(tester, '15_label_read');

    await tester.pumpWidget(const SizedBox());
    await tester.pump(const Duration(seconds: 2));
    c.dispose();
    unawaited(db.close());
    await tester.pump(const Duration(seconds: 2));
  });

  testWidgets('capture plan weights', (tester) async {
    final (db, c) = await boot(tester);
    final id = (await tester.runAsync(() => WorkoutRepository(db).saveTemplate(name: 'Full body', items: const [
          TemplateItemInput(exerciseId: 'barbell-bench-press', sets: 3, repMin: 6, repMax: 10, targetRpe: 8),
          TemplateItemInput(exerciseId: 'barbell-back-squat', sets: 3, repMin: 5, repMax: 8, targetRpe: 8),
          TemplateItemInput(exerciseId: 'dumbbell-lateral-raise', sets: 3, repMin: 12, repMax: 15, startWeightKg: 8),
          TemplateItemInput(exerciseId: 'hip-thrust', sets: 3, repMin: 8, repMax: 12),
        ])))!;
    await go(tester, c, '/workout');
    await shoot(tester, '16_workout_weights');
    await go(tester, c, '/workout/templates/$id');
    await shoot(tester, '17_template_weights');
    await tester.tap(find.text('Barbell Hip Thrust'));
    await shoot(tester, '18_starting_weight');

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

class _ShotPicker implements PhotoPicker {
  @override
  Future<PickedPhoto?> pick(ImageSource source) async =>
      PickedPhoto(bytes: File('test/vision/fixtures/scale_245g.jpg').readAsBytesSync(), mimeType: 'image/jpeg');
}

class _ShotVision implements OnDeviceVision {
  @override
  bool get available => true;

  @override
  Future<VisionResult> analyze(Uint8List image, {bool classify = true, bool text = true}) async => VisionResult(
        labels: const [VisionLabel('food', 0.93), VisionLabel('fried_egg', 0.72), VisionLabel('bacon', 0.55)],
        lines: [cell('TARE', 0.15, 0.82, h: 0.03), cell('245', 0.37, 0.73, h: 0.09)],
      );
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
