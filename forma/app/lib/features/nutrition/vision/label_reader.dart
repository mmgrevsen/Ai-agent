import '../../../data/remote/ai_api.dart';
import '../../../domain/nutrition/food.dart';
import '../../../domain/nutrition/nutrients.dart';
import 'text_rows.dart';
import 'vision_result.dart';

enum _Nutrient { energy, fat, carbs, fiber, protein }

// Row names in Danish, Norwegian, Swedish, German, English and Dutch, as
// printed on EU nutrition tables. Sub-rows ("heraf mættede fedtsyrer",
// "of which sugars") are recognised first and skipped.
final _subRow = RegExp(
  r'heraf|hvorav|varav|davon|of which|waarvan|mættede|mettede|mättat|gesättigt|saturate|sukker|sugar|zucker|socker|suiker|'
  r'umættede|umettede|omättat|ungesättigt|polyol|stivelse|starch|stärke|laktose|lactose',
);
final _names = <_Nutrient, RegExp>{
  _Nutrient.energy: RegExp(r'^(energi|energy|energie|brennwert|kalorier|calories|kcal\b|kj\b)'),
  _Nutrient.fat: RegExp(r'^(fedt|fett|fat|vet|total fat)\b'),
  _Nutrient.carbs: RegExp(r'^(kulhydrat|karbohydrat|kolhydrat|kohlenhydrat|carbohydrate|koolhydra|total carb)'),
  _Nutrient.fiber: RegExp(r'^(kostfiber|kostfibre|fiber|fibre|ballaststoffe|vezel|dietary fib)'),
  _Nutrient.protein: RegExp(r'^(protein|eiweiß|eiweiss|eiwit)'),
};

final _per100 = RegExp(r'100\s*(g|ml)\b');
final _per100ml = RegExp(r'100\s*ml\b');
final _serving = RegExp(r'(portion|serving|portie|servering|stk|stykke|skive|slice|piece)[^0-9]{0,25}(\d+(?:[.,]\d+)?)\s*(g|ml)\b');

/// Reads a nutrition table from the text Vision found on a package. Values
/// are per 100 g; anything that can't be read with confidence is left empty
/// for the user to fill in, never guessed. Returns null when the photo holds
/// no nutrition table.
LabelReading? readNutritionLabel(List<VisionTextLine> lines) {
  final rows = assembleRows(lines);
  final texts = [for (final r in rows) normalizeOcr(r.text)];
  final numbers = [for (final r in rows) numbersIn(r)];
  final labels = [for (var i = 0; i < rows.length; i++) textBeforeNumbers(rows[i], numbers[i])];
  _Nutrient? nutrientOf(int i) =>
      _subRow.hasMatch(labels[i]) ? null : _names.entries.where((e) => e.value.hasMatch(labels[i])).firstOrNull?.key;
  final firstEnergy = Iterable<int>.generate(rows.length).where((i) => nutrientOf(i) == _Nutrient.energy).firstOrNull;

  // The column header ("pr. 100 g", "pr. portion (40 g)") sits just above the
  // energy row. Earlier text ("120 g frugt pr. 100 g") is not a header.
  double? per100X;
  double? servingX;
  var perMl = false;
  ServingOption? serving;
  // Search upwards from the energy row, so the nearest header wins.
  final headerTo = firstEnergy ?? rows.length - 1;
  for (var i = headerTo; i >= 0 && i >= headerTo - 3; i--) {
    if (per100X == null && _per100.hasMatch(texts[i])) {
      perMl = _per100ml.hasMatch(texts[i]);
      per100X = numbers[i].where((n) => n.value == 100).firstOrNull?.x;
    }
    final portion = _serving.firstMatch(texts[i]);
    if (portion != null && serving == null) {
      serving = _servingOf(rows[i].text, portion);
      servingX = numbers[i].where((n) => n.value == serving?.grams).firstOrNull?.x;
    }
  }
  // A serving size printed elsewhere ("1 portion = 40 g") is still useful.
  for (var i = 0; i < rows.length && serving == null; i++) {
    final portion = _serving.firstMatch(texts[i]);
    if (portion != null) serving = _servingOf(rows[i].text, portion);
  }
  // Only per-serving values: convert them with the printed serving size.
  final perServingOnly = per100X == null && servingX != null && serving != null;
  final factor = perServingOnly ? 100 / serving.grams : 1.0;

  final values = <_Nutrient, double>{};
  double? kcal;
  double? kj;
  _Nutrient? previous;
  for (var i = 0; i < rows.length; i++) {
    var nums = numbers[i];
    final label = labels[i];
    var nutrient = nutrientOf(i);
    if (nutrient == null && label.isEmpty && nums.isNotEmpty && previous != null) {
      // Values on their own row: "490kcal" under "Energy 2050kJ", or a value
      // column Vision read apart from its names.
      final energyUnits = nums.any((n) => n.unit == 'kj' || n.unit == 'kcal');
      if (previous == _Nutrient.energy ? energyUnits : !values.containsKey(previous)) nutrient = previous;
    }
    if (nutrient == null) {
      if (label.isNotEmpty) previous = null;
      continue;
    }
    previous = nutrient;
    if (nums.isEmpty) continue;
    if (nutrient == _Nutrient.energy) {
      final picked = _energy(texts[i], label, nums, per100X, servingX);
      kcal ??= picked.kcal;
      kj ??= picked.kj;
      continue;
    }
    if (values.containsKey(nutrient)) continue;
    nums = [for (final n in nums) if (n.unit == null || n.unit == 'g' || n.unit == 'mg') n];
    final n = _pick(nums, per100X, servingX);
    if (n == null) continue;
    var v = (n.unit == 'mg' ? n.value / 1000 : n.value) * factor;
    // "< 0,5 g" is declared as negligible.
    if (n.lessThan && n.value <= 0.5) v = 0;
    if (v >= 0 && v <= 100) values[nutrient] = _round(v);
  }

  final energy = kcal != null ? kcal * factor : (kj == null ? null : kj * factor / 4.184);
  final per100g = Nutrients(
    kcal: energy != null && energy >= 0 && energy <= 900 ? energy.roundToDouble() : null,
    proteinG: values[_Nutrient.protein],
    carbsG: values[_Nutrient.carbs],
    fatG: values[_Nutrient.fat],
    fiberG: values[_Nutrient.fiber],
  );
  final found = [per100g.kcal, per100g.proteinG, per100g.carbsG, per100g.fatG].whereType<double>().length;
  if (found == 0) return null;

  final caveats = <String>[
    'Read on this device from your photo. Compare each value with the package.',
    if (perServingOnly) 'The label only shows values per serving (${serving.label}); they were converted to per 100 g.',
    if (perMl) 'The label is per 100 ml; the values are used as per 100 g.',
    if (found < 4) 'Some values could not be read. Fill them in from the package, or leave them empty.',
  ];
  final fromMacros = per100g.kcalFromMacros;
  if (per100g.kcal != null && fromMacros != null) {
    final expected = fromMacros + (per100g.fiberG ?? 0) * 2;
    if ((per100g.kcal! - expected).abs() > 25 + expected * 0.15) {
      caveats.add('The calories don\'t match protein, carbs and fat (about ${expected.round()} kcal). A value may be misread.');
    }
  }
  return LabelReading(per100g: per100g, serving: serving, caveats: caveats);
}

