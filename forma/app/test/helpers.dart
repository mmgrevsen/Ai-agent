import 'dart:io';

import 'package:drift/drift.dart';
import 'package:drift/native.dart';
import 'package:forma/app/bootstrap.dart';
import 'package:forma/content/content_bundle.dart';
import 'package:forma/content/content_service.dart';
import 'package:forma/data/db/app_database.dart';
import 'package:forma/services/sync_service.dart';

/// Fresh in-memory database with the bundled exercise library.
Future<AppDatabase> testDatabase() async {
  driftRuntimeOptions.dontWarnAboutMultipleDatabases = true;
  final db = AppDatabase(NativeDatabase.memory());
  await bootstrapData(db, exercisesJson: File('assets/exercises.json').readAsStringSync());
  return db;
}

/// In-memory stand-in for the Supabase tables: enforces per-user ownership,
/// last-write-wins on `updated_at` and assigns a monotonic server clock, just
/// like the SQL triggers in `supabase/migrations`.
class FakeRemote implements RemoteStore {
  final Map<String, Map<String, Map<String, dynamic>>> tables = {};
  int _clock = 0;
  int upsertCalls = 0;

  /// The authenticated user; reads are filtered like row-level security.
  String? currentUser;

  String _now() => DateTime.utc(2030).add(Duration(milliseconds: ++_clock)).toIso8601String();

  @override
  Future<void> upsert(String table, List<Map<String, dynamic>> rows, {required String onConflict}) async {
    upsertCalls++;
    final t = tables.putIfAbsent(table, () => {});
    for (final r in rows) {
      final key = r[onConflict] as String;
      final existing = t[key];
      if (existing != null) {
        if (existing['user_id'] != r['user_id']) throw StateError('RLS: row owned by another user');
        if ((existing['updated_at'] as String).compareTo(r['updated_at'] as String) > 0) continue;
      }
      t[key] = {...r, 'server_updated_at': _now()};
    }
  }

  @override
  Future<List<Map<String, dynamic>>> pullSince(String table, String? cursor, {int limit = 500}) async {
    final rows = (tables[table]?.values ?? const <Map<String, dynamic>>[])
        .where((r) => currentUser == null || r['user_id'] == currentUser)
        .where((r) => cursor == null || (r['server_updated_at'] as String).compareTo(cursor) > 0)
        .where((r) => table != 'exercises' || r['is_custom'] == true)
        .toList()
      ..sort((a, b) => (a['server_updated_at'] as String).compareTo(b['server_updated_at'] as String));
    return rows.take(limit).map(Map<String, dynamic>.from).toList();
  }
}

/// The content bundled with the app, read from the asset files.
ContentBundle testContentBundle({int version = 0, Map<String, dynamic> Function(Map<String, dynamic>)? edit, int minAppBuild = 0}) {
  final sections = assembleSections({for (final e in kContentFiles.entries) e.key: File(e.value).readAsStringSync()});
  return ContentBundle.create(sections: edit == null ? sections : edit(sections), version: version, minAppBuild: minAppBuild);
}

/// An initialised content service over [db] (no network unless [transport]).
Future<ContentService> testContentService(AppDatabase db, {ContentTransport? transport, int appBuild = 0, ContentBundle? builtIn}) async {
  final s = ContentService(db: db, builtIn: builtIn ?? testContentBundle(), transport: transport, appBuild: appBuild);
  await s.init();
  return s;
}
