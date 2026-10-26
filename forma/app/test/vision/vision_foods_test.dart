import 'dart:io';

import 'package:flutter_test/flutter_test.dart';
import 'package:forma/features/nutrition/vision/vision_foods.dart';
import 'package:forma/features/nutrition/vision/vision_result.dart';

import '../helpers.dart';

void main() {
  final foods = testContentBundle().foods;
  final matcher = VisionFoodMatcher(foods);
  // Every label Apple Vision can return (listed by tool/vision/main.swift in CI).
  final appleLabels = File('test/vision/fixtures/vision_identifiers.txt').readAsLinesSync().where((l) => l.isNotEmpty).toSet();

  test('every mapped label is one Apple Vision really returns', () {
    expect(appleLabels.length, 1303);
    expect(visionFoodQueries.keys.where((k) => !appleLabels.contains(k)), isEmpty);
    expect(visionGenericFood.where((k) => !appleLabels.contains(k)), isEmpty);
    expect(visionDocument.where((k) => !appleLabels.contains(k)), isEmpty);
  });

  test('every mapped label finds at least one reference food', () {
    final empty = [
      for (final e in visionFoodQueries.entries)
        if (matcher.suggest([VisionLabel(e.key, 0.9)]).isEmpty) e.key,
    ];
    expect(empty, isEmpty);
  });

  test('searches whole words: "is" finds ice cream, not every food containing "is"', () {
    final hits = matcher.search('is', limit: 10);
    expect(hits, isNotEmpty);
    for (final f in hits) {
      final words = '${f.name} ${f.aliases.join(' ')}'.toLowerCase().split(RegExp(r'[^a-zæøå]+'));
      expect(words.any((w) => w.startsWith('is')), isTrue, reason: f.name);
    }
    expect(hits.first.name.toLowerCase(), startsWith('is'));
  });

  test('a plain food comes before dishes that contain it', () {
    expect(matcher.search('banan').first.name, 'Banan, rå');
    expect(matcher.search('agurk').first.name, 'Agurk, rå');
  });

  test('pizza photo → pizzas', () {
    final groups = matcher.suggest([const VisionLabel('pizza', 0.83), const VisionLabel('food', 0.9)]);
    expect(groups, hasLength(1));
    expect(groups.single.title, 'Pizza');
    expect(groups.single.foods, hasLength(4));
    expect(groups.single.foods.every((f) => '${f.name} ${f.aliases.join(' ')}'.toLowerCase().contains('pizza')), isTrue);
  });

  test('eggs suggest hen eggs and the Danish meals', () {
    final groups = matcher.suggest([const VisionLabel('fried_egg', 0.7), const VisionLabel('bacon', 0.5), const VisionLabel('egg', 0.4)]);
    expect(groups.map((g) => g.title), ['Spejlæg', 'Bacon', 'Æg']);
    expect(groups.first.foods.first.name, contains('spejlæg'));
    expect(groups.last.foods.every((f) => f.name.startsWith('Æg') || f.name.contains('æg')), isTrue);
  });

  test('a food is listed once, under the most confident label', () {
    final groups = matcher.suggest([const VisionLabel('egg', 0.8), const VisionLabel('fried_egg', 0.6)]);
    final ids = [for (final g in groups) ...g.foods.map((f) => f.id)];
    expect(ids.toSet().length, ids.length);
  });

  test('ignores generic, non-food and unsure labels', () {
    expect(matcher.suggest([const VisionLabel('food', 0.9), const VisionLabel('kitchen', 0.8), const VisionLabel('table', 0.7)]), isEmpty);
    expect(matcher.suggest([const VisionLabel('pizza', 0.05)]), isEmpty);
  });

  test('caps the number of groups', () {
    final labels = [for (final k in visionFoodQueries.keys.take(12)) VisionLabel(k, 0.5)];
    expect(matcher.suggest(labels, maxGroups: 5), hasLength(5));
  });

  test('Danish everyday foods are found', () {
    for (final (label, expected) in [
      ('bread', 'rugbrød'),
      ('meatball', 'frikadelle'),
      ('oatmeal', 'havregrød'),
      ('rice', 'ris'),
      ('potato', 'kartoffel'),
      ('salmon', 'laks'),
      ('pastry', 'wienerbrød'),
      ('yogurt', 'yoghurt'),
    ]) {
      final foods = matcher.suggest([VisionLabel(label, 0.6)]).single.foods;
      expect(foods.first.name.toLowerCase(), contains(expected), reason: label);
    }
  });
}
