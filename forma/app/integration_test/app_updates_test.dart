import 'dart:convert';
import 'dart:io';

import 'package:drift/drift.dart' show Value;
import 'package:drift/native.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:forma/app/app.dart';
import 'package:forma/app/bootstrap.dart';
import 'package:forma/app/providers.dart';
import 'package:forma/app/router.dart';
import 'package:forma/content/content_providers.dart';
import 'package:forma/content/content_service.dart';
import 'package:forma/data/db/app_database.dart';
import 'package:forma/data/repositories/settings_repository.dart';
import 'package:integration_test/integration_test.dart';

import '../test/helpers.dart';

class _Server implements ContentTransport {
  Object? body;
  @override
  Future<ContentFetch> fetch({String? etag}) async => ContentDownloaded(body);
}

void main() {
  IntegrationTestWidgetsFlutterBinding.ensureInitialized();

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

  testWidgets('check for updates, see the new content, roll back', (tester) async {
    final db = AppDatabase(NativeDatabase.memory());
    await bootstrapData(db, exercisesJson: await File('assets/exercises.json').readAsString());
    await SettingsRepository(db).updateProfile(const ProfilesCompanion(displayName: Value('Sam'), onboardingCompleted: Value(true)));
    final server = _Server()
      ..body = testContentBundle(
        version: 202611011200,
        edit: (s) => (jsonDecode(jsonEncode(s)) as Map<String, dynamic>)
          ..['config'] = {
            'flags': {'labelPhotos': false},
            'announcement': {'id': 'hello', 'title': 'New: photo logging', 'body': 'Photograph your plate on a kitchen scale.'},
          },
      ).toJson();
    final content = ContentService(db: db, builtIn: testContentBundle(), transport: server, appBuild: 0);
    await content.init();

    tester.view.physicalSize = const Size(1179, 2556);
    tester.view.devicePixelRatio = 3;
    addTearDown(tester.view.reset);
    await tester.pumpWidget(ProviderScope(
      overrides: [databaseProvider.overrideWithValue(db), contentServiceProvider.overrideWithValue(content)],
      child: const FormaApp(),
    ));
    await until(tester, find.text('Overview'));
    expect(find.text('New: photo logging'), findsNothing);

    // The automatic check runs shortly after start.
    await until(tester, find.text('New: photo logging'), timeout: const Duration(seconds: 10));

    await tap(tester, find.byTooltip('Settings'));
    await tap(tester, find.text('App updates'));
    await until(tester, find.text('Downloaded update'));
    expect(find.textContaining('Published'), findsOneWidget);
    expect(find.text('Development build'), findsOneWidget);
    expect(find.text('Code updates not enabled'), findsOneWidget);

    await tap(tester, find.text('Check for updates'));
    await until(tester, find.text('You have the newest content.'));

    // Server flags hide features without an app update.
    final router = ProviderScope.containerOf(tester.element(find.byType(MaterialApp))).read(routerProvider);
    router.go('/nutrition/add');
    await until(tester, find.text('Barcode photo'));
    expect(find.text('Nutrition label'), findsNothing);
    router.go('/settings/updates');
    await until(tester, find.text('Go back to the previous content').evaluate().isEmpty ? find.text('Use the built-in content') : find.text('Go back to the previous content'));

    await tap(tester, find.text('Use the built-in content'));
    await tap(tester, find.text('Go back'));
    await until(tester, find.text('Built into the app'));
    expect(await db.readMeta(ContentService.kRejected), '202611011200');

    await tester.pumpWidget(const SizedBox());
    await tester.pump(const Duration(milliseconds: 500));
    await content.dispose();
    await db.close();
  });
}
