// Tests edit raw JSON content on purpose.
// ignore_for_file: avoid_dynamic_calls

import 'dart:convert';

import 'package:flutter_test/flutter_test.dart';
import 'package:forma/content/content_bundle.dart';
import 'package:forma/data/repositories/exercise_repository.dart';
import 'package:forma/domain/catalog.dart';
import 'package:forma/domain/training/models.dart';
import 'package:forma/domain/training/progression_engine.dart';
import 'package:forma/services/program_generator.dart';

import '../helpers.dart';

Map<String, dynamic> _copy(Map<String, dynamic> m) => jsonDecode(jsonEncode(m)) as Map<String, dynamic>;

/// Applies [change] to a copy of the shipped sections and expects rejection.
List<String> _errorsFor(void Function(Map<String, dynamic> s) change) {
  try {
    testContentBundle(edit: (s) {
      final c = _copy(s);
      change(c);
      return c;
    });
  } on ContentValidationException catch (e) {
    return e.errors;
  }
  fail('Expected the content to be rejected');
}

void main() {
  group('shipped content', () {
    test('the files in assets/ form a valid bundle', () {
      final b = testContentBundle();
      expect(b.exercises.length, greaterThanOrEqualTo(80));
      expect(b.programs.layouts.length, 3);
      expect(b.progression.deloadFactor, 0.9);
      expect(b.config.flag('photoLogging'), isTrue);
      expect(b.config.coachSuggestions, isNotEmpty);
    });

    test('the built-in programs reproduce the original generator', () async {
      final db = await testDatabase();
      addTearDown(db.close);
      final library = await ExerciseRepository(db).all();
      const ctx = TrainingContext(available: {'barbell', 'rack', 'bench', 'dumbbell', 'cable', 'machine', 'pullup_bar'}, restrictions: [], increments: {});
      final gen = ProgramGenerator(testContentBundle().programs);
      final names = {
        for (var d = 1; d <= 6; d++) d: gen.generate(library: library, context: ctx, daysPerWeek: d, goal: TrainingGoal.muscle, experience: 'advanced').name,
      };
      expect(names, {1: 'Full body', 2: 'Full body A/B', 3: 'Full body A/B', 4: 'Upper / Lower', 5: 'Push / Pull / Legs', 6: 'Push / Pull / Legs'});

      final three = gen.generate(library: library, context: ctx, daysPerWeek: 3, goal: TrainingGoal.strength, experience: 'advanced');
      expect(three.templates.map((t) => t.weekdays), [
        [1, 5],
        [3],
      ]);
      final squat = three.templates.first.items.first;
      expect(squat.exerciseId, 'barbell-back-squat');
      expect((squat.sets, squat.repMin, squat.repMax, squat.targetRpe, squat.restSeconds, squat.warmupSets), (4, 4, 6, 8.0, 180, 2));
      final lateral = three.templates.first.items.firstWhere((i) => i.exerciseId == 'dumbbell-lateral-raise');
      expect((lateral.sets, lateral.repMin, lateral.repMax, lateral.targetRpe, lateral.restSeconds), (3, 8, 12, 9.0, 90));
    });
  });

  group('integrity', () {
    test('checksum is independent of key order and detects edits', () {
      final b = testContentBundle(version: 5);
      final reordered = Map.fromEntries(b.sections.entries.toList().reversed);
      expect(sectionsChecksum(reordered), b.checksum);

      final tampered = _copy(b.toJson());
      (tampered['sections'] as Map)['progression'] = {'deloadFactor': 0.85};
      expect(() => ContentBundle.parse(tampered), throwsA(isA<ContentValidationException>().having((e) => e.errors.single, 'error', contains('checksum'))));
    });

    test('round trip through JSON keeps everything', () {
      final b = testContentBundle(version: 202610251200, minAppBuild: 7);
      final again = ContentBundle.parse(jsonDecode(jsonEncode(b.toJson())));
      expect((again.version, again.minAppBuild, again.checksum), (b.version, 7, b.checksum));
      expect(again.exercises.length, b.exercises.length);
    });

    test('content from a newer app format is refused with a clear reason', () {
      final j = testContentBundle().toJson()..['format'] = kContentFormat + 1;
      expect(() => ContentBundle.parse(j), throwsA(isA<ContentValidationException>().having((e) => e.errors.single, 'error', contains('newer version of the app'))));
      expect(() => ContentBundle.parse('nope'), throwsA(isA<ContentValidationException>()));
      expect(() => ContentBundle.parse({'format': 1, 'version': 1}), throwsA(isA<ContentValidationException>()));
    });
  });

  group('validation rejects unsafe or broken content', () {
    test('programs', () {
      expect(_errorsFor((s) => (s['programs']['slots'] as Map)['squat'] = ['does-not-exist']), contains(contains('unknown exercise "does-not-exist"')));
      expect(_errorsFor((s) => (s['programs']['repRanges'] as Map)['default'] = {'compound': [12, 8], 'isolation': [10, 15]}), contains(contains('repRanges.default.compound')));
      expect(_errorsFor((s) => (s['programs']['weekdays'] as Map)['3'] = [1, 1, 5]), contains(contains('weekdays.3')));
      expect(_errorsFor((s) => (s['programs']['layouts'] as List).removeLast()), contains(contains('cover 5 day(s)')));
      expect(_errorsFor((s) => ((s['programs']['layouts'] as List).first as Map)['templates'] = [
            {'name': 'A', 'slots': ['nope']},
          ]), contains(contains('unknown slot "nope"')));
      expect(_errorsFor((s) => (s['programs']['prescription'] as Map)['restCompound'] = 5), contains(contains('restCompound')));
      expect(_errorsFor((s) => ((s['programs']['prescription'] as Map)['setsByExperience'] as Map)['advanced'] = 20), contains(contains('advanced')));
    });

    test('progression stays within safe bounds', () {
      expect(_errorsFor((s) => s['progression'] = {'deloadFactor': 0.5}), contains(contains('deloadFactor')));
      expect(_errorsFor((s) => s['progression'] = {'plateauSessions': 1}), contains(contains('plateauSessions')));
      expect(_errorsFor((s) => s['progression'] = {'deloadSetFactor': 1.2}), contains(contains('deloadSetFactor')));
    });

    test('exercises', () {
      expect(_errorsFor((s) => (s['exercises']['exercises'] as List).add((s['exercises']['exercises'] as List).first)), contains(contains('unique')));
      expect(_errorsFor((s) => ((s['exercises']['exercises'] as List).first as Map)['tracking'] = 'vibes'), contains(contains('tracking')));
      expect(_errorsFor((s) => ((s['exercises']['exercises'] as List).first as Map).remove('name')), contains(contains('name is required')));
      expect(_errorsFor((s) => s['exercises'] = {'exercises': []}), contains(contains('non-empty')));
    });

    test('foods must cite a source and be physically possible', () {
      Map<String, dynamic> food(Map<String, dynamic> over) => {
            'id': 'rugbroed',
            'name': 'Rugbrød',
            'reference': 'Frida 2024',
            'provenance': 'verified',
            'per100g': {'kcal': 212, 'protein': 6.1, 'carbs': 37, 'fat': 2.4, 'fiber': 8.1},
            ...over,
          };
      final ok = testContentBundle(edit: (s) => _copy(s)..['foods'] = {'foods': [food({})]});
      expect(ok.foods.single.name, 'Rugbrød');
      expect(ok.foods.single.matches('rugb'), isTrue);
      expect(_errorsFor((s) => s['foods'] = {'foods': [food({'reference': ''})]}), contains(contains('data source')));
      expect(_errorsFor((s) => s['foods'] = {'foods': [food({'provenance': 'ai'})]}), contains(contains('provenance')));
      expect(_errorsFor((s) => s['foods'] = {'foods': [food({'per100g': {'protein': 60, 'carbs': 60}})]}), contains(contains('exceed 100 g')));
      expect(_errorsFor((s) => s['foods'] = {'foods': [food({}), food({})]}), contains(contains('unique')));
    });

    test('config and coach', () {
      expect(_errorsFor((s) => s['config'] = {'flags': {'photoLogging': 'yes'}}), contains(contains('flags.photoLogging')));
      expect(_errorsFor((s) => s['config'] = {'announcement': {'id': 'a', 'title': 'x' * 61, 'body': ''}}), contains(contains('announcement')));
      expect(_errorsFor((s) => s['coach'] = {'suggestions': ['x' * 81]}), contains(contains('coach.suggestions')));
      final b = testContentBundle(edit: (s) => _copy(s)
        ..['config'] = {
          'flags': {'labelPhotos': false},
          'announcement': {'id': 'n1', 'title': 'New', 'body': 'Photo logging', 'until': '2026-12-01'},
        });
      expect(b.config.flag('labelPhotos'), isFalse);
      expect(b.config.flag('somethingNew'), isTrue, reason: 'unknown flags default to on');
      expect(b.config.announcement!.until, DateTime(2026, 12));
    });

    test('every problem is reported at once', () {
      final errors = _errorsFor((s) {
        s['progression'] = {'deloadFactor': 0.1};
        s['coach'] = {'suggestions': ['x' * 81]};
      });
      expect(errors.length, 2);
    });
  });

  group('content drives the engines', () {
    test('program slots and prescriptions come from content', () async {
      final db = await testDatabase();
      addTearDown(db.close);
      final library = await ExerciseRepository(db).all();
      final custom = testContentBundle(edit: (s) {
        final c = _copy(s);
        (c['programs']['slots'] as Map)['squat'] = ['goblet-squat'];
        (c['programs']['prescription'] as Map)['compoundRpe'] = 7.5;
        return c;
      });
      const ctx = TrainingContext(available: {'barbell', 'rack', 'bench', 'dumbbell'}, restrictions: [], increments: {});
      final p = ProgramGenerator(custom.programs).generate(library: library, context: ctx, daysPerWeek: 2, goal: TrainingGoal.general, experience: 'beginner');
      final first = p.templates.first.items.first;
      expect(first.exerciseId, 'goblet-squat');
      expect(first.targetRpe, 7.5);
    });

    test('progression tuning changes deload depth', () {
      final history = [
        for (var i = 0; i < 3; i++)
          ExerciseSession(workoutId: 'w$i', date: DateTime(2026, 10, 20 - i * 3), sets: const [SetRecord(weightKg: 100, reps: 6), SetRecord(weightKg: 100, reps: 6), SetRecord(weightKg: 100, reps: 6)]),
      ];
      ProgressionInput input() => ProgressionInput(
            prescription: const Prescription(sets: 3, repMin: 6, repMax: 10),
            history: history,
            tracking: TrackingType.weightReps,
            lowerBody: false,
            incrementKg: 2.5,
            limits: const SafetyLimits(),
            deloadWeek: true,
          );
      expect(const ProgressionEngine().recommend(input()).weightKg, 90);
      expect(const ProgressionEngine(tuning: ProgressionTuning(deloadFactor: 0.85)).recommend(input()).weightKg, 85);
    });
  });
}
