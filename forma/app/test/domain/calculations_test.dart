import 'package:flutter_test/flutter_test.dart';
import 'package:forma/core/util/format.dart';
import 'package:forma/domain/body/weight_trend.dart';
import 'package:forma/domain/catalog.dart';
import 'package:forma/domain/dates.dart';
import 'package:forma/domain/nutrition/energy.dart';
import 'package:forma/domain/nutrition/nutrients.dart';
import 'package:forma/domain/recovery/recovery.dart';
import 'package:forma/domain/training/analytics.dart';
import 'package:forma/domain/training/models.dart';
import 'package:forma/domain/training/strength.dart';

void main() {
  group('strength', () {
    test('Epley e1RM with and without RPE', () {
      expect(estimateOneRepMax(weightKg: 100, reps: 5), closeTo(116.67, 0.01));
      // RPE 8 → 2 reps in reserve → treated as 7 reps.
      expect(estimateOneRepMax(weightKg: 100, reps: 5, rpe: 8), closeTo(123.33, 0.01));
      expect(estimateOneRepMax(weightKg: 100, reps: 1), 100);
      expect(estimateOneRepMax(weightKg: 100, reps: 20), isNull);
      expect(estimateOneRepMax(weightKg: null, reps: 5), isNull);
    });

    test('rounding to increments', () {
      expect(roundToIncrement(61.3, 2.5), 62.5);
      expect(roundToIncrement(61.3, 2.5, mode: RoundMode.down), 60);
      expect(roundToIncrement(60, 2.5, mode: RoundMode.down), 60);
      expect(roundToIncrement(60.1, 2.5, mode: RoundMode.up), 62.5);
    });

    test('warm-up ramp stays below working load and increases', () {
      final ramp = warmupRamp(workingKg: 100, incrementKg: 2.5, minimumKg: 20);
      expect(ramp.map((s) => s.weightKg), [50, 70, 85]);
      expect(ramp.every((s) => s.kind == SetKind.warmup), isTrue);
      expect(warmupRamp(workingKg: 20, incrementKg: 2.5, minimumKg: 20), isEmpty);
    });
  });

  test('clock format', () {
    expect(clock(const Duration(seconds: 75)), '1:15');
    expect(clock(const Duration(hours: 1, minutes: 2, seconds: 3)), '1:02:03');
    expect(clock(const Duration(seconds: -5)), '-0:05');
  });

  group('weight trend', () {
    test('smooths noise and handles gaps', () {
      final start = DateTime(2026, 1, 1);
      final t = WeightTrend.compute([
        WeighIn(start, 80),
        WeighIn(addDays(start, 1), 81),
        WeighIn(addDays(start, 4), 79),
      ]);
      expect(t.points.first.trendKg, 80);
      expect(t.points[1].trendKg, closeTo(80.1, 1e-9));
      // Gap days are filled with the carried trend.
      expect(t.points.length, 5);
      expect(t.points[2].scaleKg, isNull);
      const a = 1 - 0.9 * 0.9 * 0.9;
      expect(t.latest!.trendKg, closeTo(80.1 + a * (79 - 80.1), 1e-9));
    });

    test('averages multiple weigh-ins per day', () {
      final d = DateTime(2026, 1, 1);
      final t = WeightTrend.compute([WeighIn(d, 80), WeighIn(d.add(const Duration(hours: 10)), 82)]);
      expect(t.points.single.scaleKg, 81);
    });

    test('change over a period requires data spanning it', () {
      final start = DateTime(2026, 1, 1);
      final t = WeightTrend.compute([for (var i = 0; i < 5; i++) WeighIn(addDays(start, i), 80.0 - i * 0.1)]);
      expect(t.changeOver(7), isNull);
      expect(t.changeOver(3), lessThan(0));
    });
  });

  group('energy', () {
    test('Mifflin–St Jeor', () {
      expect(basalMetabolicRate(weightKg: 80, heightCm: 180, age: 30, sex: Sex.male), 1780);
      expect(basalMetabolicRate(weightKg: 60, heightCm: 165, age: 30, sex: Sex.female), closeTo(1320.25, 0.01));
      expect(basalMetabolicRate(weightKg: 80, heightCm: null, age: 30), isNull);
    });

    test('adaptive estimate from stable weight equals average intake', () {
      final today = DateTime(2026, 3, 1);
      final intake = [for (var i = 1; i <= 21; i++) DailyIntake(addDays(today, -i), 2500)];
      final trend = WeightTrend.compute([for (var i = 0; i <= 40; i++) WeighIn(addDays(today, -i), 80)]);
      final e = const EnergyModel().estimate(today: today, intake: intake, trend: trend)!;
      expect(e.method, EnergyMethod.adaptive);
      expect(e.kcal, closeTo(2500, 1));
    });

    test('losing weight on 2000 kcal implies higher expenditure', () {
      final today = DateTime(2026, 3, 1);
      final intake = [for (var i = 1; i <= 21; i++) DailyIntake(addDays(today, -i), 2000)];
      // Lose 0.5 kg/week steadily.
      final trend = WeightTrend.compute([for (var i = 60; i >= 0; i--) WeighIn(addDays(today, -i), 80 + i * 0.5 / 7)]);
      final e = const EnergyModel().estimate(today: today, intake: intake, trend: trend)!;
      expect(e.kcal, greaterThan(2400));
      expect(e.kcal, lessThan(2700));
    });

    test('falls back to formula with low confidence when data is sparse', () {
      final today = DateTime(2026, 3, 1);
      final e = const EnergyModel().estimate(
        today: today,
        intake: [DailyIntake(addDays(today, -1), 2000)],
        trend: WeightTrend.compute([WeighIn(today, 80)]),
        formulaKcal: 2600,
      )!;
      expect(e.method, EnergyMethod.formula);
      expect(e.confidence, Confidence.low);
      expect(e.kcal, 2600);
    });

    test('incomplete days are excluded', () {
      final today = DateTime(2026, 3, 1);
      final intake = [for (var i = 1; i <= 21; i++) DailyIntake(addDays(today, -i), 1000, complete: false)];
      final trend = WeightTrend.compute([for (var i = 0; i <= 30; i++) WeighIn(addDays(today, -i), 80)]);
      expect(const EnergyModel().estimate(today: today, intake: intake, trend: trend), isNull);
    });

    test('no data and no formula → null', () {
      expect(
        const EnergyModel().estimate(today: DateTime(2026), intake: const [], trend: WeightTrend.compute(const [])),
        isNull,
      );
    });
  });

  group('target safeguards', () {
    test('under 18 → maintenance only', () {
      final r = computeTargets(const TargetInput(expenditureKcal: 2400, weightKg: 70, goal: WeightGoal.lose, age: 16));
      expect(r.effectiveGoal, WeightGoal.maintain);
      expect(r.kcal, 2400);
      expect(r.notes.single, contains('under 18'));
    });

    test('loss rate capped at 1%/week and deficit at 25%', () {
      final r = computeTargets(const TargetInput(expenditureKcal: 2000, weightKg: 100, goal: WeightGoal.lose, weeklyRatePct: 2));
      expect(r.weeklyRatePct, 1.0);
      expect(r.kcal, 1500); // 25% cap binds (1% of 100 kg ≈ 1100 kcal/day)
      expect(r.notes.length, 2);
    });

    test('calorie floor applies', () {
      final r = computeTargets(const TargetInput(
        expenditureKcal: 1500,
        weightKg: 55,
        goal: WeightGoal.lose,
        weeklyRatePct: 1,
        sex: Sex.female,
        age: 30,
        heightCm: 165,
      ));
      expect(r.kcal, greaterThanOrEqualTo(1260)); // BMR ≈ 1270 > 1200 floor
    });

    test('low BMI blocks deficits', () {
      final r = computeTargets(const TargetInput(expenditureKcal: 2000, weightKg: 48, heightCm: 170, goal: WeightGoal.lose));
      expect(r.effectiveGoal, WeightGoal.maintain);
    });

    test('macros add up to roughly the calorie target', () {
      final r = computeTargets(const TargetInput(expenditureKcal: 2600, weightKg: 80, goal: WeightGoal.maintain));
      final fromMacros = r.proteinG * 4 + r.carbsG * 4 + r.fatG * 9;
      expect(fromMacros, closeTo(r.kcal, 20));
      expect(r.proteinG, 128);
    });
  });

  group('nutrients', () {
    test('unknown values are not zero and mark totals incomplete', () {
      const a = Nutrients(kcal: 100, proteinG: 10, carbsG: 5, fatG: 2, fiberG: 1);
      const b = Nutrients(kcal: 200, proteinG: null, carbsG: 20, fatG: 5, fiberG: null);
      final t = NutrientTotals.of([a, b]);
      expect(t.kcal, 300);
      expect(t.proteinG, 10);
      expect(t.incompleteFields, {'protein', 'fiber'});
      expect(b.scale(2).proteinG, isNull);
    });

    test('plausibility checks flag inconsistent data', () {
      expect(plausibilityWarnings(const Nutrients(kcal: 100, proteinG: 10, carbsG: 10, fatG: 1.8, fiberG: 0)), isEmpty);
      expect(plausibilityWarnings(const Nutrients(kcal: 50, proteinG: 30, carbsG: 30, fatG: 10)), isNotEmpty);
      expect(plausibilityWarnings(const Nutrients(kcal: 100, proteinG: 60, carbsG: 60, fatG: 0)), isNotEmpty);
    });
  });

  group('recovery', () {
    final today = DateTime(2026, 5, 30);
    List<DailyMetric> series(double base, double latest) => [
          for (var i = 1; i <= 20; i++) DailyMetric(addDays(today, -i), base + (i.isEven ? 1 : -1)),
          DailyMetric(today, latest),
        ];

    test('unknown with no data', () {
      final s = const RecoveryEngine().evaluate(today: today);
      expect(s.band, ReadinessBand.unknown);
      expect(s.missing, containsAll(['Heart-rate variability', 'Resting heart rate', 'Sleep', 'Check-in']));
    });

    test('strained when HRV down and RHR up vs baseline', () {
      final s = const RecoveryEngine().evaluate(today: today, hrvMs: series(60, 40), restingHr: series(52, 60));
      expect(s.band, ReadinessBand.strained);
    });

    test('normal when within range', () {
      final s = const RecoveryEngine().evaluate(today: today, hrvMs: series(60, 61), restingHr: series(52, 52));
      expect(s.band, ReadinessBand.normal);
    });

    test('short history builds baseline instead of judging', () {
      final s = const RecoveryEngine().evaluate(
        today: today,
        hrvMs: [DailyMetric(addDays(today, -1), 50), DailyMetric(today, 30)],
      );
      expect(s.band, ReadinessBand.unknown);
      expect(s.factors.single.detail, contains('building your baseline'));
    });
  });

  group('analytics', () {
    final d = DateTime(2026, 10, 1);
    test('personal records and new PR detection', () {
      final old = ExerciseSession(workoutId: 'a', date: d, sets: const [SetRecord(weightKg: 100, reps: 5)]);
      final now = ExerciseSession(workoutId: 'b', date: addDays(d, 3), sets: const [SetRecord(weightKg: 105, reps: 5)]);
      final prs = personalRecords([old, now]);
      expect(prs.firstWhere((p) => p.kind == PrKind.heaviestWeight).value, 105);
      final fresh = newRecordsIn(now, [old]);
      expect(fresh.map((p) => p.kind), contains(PrKind.heaviestWeight));
      // First ever session is not celebrated as a "record".
      expect(newRecordsIn(old, const []), isEmpty);
    });

    test('weekly buckets and consistency', () {
      final today = DateTime(2026, 10, 22); // Thursday
      final rows = [
        for (var w = 1; w <= 3; w++)
          for (var k = 0; k < 3; k++)
            WorkoutSummaryRow(date: addDays(startOfWeek(today), -7 * w + k), volumeKg: 1000, workingSets: 10, durationMin: 60),
        WorkoutSummaryRow(date: today, volumeKg: 500, workingSets: 5, durationMin: 30),
      ];
      final buckets = weeklyBuckets(rows, today: today, weeks: 4);
      expect(buckets.map((b) => b.workouts), [3, 3, 3, 1]);
      final c = consistency(rows, today: today, target: 3);
      expect(c.thisWeek, 1);
      expect(c.streakWeeks, 3);
    });
  });
}
