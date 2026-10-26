import 'package:flutter_test/flutter_test.dart';
import 'package:forma/features/nutrition/vision/text_rows.dart';
import 'package:forma/features/nutrition/vision/vision_result.dart';

import 'vision_test_helpers.dart';

void main() {
  test('parses the platform reply and skips malformed entries', () {
    final r = VisionResult.fromJson({
      'labels': [
        {'id': 'food', 'confidence': 0.4},
        {'id': 'pizza', 'confidence': 0.8},
        {'confidence': 0.9},
        'junk',
        {'id': 'salad', 'confidence': 7},
      ],
      'lines': [
        {'text': 'Energi', 'confidence': 0.9, 'x': 0.1, 'y': 0.2, 'w': 0.2, 'h': 0.03},
        {'text': '  '},
        {'text': 12},
        {'text': 'Fedt', 'x': double.nan},
      ],
    });
    expect(r.labels.map((l) => l.id), ['salad', 'pizza', 'food']);
    expect(r.labels.first.confidence, 1);
    expect(r.lines.map((l) => l.text), ['Energi', 'Fedt']);
    expect(r.lines.last.x, 0);
    expect(VisionResult.fromJson(const {}).labels, isEmpty);
  });

  test('assembles cells on the same line into rows, left to right', () {
    final rows = assembleRows([
      cell('2,1 g', 0.41, 0.2),
      cell('Energi', 0.04, 0.1),
      cell('Fedt', 0.04, 0.201),
      cell('1431 kJ', 0.41, 0.102),
      cell('0,8 g', 0.71, 0.198),
    ]);
    expect(rows.map((r) => r.text), ['Energi 1431 kJ', 'Fedt 2,1 g 0,8 g']);
  });

  test('numbers keep their units and positions', () {
    final row = assembleRows([cell('Energi', 0.04, 0.1), cell('1431 kJ / 342 kcal', 0.41, 0.1, w: 0.25), cell('17 %', 0.8, 0.1)]).single;
    final nums = numbersIn(row);
    expect(nums.map((n) => (n.value, n.unit)), [(1431, 'kj'), (342, 'kcal')]);
    expect(nums.first.x, lessThan(nums.last.x));
    expect(textBeforeNumbers(row, nums), 'energi');
  });

  test('OCR clean-up leaves words alone', () {
    expect(normalizeOcr('O,5 g'), '0,5 g');
    expect(normalizeOcr('1o,5'), '10,5');
    expect(normalizeOcr('342 kcaI'), '342 kcal');
    expect(normalizeOcr('Salt og peber'), 'salt og peber');
    expect(normalizeOcr('Kokosolie'), 'kokosolie');
    expect(normalizeOcr('1 431 kJ'), '1431 kj');
  });
}
