import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import 'app/app.dart';
import 'app/bootstrap.dart';
import 'app/providers.dart';
import 'data/db/app_database.dart';
import 'data/remote/backend.dart';

Future<void> main() async {
  WidgetsFlutterBinding.ensureInitialized();
  final db = AppDatabase.open();
  await bootstrapData(db, exercisesJson: await rootBundle.loadString('assets/exercises.json'));
  final backend = await Backend.init();

  runApp(
    ProviderScope(
      overrides: [
        databaseProvider.overrideWithValue(db),
        backendProvider.overrideWithValue(backend),
      ],
      child: const FormaApp(),
    ),
  );
}
