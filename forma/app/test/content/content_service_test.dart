// Tests edit raw JSON content on purpose.
// ignore_for_file: avoid_dynamic_calls

import 'dart:async';
import 'dart:convert';
import 'dart:io';

import 'package:drift/drift.dart' show Value;
import 'package:flutter_test/flutter_test.dart';
import 'package:forma/content/content_bundle.dart';
import 'package:forma/content/content_service.dart';
import 'package:forma/data/db/app_database.dart';
import 'package:forma/data/repositories/exercise_repository.dart';
import 'package:forma/data/repositories/workout_repository.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';

import '../helpers.dart';

/// Serves whatever [next] holds; can fail like a dead connection.
class FakeTransport implements ContentTransport {
  Object? next;
  bool offline = false;
  int calls = 0;
  String? lastEtag;
  Completer<void>? gate;

  @override
  Future<ContentFetch> fetch({String? etag}) async {
    calls++;
    lastEtag = etag;
    if (gate != null) await gate!.future;
    if (offline) throw const ContentFetchException('No connection to the update server.');
    final n = next;
    if (n is ContentFetch) return n;
    return ContentDownloaded(n, etag: 'etag-$calls');
  }
}

Map<String, dynamic> _copy(Map<String, dynamic> m) => jsonDecode(jsonEncode(m)) as Map<String, dynamic>;

/// A newer bundle where one exercise is renamed, one added and one removed.
ContentBundle _update(int version, {int minAppBuild = 0, double deload = 0.85}) => testContentBundle(
      version: version,
      minAppBuild: minAppBuild,
      edit: (s) {
        final c = _copy(s);
        final list = c['exercises']['exercises'] as List;
        (list.firstWhere((e) => e['id'] == 'goblet-squat') as Map)['name'] = 'Goblet Squat (updated)';
        list.removeWhere((e) => e['id'] == 'dumbbell-fly');
        (c['programs']['slots'] as Map)['chest_fly'] = ['cable-fly', 'pec-deck'];
        list.add({
          'id': 'sled-push',
          'name': 'Sled Push',
          'primary': 'quads',
          'secondary': ['glutes'],
          'equipment': ['machine'],
          'pattern': 'carry',
          'mechanic': 'compound',
          'tracking': 'weight_distance',
          'instructions': ['Push the sled with a forward lean.'],
        });
        c['progression'] = {'deloadFactor': deload};
        return c;
      },
    );

