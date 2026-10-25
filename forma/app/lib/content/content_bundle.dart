// Server-updatable content: the versioned bundle format, its validation and
// the typed sections the app reads. Pure Dart (no Flutter imports) so the
// publishing tool in `tool/` runs the exact same checks as the app.
import 'dart:convert';

import 'package:crypto/crypto.dart';

import '../domain/training/models.dart' show ProgressionTuning;

export '../domain/training/models.dart' show ProgressionTuning;

/// Highest bundle format this build understands. Bump it (and keep reading
/// older formats) when the structure changes incompatibly.
const kContentFormat = 1;

class ContentValidationException implements Exception {
  ContentValidationException(this.errors);
  final List<String> errors;

  @override
  String toString() => 'Invalid content: ${errors.take(5).join('; ')}${errors.length > 5 ? ' (+${errors.length - 5} more)' : ''}';
}

/// JSON with sorted object keys, so the checksum doesn't depend on key order.
String canonicalJson(Object? value) => jsonEncode(_sorted(value));

Object? _sorted(Object? v) => switch (v) {
      final Map<dynamic, dynamic> m => {for (final k in (m.keys.map((k) => '$k').toList()..sort())) k: _sorted(m[k])},
      final List<dynamic> l => [for (final x in l) _sorted(x)],
      _ => v,
    };

String sectionsChecksum(Map<String, dynamic> sections) => sha256.convert(utf8.encode(canonicalJson(sections))).toString();

// ---------------------------------------------------------------- sections

const _trackingTypes = {'weight_reps', 'bodyweight_reps', 'duration', 'distance_duration', 'weight_distance'};
final _idPattern = RegExp(r'^[a-z0-9]+(-[a-z0-9]+)*$');

/// Program templates and prescriptions used by the starter-program generator.
class ProgramCatalog {
  const ProgramCatalog({
    required this.slots,
    required this.compoundSlots,
    required this.layouts,
    required this.weekdays,
    required this.repRanges,
    required this.setsByExperience,
    required this.isolationSets,
    required this.compoundRpe,
    required this.isolationRpe,
    required this.restStrengthCompound,
    required this.restCompound,
    required this.restIsolation,
    required this.barbellWarmupSets,
  });

  /// Movement slot → exercise ids in order of preference.
  final Map<String, List<String>> slots;
  final Set<String> compoundSlots;
  final List<ProgramLayout> layouts;

  /// Days per week → weekdays (1 = Monday).
  final Map<int, List<int>> weekdays;

  /// goal code (or "default") → (compound, isolation) rep ranges.
  final Map<String, ({(int, int) compound, (int, int) isolation})> repRanges;
  final Map<String, int> setsByExperience;
  final int isolationSets;
  final double compoundRpe;
  final double isolationRpe;
  final int restStrengthCompound;
  final int restCompound;
  final int restIsolation;
  final int barbellWarmupSets;

  ProgramLayout layoutFor(int days) => layouts.firstWhere((l) => l.days.contains(days));

  (int, int) repRange(String goalCode, {required bool compound}) {
    final r = repRanges[goalCode] ?? repRanges['default']!;
    return compound ? r.compound : r.isolation;
  }

