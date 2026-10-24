import 'package:flutter_test/flutter_test.dart';
import 'package:forma/domain/catalog.dart';
import 'package:forma/domain/training/models.dart';
import 'package:forma/domain/training/progression_engine.dart';

ExerciseSession session(DateTime date, List<(double, int)> sets, {double? rpe}) => ExerciseSession(
      workoutId: date.toIso8601String(),
      date: date,
      sets: [for (final (w, r) in sets) SetRecord(weightKg: w, reps: r, rpe: rpe)],
    );

void main() {
  const engine = ProgressionEngine();
  const limits = SafetyLimits(maxIncreasePct: 5, maxIncreaseUpperKg: 2.5, maxIncreaseLowerKg: 5);
  const rx = Prescription(sets: 3, repMin: 8, repMax: 10, targetRpe: 8);
  final d1 = DateTime(2026, 10, 1);
  final d2 = DateTime(2026, 10, 4);
  final d3 = DateTime(2026, 10, 8);
  final d4 = DateTime(2026, 10, 11);

  ProgressionInput input(List<ExerciseSession> history,
          {double? inc = 2.5, bool lower = false, bool deload = false, bool lowReadiness = false, SafetyLimits l = limits}) =>
      ProgressionInput(
        tracking: TrackingType.weightReps,
        lowerBody: lower,
        prescription: rx,
        history: history,
        limits: l,
        incrementKg: inc,
        deloadWeek: deload,
        lowReadiness: lowReadiness,
      );

  group('baseline', () {
    test('no history never invents a weight', () {
      final r = engine.recommend(input([]));
      expect(r.action, ProgressionAction.baseline);
      expect(r.weightKg, isNull);
      expect(r.reasons.join(' '), contains('No previous sessions'));
    });

    test('sessions without completed working sets count as no history', () {
      final s = ExerciseSession(
        workoutId: 'w',
        date: d1,
        sets: const [SetRecord(weightKg: 60, reps: 8, completed: false), SetRecord(kind: SetKind.warmup, weightKg: 20, reps: 10)],
      );
      expect(engine.recommend(input([s])).action, ProgressionAction.baseline);
    });
  });

  group('increase', () {
    test('all sets at top of range → smallest increment', () {
      final r = engine.recommend(input([session(d1, [(60, 10), (60, 10), (60, 10)], rpe: 8)]));
      expect(r.action, ProgressionAction.increaseLoad);
      expect(r.weightKg, 62.5);
      expect(r.reps, 8);
      expect(r.reasons.first, contains('3 × 10 reps @ 60 kg'));
    });

    test('repeated easy success allows two increments when within limit (lower body)', () {
      final history = [
        session(d2, [(100, 10), (100, 10), (100, 10)], rpe: 6),
        session(d1, [(100, 10), (100, 10), (100, 10)], rpe: 6),
      ];
      final r = engine.recommend(input(history, lower: true));
      expect(r.action, ProgressionAction.increaseLoad);
      expect(r.weightKg, 105); // 2 × 2.5, capped by 5 kg / 5%
    });

    test('repeated easy success is still capped by the percentage limit', () {
      final history = [
        session(d2, [(40, 10), (40, 10), (40, 10)], rpe: 6),
        session(d1, [(40, 10), (40, 10), (40, 10)], rpe: 6),
      ];
      // 5% of 40 kg = 2 kg < 2.5 kg increment → cannot add load at all.
      final r = engine.recommend(input(history));
      expect(r.action, ProgressionAction.increaseReps);
      expect(r.safetyCapped, isTrue);
      expect(r.weightKg, 40);
    });

    test('never exceeds the absolute safety limit', () {
      final history = [
        session(d2, [(200, 10), (200, 10), (200, 10)], rpe: 5),
        session(d1, [(200, 10), (200, 10), (200, 10)], rpe: 5),
      ];
      final r = engine.recommend(input(history, inc: 2.5, lower: true));
      expect(r.weightKg! - 200, lessThanOrEqualTo(5));
    });

    test('dumbbell jump above the limit falls back to reps', () {
      final r = engine.recommend(input([session(d1, [(10, 10), (10, 10), (10, 10)], rpe: 8)], inc: 2));
      expect(r.action, ProgressionAction.increaseReps);
      expect(r.safetyCapped, isTrue);
      expect(r.reasons.join(' '), contains('20%'));
    });

    test('very high effort holds the load', () {
      final r = engine.recommend(input([session(d1, [(60, 10), (60, 10), (60, 10)], rpe: 10)]));
      expect(r.action, ProgressionAction.maintain);
      expect(r.weightKg, 60);
    });

    test('low readiness holds instead of increasing', () {
      final r = engine.recommend(input([session(d1, [(60, 10), (60, 10), (60, 10)], rpe: 8)], lowReadiness: true));
      expect(r.action, ProgressionAction.maintain);
      expect(r.weightKg, 60);
    });

    test('fewer sets than prescribed does not trigger an increase', () {
      final r = engine.recommend(input([session(d1, [(60, 10), (60, 10)], rpe: 8)]));
      expect(r.action, isNot(ProgressionAction.increaseLoad));
    });

    test('missing RPE is explained, not invented', () {
      final r = engine.recommend(input([session(d1, [(60, 10), (60, 10), (60, 10)])]));
      expect(r.action, ProgressionAction.increaseLoad);
      expect(r.reasons.join(' '), contains('No effort (RPE) was recorded'));
    });

    test('no increment configured → progress reps', () {
      final r = engine.recommend(input([session(d1, [(60, 10), (60, 10), (60, 10)])], inc: null));
      expect(r.action, ProgressionAction.increaseReps);
      expect(r.weightKg, 60);
    });
  });

  group('within range', () {
    test('keeps load and targets one more rep than the weakest set', () {
      final r = engine.recommend(input([session(d1, [(60, 10), (60, 9), (60, 8)], rpe: 8)]));
      expect(r.action, ProgressionAction.increaseReps);
      expect(r.weightKg, 60);
      expect(r.reps, 9);
    });
  });

  group('deterioration', () {
    test('single missed session → maintain', () {
      final r = engine.recommend(input([session(d1, [(60, 8), (60, 7), (60, 6)])]));
      expect(r.action, ProgressionAction.maintain);
      expect(r.weightKg, 60);
    });

    test('two missed sessions in a row at the same load → reduce ~10%', () {
      final history = [
        session(d2, [(60, 7), (60, 6), (60, 6)]),
        session(d1, [(60, 8), (60, 7), (60, 6)]),
      ];
      final r = engine.recommend(input(history));
      expect(r.action, ProgressionAction.reduceLoad);
      expect(r.weightKg, 52.5); // 54 rounded down to 2.5
      expect(r.weightKg, lessThan(60));
    });

    test('three stalled sessions → reset suggestion', () {
      final history = [
        session(d3, [(80, 8), (80, 8), (80, 8)], rpe: 9),
        session(d2, [(80, 8), (80, 8), (80, 8)], rpe: 9),
        session(d1, [(80, 8), (80, 8), (80, 8)], rpe: 9),
      ];
      final r = engine.recommend(input(history, lower: true));
      expect(r.action, ProgressionAction.deload);
      expect(r.weightKg, 70); // 90% = 72 kg, rounded down to the 2.5 kg increment
    });

    test('improving reps at the same load is not a stall', () {
      final history = [
        session(d4, [(80, 9), (80, 9), (80, 9)], rpe: 8),
        session(d3, [(80, 9), (80, 8), (80, 8)], rpe: 8),
        session(d2, [(80, 8), (80, 8), (80, 8)], rpe: 8),
      ];
      final r = engine.recommend(input(history, lower: true));
      expect(r.action, ProgressionAction.increaseReps);
    });
  });

  test('deload week reduces load and sets', () {
    final r = engine.recommend(input([session(d1, [(100, 10), (100, 10), (100, 10)])], deload: true));
    expect(r.action, ProgressionAction.deload);
    expect(r.weightKg, 90);
    expect(r.sets, 2);
  });

  test('duration exercises add seconds', () {
    final r = engine.recommend(ProgressionInput(
      tracking: TrackingType.duration,
      lowerBody: false,
      prescription: rx,
      history: [ExerciseSession(workoutId: 'w', date: d1, sets: const [SetRecord(durationS: 45), SetRecord(durationS: 40)])],
      limits: limits,
    ));
    expect(r.action, ProgressionAction.increaseDuration);
    expect(r.durationS, 50);
  });

  test('bodyweight exercise without load progresses reps', () {
    final r = engine.recommend(ProgressionInput(
      tracking: TrackingType.bodyweightReps,
      lowerBody: false,
      prescription: rx,
      history: [ExerciseSession(workoutId: 'w', date: d1, sets: const [SetRecord(reps: 10), SetRecord(reps: 10), SetRecord(reps: 11)])],
      limits: limits,
      incrementKg: 2.5,
    ));
    expect(r.action, ProgressionAction.increaseReps);
    expect(r.weightKg, isNull);
    expect(r.reps, 11);
  });
}
