import 'dart:convert';
import 'dart:io';

import 'package:path/path.dart' as p;
import 'package:path_provider/path_provider.dart';

import '../data/db/app_database.dart';

/// Exports every personal table as JSON. Bundled library exercises are
/// omitted; custom exercises are included.
class ExportService {
  ExportService(this.db);
  final AppDatabase db;

  Future<Map<String, dynamic>> collect() async {
    final tables = <String, dynamic>{};
    for (final t in db.syncedTables) {
      final name = t.actualTableName;
      final where = name == 'exercises' ? ' WHERE is_custom = 1' : '';
      final rows = await db.customSelect('SELECT * FROM "$name"$where').get();
      tables[name] = [
        for (final r in rows) {for (final e in r.data.entries) if (e.key != 'dirty') e.key: e.value},
      ];
    }
    return {
      'format': 'forma-export',
      'version': 1,
      'exportedAt': DateTime.now().toUtc().toIso8601String(),
      'notes': 'Weights are in kilograms, energy in kcal, nutrients in grams. '
          '"provenance" and "source" columns describe where each value came from. '
          'Rows with deleted_at set were deleted in the app.',
      'tables': tables,
    };
  }

  Future<File> writeFile() async {
    final data = await collect();
    final dir = await getTemporaryDirectory();
    final stamp = DateTime.now().toIso8601String().substring(0, 10);
    final file = File(p.join(dir.path, 'forma-export-$stamp.json'));
    await file.writeAsString(const JsonEncoder.withIndent('  ').convert(data));
    return file;
  }
}