  static ProgramCatalog parse(Object? raw, Set<String> exerciseIds, List<String> errors) {
    final j = raw is Map ? raw : const {};
    final slots = <String, List<String>>{};
    final rawSlots = j['slots'];
    if (rawSlots is! Map || rawSlots.isEmpty) errors.add('programs.slots must be a non-empty object');
    for (final e in (rawSlots is Map ? rawSlots.entries : const <MapEntry<dynamic, dynamic>>[])) {
      final ids = e.value is List ? [for (final x in e.value as List) '$x'] : <String>[];
      if (ids.isEmpty) errors.add('programs.slots.${e.key} has no exercises');
      for (final id in ids) {
        if (!exerciseIds.contains(id)) errors.add('programs.slots.${e.key} uses unknown exercise "$id"');
      }
      slots['${e.key}'] = ids;
    }
    final compound = {for (final s in (j['compoundSlots'] is List ? j['compoundSlots'] as List : const [])) '$s'};
    for (final s in compound) {
      if (!slots.containsKey(s)) errors.add('programs.compoundSlots has unknown slot "$s"');
    }

    final layouts = <ProgramLayout>[];
    for (final (i, l) in (j['layouts'] is List ? j['layouts'] as List : const []).indexed) {
      final layout = ProgramLayout.parse(l, 'programs.layouts[$i]', slots.keys.toSet(), errors);
      if (layout != null) layouts.add(layout);
    }
    final weekdays = <int, List<int>>{};
    final rawWeekdays = j['weekdays'] is Map ? j['weekdays'] as Map : const {};
    for (var d = 1; d <= 6; d++) {
      final covering = layouts.where((l) => l.days.contains(d)).length;
      if (covering != 1) errors.add('programs.layouts must cover $d day(s) per week exactly once (found $covering)');
      final w = rawWeekdays['$d'];
      final list = w is List ? [for (final x in w) if (x is int) x] : <int>[];
      if (list.length != d || list.any((x) => x < 1 || x > 7) || list.toSet().length != d) {
        errors.add('programs.weekdays.$d must list $d different weekdays (1–7)');
      }
      weekdays[d] = list;
    }

    (int, int)? range(Object? v, String path) {
      if (v is List && v.length == 2 && v[0] is int && v[1] is int) {
        final (a, b) = (v[0] as int, v[1] as int);
        if (a >= 1 && a <= b && b <= 50) return (a, b);
      }
      errors.add('$path must be [min, max] with 1 ≤ min ≤ max ≤ 50');
      return null;
    }

    final repRanges = <String, ({(int, int) compound, (int, int) isolation})>{};
    final rawRanges = j['repRanges'] is Map ? j['repRanges'] as Map : const {};
    if (!rawRanges.containsKey('default')) errors.add('programs.repRanges.default is required');
    for (final e in rawRanges.entries) {
      final m = e.value is Map ? e.value as Map : const {};
      final c = range(m['compound'], 'programs.repRanges.${e.key}.compound');
      final iso = range(m['isolation'], 'programs.repRanges.${e.key}.isolation');
      if (c != null && iso != null) repRanges['${e.key}'] = (compound: c, isolation: iso);
    }

    final p = j['prescription'] is Map ? j['prescription'] as Map : const {};
    int intIn(String key, int min, int max) {
      final v = p[key];
      if (v is int && v >= min && v <= max) return v;
      errors.add('programs.prescription.$key must be a whole number from $min to $max');
      return min;
    }

    double numIn(String key, double min, double max) {
      final v = p[key];
      if (v is num && v >= min && v <= max) return v.toDouble();
      errors.add('programs.prescription.$key must be between $min and $max');
      return min;
    }

    final sets = <String, int>{};
    final rawSets = p['setsByExperience'] is Map ? p['setsByExperience'] as Map : const {};
    for (final level in const ['beginner', 'intermediate', 'advanced']) {
      final v = rawSets[level];
      if (v is int && v >= 1 && v <= 8) {
        sets[level] = v;
      } else {
        errors.add('programs.prescription.setsByExperience.$level must be 1–8');
      }
    }
    return ProgramCatalog(
      slots: slots,
      compoundSlots: compound,
      layouts: layouts,
      weekdays: weekdays,
      repRanges: repRanges,
      setsByExperience: sets,
      isolationSets: intIn('isolationSets', 1, 8),
      compoundRpe: numIn('compoundRpe', 6, 10),
      isolationRpe: numIn('isolationRpe', 6, 10),
      restStrengthCompound: intIn('restStrengthCompound', 30, 600),
      restCompound: intIn('restCompound', 30, 600),
      restIsolation: intIn('restIsolation', 30, 600),
      barbellWarmupSets: intIn('barbellWarmupSets', 0, 5),
    );
  }
}

class ProgramLayout {
  const ProgramLayout({required this.days, required this.name, required this.nameByDays, required this.templates});
  final Set<int> days;
  final String name;
  final Map<int, String> nameByDays;
  final List<({String name, List<String> slots})> templates;

  String nameFor(int days) => nameByDays[days] ?? name;

  static ProgramLayout? parse(Object? raw, String path, Set<String> slotNames, List<String> errors) {
    if (raw is! Map) {
      errors.add('$path must be an object');
      return null;
    }
    final days = {for (final d in (raw['days'] is List ? raw['days'] as List : const [])) if (d is int) d};
    if (days.isEmpty || days.any((d) => d < 1 || d > 6)) errors.add('$path.days must list days per week (1–6)');
    final name = raw['name'];
    if (name is! String || name.trim().isEmpty) errors.add('$path.name is required');
    final templates = <({String name, List<String> slots})>[];
    for (final (i, t) in (raw['templates'] is List ? raw['templates'] as List : const []).indexed) {
      final tn = t is Map ? t['name'] : null;
      final ts = t is Map && t['slots'] is List ? [for (final s in t['slots'] as List) '$s'] : <String>[];
      if (tn is! String || tn.trim().isEmpty || ts.isEmpty) {
        errors.add('$path.templates[$i] needs a name and slots');
        continue;
      }
      for (final s in ts) {
        if (!slotNames.contains(s)) errors.add('$path.templates[$i] uses unknown slot "$s"');
      }
      templates.add((name: tn, slots: ts));
    }
    if (templates.isEmpty) errors.add('$path needs at least one template');
    final byDays = <int, String>{};
    if (raw['nameByDays'] is Map) {
      for (final e in (raw['nameByDays'] as Map).entries) {
        final d = int.tryParse('${e.key}');
        if (d != null && e.value is String) byDays[d] = e.value as String;
      }
    }
    return ProgramLayout(days: days, name: name is String ? name : '', nameByDays: byDays, templates: templates);
  }
}

