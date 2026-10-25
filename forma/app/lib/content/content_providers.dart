import 'dart:async';

import 'package:drift/drift.dart' show TableUpdate;
import 'package:flutter/widgets.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../app/providers.dart';
import '../core/config/env.dart';
import 'content_bundle.dart';
import 'content_service.dart';

/// Builds the content bundled with the app from its assets.
Future<ContentBundle> loadBuiltInContent(AssetBundle assets) async {
  final files = {for (final e in kContentFiles.entries) e.key: await assets.loadString(e.value)};
  return ContentBundle.create(sections: assembleSections(files), version: Env.builtInContentVersion);
}

/// Overridden in `main` (and tests) with an initialised service.
final contentServiceProvider = Provider<ContentService>((ref) => throw UnimplementedError('contentServiceProvider must be overridden'));

/// The current content status; updates when new content is activated.
final contentStatusProvider = StreamProvider<ContentStatus>((ref) async* {
  final service = ref.watch(contentServiceProvider);
  yield service.status;
  yield* service.changes;
});

/// The active content. Falls back to the service's synchronous state while
/// the stream starts, so readers never see a loading state.
final contentBundleProvider = Provider<ContentBundle>(
  (ref) => ref.watch(contentStatusProvider).value?.bundle ?? ref.watch(contentServiceProvider).status.bundle,
);

final programCatalogProvider = Provider((ref) => ref.watch(contentBundleProvider).programs);
final progressionTuningProvider = Provider((ref) => ref.watch(contentBundleProvider).progression);
final appConfigProvider = Provider((ref) => ref.watch(contentBundleProvider).config);
final contentFoodsProvider = Provider((ref) => ref.watch(contentBundleProvider).foods);

/// Checks for content in the background: shortly after launch, when the app
/// returns to the foreground (which also covers a connection coming back),
/// and every 30 minutes while open. Also confirms a successful start.
final contentUpdaterProvider = Provider<void>((ref) {
  final service = ref.watch(contentServiceProvider);
  WidgetsBinding.instance.addPostFrameCallback((_) => service.markBootSucceeded());
  if (service.transport == null) return;

  Future<void> checkIfStale() async {
    final last = service.status.lastCheck;
    if (last == null || DateTime.now().difference(last) > const Duration(minutes: 15)) await service.check();
  }

  final first = Timer(const Duration(seconds: 3), service.check);
  final periodic = Timer.periodic(const Duration(minutes: 30), (_) => service.check());
  final lifecycle = AppLifecycleListener(onResume: checkIfStale);
  ref.onDispose(() {
    first.cancel();
    periodic.cancel();
    lifecycle.dispose();
  });
});

/// Siri / Apple Watch shortcuts write to the database outside Flutter, so
/// the diary is refreshed whenever the app comes back to the foreground.
final externalChangesProvider = Provider<void>((ref) {
  final db = ref.watch(databaseProvider);
  final lifecycle = AppLifecycleListener(
    onResume: () => db.notifyUpdates({TableUpdate.onTable(db.nutritionEntries), TableUpdate.onTable(db.foods)}),
  );
  ref.onDispose(lifecycle.dispose);
});
