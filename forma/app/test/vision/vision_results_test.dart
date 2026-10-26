// Checks the app's reading of real Apple Vision output. CI produces the
// results on a Mac (.github/workflows/forma-vision.yml) and points
// FORMA_VISION_OUT at them; without it these tests are skipped.
import 'dart:convert';
import 'dart:io';

import 'package:flutter_test/flutter_test.dart';

void main() {
  final dir = Platform.environment['FORMA_VISION_OUT'];
  final skip = dir == null ? 'Set FORMA_VISION_OUT to run (CI on a Mac does)' : null;

  test('dumps Vision results', () {
    final files = Directory(dir!).listSync().whereType<File>().where((f) => f.path.endsWith('.json') && !f.path.endsWith('expected.json')).toList()
      ..sort((a, b) => a.path.compareTo(b.path));
    for (final f in files) {
      final j = jsonDecode(f.readAsStringSync()) as Map<String, dynamic>;
      final labels = [for (final l in j['labels'] as List) '${l['id']} ${(l['confidence'] as num).toStringAsFixed(2)}'];
      final lines = [for (final l in j['lines'] as List) l['text']];
      // ignore: avoid_print
      print('${f.uri.pathSegments.last}\n  labels: ${labels.take(10).join(', ')}\n  text: ${lines.take(40).join(' | ')}');
    }
    expect(files, isNotEmpty);
  }, skip: skip);
}
