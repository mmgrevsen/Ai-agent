import 'dart:math' as math;

import '../body/weight_trend.dart';
import '../dates.dart';

/// Energy content of body-mass change. The commonly used ~7700 kcal/kg is an
/// approximation; it is applied to the smoothed trend, not daily weights.
const kcalPerKg = 7700.0;

enum Sex { female, male, unspecified }

enum ActivityLevel {
  sedentary(1.2, 'Mostly sitting'),
  light(1.375, 'Light activity'),
  moderate(1.55, 'Moderately active'),
  high(1.725, 'Very active');

  const ActivityLevel(this.factor, this.label);
  final double factor;
  final String label;

  static ActivityLevel fromName(String? n) => values.firstWhere((a) => a.name == n, orElse: () => moderate);
}

enum EnergyMethod {
  /// Mifflin–St Jeor × activity factor. A population estimate.
  formula,

  /// Derived from the user's own intake and weight trend.
  adaptive,

  /// A weighted mix while data accumulates.
  blended,
}

enum Confidence { low, medium, high }

class EnergyEstimate {
  const EnergyEstimate({
    required this.kcal,
    required this.method,
    required this.confidence,
    required this.explanation,
    this.loggedDays = 0,
    this.weighIns = 0,
  });

  /// Estimated total daily energy expenditure. Always an estimate.
  final double kcal;
  final EnergyMethod method;
  final Confidence confidence;
  final String explanation;
  final int loggedDays;
  final int weighIns;
}

class DailyIntake {
  const DailyIntake(this.day, this.kcal, {this.complete = true});
  final DateTime day;
  final double kcal;

  /// False when the user's log for the day is partial or contains foods
  /// without calorie data. Such days are excluded from the estimate.
  final bool complete;
}

/// Basal metabolic rate (Mifflin–St Jeor). Returns `null` when inputs are
/// missing. For unspecified sex the midpoint of the two equations is used.
double? basalMetabolicRate({double? weightKg, double? heightCm, int? age, Sex sex = Sex.unspecified}) {
  if (weightKg == null || heightCm == null || age == null) return null;
  final base = 10 * weightKg + 6.25 * heightCm - 5 * age;
  return switch (sex) {
    Sex.male => base + 5,
    Sex.female => base - 161,
    Sex.unspecified => base - 78,
  };
}

/// Estimates expenditure from intake and weight trend over [windowDays],
/// blended with a formula estimate while data is sparse.
class EnergyModel {
  const EnergyModel({this.windowDays = 21, this.minLoggedDays = 10, this.minWeighIns = 4});

  final int windowDays;
  final int minLoggedDays;
  final int minWeighIns;

  EnergyEstimate? estimate({
    required DateTime today,
    required List<DailyIntake> intake,
    required WeightTrend trend,
    double? formulaKcal,
  }) {
    // Window ends yesterday: today's log is usually unfinished.
    final end = addDays(dateOnly(today), -1);
    final start = addDays(end, -(windowDays - 1));
    final inWindow = [
      for (final d in intake)
        if (d.complete && !dateOnly(d.day).isBefore(start) && !dateOnly(d.day).isAfter(end)) d,
    ];
    final weighIns = trend.points
        .where((p) => p.scaleKg != null && !p.day.isBefore(start) && !p.day.isAfter(end))
        .length;

    double? observed;
    final trendStart = trend.trendOn(start);
    final trendEnd = trend.trendOn(end);
    if (inWindow.length >= minLoggedDays && weighIns >= minWeighIns && trendStart != null && trendEnd != null) {
      final avgIntake = inWindow.map((d) => d.kcal).reduce((a, b) => a + b) / inWindow.length;
      final deltaKg = trendEnd - trendStart;
      observed = avgIntake - deltaKg * kcalPerKg / windowDays;
    }

    if (observed == null && formulaKcal == null) return null;

    if (observed == null) {
      return EnergyEstimate(
        kcal: _clamp(formulaKcal!),
        method: EnergyMethod.formula,
        confidence: Confidence.low,
        loggedDays: inWindow.length,
        weighIns: weighIns,
        explanation: 'Based on a standard formula using your age, height, weight and activity level. '
            'Log food and weigh in regularly for ~2 weeks to personalise it '
            '(${inWindow.length}/$minLoggedDays complete days, $weighIns/$minWeighIns weigh-ins so far).',
      );
    }

    // Weight the observed value by how much data backs it.
    final dataWeight = math.min(1.0, inWindow.length / windowDays) * math.min(1.0, weighIns / (windowDays / 2));
    final confidence = dataWeight >= 0.75
        ? Confidence.high
        : dataWeight >= 0.4
            ? Confidence.medium
            : Confidence.low;

    if (formulaKcal == null || dataWeight >= 0.95) {
      return EnergyEstimate(
        kcal: _clamp(observed),
        method: EnergyMethod.adaptive,
        confidence: confidence,
        loggedDays: inWindow.length,
        weighIns: weighIns,
        explanation: 'Calculated from your logged intake and weight trend over the last $windowDays days '
            '(${inWindow.length} complete days, $weighIns weigh-ins). This is an estimate, not a measurement.',
      );
    }
    final blended = dataWeight * observed + (1 - dataWeight) * formulaKcal;
    return EnergyEstimate(
      kcal: _clamp(blended),
      method: EnergyMethod.blended,
      confidence: confidence,
      loggedDays: inWindow.length,
      weighIns: weighIns,
      explanation: 'Mostly based on your logged intake and weight trend (${inWindow.length} complete days, '
          '$weighIns weigh-ins), blended with a formula estimate until more data is available.',
    );
  }