/// Reads the bounded progression knobs (see [ProgressionTuning]).
ProgressionTuning parseProgressionTuning(Object? raw, List<String> errors) {
  final j = raw is Map ? raw : const {};
  double d(String k, double min, double max, double fallback) {
    final v = j[k];
    if (v == null) return fallback;
    if (v is num && v >= min && v <= max) return v.toDouble();
    errors.add('progression.$k must be between $min and $max');
    return fallback;
  }

  final plateau = j['plateauSessions'];
  if (plateau != null && (plateau is! int || plateau < 2 || plateau > 6)) errors.add('progression.plateauSessions must be 2–6');
  return ProgressionTuning(
    deloadFactor: d('deloadFactor', 0.8, 0.95, 0.9),
    plateauSessions: plateau is int && plateau >= 2 && plateau <= 6 ? plateau : 3,
    deloadSetFactor: d('deloadSetFactor', 0.4, 0.8, 0.6),
  );
}

/// A reference food with values from a named, citable data source.
class ContentFood {
  const ContentFood({
    required this.id,
    required this.name,
    required this.reference,
    required this.provenance,
    required this.kcal,
    required this.protein,
    required this.carbs,
    required this.fat,
    required this.fiber,
    this.brand,
    this.servings = const [],
  });

  final String id;
  final String name;
  final String? brand;

  /// Where the values come from, e.g. "Frida 2024, food 123".
  final String reference;

  /// verified | community
  final String provenance;
  final double? kcal, protein, carbs, fat, fiber;
  final List<({String label, double grams})> servings;

  /// Matches a search the same way local foods are matched.
  bool matches(String query) {
    final q = query.trim().toLowerCase();
    return name.toLowerCase().contains(q) || (brand?.toLowerCase().contains(q) ?? false);
  }

  static List<ContentFood> parse(Object? raw, List<String> errors) {
    final list = raw is Map && raw['foods'] is List ? raw['foods'] as List : const [];
    final seen = <String>{};
    final out = <ContentFood>[];
    for (final (i, f) in list.indexed) {
      final path = 'foods[$i]';
      if (f is! Map) {
        errors.add('$path must be an object');
        continue;
      }
      final id = f['id'], name = f['name'], ref = f['reference'], prov = f['provenance'];
      if (id is! String || !_idPattern.hasMatch(id) || !seen.add(id)) errors.add('$path.id must be a unique lowercase-dashed id');
      if (name is! String || name.trim().isEmpty) errors.add('$path.name is required');
      if (ref is! String || ref.trim().isEmpty) errors.add('$path.reference must name the data source (no unsourced values)');
      if (prov != 'verified' && prov != 'community') errors.add('$path.provenance must be "verified" or "community"');
      final per = f['per100g'] is Map ? f['per100g'] as Map : const {};
      double? n(String k, double max) {
        final v = per[k];
        if (v == null) return null;
        if (v is num && v >= 0 && v <= max) return v.toDouble();
        errors.add('$path.per100g.$k must be 0–$max or null');
        return null;
      }

      final kcal = n('kcal', 900), p = n('protein', 100), c = n('carbs', 100), fat = n('fat', 100), fib = n('fiber', 100);
      if ((p ?? 0) + (c ?? 0) + (fat ?? 0) + (fib ?? 0) > 105) errors.add('$path macros exceed 100 g per 100 g');
      final servings = <({String label, double grams})>[];
      for (final s in (f['servings'] is List ? f['servings'] as List : const [])) {
        if (s is Map && s['label'] is String && s['grams'] is num && (s['grams'] as num) > 0 && (s['grams'] as num) <= 2000) {
          servings.add((label: s['label'] as String, grams: (s['grams'] as num).toDouble()));
        } else {
          errors.add('$path.servings entries need a label and 0–2000 g');
        }
      }
      if (id is String && name is String && ref is String && prov is String) {
        out.add(ContentFood(
          id: id,
          name: name.trim(),
          brand: f['brand'] is String ? f['brand'] as String : null,
          reference: ref,
          provenance: prov,
          kcal: kcal,
          protein: p,
          carbs: c,
          fat: fat,
          fiber: fib,
          servings: servings,
        ));
      }
    }
    return out;
  }
}

