// Checks the app's reading of real Apple Vision output. CI produces it on a
// Mac (.github/workflows/forma-vision.yml: the committed fixtures plus real
// food photos and nutrition labels downloaded for the run) and points
// FORMA_VISION_OUT at it; without it these tests are skipped.
// ignore_for_file: avoid_print
import 'dart:convert';
import 'dart:io';

import 'package:flutter_test/flutter_test.dart';
import 'package:forma/features/nutrition/vision/label_reader.dart';
import 'package:forma/features/nutrition/vision/scale_reader.dart';
import 'package:forma/features/nutrition/vision/vision_foods.dart';
import 'package:forma/features/nutrition/vision/vision_result.dart';

import '../helpers.dart';

void main() {
  final dir = Platform.environment['FORMA_VISION_OUT'];
  final skip = dir == null ? 'Set FORMA_VISION_OUT to run (CI on a Mac does)' : null;

  VisionResult result(String name) =>
      VisionResult.fromJson(jsonDecode(File('$dir/$name.json').readAsStringSync()) as Map<String, dynamic>);
  Map<String, dynamic> expected() {
    final f = File('$dir/expected.json');
    return f.existsSync() ? jsonDecode(f.readAsStringSync()) as Map<String, dynamic> : const {};
  }

  group('committed test photos', () {
    test('Danish nutrition table', () {
      final r = readNutritionLabel(result('label_da_table').lines)!;
      expect((r.per100g.kcal, r.per100g.fatG, r.per100g.carbsG, r.per100g.fiberG, r.per100g.proteinG), (342, 2.1, 64, 9.5, 12));
      expect(r.serving?.grams, 40);
    }, skip: skip);

    test('English nutrition table', () {
      final r = readNutritionLabel(result('label_en_rows').lines)!;
      expect((r.per100g.kcal, r.per100g.fatG, r.per100g.carbsG, r.per100g.fiberG, r.per100g.proteinG), (490, 24, 60, 2.1, 6.3));
    }, skip: skip);

    test('kitchen scale display', () {
      expect(readScale(result('scale_245g').lines)?.grams, 245);
    }, skip: skip);
  });

  test('real food photos: the right food is among the suggestions', () {
    final foods = (expected()['foods'] as Map<String, dynamic>? ?? const {});
    if (foods.isEmpty) {
      print('No food photos could be downloaded for this run.');
      return;
    }
    final matcher = VisionFoodMatcher(testContentBundle().foods);
    var hits = 0;
    for (final MapEntry(key: file, value: words) in foods.entries) {
      final r = result(file.replaceAll('.jpg', ''));
      final groups = matcher.suggest(r.labels);
      final names = [for (final g in groups) ...[g.title, ...g.foods.map((f) => '${f.name} ${f.aliases.join(' ')}')]].join(' | ').toLowerCase();
      final hit = (words as List).any((w) => names.contains((w as String).toLowerCase()));
      if (hit) hits++;
      print('${hit ? 'OK  ' : 'MISS'} $file\n     Vision: ${r.labels.take(6).join(', ')}\n     Forma: ${[for (final g in groups) '${g.title}: ${g.foods.take(2).map((f) => f.name).join('; ')}'].join(' / ')}');
    }
    final rate = hits / foods.length;
    print('Food photos: $hits of ${foods.length} (${(rate * 100).round()} %) had the right food among the suggestions.');
    expect(rate, greaterThanOrEqualTo(0.5));
  }, skip: skip);

  test('real nutrition labels (Open Food Facts): values match the product data', () {
    final labels = (expected()['labels'] as Map<String, dynamic>? ?? const {});
    if (labels.isEmpty) {
      print('No label photos could be downloaded for this run.');
      return;
    }
    var read = 0;
    var correct = 0;
    var wrong = 0;
    var total = 0;
    bool close(double? got, num want, {double abs = 0.6, double rel = 0.05}) => got != null && (got - want).abs() <= abs + want.abs() * rel;
    for (final MapEntry(key: file, value: v) in labels.entries) {
      final want = v as Map<String, dynamic>;
      final r = readNutritionLabel(result(file.replaceAll('.jpg', '')).lines);
      final got = <String, double?>{
        'kcal': r?.per100g.kcal,
        'protein': r?.per100g.proteinG,
        'carbs': r?.per100g.carbsG,
        'fat': r?.per100g.fatG,
      };
      if (r != null) read++;
      final marks = <String>[];
      for (final k in got.keys) {
        total++;
        final ok = close(got[k], want[k] as num, abs: k == 'kcal' ? 3 : 0.6);
        if (ok) {
          correct++;
        } else if (got[k] != null) {
          wrong++;
        }
        marks.add('$k ${got[k] ?? '–'}${ok ? '' : ' (label ${want[k]})'}');
      }
      print('$file ${want['product']}: ${marks.join(', ')}');
    }
    print('Labels: read $read of ${labels.length}; $correct of $total values right, $wrong wrong, ${total - correct - wrong} left empty.');
    // A value that is filled in must almost always be right; empty is fine.
    expect(wrong, lessThanOrEqualTo((correct + wrong) * 0.1));
  }, skip: skip);
}