double _round(double v) => double.parse(v.toStringAsFixed(v < 10 ? 2 : 1));

/// The value in the per-100 g column: nearest the "100 g" header when the
/// photo shows one, otherwise the first value (EU tables put it first).
RowNumber? _pick(List<RowNumber> numbers, double? per100X, double? servingX) {
  if (numbers.isEmpty) return null;
  if (per100X == null) return numbers.first;
  final nearest = numbers.reduce((a, b) => (a.x - per100X).abs() <= (b.x - per100X).abs() ? a : b);
  // A lone value under the serving column is not a per-100 g value.
  if (servingX != null && (nearest.x - servingX).abs() < (nearest.x - per100X).abs()) return null;
  return nearest;
}

({double? kcal, double? kj}) _energy(String text, String label, List<RowNumber> numbers, double? per100X, double? servingX) {
  var kcals = [for (final n in numbers) if (n.unit == 'kcal') n];
  var kjs = [for (final n in numbers) if (n.unit == 'kj') n];
  final bare = [for (final n in numbers) if (n.unit == null) n];
  if (kcals.isEmpty && kjs.isEmpty && bare.isNotEmpty) {
    final hasKj = text.contains('kj');
    final hasKcal = text.contains('kcal');
    if (hasKj && hasKcal) {
      // "Energi kJ/kcal 1431/342": the values follow the order of the units.
      final kjFirst = text.indexOf('kj') < text.indexOf('kcal');
      for (var i = 0; i < bare.length; i++) {
        (i.isEven == kjFirst ? kjs : kcals).add(bare[i]);
      }
    } else if (hasKcal || label.startsWith('kalori') || label.startsWith('calorie')) {
      kcals = bare;
    } else if (hasKj) {
      kjs = bare;
    }
  }
  return (kcal: _pick(kcals, per100X, servingX)?.value, kj: _pick(kjs, per100X, servingX)?.value);
}

ServingOption? _servingOf(String rowText, RegExpMatch portion) {
  final grams = double.tryParse(portion[2]!.replaceAll(',', '.'));
  if (grams == null || grams <= 0 || grams > 2000 || grams == 100) return null;
  final unit = portion[3]!;
  final inBrackets = RegExp(r'\(([^)]*\d[^)]*)\)').firstMatch(rowText)?[1]?.trim();
  return ServingOption(inBrackets != null ? '1 serving ($inBrackets)' : '1 serving (${portion[2]} $unit)', grams);
}
