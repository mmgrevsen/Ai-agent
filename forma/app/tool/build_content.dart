// Builds (or checks) a content bundle from the files in assets/.
//
//   dart run tool/build_content.dart --check
//   dart run tool/build_content.dart --out build/content.json [--version N]
//   dart run tool/build_content.dart --from content-v123.json --out build/content.json   (rollback)
//
// The version defaults to the current UTC time (yyyymmddHHMM), so a later
// publish always wins, including a rollback that republishes old content.
// Validation is the same code the app runs before activating a bundle.
import 'dart:convert';
import 'dart:io';

import 'package:forma/content/content_bundle.dart';

int timestampVersion(DateTime t) {
  final u = t.toUtc();
  String two(int v) => v.toString().padLeft(2, '0');
  return int.parse('${u.year}${two(u.month)}${two(u.day)}${two(u.hour)}${two(u.minute)}');
}

void main(List<String> args) {
  String? opt(String name) {
    final i = args.indexOf(name);
    return i >= 0 && i + 1 < args.length ? args[i + 1] : null;
  }

  final check = args.contains('--check');
  final out = opt('--out');
  final from = opt('--from');
  final version = int.tryParse(opt('--version') ?? '') ?? timestampVersion(DateTime.now());
  if (!check && out == null) {
    stderr.writeln('Usage: dart run tool/build_content.dart (--check | --out FILE) [--version N] [--from OLD_BUNDLE]');
    exit(64);
  }

  try {
    final Map<String, dynamic> sections;
    String? notes;
    var minAppBuild = 0;
    if (from != null) {
      final old = ContentBundle.parse(jsonDecode(File(from).readAsStringSync()));
      sections = old.sections;
      minAppBuild = old.minAppBuild;
      notes = 'Rollback to content ${old.version}';
    } else {
      sections = assembleSections({for (final e in kContentFiles.entries) e.key: File(e.value).readAsStringSync()});
      final release = jsonDecode(File('assets/content/release.json').readAsStringSync()) as Map<String, dynamic>;
      minAppBuild = release['minAppBuild'] as int? ?? 0;
      notes = release['notes'] as String?;
    }
    final bundle = ContentBundle.create(sections: sections, version: version, minAppBuild: minAppBuild, createdAt: DateTime.now(), notes: notes);
    stdout.writeln('Content OK: ${bundle.exercises.length} exercises, ${bundle.programs.layouts.length} program layouts, '
        '${bundle.foods.length} reference foods, ${bundle.config.flags.length} flags. Version ${bundle.version}, '
        'min app build ${bundle.minAppBuild}.');
    if (out != null) {
      File(out)
        ..createSync(recursive: true)
        ..writeAsStringSync(jsonEncode(bundle.toJson()));
      stdout.writeln('Wrote $out (sha256 ${bundle.checksum.substring(0, 12)}…)');
    }
  } on ContentValidationException catch (e) {
    stderr.writeln('Content is invalid:');
    for (final err in e.errors) {
      stderr.writeln('  • $err');
    }
    exit(1);
  } on FileSystemException catch (e) {
    stderr.writeln('Could not read ${e.path}: ${e.message}');
    exit(1);
  }
}
