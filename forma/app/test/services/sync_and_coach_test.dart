import 'dart:convert';

import 'package:drift/drift.dart' show Value;
import 'package:flutter_test/flutter_test.dart';
import 'package:forma/data/db/app_database.dart';
import 'package:forma/data/remote/ai_api.dart';
import 'package:forma/data/remote/backend.dart';
import 'package:forma/data/repositories/body_repository.dart';
import 'package:forma/data/repositories/coach_repository.dart';
import 'package:forma/data/repositories/exercise_repository.dart';
import 'package:forma/data/repositories/health_repository.dart';
import 'package:forma/data/repositories/nutrition_repository.dart';
import 'package:forma/data/repositories/settings_repository.dart';
import 'package:forma/data/repositories/workout_repository.dart';
import 'package:forma/domain/catalog.dart';
import 'package:forma/services/coach_service.dart';
import 'package:forma/services/health_service.dart';
import 'package:forma/services/nutrition_service.dart';
import 'package:forma/services/sync_service.dart';

import '../helpers.dart';

void main() {
  group('sync', () {
    late FakeRemote remote;
    late AppDatabase a;
    late AppDatabase b;

    setUp(() async {
      remote = FakeRemote();
      a = await testDatabase();
      b = await testDatabase();
    });
    tearDown(() async {
      await a.close();
      await b.close();
    });

    SyncService svc(AppDatabase db, {String user = 'user-1', bool health = false}) {
      remote.currentUser = user;
      return SyncService(db: db, remote: remote, userId: user, includeHealth: health);
    }

    Future<String> logWorkout(AppDatabase db) async {
      final repo = WorkoutRepository(db);
      final w = await repo.createWorkout(name: 'Legs', startedAt: DateTime.utc(2026, 10, 1, 17));
      final we = await repo.addExercise(workoutId: w, exerciseId: 'barbell-back-squat');
      final s = await repo.addSet(we, weightKg: 100, reps: 5);
      await repo.updateSet(s, const WorkoutSetsCompanion(completed: Value(true)));
      await repo.finishWorkout(w, endedAt: DateTime.utc(2026, 10, 1, 18));
      return w;
    }

    test('two devices converge, singletons merge by user', () async {
      final w = await logWorkout(a);
      await SettingsRepository(a).updateProfile(const ProfilesCompanion(displayName: Value('Alex'), onboardingCompleted: Value(true)));
      final pushed = (await svc(a).sync()).pushed;
      expect(pushed, greaterThan(4));
      expect(remote.tables['profiles']!.keys, ['user-1']);
      expect(remote.tables['profiles']!['user-1']!.containsKey('id'), isFalse);

      await svc(b).sync();
      final detail = await WorkoutRepository(b).workout(w);
      expect(detail, isNotNull);
      expect(detail!.exercises.single.sets.single.weightKg, 100);
      expect(detail.exercises.single.sets.single.completed, isTrue);
      final profile = await SettingsRepository(b).profile();
      expect(profile.displayName, 'Alex');
      expect(profile.onboardingCompleted, isTrue);
      // Pulled rows are clean, so B has nothing to push back.
      expect((await svc(b).sync()).pushed, 0);
    });

    test('push is idempotent and only clean rows are skipped', () async {
      await logWorkout(a);
      await svc(a).sync();
      final count = remote.tables['workout_sets']!.length;
      // Simulate a lost acknowledgement: mark everything dirty again and resend.
      await a.customStatement('UPDATE workout_sets SET dirty = 1');
      await svc(a).sync();
      expect(remote.tables['workout_sets']!.length, count);
    });

    test('last write wins; newer unsynced local edits are kept', () async {
      final w = await logWorkout(a);
      await svc(a).sync();
      await svc(b).sync();
      final setId = (await WorkoutRepository(a).workout(w))!.exercises.single.sets.single.id;

      // B edits first, A edits later; both sync.
      await WorkoutRepository(b).updateSet(setId, const WorkoutSetsCompanion(reps: Value(6)));
      await Future<void>.delayed(const Duration(milliseconds: 5));
      await WorkoutRepository(a).updateSet(setId, const WorkoutSetsCompanion(reps: Value(7)));
      await svc(b).sync();
      await svc(a).sync(); // A's newer edit overwrites on the server and is kept locally.
      await svc(b).sync(); // B pulls the newer value.
      for (final db in [a, b]) {
        expect((await WorkoutRepository(db).workout(w))!.exercises.single.sets.single.reps, 7);
      }
    });

    test('deletes propagate as soft deletes', () async {
      final w = await logWorkout(a);
      await svc(a).sync();
      await svc(b).sync();
      await WorkoutRepository(b).deleteWorkout(w);
      await svc(b).sync();
      await svc(a).sync();
      expect(await WorkoutRepository(a).workout(w), isNull);
      expect(await WorkoutRepository(a).history(), isEmpty);
    });

    test('signing in as a different account clears the previous local copy', () async {
      await logWorkout(a);
      await svc(a).sync();
      await svc(a, user: 'user-2').sync();
      expect(await WorkoutRepository(a).history(), isEmpty);
      expect((await ExerciseRepository(a).all()).length, greaterThan(70), reason: 'library is kept');
      // Account 1's data is untouched on the server.
      expect(remote.tables['workouts']!.values.where((r) => r['user_id'] == 'user-1'), hasLength(1));
    });

    test('health observations stay local unless the user opts in', () async {
      await HealthRepository(a).importSamples([
        HealthSample(id: 'hk-1', type: 'resting_hr', start: DateTime.utc(2026), end: DateTime.utc(2026), value: 52, unit: 'bpm'),
      ], syncToServer: false);
      await svc(a).sync();
      expect(remote.tables['health_observations'], isNull);
      await a.customStatement('UPDATE health_observations SET dirty = 1');
      await svc(a, health: true).sync();
      expect(remote.tables['health_observations'], hasLength(1));
    });

    test('global library exercises are never pushed; custom ones are', () async {
      final id = await ExerciseRepository(a).createCustom(name: 'Sled push', primaryMuscle: 'quads', pattern: 'squat', tracking: TrackingType.weightReps);
      await svc(a).sync();
      expect(remote.tables['exercises']!.keys, [id]);
    });
  });

  group('coach proposals', () {
    late AppDatabase db;
    late CoachService coach;

    setUp(() async {
      db = await testDatabase();
      final settings = SettingsRepository(db);
      final nutrition = NutritionRepository(db);
      final body = BodyRepository(db);
      coach = CoachService(
        api: AiApi(Backend(null)),
        coach: CoachRepository(db),
        workouts: WorkoutRepository(db),
        exercises: ExerciseRepository(db),
        nutrition: nutrition,
        body: body,
        settings: settings,
        nutritionService: NutritionService(settings: settings, nutrition: nutrition, body: body),
      );
      await settings.setEquipmentSet({'dumbbell', 'bench'});
      await settings.addRestriction('pattern', 'vertical_push');
      await settings.updateProfile(const ProfilesCompanion(birthYear: Value(1990), heightCm: Value(180), sex: Value('male')));
      for (var i = 0; i < 20; i++) {
        await body.addWeight(80, at: DateTime.now().subtract(Duration(days: i)));
      }
    });
    tearDown(() => db.close());

    Future<AiRecommendation> proposal(String kind, Map<String, dynamic> payload) async {
      final id = await CoachRepository(db).addRecommendation(kind: kind, title: 't', explanation: 'e', payload: jsonEncode(payload));
      return (await CoachRepository(db).recommendation(id))!;
    }

    test('valid template proposal applies only after check', () async {
      final rec = await proposal('create_template', {
        'name': 'Coach upper',
        'exercises': [
          {'exerciseId': 'dumbbell-bench-press', 'sets': 3, 'repMin': 8, 'repMax': 12, 'targetRpe': 8},
          {'exerciseId': 'dumbbell-row', 'sets': 3, 'repMin': 8, 'repMax': 12},
        ],
        'weekdays': [2],
      });
      final check = await coach.check(rec, today: DateTime.now());
      expect(check.ok, isTrue, reason: check.problems.join());
      expect(await WorkoutRepository(db).templates(), isEmpty, reason: 'nothing saved before confirmation');
      await coach.apply(rec, today: DateTime.now());
      final templates = await WorkoutRepository(db).templates();
      expect(templates.single.items, hasLength(2));
      expect((await WorkoutRepository(db).activeSchedule())!.days[2], templates.single.template.id);
      expect((await CoachRepository(db).recommendation(rec.id))!.status, 'accepted');
    });

    test('blocks unavailable equipment, restrictions, unknown ids and bad ranges', () async {
      final rec = await proposal('create_template', {
        'name': 'Bad',
        'exercises': [
          {'exerciseId': 'barbell-back-squat', 'sets': 3, 'repMin': 5, 'repMax': 5},
          {'exerciseId': 'dumbbell-shoulder-press', 'sets': 3, 'repMin': 8, 'repMax': 12},
          {'exerciseId': 'made-up', 'sets': 3, 'repMin': 8, 'repMax': 12},
          {'exerciseId': 'dumbbell-row', 'sets': 20, 'repMin': 12, 'repMax': 8},
        ],
      });
      final check = await coach.check(rec, today: DateTime.now());
      expect(check.ok, isFalse);
      expect(check.problems.join('\n'), allOf(contains('equipment'), contains('restricted'), contains('Unknown exercise'), contains('sets must be'), contains('rep range')));
      final applied = await coach.apply(rec, today: DateTime.now());
      expect(applied.ok, isFalse);
      expect(await WorkoutRepository(db).templates(), isEmpty);
    });

    test('blocks unsafe calorie targets', () async {
      final low = await proposal('adjust_targets', {'kcal': 1100, 'proteinG': 150});
      expect((await coach.check(low, today: DateTime.now())).ok, isFalse);
      final fine = await proposal('adjust_targets', {'kcal': 2300, 'proteinG': 140, 'carbsG': 250, 'fatG': 70});
      final check = await coach.check(fine, today: DateTime.now());
      expect(check.ok, isTrue, reason: check.problems.join());
    });

    test('minors cannot be given a deficit', () async {
      await SettingsRepository(db).updateProfile(ProfilesCompanion(birthYear: Value(DateTime.now().year - 16)));
      final rec = await proposal('adjust_targets', {'kcal': 1800});
      final check = await coach.check(rec, today: DateTime.now());
      expect(check.problems.join(), contains('under 18'));
    });

    test('context respects scopes and excludes free text', () async {
      await db.into(db.workouts).insert(WorkoutsCompanion.insert(name: 'W', startedAt: DateTime.now().toUtc(), endedAt: Value(DateTime.now().toUtc()), notes: const Value('private note')));
      final ctx = await coach.buildContext(today: DateTime.now(), scopes: {CoachScope.goals, CoachScope.body});
      expect(ctx.containsKey('training'), isFalse);
      expect(ctx.containsKey('nutrition'), isFalse);
      expect(ctx['body'], isNotNull);
      expect((ctx['profile'] as Map)['ageRange'], '30s');
      final full = jsonEncode(await coach.buildContext(today: DateTime.now(), scopes: CoachScope.values.toSet()));
      expect(full.contains('private note'), isFalse);
      expect(full.contains('1990'), isFalse);
    });

    test('relevant scopes follow the question', () {
      expect(relevantScopes('Why has my bench stalled?'), containsAll([CoachScope.training, CoachScope.goals]));
      expect(relevantScopes('Why has my bench stalled?').contains(CoachScope.nutrition), isFalse);
      expect(relevantScopes('How is my protein?'), contains(CoachScope.nutrition));
      expect(relevantScopes('hello'), CoachScope.values.toSet());
    });

    test('coach reply parsing drops malformed proposals', () {
      final reply = parseCoachReply({
        'answer': 'Your squat rose 5 kg.',
        'citations': [{'kind': 'workout', 'label': 'Squat 1 Oct'}, 'junk'],
        'dataGaps': ['No sleep data'],
        'proposals': [
          {'type': 'create_template', 'title': 'T', 'payload': {'name': 'x'}},
          {'type': 'delete_everything', 'title': 'X', 'payload': <String, dynamic>{}},
          {'type': 'adjust_targets', 'title': 'no payload'},
        ],
      });
      expect(reply.citations, hasLength(1));
      expect(reply.proposals.single.type, 'create_template');
      expect(() => parseCoachReply({'answer': ''}), throwsA(isA<BackendException>()));
    });

    test('photo estimate parsing rejects implausible items', () {
      final r = parsePhotoEstimate({
        'items': [
          {'name': 'Rice', 'grams': 180, 'kcal': 234, 'protein': 4, 'confidence': 'medium'},
          {'name': 'Bad', 'grams': -5},
          {'name': 'Huge', 'grams': 99999},
          {'grams': 100},
          {'name': 'Sauce', 'grams': 30, 'kcal': -10, 'confidence': 'certain'},
        ],
        'caveats': ['Oil content is hard to see'],
      });
      expect(r.items.map((i) => i.name), ['Rice', 'Sauce']);
      expect(r.items.last.nutrients.kcal, isNull);
      expect(r.items.last.confidence, 'low');
    });
  });

  test('health aggregation unions overlapping sleep and averages heart metrics', () {
    final d = DateTime(2026, 5, 2, 8); // woke at 08:00
    final day = DateTime(2026, 5, 2);
    final daily = aggregateDaily([
      HealthSample(id: '1', type: 'sleep', start: d.subtract(const Duration(hours: 7)), end: d.subtract(const Duration(hours: 3)), value: 240, unit: 'min'),
      // Watch and phone overlap by an hour.
      HealthSample(id: '2', type: 'sleep', start: d.subtract(const Duration(hours: 4)), end: d, value: 240, unit: 'min'),
      HealthSample(id: '3', type: 'resting_hr', start: d, end: d, value: 50, unit: 'bpm'),
      HealthSample(id: '4', type: 'resting_hr', start: d, end: d, value: 54, unit: 'bpm'),
      HealthSample(id: '5', type: 'steps', start: d, end: d, value: 3000, unit: 'count'),
      HealthSample(id: '6', type: 'steps', start: d, end: d.add(const Duration(hours: 1)), value: 2000, unit: 'count'),
    ]);
    expect(daily['sleep']![day], 420); // 01:00–08:00, overlap counted once
    expect(daily['resting_hr']![day], 52);
    expect(daily['steps']![day], 5000);
  });
}

