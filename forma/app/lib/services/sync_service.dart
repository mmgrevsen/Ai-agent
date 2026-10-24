import 'package:drift/drift.dart';
import 'package:supabase_flutter/supabase_flutter.dart' show SupabaseClient;

import '../data/db/app_database.dart';

/// Server operations needed by sync. Implemented by Supabase in production
/// and by an in-memory fake in tests.
abstract interface class RemoteStore {
  /// Idempotent upsert of rows (snake_case keys).
  Future<void> upsert(String table, List<Map<String, dynamic>> rows, {required String onConflict});

  /// Rows with `server_updated_at > cursor`, oldest first.
  Future<List<Map<String, dynamic>>> pullSince(String table, String? cursor, {int limit = 500});
}

class SupabaseRemoteStore implements RemoteStore {
  SupabaseRemoteStore(this.client);
  final SupabaseClient client;

  @override
  Future<void> upsert(String table, List<Map<String, dynamic>> rows, {required String onConflict}) async {
    if (rows.isEmpty) return;
    await client.from(table).upsert(rows, onConflict: onConflict);
  }

  @override
  Future<List<Map<String, dynamic>>> pullSince(String table, String? cursor, {int limit = 500}) async {
    var q = client.from(table).select();
    if (cursor != null) q = q.gt('server_updated_at', cursor);
    if (table == 'exercises') q = q.eq('is_custom', true);
    final rows = await q.order('server_updated_at').limit(limit);
    return List<Map<String, dynamic>>.from(rows);
  }
}

class SyncResult {
  const SyncResult({required this.pushed, required this.pulled, required this.at});
  final int pushed;
  final int pulled;
  final DateTime at;
}

/// Two-way sync between the local database and Supabase.
///
/// * Push: dirty rows are upserted by primary key (idempotent, so retries
///   and duplicate deliveries are safe). A row is marked clean only if it
///   was not modified again while the push was in flight.
/// * Pull: rows changed on the server since the per-table cursor
///   (server clock) are applied with last-write-wins on `updated_at`; local
///   unsynced edits that are newer are kept.
class SyncService {
  SyncService({required this.db, required this.remote, required this.userId, this.includeHealth = false});

  final AppDatabase db;
  final RemoteStore remote;
  final String userId;
  final bool includeHealth;

  static const _singletons = {'profiles', 'user_preferences'};
  static const _localOnlyColumns = {'dirty'};
  static const batchSize = 200;

  List<TableInfo<Table, Object?>> get _tables => [
        for (final t in db.syncedTables)
          if (includeHealth || t.actualTableName != 'health_observations') t,
      ];

  Future<SyncResult> sync() async {
    await _guardAccount();
    var pushed = 0;
    var pulled = 0;
    // Push first so the server has our latest edits before we pull.
    for (final t in _tables) {
      pushed += await _push(t);
    }
    for (final t in _tables) {
      pulled += await _pull(t);
    }
    final now = DateTime.now();
    await db.writeMeta('sync_last_success', now.toUtc().toIso8601String());
    return SyncResult(pushed: pushed, pulled: pulled, at: now);
  }

  /// Local data created without an account is adopted by the first account
  /// that signs in. If a *different* account signs in later, the previous
  /// account's local copy is cleared (it remains on the server).
  Future<void> _guardAccount() async {
    final owner = await db.readMeta('sync_user_id');
    if (owner != null && owner != userId) {
      await wipeUserData(db);
    }
    await db.writeMeta('sync_user_id', userId);
  }

  Future<int> _push(TableInfo<Table, Object?> t) async {
    final name = t.actualTableName;
    final where = name == 'exercises' ? 'dirty = 1 AND is_custom = 1' : 'dirty = 1';
    final rows = await db.customSelect('SELECT * FROM "$name" WHERE $where', readsFrom: {t}).get();
    if (rows.isEmpty) return 0;
    final boolCols = {for (final c in t.$columns) if (c.type == DriftSqlType.bool) c.name};
    var count = 0;
    for (var i = 0; i < rows.length; i += batchSize) {
      final chunk = rows.sublist(i, (i + batchSize).clamp(0, rows.length));
      final payload = [
        for (final r in chunk)
          {
            for (final e in r.data.entries)
              if (!_localOnlyColumns.contains(e.key) && !(_singletons.contains(name) && e.key == 'id'))
                e.key: boolCols.contains(e.key) ? e.value == 1 : e.value,
            'user_id': userId,
          },
      ];
      await remote.upsert(name, payload, onConflict: _singletons.contains(name) ? 'user_id' : 'id');
      for (final r in chunk) {
        await db.customUpdate(
          'UPDATE "$name" SET dirty = 0 WHERE id = ? AND updated_at = ?',
          variables: [Variable.withString(r.data['id'] as String), Variable.withString(r.data['updated_at'] as String)],
          updates: {t},
        );
      }
      count += chunk.length;
    }
    return count;
  }

