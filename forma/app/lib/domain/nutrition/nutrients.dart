/// Macro-nutrient values. `null` means *unknown*, which is different from 0.
class Nutrients {
  const Nutrients({this.kcal, this.proteinG, this.carbsG, this.fatG, this.fiberG});

  static const zero = Nutrients(kcal: 0, proteinG: 0, carbsG: 0, fatG: 0, fiberG: 0);

  final double? kcal;
  final double? proteinG;
  final double? carbsG;
  final double? fatG;
  final double? fiberG;

  /// True when any core value is unknown.
  bool get isIncomplete => kcal == null || proteinG == null || carbsG == null || fatG == null || fiberG == null;

  /// True when calories are unknown — the entry cannot count toward energy.
  bool get missingEnergy => kcal == null;

  Nutrients scale(double factor) => Nutrients(
        kcal: _m(kcal, factor),
        proteinG: _m(proteinG, factor),
        carbsG: _m(carbsG, factor),
        fatG: _m(fatG, factor),
        fiberG: _m(fiberG, factor),
      );

  static double? _m(double? v, double f) => v == null ? null : v * f;

  /// Calories implied by macros (Atwater factors). Used to sanity-check data.
  double? get kcalFromMacros =>
      proteinG == null || carbsG == null || fatG == null ? null : proteinG! * 4 + carbsG! * 4 + fatG! * 9;

  @override
  bool operator ==(Object other) =>
      other is Nutrients &&
      other.kcal == kcal &&
      other.proteinG == proteinG &&
      other.carbsG == carbsG &&
      other.fatG == fatG &&
      other.fiberG == fiberG;

  @override
  int get hashCode => Object.hash(kcal, proteinG, carbsG, fatG, fiberG);
}

/// A sum of nutrients that remembers whether any part was unknown.
class NutrientTotals {
  const NutrientTotals({
    this.kcal = 0,
    this.proteinG = 0,
    this.carbsG = 0,
    this.fatG = 0,
    this.fiberG = 0,
    this.incompleteFields = const {},
    this.count = 0,
  });

  final double kcal;
  final double proteinG;
  final double carbsG;
  final double fatG;
  final double fiberG;

  /// Names of fields where at least one summed item was unknown, so the total
  /// is a lower bound.
  final Set<String> incompleteFields;
  final int count;

  bool get isIncomplete => incompleteFields.isNotEmpty;
  bool get isEmpty => count == 0;

  NutrientTotals add(Nutrients n) {
    final missing = {...incompleteFields};
    double v(double acc, double? x, String name) {
      if (x == null) {
        missing.add(name);
        return acc;
      }
      return acc + x;
    }

    return NutrientTotals(
      kcal: v(kcal, n.kcal, 'kcal'),
      proteinG: v(proteinG, n.proteinG, 'protein'),
      carbsG: v(carbsG, n.carbsG, 'carbs'),
      fatG: v(fatG, n.fatG, 'fat'),
      fiberG: v(fiberG, n.fiberG, 'fiber'),
      incompleteFields: missing,
      count: count + 1,
    );
  }

  static NutrientTotals of(Iterable<Nutrients> items) =>
      items.fold(const NutrientTotals(), (t, n) => t.add(n));
}

/// Data-quality checks for imported food values. Returns human-readable
/// warnings; an empty list means nothing looked wrong.
List<String> plausibilityWarnings(Nutrients per100g) {
  final w = <String>[];
  final macros = [per100g.proteinG, per100g.carbsG, per100g.fatG, per100g.fiberG].whereType<double>();
  if (macros.any((v) => v < 0)) w.add('Contains negative values.');
  if (macros.fold<double>(0, (a, b) => a + b) > 105) w.add('Macros add up to more than 100 g per 100 g.');
  final k = per100g.kcal;
  if (k != null && k > 950) w.add('Energy is higher than pure fat (900 kcal / 100 g).');
  final derived = per100g.kcalFromMacros;
  if (k != null && derived != null && k > 40 && (derived - k).abs() / k > 0.35) {
    w.add('Calories don\'t match the macros (${derived.round()} kcal implied).');
  }
  return w;
}
