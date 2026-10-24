import '../data/repositories/body_repository.dart';
import '../data/repositories/nutrition_repository.dart';
import '../data/repositories/settings_repository.dart';
import '../domain/body/weight_trend.dart';
import '../domain/dates.dart';
import '../domain/nutrition/energy.dart';

class TargetProposal {
  const TargetProposal({required this.estimate, required this.targets, required this.weightKg});
  final EnergyEstimate estimate;
  final NutritionTargetsResult targets;
  final double weightKg;
}

/// Combines profile, intake and weight trend into expenditure estimates and
/// suggested targets. Nothing here writes data except [applyProposal].
class NutritionService {
  NutritionService({required this.settings, required this.nutrition, required this.body, this.model = const EnergyModel()});

  final SettingsRepository settings;
  final NutritionRepository nutrition;
  final BodyRepository body;
  final EnergyModel model;

  static const rateGoalKind = 'weight_change_rate';

  static WeightGoal weightGoalFor(String primaryGoal) => switch (primaryGoal) {
        'lose_fat' => WeightGoal.lose,
        'build_muscle' => WeightGoal.gain,
        _ => WeightGoal.maintain,
      };

  Future<WeightTrend> trend({DateTime? since}) async => BodyRepository.trendOf(await body.weights(since: since));

  Future<EnergyEstimate?> estimate({required DateTime today}) async {
    final profile = await settings.profile();
    final t = await trend(since: addDays(today, -120));
    final weight = t.latest?.trendKg;
    final bmr = basalMetabolicRate(
      weightKg: weight,
      heightCm: profile.heightCm,
      age: ageFromBirthYear(profile.birthYear, today),
      sex: Sex.values.firstWhere((s) => s.name == profile.sex, orElse: () => Sex.unspecified),
    );
    final formula = bmr == null ? null : bmr * ActivityLevel.fromName(profile.activityLevel).factor;
    final intake = await nutrition.dailyIntake(from: addDays(today, -40), to: today);
    return model.estimate(today: today, intake: intake, trend: t, formulaKcal: formula);
  }

  /// Suggested targets, or `null` when there is no body weight to base them on.
  Future<TargetProposal?> propose({required DateTime today}) async {
    final est = await estimate(today: today);
    final t = await trend(since: addDays(today, -120));
    final weight = t.latest?.trendKg;
    if (est == null || weight == null) return null;
    final profile = await settings.profile();
    final goals = await settings.goals();
    final rate = goals.where((g) => g.kind == rateGoalKind).firstOrNull?.targetValue;
    final targets = computeTargets(TargetInput(
      expenditureKcal: est.kcal,
      weightKg: weight,
      goal: weightGoalFor(profile.primaryGoal),
      weeklyRatePct: rate ?? (profile.primaryGoal == 'build_muscle' ? 0.25 : 0.5),
      age: ageFromBirthYear(profile.birthYear, today),
      heightCm: profile.heightCm,
      sex: Sex.values.firstWhere((s) => s.name == profile.sex, orElse: () => Sex.unspecified),
    ));
    return TargetProposal(estimate: est, targets: targets, weightKg: weight);
  }

  Future<void> applyProposal(TargetProposal p, {DateTime? from}) => settings.setTargets(
        kcal: p.targets.kcal,
        proteinG: p.targets.proteinG,
        carbsG: p.targets.carbsG,
        fatG: p.targets.fatG,
        fiberG: p.targets.fiberG,
        mode: 'adaptive',
        rationale: [
          'Expenditure ≈ ${p.estimate.kcal.round()} kcal (${p.estimate.method.name}, ${p.estimate.confidence.name} confidence).',
          ...p.targets.notes,
        ].join(' '),
        from: from,
      );
}
