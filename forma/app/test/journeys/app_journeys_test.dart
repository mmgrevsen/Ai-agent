import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:forma/app/app.dart';
import 'package:forma/app/providers.dart';
import 'package:forma/content/content_providers.dart';
import 'package:forma/data/db/app_database.dart';
import 'package:forma/features/health/health_providers.dart';
import 'package:forma/services/health_service.dart';

import '../helpers.dart';

/// Monday, so the generated 3-day plan has a workout today.
final _monday = DateTime(2026, 10, 19, 9);

Future<void> pumpApp(WidgetTester tester, AppDatabase db) async {
  final content = (await tester.runAsync(() => testContentService(db)))!;
  tester.view.physicalSize = const Size(390 * 3, 844 * 3);
  tester.view.devicePixelRatio = 3;
  addTearDown(tester.view.reset);
  await tester.pumpWidget(
    ProviderScope(
      retry: (_, _) => null,
      overrides: [
        databaseProvider.overrideWithValue(db),
        healthPlatformProvider.overrideWithValue(const UnsupportedHealthPlatform()),
        clockProvider.overrideWithValue(() => _monday),
        contentServiceProvider.overrideWithValue(content),
      ],
      child: const FormaApp(),
    ),
  );
  await settle(tester);
}

/// pumpAndSettle never settles while a workout clock ticks, so pump a
/// bounded number of frames instead.
Future<void> settle(WidgetTester tester, [int frames = 12]) async {
  for (var i = 0; i < frames; i++) {
    await tester.pump(const Duration(milliseconds: 80));
  }
}

/// Pumps until [f] appears (database work completes in fake-time slices).
Future<void> pumpUntil(WidgetTester tester, Finder f, {int maxFrames = 200}) async {
  for (var i = 0; i < maxFrames && f.evaluate().isEmpty; i++) {
    // Let real async work (database transactions) progress between frames.
    await tester.runAsync(() => Future<void>.delayed(const Duration(milliseconds: 5)));
    await tester.pump(const Duration(milliseconds: 50));
  }
  expect(f, findsWidgets);
}

Future<void> tap(WidgetTester tester, Finder f) async {
  await pumpUntil(tester, f);
  await tester.ensureVisible(f.first);
  await settle(tester, 4);
  await tester.tap(f.first);
  await settle(tester);
}

Future<void> dispose(WidgetTester tester, AppDatabase db) async {
  await tester.pumpWidget(const SizedBox());
  await settle(tester, 3);
  await tester.runAsync(db.close);
}

Future<AppDatabase> onboardedDb(WidgetTester tester) async {
  final db = (await tester.runAsync(testDatabase))!;
  return db;
}

Future<void> completeOnboarding(WidgetTester tester) async {
  expect(find.text('Get started'), findsOneWidget);
  await tap(tester, find.text('Get started'));
  await tester.enterText(find.widgetWithText(TextField, 'First name'), 'Sam');
  await tester.enterText(find.widgetWithText(TextFormField, 'Weight'), '80');
  await settle(tester);
  await tap(tester, find.text('Continue'));
  await tap(tester, find.text('Build muscle'));
  await tap(tester, find.text('Continue'));
  await tap(tester, find.text('Full gym'));
  await tap(tester, find.text('Continue'));
  expect(find.text('Create a starter plan'), findsOneWidget);
  await tap(tester, find.text('Finish setup'));
  await settle(tester, 30);
}

void main() {
  testWidgets('onboarding creates a plan and lands on a populated overview', (tester) async {
    final db = await onboardedDb(tester);
    await pumpApp(tester, db);
    await completeOnboarding(tester);

    expect(find.textContaining('Good'), findsWidgets);
    expect(find.textContaining('Sam'), findsOneWidget);
    // The generated plan's first template is scheduled on Mondays.
    expect(find.text('Full body A'), findsOneWidget);
    expect(find.text('Start'), findsOneWidget);
    // Weight entered during onboarding feeds the dashboard trend.
    expect(find.text('WEIGHT TREND'), findsOneWidget);

    final profile = await tester.runAsync(() => db.select(db.profiles).getSingle());
    expect(profile!.primaryGoal, 'build_muscle');
    expect(profile.onboardingCompleted, isTrue);
    await dispose(tester, db);
  });

  // Workout logging and food logging journeys run in integration_test/ on a
  // real event loop: their database transactions don't complete under the
  // fake clock used by widget tests.

  testWidgets('log body weight from Progress', (tester) async {
    final db = await onboardedDb(tester);
    await pumpApp(tester, db);
    await completeOnboarding(tester);

    await tap(tester, find.text('Progress').last);
    await tap(tester, find.text('Details'));
    expect(find.text('TREND WEIGHT'), findsOneWidget);
    await tap(tester, find.text('Log weight'));
    await tester.enterText(find.widgetWithText(TextFormField, 'Weight'), '79.4');
    await settle(tester);
    await tap(tester, find.widgetWithText(FilledButton, 'Save'));

    final rows = await tester.runAsync(() => db.select(db.bodyWeights).get());
    expect(rows!.map((r) => r.weightKg), containsAll([80.0, 79.4]));
    await dispose(tester, db);
  });

  testWidgets('coach tab works without a server and explains why chat is unavailable', (tester) async {
    final db = await onboardedDb(tester);
    await pumpApp(tester, db);
    await completeOnboarding(tester);
    await tap(tester, find.text('Coach').last);
    expect(find.text('NOTES FROM YOUR DATA'), findsOneWidget);
    expect(find.text('The AI coach needs the Forma server'), findsOneWidget);
    await dispose(tester, db);
  });
}