/// A message shown on the Overview until [until] (or until dismissed).
class Announcement {
  const Announcement({required this.id, required this.title, required this.body, this.until});
  final String id;
  final String title;
  final String body;
  final DateTime? until;
}

/// Server-controlled switches and texts.
class AppConfig {
  const AppConfig({this.flags = const {}, this.announcement, this.coachSuggestions = const []});
  final Map<String, bool> flags;
  final Announcement? announcement;
  final List<String> coachSuggestions;

  /// Unknown flags default to on, so an older bundle never hides a feature.
  bool flag(String name) => flags[name] ?? true;

  static AppConfig parse(Object? config, Object? coach, List<String> errors) {
    final c = config is Map ? config : const {};
    final flags = <String, bool>{};
    if (c['flags'] is Map) {
      for (final e in (c['flags'] as Map).entries) {
        if (e.value is bool) {
          flags['${e.key}'] = e.value as bool;
        } else {
          errors.add('config.flags.${e.key} must be true or false');
        }
      }
    }
    Announcement? announcement;
    final a = c['announcement'];
    if (a is Map) {
      final id = a['id'], title = a['title'], body = a['body'], until = a['until'];
      final untilDate = until is String ? DateTime.tryParse(until) : null;
      if (id is! String || id.isEmpty || title is! String || title.trim().isEmpty || title.length > 60 || body is! String || body.length > 400) {
        errors.add('config.announcement needs an id, a title (≤ 60 chars) and a body (≤ 400 chars)');
      } else if (until != null && untilDate == null) {
        errors.add('config.announcement.until must be an ISO date');
      } else {
        announcement = Announcement(id: id, title: title.trim(), body: body.trim(), until: untilDate);
      }
    } else if (a != null) {
      errors.add('config.announcement must be an object or null');
    }
    final k = coach is Map ? coach : const {};
    final suggestions = [for (final s in (k['suggestions'] is List ? k['suggestions'] as List : const [])) if (s is String && s.trim().isNotEmpty) s.trim()];
    if (suggestions.length > 8 || suggestions.any((s) => s.length > 80)) errors.add('coach.suggestions: at most 8, each ≤ 80 characters');
    return AppConfig(flags: flags, announcement: announcement, coachSuggestions: suggestions.take(8).toList());
  }
}

/// Validates the exercise list (same item format as `assets/exercises.json`).
List<Map<String, dynamic>> parseExercises(Object? raw, List<String> errors) {
  final list = raw is Map && raw['exercises'] is List ? raw['exercises'] as List : null;
  if (list == null || list.isEmpty) {
    errors.add('exercises.exercises must be a non-empty list');
    return const [];
  }
  final seen = <String>{};
  final out = <Map<String, dynamic>>[];
  for (final (i, e) in list.indexed) {
    final path = 'exercises[$i]';
    if (e is! Map) {
      errors.add('$path must be an object');
      continue;
    }
    final before = errors.length;
    final id = e['id'];
    if (id is! String || !_idPattern.hasMatch(id) || !seen.add(id)) errors.add('$path.id must be a unique lowercase-dashed id');
    for (final k in const ['name', 'primary', 'pattern']) {
      if (e[k] is! String || (e[k] as String).trim().isEmpty) errors.add('$path.$k is required');
    }
    if (e['mechanic'] != 'compound' && e['mechanic'] != 'isolation') errors.add('$path.mechanic must be compound or isolation');
    if (!_trackingTypes.contains(e['tracking'])) errors.add('$path.tracking must be one of $_trackingTypes');
    for (final k in const ['secondary', 'equipment', 'instructions']) {
      if (e[k] is! List || (e[k] as List).any((x) => x is! String)) errors.add('$path.$k must be a list of text');
    }
    if (errors.length == before) out.add(Map<String, dynamic>.from(e));
  }
  return out;
}

// ---------------------------------------------------------------- bundle

/// A validated, versioned set of server-updatable content.
class ContentBundle {
  const ContentBundle({
    required this.format,
    required this.version,
    required this.minAppBuild,
    required this.sections,
    required this.checksum,
    required this.exercises,
    required this.programs,
    required this.progression,
    required this.foods,
    required this.config,
    this.createdAt,
    this.notes,
  });

  final int format;

  /// Monotonic; a bundle is only activated if it is newer than the active one.
  final int version;

  /// Oldest app build that understands this content.
  final int minAppBuild;
  final DateTime? createdAt;
  final String? notes;