  Future<int> _pull(TableInfo<Table, Object?> t) async {
    final name = t.actualTableName;
    final key = 'sync_cursor:$name';
    var cursor = await db.readMeta(key);
    final columns = {for (final c in t.$columns) c.name: c};
    var total = 0;
    while (true) {
      final rows = await remote.pullSince(name, cursor, limit: 500);
      if (rows.isEmpty) break;
      await db.transaction(() async {
        for (final r in rows) {
          final id = _singletons.contains(name) ? AppDatabase.singletonId : r['id'] as String;
          final remoteUpdated = _ts(r['updated_at']);
          final local = await db.customSelect(
            'SELECT updated_at, dirty FROM "$name" WHERE id = ?',
            variables: [Variable.withString(id)],
          ).getSingleOrNull();
          if (local != null && local.data['dirty'] == 1 && remoteUpdated != null) {
            final localUpdated = local.data['updated_at'] as String;
            if (localUpdated.compareTo(remoteUpdated) > 0) continue; // Newer local edit wins.
          }
          final values = <String, Object?>{};
          for (final e in columns.entries) {
            if (e.key == 'dirty') continue;
            if (e.key == 'id') {
              values['id'] = id;
              continue;
            }
            if (!r.containsKey(e.key)) continue;
            final v = r[e.key];
            values[e.key] = switch (e.value.type) {
              DriftSqlType.bool => v == null ? null : ((v == true || v == 1) ? 1 : 0),
              DriftSqlType.dateTime => _ts(v),
              _ => v,
            };
          }
          values['dirty'] = 0;
          final cols = values.keys.map((k) => '"$k"').join(', ');
          final marks = List.filled(values.length, '?').join(', ');
          // A true upsert: REPLACE would delete the row first and break
          // foreign keys from child rows.
          final updates = values.keys.where((k) => k != 'id').map((k) => '"$k" = excluded."$k"').join(', ');
          await db.customInsert(
            'INSERT INTO "$name" ($cols) VALUES ($marks) ON CONFLICT(id) DO UPDATE SET $updates',
            variables: [for (final v in values.values) _variable(v)],
            updates: {t},
          );
        }
      });
      total += rows.length;
      cursor = rows.last['server_updated_at'] as String?;
      if (cursor != null) await db.writeMeta(key, cursor);
      if (rows.length < 500) break;
    }
    return total;
  }

  /// Normalises timestamps to drift's text format (UTC ISO-8601).
  static String? _ts(Object? v) {
    if (v == null) return null;
    final parsed = DateTime.tryParse(v.toString());
    return parsed?.toUtc().toIso8601String();
  }

  static Variable<Object> _variable(Object? v) => switch (v) {
        null => const Variable(null),
        final int i => Variable.withInt(i),
        final double d => Variable.withReal(d),
        final bool b => Variable.withBool(b),
        _ => Variable.withString(v.toString()),
      };
}

/// Deletes all personal data from this device (keeps the bundled exercise
/// library) and recreates empty singleton rows.
Future<void> wipeUserData(AppDatabase db) => db.transaction(() async {
      for (final t in db.syncedTables.reversed) {
        if (t.actualTableName == 'exercises') {
          await db.customStatement('DELETE FROM exercises WHERE is_custom = 1');
        } else {
          await db.customStatement('DELETE FROM "${t.actualTableName}"');
        }
      }
      await db.customStatement("DELETE FROM meta WHERE key LIKE 'sync_%' OR key LIKE 'health_%'");
      await db.customStatement("INSERT OR IGNORE INTO profiles (id, created_at, updated_at, dirty) VALUES ('me', strftime('%Y-%m-%dT%H:%M:%fZ','now'), strftime('%Y-%m-%dT%H:%M:%fZ','now'), 1)");
      await db.customStatement("INSERT OR IGNORE INTO user_preferences (id, created_at, updated_at, dirty) VALUES ('me', strftime('%Y-%m-%dT%H:%M:%fZ','now'), strftime('%Y-%m-%dT%H:%M:%fZ','now'), 1)");
    });
