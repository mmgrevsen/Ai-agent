import 'package:flutter_test/flutter_test.dart';
import 'package:forma/features/nutrition/vision/scale_reader.dart';

import 'vision_test_helpers.dart';

void main() {
  test('reads "245 g"', () {
    final r = readScale([cell('245 g', 0.4, 0.7, h: 0.08)])!;
    expect(r.grams, 245);
    expect(r.hasUnit, isTrue);
    expect(r.text, '245 g');
  });

  test('accepts kg, oz and lb', () {
    expect(readScale([cell('0,245 kg', 0.4, 0.7, h: 0.08)])!.grams, 245);
    expect(readScale([cell('1.2kg', 0.4, 0.7, h: 0.08)])!.grams, 1200);
    expect(readScale([cell('8.6 oz', 0.4, 0.7, h: 0.08)])!.grams, closeTo(243.8, 0.1));
    expect(readScale([cell('1 lb', 0.4, 0.7, h: 0.08)])!.grams, closeTo(453.6, 0.1));
  });

  test('a big bare number counts (the unit is often unlit or misread)', () {
    // What Vision read from test/vision/fixtures/scale_245g.jpg: "TARE" and "245".
    final r = readScale([cell('TARE', 0.15, 0.82, h: 0.03), cell('245', 0.37, 0.73, h: 0.09)])!;
    expect(r.grams, 245);
    expect(r.hasUnit, isFalse);
  });

  test('a small bare number is ignored', () {
    expect(readScale([cell('245', 0.4, 0.7, h: 0.02)]), isNull);
  });

  test('a display read as "2O5 g" or "1S0 g" is fixed', () {
    expect(readScale([cell('2O5 g', 0.4, 0.7, h: 0.08)])!.grams, 205);
    expect(readScale([cell('1S0 g', 0.4, 0.7, h: 0.08)])!.grams, 150);
  });

  test('number and unit read as separate pieces', () {
    final r = readScale([cell('312', 0.40, 0.70, h: 0.08), cell('g', 0.55, 0.72, h: 0.05)])!;
    expect(r.grams, 312);
    expect(r.hasUnit, isTrue);
  });

  test('the scale display beats a small "500 g" printed on a pack', () {
    final r = readScale([cell('500 g', 0.1, 0.1, h: 0.025), cell('245', 0.4, 0.7, h: 0.09)])!;
    expect(r.grams, 245);
  });

  test('text that is not just a weight is ignored', () {
    expect(readScale([cell('Nettovægt 500 g', 0.1, 0.1, h: 0.08)]), isNull);
    expect(readScale([cell('Pizza', 0.1, 0.1, h: 0.08)]), isNull);
    expect(readScale([cell('-12 g', 0.1, 0.1, h: 0.08)]), isNull);
    expect(readScale([cell('0 g', 0.1, 0.1, h: 0.08)]), isNull);
    expect(readScale([cell('9000 g', 0.1, 0.1, h: 0.08)]), isNull);
    expect(readScale(const []), isNull);
  });

  test('a fractional bare number is not taken for a weight', () {
    expect(readScale([cell('12,5', 0.4, 0.7, h: 0.08)]), isNull);
  });
}
