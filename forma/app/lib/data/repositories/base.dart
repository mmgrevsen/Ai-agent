import 'dart:async';

import 'package:drift/drift.dart';

import '../db/app_database.dart';

/// Shared helpers for repositories.
abstract class Repository {
  Repository(this.db);

  final AppDatabase db;

  /// Emits [load] now and again whenever any of [tables] change.
  Stream<T> watchTables<T>(Set<ResultSetImplementation<dynamic, dynamic>> tables, Future<T> Function() load) {
    late StreamController<T> controller;
    StreamSubscription<Set<TableUpdate>>? sub;
    var pending = false;
    var running = false;

    Future<void> run() async {
      if (running) {
        pending = true;
        return;
      }
      running = true;
      try {
        do {
          pending = false;
          final value = await load();
          if (!controller.isClosed) controller.add(value);
        } while (pending);
      } catch (e, st) {
        if (!controller.isClosed) controller.addError(e, st);
      } finally {
        running = false;
      }
    }

    controller = StreamController<T>(
      onListen: () {
        unawaited(run());
        sub = db.tableUpdates(TableUpdateQuery.onAllTables(tables)).listen((_) => run());
      },
      onCancel: () async {
        await sub?.cancel();
      },
    );
    return controller.stream;
  }

  /// Values every local mutation must set so sync picks it up.
  static Value<DateTime> get touched => Value(nowUtc());
  static const dirty = Value(true);
}
