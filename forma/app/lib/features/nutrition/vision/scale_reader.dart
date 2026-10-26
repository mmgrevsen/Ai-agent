import 'text_rows.dart';
import 'vision_result.dart';

/// A weight read from a kitchen scale's display in a photo.
class ScaleReading {
  const ScaleReading(this.grams, {required this.text, required this.hasUnit});
  final double grams;

  /// What was read, e.g. "245 g".
  final String text;

  /// The display showed a unit. Without one the number is only offered,
  /// never used silently.
  final bool hasUnit;
}

// The whole piece of text is one weight: "245 g", "245g", "0,245 kg", "8.6 oz".
final _weight = RegExp(r'^(\d{1,4}(?:[.,]\d{1,3})?)\s*(kg|g|gr|oz|lb)?$');
// Segment displays are often read with letters for digits.
const _digitLookalikes = {'o': '0', 'i': '1', 'l': '1', '|': '1', 's': '5', 'b': '8', 'z': '2'};

/// Finds a kitchen-scale reading among the text in a photo. Display digits
/// are the largest text on a scale, so the tallest candidate wins; a number
/// without a unit must be large to count at all.
ScaleReading? readScale(List<VisionTextLine> lines) {
  final candidates = <(ScaleReading, double)>[];
  void consider(String raw, double height) {
    var t = raw.toLowerCase().trim().replaceAll(RegExp(r'\s+'), ' ');
    // "2O5 g" → "205 g", but only on text that is mostly digits already.
    final digits = RegExp(r'\d').allMatches(t).length;
    if (digits >= 2) {
      final m = RegExp(r'^([0-9oilsbz|.,]+)\s*(kg|g|gr|oz|lb)?$').firstMatch(t);
      if (m != null) {
        t = m[1]!.split('').map((c) => _digitLookalikes[c] ?? c).join() + (m[2] == null ? '' : ' ${m[2]}');
      }
    }
    final m = _weight.firstMatch(t);
    if (m == null) return;
    final value = double.tryParse(m[1]!.replaceAll(',', '.'));
    if (value == null || value <= 0) return;
    final unit = m[2];
    final grams = switch (unit) {
      'kg' => value * 1000,
      'oz' => value * 28.3495,
      'lb' => value * 453.592,
      _ => value,
    };
    if (grams < 1 || grams > 5000) return;
    // A bare number must be display-sized (≥ 4 % of the photo's height) and whole.
    if (unit == null && (height < 0.04 || value != value.roundToDouble())) return;
    final shown = unit == null ? '${m[1]}' : '${m[1]} $unit';
    candidates.add((ScaleReading(double.parse(grams.toStringAsFixed(1)), text: shown, hasUnit: unit != null), height));
  }

  for (final line in lines) {
    consider(line.text, line.h);
  }
  // "245" and "g" read as separate pieces.
  for (final row in assembleRows(lines)) {
    if (row.cells.length > 1) consider(row.text, row.cells.map((c) => c.h).reduce((a, b) => a > b ? a : b));
  }
  if (candidates.isEmpty) return null;
  // Taller text wins; a printed unit counts as half as tall again, so a
  // pack's small "500 g" never beats a display's big "245".
  double weight((ScaleReading, double) c) => c.$2 * (c.$1.hasUnit ? 1.5 : 1);
  candidates.sort((a, b) => weight(b).compareTo(weight(a)));
  return candidates.first.$1;
}
