import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import 'app/app.dart';
import 'app/bootstrap.dart';
import 'app/providers.dart';
import 'content/content_providers.dart';
import 'content/content_service.dart';
import 'core/config/env.dart';
import 'data/db/app_database.dart';
import 'data/remote/backend.dart';

Future<void> main() async {
  WidgetsFlutterBinding.ensureInitialized();
  final db = AppDatabase.open();
  await bootstrapData(db, exercisesJson: await rootBundle.loadString('assets/exercises.json'));
  final content = ContentService(
    db: db,
    builtIn: await loadBuiltInContent(rootBundle),
    transport: Env.contentUrl.isEmpty ? null : HttpContentTransport(Uri.parse(Env.contentUrl)),
    appBuild: Env.appBuild,
  );
  await content.init();
  final backend = await Backend.init();

  runApp(
    ProviderScope(
      overrides: [
        databaseProvider.overrideWithValue(db),
        backendProvider.overrideWithValue(backend),
        contentServiceProvider.overrideWithValue(content),
      ],
      child: const FormaApp(),
    ),
  );
}
