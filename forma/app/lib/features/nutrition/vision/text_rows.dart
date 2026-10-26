import 'dart:math' as math;

import 'vision_result.dart';

/// Pieces of text on the same line of a photo, left to right. Vision often
/// returns a table's name and value cells as separate pieces.
class TextRow {
  TextRow(this.cells);
  final List<VisionTextLine> cells;

  String get text => cells.map((c) => c.text.trim()).join(' ');
  double get top => cells.map((c) => c.y).reduce(math.min);
  double get bottom => cells.map((c) => c.bottom).reduce(math.max);

  @override
  String toString() => text;
}

/// Groups text into rows: a piece joins a row when they overlap by more
/// than half the height of the smaller one.
List<TextRow> assembleRows(List<VisionTextLine> lines) {
  final sorted = [for (final l in lines) if (l.text.trim().isNotEmpty) l]..sort((a, b) => a.centerY.compareTo(b.centerY));
  final rows = <List<VisionTextLine>>[];
  for (final line in sorted) {
    List<VisionTextLine>? best;
    var bestOverlap = 0.5;
    // Rows are built top to bottom, so only the last few can still match.
    for (final row in rows.reversed.take(4)) {
      final top = row.map((c) => c.y).reduce(math.min);
      final bottom = row.map((c) => c.bottom).reduce(math.max);
      final smaller = math.min(line.h, bottom - top);
      if (smaller <= 0) continue;
      final overlap = (math.min(bottom, line.bottom) - math.max(top, line.y)) / smaller;
      if (overlap > bestOverlap) {
        best = row;
        bestOverlap = overlap;
      }
    }
    if (best != null) {
      best.add(line);
    } else {
      rows.add([line]);
    }
  }
  return [for (final r in rows) TextRow(r..sort((a, b) => a.x.compareTo(b.x)))];
}

/// A number found in a row, with its unit and horizontal position.
class RowNumber {
  const RowNumber(this.value, {this.unit, required this.x, this.lessThan = false, this.cell = 0, this.offset = 0});
  final double value;

  /// kj, kcal, g, mg, mcg or ml; null when none was printed.
  final String? unit;

  /// Estimated horizontal centre (0–1) in the photo.
  final double x;

  /// Printed as "< 0,5 g".
  final bool lessThan;

  /// Which cell of the row it is in, and where in that cell's normalised text.
  final int cell;
  final int offset;

  @override
  String toString() => '${lessThan ? '<' : ''}$value${unit ?? ''}@${x.toStringAsFixed(2)}';
}

/// Common OCR slips on printed numbers: "O,5 g" for "0,5 g", "kcaI" for "kcal".
String normalizeOcr(String text) {
  var t = text.toLowerCase().replaceAll('\u00a0', ' ');
  // An "o" inside a number, or before a decimal comma: "1o,5" and "o,5".
  t = t.replaceAllMapped(RegExp(r'(?<=\d)o(?=\d|[.,]\d)|(?<![a-zæøå\d])o(?=[.,]\d)'), (_) => '0');
  // "o g" with a space; "og" alone is the Danish word for "and".
  t = t.replaceAllMapped(RegExp(r'(?<![a-zæøå\d])o (?=g\b)'), (_) => '0 ');
  t = t.replaceAll(RegExp(r'kca[1i|]'), 'kcal');
  // "1 431 kJ" → "1431 kJ" (thousands separated by a space).
  t = t.replaceAllMapped(RegExp(r'\b(\d) (\d{3})(?=\s*(kj|kcal))'), (m) => '${m[1]}${m[2]}');
  return t;
}

// A number, its unit and nothing that makes it a percentage (reference intake).
final _number = RegExp(r'(<\s*)?(\d+(?:[.,]\d+)?)(?!\d|[.,]\d)\s*(kj|kcal|mg|mcg|µg|ml|g)?(?![a-zæøå])(?!\s*%)');
final _letter = RegExp(r'[a-zæøå]');

/// The numbers in [row], each placed where it sits in the photo.
List<RowNumber> numbersIn(TextRow row) {
  final out = <RowNumber>[];
  for (var i = 0; i < row.cells.length; i++) {
    final cell = row.cells[i];
    final t = normalizeOcr(cell.text);
    for (final m in _number.allMatches(t)) {
      // "b12" or "d3" (a vitamin) is a name, not a value; "protein12" is a value.
      final at = m.start;
      if (at > 0 && _letter.hasMatch(t[at - 1]) && (at == 1 || !_letter.hasMatch(t[at - 2]))) continue;
      var raw = m[2]!;
      final unit = m[3];
      // "1.431 kJ" uses a thousands dot.
      if ((unit == 'kj' || unit == 'kcal') && RegExp(r'^\d\.\d{3}$').hasMatch(raw)) raw = raw.replaceAll('.', '');
      final value = double.tryParse(raw.replaceAll(',', '.'));
      if (value == null) continue;
      final centre = t.isEmpty ? 0.5 : (m.start + m.end) / 2 / t.length;
      out.add(RowNumber(
        value,
        unit: unit == 'µg' ? 'mcg' : unit,
        x: cell.x + cell.w * centre,
        lessThan: m[1] != null,
        cell: i,
        offset: m.start,
      ));
    }
  }
  return out;
}

/// The row's text before its first number, normalised: "fedt" in "Fedt 2,1 g 0,8 g".
String textBeforeNumbers(TextRow row, List<RowNumber> numbers) {
  final first = numbers.firstOrNull;
  final parts = <String>[
    for (var i = 0; i < row.cells.length && (first == null || i < first.cell); i++) normalizeOcr(row.cells[i].text),
    if (first != null) normalizeOcr(row.cells[first.cell].text).substring(0, first.offset),
  ];
  return parts.join(' ').replaceFirst(RegExp(r'^[\s\-–•·*:.,]+'), '').trim();
}