  /// The raw sections, kept for storage and checksum verification.
  final Map<String, dynamic> sections;
  final String checksum;

  final List<Map<String, dynamic>> exercises;
  final ProgramCatalog programs;
  final ProgressionTuning progression;
  final List<ContentFood> foods;
  final AppConfig config;

  Set<String> get exerciseIds => {for (final e in exercises) e['id'] as String};

  Map<String, dynamic> toJson() => {
        'format': format,
        'version': version,
        'minAppBuild': minAppBuild,
        'createdAt': ?createdAt?.toUtc().toIso8601String(),
        'notes': ?notes,
        'sections': sections,
        'sha256': checksum,
      };

  /// Builds a bundle from raw sections and stamps its checksum (publishing).
  static ContentBundle create({
    required Map<String, dynamic> sections,
    required int version,
    int minAppBuild = 0,
    DateTime? createdAt,
    String? notes,
  }) =>
      parse({
        'format': kContentFormat,
        'version': version,
        'minAppBuild': minAppBuild,
        'createdAt': ?createdAt?.toUtc().toIso8601String(),
        'notes': ?notes,
        'sections': sections,
        'sha256': sectionsChecksum(sections),
      });

  /// Parses and fully validates a bundle. Throws [ContentValidationException]
  /// listing every problem; nothing partial is ever returned.
  static ContentBundle parse(Object? raw) {
    final errors = <String>[];
    if (raw is! Map) throw ContentValidationException(['The bundle must be a JSON object']);
    final format = raw['format'];
    if (format is! int || format < 1) throw ContentValidationException(['format is missing']);
    if (format > kContentFormat) {
      throw ContentValidationException(['This content needs a newer version of the app (format $format)']);
    }
    final version = raw['version'];
    if (version is! int || version < 0) errors.add('version must be a whole number ≥ 0');
    final minAppBuild = raw['minAppBuild'] ?? 0;
    if (minAppBuild is! int || minAppBuild < 0) errors.add('minAppBuild must be a whole number ≥ 0');
    final sections = raw['sections'];
    if (sections is! Map) throw ContentValidationException([...errors, 'sections are missing']);
    final s = Map<String, dynamic>.from(sections);
    final checksum = raw['sha256'];
    if (checksum is! String || checksum != sectionsChecksum(s)) errors.add('checksum mismatch — the content is corrupt or was edited after publishing');

    final exercises = parseExercises(s['exercises'], errors);
    final ids = {for (final e in exercises) e['id'] as String};
    final programs = ProgramCatalog.parse(s['programs'], ids, errors);
    final progression = parseProgressionTuning(s['progression'], errors);
    final foods = ContentFood.parse(s['foods'], errors);
    final config = AppConfig.parse(s['config'], s['coach'], errors);
    if (errors.isNotEmpty) throw ContentValidationException(errors);
    final created = raw['createdAt'];
    return ContentBundle(
      format: format,
      version: version as int,
      minAppBuild: minAppBuild as int,
      createdAt: created is String ? DateTime.tryParse(created) : null,
      notes: raw['notes'] is String ? raw['notes'] as String : null,
      sections: s,
      checksum: checksum as String,
      exercises: exercises,
      programs: programs,
      progression: progression,
      foods: foods,
      config: config,
    );
  }
}

// ---------------------------------------------------------------- sources

/// Section name → file under `assets/` that holds its source. The same files
/// are bundled into the app (offline baseline) and published as updates.
const kContentFiles = {
  'exercises': 'assets/exercises.json',
  'programs': 'assets/content/programs.json',
  'progression': 'assets/content/progression.json',
  'foods': 'assets/content/foods.json',
  'coach': 'assets/content/coach.json',
  'config': 'assets/content/config.json',
};

/// Decodes the source files into bundle sections.
Map<String, dynamic> assembleSections(Map<String, String> files) {
  final missing = [for (final k in kContentFiles.keys) if (!files.containsKey(k)) k];
  if (missing.isNotEmpty) throw ContentValidationException(['Missing content files: ${missing.join(', ')}']);
  final errors = <String>[];
  final sections = <String, dynamic>{};
  for (final MapEntry(:key, :value) in files.entries) {
    try {
      sections[key] = jsonDecode(value);
    } on FormatException catch (e) {
      errors.add('${kContentFiles[key]} is not valid JSON: ${e.message}');
    }
  }
  if (errors.isNotEmpty) throw ContentValidationException(errors);
  return sections;
}

extension ListFallback<T> on List<T> {
  List<T> ifEmpty(List<T> fallback) => isEmpty ? fallback : this;
}