  static double _clamp(double kcal) => kcal.clamp(1200, 5500).toDouble();
}

enum WeightGoal { lose, maintain, gain }

class TargetInput {
  const TargetInput({
    required this.expenditureKcal,
    required this.weightKg,
    required this.goal,
    this.weeklyRatePct = 0.5,
    this.age,
    this.heightCm,
    this.sex = Sex.unspecified,
  });

  final double expenditureKcal;
  final double weightKg;
  final WeightGoal goal;

  /// Desired change per week as % of body weight (always positive).
  final double weeklyRatePct;
  final int? age;
  final double? heightCm;
  final Sex sex;
}

class NutritionTargetsResult {
  const NutritionTargetsResult({
    required this.kcal,
    required this.proteinG,
    required this.carbsG,
    required this.fatG,
    required this.fiberG,
    required this.effectiveGoal,
    required this.weeklyRatePct,
    required this.notes,
  });

  final double kcal;
  final double proteinG;
  final double carbsG;
  final double fatG;
  final double fiberG;

  /// The goal actually applied — may differ from the request when a
  /// safeguard applies (e.g. under 18).
  final WeightGoal effectiveGoal;
  final double weeklyRatePct;

  /// Explanations of every safeguard or adjustment applied.
  final List<String> notes;
}

/// Turns an expenditure estimate into daily targets with safeguards:
/// * no deficits for users under 18 or with a BMI below 18.5;
/// * weight loss capped at 1% of body weight per week and 25% below expenditure;
/// * gain capped at 0.5% per week;
/// * calories never below a floor (the larger of BMR and 1200–1500 kcal).
NutritionTargetsResult computeTargets(TargetInput input) {
  final notes = <String>[];
  var goal = input.goal;
  var rate = input.weeklyRatePct.abs();

  if (goal != WeightGoal.maintain && input.age != null && input.age! < 18) {
    goal = WeightGoal.maintain;
    notes.add('For people under 18, Forma sets maintenance targets only. '
        'Please talk to a doctor or registered dietitian about weight goals.');
  }
  final bmi = input.heightCm == null ? null : input.weightKg / math.pow(input.heightCm! / 100, 2);
  if (goal == WeightGoal.lose && bmi != null && bmi < 18.5) {
    goal = WeightGoal.maintain;
    notes.add('Your BMI is below 18.5, so Forma will not set a calorie deficit. '
        'Consider speaking with a healthcare professional.');
  }

  final tdee = input.expenditureKcal;
  var kcal = tdee;
  if (goal == WeightGoal.lose) {
    if (rate > 1.0) {
      rate = 1.0;
      notes.add('Weekly loss is capped at 1% of body weight to protect muscle and wellbeing.');
    }
    var deficit = input.weightKg * rate / 100 * kcalPerKg / 7;
    if (deficit > tdee * 0.25) {
      deficit = tdee * 0.25;
      notes.add('The deficit is capped at 25% below your estimated expenditure.');
    }
    kcal = tdee - deficit;
  } else if (goal == WeightGoal.gain) {
    if (rate > 0.5) {
      rate = 0.5;
      notes.add('Weekly gain is capped at 0.5% of body weight to limit fat gain.');
    }
    kcal = tdee + input.weightKg * rate / 100 * kcalPerKg / 7;
  } else {
    rate = 0;
  }

  final bmr = basalMetabolicRate(
    weightKg: input.weightKg,
    heightCm: input.heightCm,
    age: input.age,
    sex: input.sex,
  );
  final genericFloor = switch (input.sex) {
    Sex.female => 1200.0,
    Sex.male => 1500.0,
    Sex.unspecified => 1350.0,
  };
  final floor = math.max(genericFloor, bmr ?? 0);
  if (kcal < floor) {
    kcal = floor;
    notes.add('Calories are kept at or above ${floor.round()} kcal, a minimum for meeting basic needs.');
  }

  final protein = math.min(input.weightKg * 1.6, 220.0);
  final fat = math.max(input.weightKg * 0.7, kcal * 0.25 / 9);
  final carbs = math.max(0.0, (kcal - protein * 4 - fat * 9) / 4);
  final fiber = math.max(25.0, kcal / 1000 * 14);

  return NutritionTargetsResult(
    kcal: (kcal / 10).roundToDouble() * 10,
    proteinG: protein.roundToDouble(),
    carbsG: carbs.roundToDouble(),
    fatG: fat.roundToDouble(),
    fiberG: fiber.roundToDouble(),
    effectiveGoal: goal,
    weeklyRatePct: rate,
    notes: notes,
  );
}
