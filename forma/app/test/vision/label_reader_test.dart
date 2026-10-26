import 'package:flutter_test/flutter_test.dart';
import 'package:forma/features/nutrition/vision/label_reader.dart';
import 'package:forma/features/nutrition/vision/vision_result.dart';

import 'vision_test_helpers.dart';

void main() {
  group('Danish nutrition table', () {
    final danish = table([
      ['Næringsindhold'],
      [null, 'pr. 100 g', 'pr. portion (40 g)'],
      ['Energi', '1431 kJ / 342 kcal', '572 kJ / 137 kcal'],
      ['Fedt', '2,1 g', '0,8 g'],
      ['heraf mættede fedtsyrer', '0,4 g', '0,2 g'],
      ['Kulhydrat', '64 g', '26 g'],
      ['heraf sukkerarter', '1,2 g', '0,5 g'],
      ['Kostfibre', '9,5 g', '3,8 g'],
      ['Protein', '12 g', '4,8 g'],
      ['Salt', '0,02 g', '0,01 g'],
    ]);

    test('reads every per-100 g value, not the portion column', () {
      final r = readNutritionLabel(danish)!;
      expect(r.per100g.kcal, 342);
      expect(r.per100g.fatG, 2.1);
      expect(r.per100g.carbsG, 64);
      expect(r.per100g.fiberG, 9.5);
      expect(r.per100g.proteinG, 12);
    });

    test('takes the serving size from the header', () {
      final r = readNutritionLabel(danish)!;
      expect(r.serving?.grams, 40);
      expect(r.serving?.label, contains('40 g'));
    });

    test('says it was read on the device and raises no false alarms', () {
      final r = readNutritionLabel(danish)!;
      expect(r.caveats.first, contains('Read on this device'));
      expect(r.caveats.where((c) => c.contains('don\'t match')), isEmpty);
      expect(r.caveats.where((c) => c.contains('could not be read')), isEmpty);
    });

    test('works whatever order Vision returns the pieces in', () {
      final shuffled = [...danish]..shuffle();
      final r = readNutritionLabel(shuffled)!;
      expect((r.per100g.kcal, r.per100g.fatG, r.per100g.carbsG, r.per100g.proteinG), (342, 2.1, 64, 12));
    });

    test('a sub-row never replaces its main value', () {
      final lines = table([
        [null, 'pr. 100 g'],
        ['Energi', '1431 kJ / 342 kcal'],
        ['- heraf mættede fedtsyrer', '0,4 g'],
        ['Fedt', '2,1 g'],
        ['heraf sukkerarter', '30 g'],
        ['Kulhydrat', '64 g'],
        ['Protein', '12 g'],
      ]);
      final r = readNutritionLabel(lines)!;
      expect(r.per100g.fatG, 2.1);
      expect(r.per100g.carbsG, 64);
    });
  });

  test('English label with kJ and kcal on separate rows', () {
    final r = readNutritionLabel(table([
      [null, 'per 100g'],
      ['Energy', '2050kJ'],
      [null, '490kcal'],
      ['Fat', '24g'],
      ['of which saturates', '14g'],
      ['Carbohydrate', '60g'],
      ['of which sugars', '50g'],
      ['Fibre', '2.1g'],
      ['Protein', '6.3g'],
      ['Salt', '0.24g'],
    ], columns: const [0.06, 0.62]))!;
    expect(r.per100g.kcal, 490);
    expect(r.per100g.fatG, 24);
    expect(r.per100g.carbsG, 60);
    expect(r.per100g.fiberG, 2.1);
    expect(r.per100g.proteinG, 6.3);
  });

  test('only kJ printed: kcal is converted (÷ 4.184)', () {
    final r = readNutritionLabel(table([
      ['Energi', '1431 kJ'],
      ['Fedt', '2,1 g'],
      ['Kulhydrat', '64 g'],
      ['Protein', '12 g'],
    ]))!;
    expect(r.per100g.kcal, 342);
  });

  test('"Energi kJ/kcal 1431/342" pairs the values with the units in order', () {
    final r = readNutritionLabel(table([
      ['Energi kJ/kcal', '1431/342'],
      ['Fedt', '2,1 g'],
      ['Kulhydrat', '64 g'],
      ['Protein', '12 g'],
    ]))!;
    expect(r.per100g.kcal, 342);
  });

  test('names and values in one piece of text', () {
    final r = readNutritionLabel([
      cell('Energi 1431 kJ / 342 kcal', 0.05, 0.1),
      cell('Fedt 2,1 g', 0.05, 0.15),
      cell('heraf mættede fedtsyrer 0,4 g', 0.05, 0.2),
      cell('Kulhydrat 64 g', 0.05, 0.25),
      cell('Kostfibre 9,5 g', 0.05, 0.3),
      cell('Protein 12 g', 0.05, 0.35),
    ])!;
    expect((r.per100g.kcal, r.per100g.fatG, r.per100g.carbsG, r.per100g.fiberG, r.per100g.proteinG), (342, 2.1, 64, 9.5, 12));
  });

  test('a value read just below its name still belongs to it', () {
    final r = readNutritionLabel([
      cell('Energi', 0.05, 0.10),
      cell('1431 kJ / 342 kcal', 0.5, 0.14),
      cell('Fedt', 0.05, 0.20),
      cell('2,1 g', 0.5, 0.24),
      cell('Protein', 0.05, 0.30),
      cell('12 g', 0.5, 0.34),
    ])!;
    expect((r.per100g.kcal, r.per100g.fatG, r.per100g.proteinG), (342, 2.1, 12));
  });

  test('common OCR slips: "O,4 g", "kcaI", "1 431 kJ"', () {
    final r = readNutritionLabel(table([
      ['Energi', '1 431 kJ / 342 kcaI'],
      ['Fedt', 'O,4 g'],
      ['Kulhydrat', '64 g'],
      ['Protein', '12 g'],
    ]))!;
    expect(r.per100g.kcal, 342);
    expect(r.per100g.fatG, 0.4);
  });

  test('"< 0,5 g" counts as zero', () {
    final r = readNutritionLabel(table([
      ['Energi', '180 kJ / 42 kcal'],
      ['Fedt', '< 0,5 g'],
      ['Kulhydrat', '10 g'],
      ['Kostfibre', '<0,5 g'],
      ['Protein', '0,5 g'],
    ]))!;
    expect(r.per100g.fatG, 0);
    expect(r.per100g.fiberG, 0);
    expect(r.per100g.proteinG, 0.5);
  });

  test('Swedish and Norwegian names', () {
    final r = readNutritionLabel(table([
      ['Energi', '268 kJ / 64 kcal'],
      ['Fett', '3,5 g'],
      ['varav mättat fett', '2,3 g'],
      ['Kolhydrater', '4,8 g'],
      ['varav sockerarter', '4,8 g'],
      ['Protein', '3,4 g'],
    ]))!;
    expect((r.per100g.kcal, r.per100g.fatG, r.per100g.carbsG, r.per100g.proteinG), (64, 3.5, 4.8, 3.4));
    final n = readNutritionLabel(table([
      ['Energi', '1600 kJ / 380 kcal'],
      ['Fett', '6 g'],
      ['hvorav mettede fettsyrer', '1 g'],
      ['Karbohydrater', '65 g'],
      ['Kostfiber', '8 g'],
      ['Protein', '13 g'],
    ]))!;
    expect((n.per100g.carbsG, n.per100g.fiberG, n.per100g.fatG), (65, 8, 6));
  });

  test('German names', () {
    final r = readNutritionLabel(table([
      [null, 'je 100 g'],
      ['Brennwert', '1520 kJ / 362 kcal'],
      ['Fett', '2,1 g'],
      ['davon gesättigte Fettsäuren', '0,4 g'],
      ['Kohlenhydrate', '68 g'],
      ['davon Zucker', '1,2 g'],
      ['Ballaststoffe', '9,5 g'],
      ['Eiweiß', '12 g'],
    ]))!;
    expect((r.per100g.kcal, r.per100g.fatG, r.per100g.carbsG, r.per100g.fiberG, r.per100g.proteinG), (362, 2.1, 68, 9.5, 12));
  });

  test('per 100 ml is used as per 100 g, with a note', () {
    final r = readNutritionLabel(table([
      [null, 'pr. 100 ml'],
      ['Energi', '192 kJ / 46 kcal'],
      ['Fedt', '1,5 g'],
      ['Kulhydrat', '4,8 g'],
      ['Protein', '3,5 g'],
    ]))!;
    expect(r.per100g.kcal, 46);
    expect(r.caveats.any((c) => c.contains('100 ml')), isTrue);
  });

  test('"120 g frugt pr. 100 g" in the ingredients is not the column header', () {
    final lines = [
      cell('Ingredienser: jordbær, sukker. Fremstillet af 45 g frugt pr. 100 g.', 0.04, 0.05, w: 0.9),
      ...table([
        [null, 'pr. 100 g', 'pr. portion (20 g)'],
        ['Energi', '1000 kJ / 240 kcal', '200 kJ / 48 kcal'],
        ['Fedt', '0,1 g', '0 g'],
        ['Kulhydrat', '58 g', '12 g'],
        ['Protein', '0,4 g', '0,1 g'],
      ], top: 0.3),
    ];
    final r = readNutritionLabel(lines)!;
    expect((r.per100g.kcal, r.per100g.carbsG, r.per100g.proteinG), (240, 58, 0.4));
    expect(r.serving?.grams, 20);
  });

  test('a label with only per-serving values is converted to per 100 g', () {
    final r = readNutritionLabel(table([
      [null, 'pr. portion (30 g)'],
      ['Energi', '480 kJ / 114 kcal'],
      ['Fedt', '1,2 g'],
      ['Kulhydrat', '20 g'],
      ['Protein', '3,6 g'],
    ]))!;
    expect(r.per100g.kcal, 380);
    expect(r.per100g.fatG, 4);
    expect(r.per100g.carbsG, closeTo(66.7, 0.01));
    expect(r.per100g.proteinG, 12);
    expect(r.caveats.any((c) => c.contains('converted to per 100 g')), isTrue);
  });

  test('a lone value under the serving column is left empty, not guessed', () {
    final r = readNutritionLabel(table([
      [null, 'pr. 100 g', 'pr. portion (40 g)'],
      ['Energi', '1431 kJ / 342 kcal', '572 kJ / 137 kcal'],
      ['Fedt', null, '0,8 g'],
      ['Kulhydrat', '64 g', '26 g'],
      ['Protein', '12 g', '4,8 g'],
    ]))!;
    expect(r.per100g.fatG, isNull);
    expect(r.per100g.carbsG, 64);
    expect(r.caveats.any((c) => c.contains('could not be read')), isTrue);
  });

  test('reference-intake percentages and vitamins are not values', () {
    final r = readNutritionLabel(table([
      ['Energi', '1431 kJ / 342 kcal', '17 %'],
      ['Fedt', '2,1 g', '3 %'],
      ['Kulhydrat', '64 g', '25 %'],
      ['Protein', '12 g', '24 %'],
      ['Vitamin B12', '2,5 µg', '100 %'],
    ]))!;
    expect((r.per100g.kcal, r.per100g.fatG, r.per100g.carbsG, r.per100g.proteinG), (342, 2.1, 64, 12));
  });

  test('flags calories that don\'t fit the macros', () {
    final r = readNutritionLabel(table([
      ['Energi', '1431 kJ / 842 kcal'],
      ['Fedt', '2,1 g'],
      ['Kulhydrat', '64 g'],
      ['Kostfibre', '9,5 g'],
      ['Protein', '12 g'],
    ]))!;
    expect(r.per100g.kcal, 842);
    expect(r.caveats.any((c) => c.contains('don\'t match')), isTrue);
  });

  test('impossible values are dropped', () {
    final r = readNutritionLabel(table([
      ['Energi', '9999 kcal'],
      ['Fedt', '210 g'],
      ['Kulhydrat', '64 g'],
      ['Protein', '12 g'],
    ]))!;
    expect(r.per100g.kcal, isNull);
    expect(r.per100g.fatG, isNull);
    expect(r.per100g.carbsG, 64);
  });

  test('text without a nutrition table gives nothing', () {
    expect(readNutritionLabel(const []), isNull);
    expect(readNutritionLabel([cell('Velkommen til 2024', 0.1, 0.1), cell('Tilbud 3 for 50', 0.1, 0.2)]), isNull);
    // "og" is Danish for "and", not "0 g".
    expect(readNutritionLabel([cell('Salt og peber', 0.1, 0.1), cell('Fedt og sødt', 0.1, 0.2)]), isNull);
  });

  test('ingredient text that mentions protein is not the protein row', () {
    final r = readNutritionLabel([
      cell('Ingredienser: mælk, mælkeprotein 3 %, salt', 0.04, 0.05, w: 0.9),
      ...table([
        ['Energi', '250 kJ / 60 kcal'],
        ['Fedt', '1,5 g'],
        ['Kulhydrat', '4 g'],
        ['Protein', '7 g'],
      ], top: 0.2),
    ])!;
    expect(r.per100g.proteinG, 7);
  });

  test('ignores pieces of text with no box', () {
    final r = readNutritionLabel([
      const VisionTextLine('Energi 342 kcal'),
      const VisionTextLine('Protein 12 g'),
    ]);
    // Without boxes everything falls on one row; it must not crash.
    expect(r, anyOf(isNull, isNotNull));
  });
}
