import 'dart:io';

import 'package:drift/native.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:forma/app/app.dart';
import 'package:forma/app/bootstrap.dart';
import 'package:forma/app/providers.dart';
import 'package:forma/content/content_providers.dart';
import 'package:forma/data/db/app_database.dart';
import 'package:integration_test/integration_test.dart';

import '../test/helpers.dart';

/// End-to-end journeys on a real device/desktop with a real event loop.
/// Run: flutter test integration_test -d DEVICE   (Linux: under Xvfb)
void main() {
  IntegrationTestWidgetsFlutterBinding.ensureInitialized();

  Future<AppDatabase> freshDb() async {
    final db = AppDatabase(NativeDatabase.memory());
    await bootstrapData(db, exercisesJson: await File('assets/exercises.json').readAsString());
    return db;
  }

  Future<void> until(WidgetTester tester, Finder f, {Duration timeout = const Duration(seconds: 20)}) async {
    final end = DateTime.now().add(timeout);
    while (f.evaluate().isEmpty) {
      if (DateTime.now().isAfter(end)) fail('Timed out waiting for $f');
      await tester.pump(const Duration(milliseconds: 100));
    }
  }

  Future<void> tap(WidgetTester tester, Finder f) async {
    await until(tester, f);
    await tester.ensureVisible(f.first);
    await tester.pump(const Duration(milliseconds: 300));
    await tester.tap(f.first);
    await tester.pump(const Duration(milliseconds: 600));
  }

  testWidgets('onboard, train, log food and weight', (tester) async {
    final db = await freshDb();
    // iPhone-sized viewport so layouts match real use.
    tester.view.physicalSize = const Size(1179, 2556);
    tester.view.devicePixelRatio = 3;
    addTearDown(tester.view.reset);
    await tester.pumpWidget(ProviderScope(
      overrides: [databaseProvider.overrideWithValue(db), contentServiceProvider.overrideWithValue(await testContentService(db))],
      child: const FormaApp(),
    ));

    // Onboarding.
    await tap(tester, find.text('Get started'));
    await tester.enterText(find.widgetWithText(TextField, 'First name'), 'Sam');
    await tester.enterText(find.widgetWithText(TextFormField, 'Weight'), '80');
    await tap(tester, find.text('Continue'));
    await tap(tester, find.text('Build muscle'));
    await tap(tester, find.text('Continue'));
    await tap(tester, find.text('Continue'));
    await tap(tester, find.text('Finish setup'));
    await until(tester, find.text('Overview'));

    // Start an empty workout, add an exercise and log a set.
    await tap(tester, find.text('Workout').last);
    final started = DateTime.now();
    await tap(tester, find.text('Start empty workout'));
    await until(tester, find.text('Add your first exercise'));
    final startLatency = DateTime.now().difference(started);
    await tap(tester, find.widgetWithText(FilledButton, 'Add exercise'));
    await tester.enterText(find.byType(TextField).first, 'goblet');
    await tap(tester, find.text('Goblet Squat'));
    await tap(tester, find.bySemanticsLabel('Complete set 1'));
    final fields = find.byType(TextField);
    await tester.enterText(fields.at(0), '24');
    await tester.enterText(fields.at(1), '12');
    await tap(tester, find.widgetWithText(FilledButton, 'Done'));
    await until(tester, find.text('REST'));
    await tap(tester, find.text('Skip'));
    await tap(tester, find.widgetWithText(FilledButton, 'Finish'));
    await tap(tester, find.descendant(of: find.byType(AlertDialog), matching: find.text('Finish')));
    await until(tester, find.text('WORKOUT COMPLETE'));
    await tap(tester, find.text('Done'));
    await until(tester, find.text('HISTORY'));

    // Start a planned workout — 6 exercises with recommendations.
    final t2 = DateTime.now();
    await tap(tester, find.byTooltip('Start Full body A'));
    await until(tester, find.text('Finish'));
    final planLatency = DateTime.now().difference(t2);
    await tester.tap(find.byTooltip('Workout options'));
    await tester.pump(const Duration(milliseconds: 500));
    await tap(tester, find.text('Discard workout'));
    await tap(tester, find.descendant(of: find.byType(AlertDialog), matching: find.text('Discard')));
    await until(tester, find.text('Start empty workout'));

    // Nutrition quick add.
    await tap(tester, find.text('Nutrition').last);
    await tap(tester, find.byTooltip('Breakfast options'));
    await tap(tester, find.text('Quick add'));
    await tester.enterText(find.widgetWithText(TextFormField, 'Calories'), '420');
    await tester.enterText(find.widgetWithText(TextFormField, 'Protein'), '30');
    await tap(tester, find.widgetWithText(FilledButton, 'Add'));
    await until(tester, find.text('420 kcal'));

    // Custom food from a label → log a portion → diary totals.
    await tap(tester, find.text('Add food').first);
    await tap(tester, find.text('New food'));
    await tester.enterText(find.widgetWithText(TextFormField, 'Name'), 'Greek yogurt');
    await tester.enterText(find.widgetWithText(TextFormField, 'Calories'), '97');
    await tester.enterText(find.widgetWithText(TextFormField, 'Protein'), '9');
    await tap(tester, find.widgetWithText(FilledButton, 'Save'));
    // The portion sheet opens for the new food straight away.
    await until(tester, find.textContaining('Not provided by the source'));
    await tester.enterText(find.widgetWithText(TextFormField, 'Amount'), '200');
    await tester.pump(const Duration(milliseconds: 300));
    await tap(tester, find.textContaining('Add ·'));
    await tap(tester, find.byTooltip('Back'));
    await until(tester, find.text('194 kcal'));
    final entries = await db.select(db.nutritionEntries).get();
    final yogurt = entries.singleWhere((e) => e.name == 'Greek yogurt');
    expect(yogurt.kcal, closeTo(194, 0.01));
    expect(yogurt.carbsG, isNull, reason: 'unknown values stay unknown');

    final sets = await db.select(db.workoutSets).get();
    expect(sets.where((s) => s.completed && s.deletedAt == null).single.reps, 12);
    // ignore: avoid_print
    print('LATENCY empty start: ${startLatency.inMilliseconds} ms, planned start: ${planLatency.inMilliseconds} ms');
    expect(planLatency, lessThan(const Duration(seconds: 3)));
    // Unmount the app (and its live queries) before closing the database.
    await tester.pumpWidget(const SizedBox());
    await tester.pump(const Duration(milliseconds: 500));
    await db.close();
  });
}