void main() {
  late AppDatabase db;
  late FakeTransport transport;
  setUp(() async {
    db = await testDatabase();
    transport = FakeTransport();
  });
  tearDown(() => db.close());

  Future<ContentService> service({int appBuild = 0, ContentBundle? builtIn}) => testContentService(db, transport: transport, appBuild: appBuild, builtIn: builtIn);

  Future<Exercise?> exercise(String id) => ExerciseRepository(db).byId(id);

  test('without downloads the built-in content is active', () async {
    final s = await service();
    expect(s.status.source, ContentSource.builtIn);
    expect(s.status.bundle.version, 0);
    expect(s.status.lastCheck, isNull);
  });

  test('newer valid content is downloaded, applied and kept across restarts', () async {
    final s = await service();
    transport.next = _update(202611011200).toJson();
    final r = await s.check();
    expect(r.outcome, CheckOutcome.updated);
    expect(s.status.bundle.version, 202611011200);
    expect(s.status.source, ContentSource.downloaded);
    expect(s.status.bundle.progression.deloadFactor, 0.85);
    expect(s.status.lastSuccess, isNotNull);
    expect(s.status.lastError, isNull);
    expect((await exercise('goblet-squat'))!.name, 'Goblet Squat (updated)');
    expect((await exercise('sled-push'))!.trackingType, 'weight_distance');
    expect(await exercise('dumbbell-fly'), isNotNull, reason: 'removed from content, but never deleted');

    await s.markBootSucceeded();
    final restarted = await service();
    expect(restarted.status.bundle.version, 202611011200);
    expect(restarted.status.source, ContentSource.downloaded);
    expect(restarted.status.lastSuccess, isNotNull);
  });

  test('status changes are streamed to the UI', () async {
    final s = await service();
    final seen = <bool>[];
    final sub = s.changes.listen((st) => seen.add(st.checking));
    transport.next = _update(202611011200).toJson();
    await s.check();
    await Future<void>.delayed(Duration.zero);
    await sub.cancel();
    expect(seen, [true, true, false], reason: 'checking → activated (still checking) → done');
  });

  test('not modified, same or older versions change nothing', () async {
    final s = await service();
    transport.next = _update(202611011200).toJson();
    await s.check();
    expect(transport.lastEtag, isNull);

    transport.next = const ContentNotModified();
    expect((await s.check()).outcome, CheckOutcome.upToDate);
    expect(transport.lastEtag, 'etag-1', reason: 'the ETag is sent back');

    transport.next = _update(202610010000).toJson();
    expect((await s.check()).outcome, CheckOutcome.upToDate);
    expect(s.status.bundle.version, 202611011200);
  });

  test('invalid content is rejected and the working content stays', () async {
    final s = await service();
    transport.next = _update(202611011200).toJson();
    await s.check();

    final corrupt = _update(202612011200).toJson();
    (corrupt['sections'] as Map)['progression'] = {'deloadFactor': 0.2};
    transport.next = corrupt;
    final r = await s.check();
    expect(r.outcome, CheckOutcome.rejected);
    expect(r.message, contains('checksum'));
    expect(s.status.bundle.version, 202611011200);
    expect(s.status.lastError, contains('failed validation'));

    expect(
      () => testContentBundle(version: 202612011300, edit: (x) => _copy(x)..['progression'] = {'deloadFactor': 0.2}),
      throwsA(isA<ContentValidationException>()),
      reason: 'the publishing tool cannot even build it',
    );

    transport.next = 'not json at all';
    expect((await s.check()).outcome, CheckOutcome.rejected);
    expect(s.status.bundle.version, 202611011200);
  });

  test('content for a newer app build waits for that build', () async {
    final s = await service(appBuild: 4);
    transport.next = _update(202611011200, minAppBuild: 5).toJson();
    final r = await s.check();
    expect(r.outcome, CheckOutcome.needsNewerApp);
    expect(r.message, contains('newer app build'));
    expect(s.status.source, ContentSource.builtIn);

    transport.next = _update(202611011300, minAppBuild: 4).toJson();
    expect((await s.check()).outcome, CheckOutcome.updated);
  });

  test('offline: content keeps working, and the next check after reconnecting succeeds', () async {
    final s = await service();
    transport
      ..offline = true
      ..next = _update(202611011200).toJson();
    final r = await s.check();
    expect(r.outcome, CheckOutcome.failed);
    expect(s.status.lastError, contains('No connection'));
    expect(s.status.source, ContentSource.builtIn);
    expect(s.status.lastSuccess, isNull);

    transport.offline = false;
    expect((await s.check()).outcome, CheckOutcome.updated);
    expect(s.status.lastError, isNull);
    final restarted = await service();
    expect(restarted.status.lastError, isNull, reason: 'the stored error is cleared too');
  });

  test('simultaneous checks share one download', () async {
    final s = await service();
    transport
      ..next = _update(202611011200).toJson()
      ..gate = Completer<void>();
    final a = s.check();
    final b = s.check();
    transport.gate!.complete();
    expect(identical(await a, await b), isTrue);
    expect(transport.calls, 1);
  });

  test('content that stops the app from starting is rolled back automatically', () async {
    var s = await service();
    transport.next = _update(202611011200).toJson();
    await s.check();
    await s.markBootSucceeded();

    transport.next = _update(202612011200, deload: 0.8).toJson();
    await s.check();
    // Two starts that never reach the first frame…
    s = await service();
    expect(s.status.bundle.version, 202612011200);
    s = await service();
    expect(s.status.bundle.version, 202611011200, reason: 'back to the previous content');
    expect(s.status.lastError, contains('rolled back'));
    await s.markBootSucceeded();

    // …and the bad version is not installed again.
    transport.next = _update(202612011200, deload: 0.8).toJson();
    expect((await s.check()).outcome, CheckOutcome.rejected);
    expect(s.status.bundle.version, 202611011200);
  });

  test('a start that succeeds clears the crash guard', () async {
    var s = await service();
    transport.next = _update(202611011200).toJson();
    await s.check();
    for (var i = 0; i < 3; i++) {
      s = await service();
      await s.markBootSucceeded();
    }
    expect(s.status.bundle.version, 202611011200);
  });

  test('manual rollback returns to the previous content without touching logged data', () async {
    final s = await service();
    final workouts = WorkoutRepository(db);
    final wid = await workouts.createWorkout(name: 'Test', startedAt: DateTime(2026, 10, 20, 9));
    await workouts.addExercise(workoutId: wid, exerciseId: 'dumbbell-fly');

    transport.next = _update(202611011200).toJson();
    await s.check();
    transport.next = _update(202611021200, deload: 0.8).toJson();
    await s.check();
    expect(s.status.previousVersion, 202611011200);

    await s.rollBack();
    expect(s.status.bundle.version, 202611011200);
    await s.rollBack();
    expect(s.status.source, ContentSource.builtIn);
    expect((await exercise('goblet-squat'))!.name, 'Goblet Squat', reason: 'built-in values restored');
    expect(await exercise('sled-push'), isNotNull, reason: 'exercises are never deleted');
    final items = await (db.select(db.workoutExercises)..where((w) => w.workoutId.equals(wid))).get();
    expect(items.single.exerciseId, 'dumbbell-fly');
  });

  test('a newer app build with newer built-in content wins over old downloads', () async {
    final s = await service();
    transport.next = _update(202611011200).toJson();
    await s.check();
    await s.markBootSucceeded();
    final newerApp = await service(builtIn: testContentBundle(version: 202612011200));
    expect(newerApp.status.source, ContentSource.builtIn);
    expect(newerApp.status.bundle.version, 202612011200);
    expect((await exercise('goblet-squat'))!.name, 'Goblet Squat');
  });

  test('unreadable stored content falls back to the built-in content', () async {
    await db.writeMeta(ContentService.kActive, '{"format":1,"broken":');
    final s = await service();
    expect(s.status.source, ContentSource.builtIn);
  });

  test('custom exercises are never overwritten by content', () async {
    await db.into(db.exercises).insert(ExercisesCompanion.insert(
          id: const Value('sled-push'),
          name: 'My sled push',
          primaryMuscle: 'quads',
          pattern: 'carry',
          isCustom: const Value(true),
        ));
    final s = await service();
    transport.next = _update(202611011200).toJson();
    await s.check();
    expect((await exercise('sled-push'))!.name, 'My sled push');
  });

  test('re-seeding the library updates rows that workouts reference (no delete and re-insert)', () async {
    final workouts = WorkoutRepository(db);
    final wid = await workouts.createWorkout(name: 'Legs', startedAt: DateTime(2026, 10, 20, 9));
    await workouts.addExercise(workoutId: wid, exerciseId: 'barbell-back-squat');
    final library = jsonDecode(await File('assets/exercises.json').readAsString()) as Map<String, dynamic>;
    library['version'] = 99;
    (library['exercises'] as List).first['name'] = 'Back Squat (renamed)';
    await ExerciseRepository(db).seed(jsonEncode(library));
    expect((await exercise('barbell-back-squat'))!.name, 'Back Squat (renamed)');
    expect((await (db.select(db.workoutExercises)..where((w) => w.workoutId.equals(wid))).get()).single.exerciseId, 'barbell-back-squat');
  });

  group('HTTP transport', () {
    final body = jsonEncode(testContentBundle(version: 1).toJson());

    test('downloads, sends the ETag and understands 304', () async {
      String? sentEtag;
      final t = HttpContentTransport(Uri.parse('https://example.test/content.json'), client: MockClient((req) async {
        sentEtag = req.headers['If-None-Match'];
        return sentEtag == 'abc' ? http.Response('', 304) : http.Response.bytes(utf8.encode(body), 200, headers: {'etag': 'abc'});
      }));
      final first = await t.fetch();
      expect(first, isA<ContentDownloaded>().having((d) => d.etag, 'etag', 'abc'));
      expect(await t.fetch(etag: 'abc'), isA<ContentNotModified>());
      expect(sentEtag, 'abc');
    });

    test('errors become readable messages', () async {
      Future<String> msg(http.Response Function() respond) async {
        final t = HttpContentTransport(Uri.parse('https://example.test/c.json'), client: MockClient((_) async => respond()));
        try {
          await t.fetch();
        } on ContentFetchException catch (e) {
          return e.message;
        }
        return 'no error';
      }

      expect(await msg(() => http.Response('', 404)), contains('No content has been published'));
      expect(await msg(() => http.Response('', 500)), contains('(500)'));
      expect(await msg(() => http.Response('{oops', 200)), contains('could not be read'));
      expect(await msg(() => http.Response('x' * (HttpContentTransport.maxBytes + 1), 200)), contains('larger than allowed'));
      final dead = HttpContentTransport(Uri.parse('https://example.test/c.json'), client: MockClient((_) => throw const SocketLikeException()));
      expect(dead.fetch, throwsA(isA<ContentFetchException>().having((e) => e.message, 'message', contains('No connection'))));
    });
  });
}

class SocketLikeException implements Exception {
  const SocketLikeException();
}
