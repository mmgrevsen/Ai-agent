import 'package:forma/features/nutrition/vision/vision_result.dart';

/// One piece of text at a position, as Vision reports it (0–1, top left).
VisionTextLine cell(String text, double x, double y, {double? w, double h = 0.03}) =>
    VisionTextLine(text, confidence: 0.95, x: x, y: y, w: w ?? 0.012 * text.length, h: h);

/// A table as separate cells, the way Vision reads printed tables: each row's
/// texts placed in [columns], rows [step] apart. Null cells are left empty.
List<VisionTextLine> table(List<List<String?>> rows, {List<double> columns = const [0.04, 0.41, 0.71], double top = 0.12, double step = 0.06}) {
  final out = <VisionTextLine>[];
  for (final (r, row) in rows.indexed) {
    for (final (c, text) in row.indexed) {
      if (text == null || text.isEmpty) continue;
      // A little jitter, as on a real photo.
      final y = top + r * step + (c.isEven ? 0.002 : -0.002);
      out.add(cell(text, columns[c], y));
    }
  }
  return out;
}
