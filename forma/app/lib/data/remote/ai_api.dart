import 'dart:convert';
import 'dart:typed_data';

import '../../domain/nutrition/food.dart';
import '../../domain/nutrition/nutrients.dart';
import 'backend.dart';

/// One food the photo model believes it sees. Everything here is an
/// estimate and is shown as such; the user can correct every field.
class PhotoFoodEstimate {
  const PhotoFoodEstimate({
    required this.name,
    required this.grams,
    required this.gramsLow,
    required this.gramsHigh,
    required this.nutrients,
    required this.confidence,
    this.notes,
    this.weighed = false,
  });

  final String name;
  final double grams;
  final double gramsLow;
  final double gramsHigh;
  final Nutrients nutrients;

  /// low | medium | high
  final String confidence;
  final String? notes;

  /// The portion comes from a kitchen scale in the photo, not a guess.
  final bool weighed;
}

class PhotoEstimateResult {
  const PhotoEstimateResult({required this.items, required this.caveats, this.scaleGrams, this.scaleApplied = false});
  final List<PhotoFoodEstimate> items;
  final List<String> caveats;

  /// What a visible kitchen scale showed, in grams.
  final double? scaleGrams;

  /// Whether that reading replaced the estimated portions.
  final bool scaleApplied;
}

/// Values read from a package's nutrition label, per 100 g. The user
/// reviews them in the custom-food form before anything is saved.
class LabelReading {
  const LabelReading({
    required this.per100g,
    this.name,
    this.brand,
    this.serving,
    this.barcode,
    this.warnings = const [],
    this.caveats = const [],
  });

  final String? name;
  final String? brand;
  final Nutrients per100g;
  final ServingOption? serving;
  final String? barcode;
  final List<String> warnings;
  final List<String> caveats;

  bool get isEmpty => per100g.kcal == null && per100g.proteinG == null && per100g.carbsG == null && per100g.fatG == null;
}

class CoachCitation {
  const CoachCitation({required this.kind, required this.label});
  final String kind;
  final String label;
}

/// A proposed change the user must confirm before anything is saved.
class CoachProposal {
  const CoachProposal({required this.type, required this.title, required this.rationale, required this.payload});

  /// create_template | adjust_targets
  final String type;
  final String title;
  final String rationale;
  final Map<String, dynamic> payload;
}

class CoachReply {
  const CoachReply({required this.answer, required this.citations, required this.dataGaps, required this.proposals});
  final String answer;
  final List<CoachCitation> citations;
  final List<String> dataGaps;
  final List<CoachProposal> proposals;
}

class AiApi {
  AiApi(this.backend);
  final Backend backend;

  Future<PhotoEstimateResult> estimatePhoto(Uint8List bytes, {required String mimeType, String? hint}) async {
    if (bytes.lengthInBytes > 4 * 1024 * 1024) {
      throw const BackendException('The photo is too large. Try again with a smaller image.');
    }
    final res = await backend.invoke('food-photo', {
      'image': base64Encode(bytes),
      'mimeType': mimeType,
      'hint': ?hint,
    }, timeout: const Duration(seconds: 90));
    return parsePhotoEstimate(res);
  }

  Future<LabelReading> readLabel(Uint8List bytes, {required String mimeType}) async {
    if (bytes.lengthInBytes > 4 * 1024 * 1024) {
      throw const BackendException('The photo is too large. Try again with a smaller image.');
    }
    final res = await backend.invoke('food-photo', {
      'image': base64Encode(bytes),
      'mimeType': mimeType,
      'mode': 'label',
    }, timeout: const Duration(seconds: 90));
    return parseLabelReading(res);
  }

  Future<CoachReply> ask({required String message, required List<Map<String, String>> history, required Map<String, dynamic> context}) async {
    final res = await backend.invoke('coach', {'message': message, 'history': history, 'context': context}, timeout: const Duration(seconds: 90));
    return parseCoachReply(res);
  }
}

double? _d(Object? v) => v is num ? v.toDouble() : null;

/// Validates the server's structured photo estimate. Malformed items are
/// dropped rather than guessed.
PhotoEstimateResult parsePhotoEstimate(Map<String, dynamic> j) {
  final items = <PhotoFoodEstimate>[];
  for (final raw in (j['items'] as List<dynamic>? ?? const [])) {
    if (raw is! Map) continue;
    final name = raw['name'];
    final grams = _d(raw['grams']);
    if (name is! String || name.trim().isEmpty || grams == null || grams <= 0 || grams > 3000) continue;
    double? nonNeg(Object? v) {
      final x = _d(v);
      return x == null || x < 0 ? null : x;
    }

    items.add(PhotoFoodEstimate(
      name: name.trim(),
      grams: grams,
      gramsLow: _d(raw['gramsLow']) ?? grams * 0.7,
      gramsHigh: _d(raw['gramsHigh']) ?? grams * 1.3,
      nutrients: Nutrients(
        kcal: nonNeg(raw['kcal']),
        proteinG: nonNeg(raw['protein']),
        carbsG: nonNeg(raw['carbs']),
        fatG: nonNeg(raw['fat']),
        fiberG: nonNeg(raw['fiber']),
      ),
      confidence: const {'low', 'medium', 'high'}.contains(raw['confidence']) ? raw['confidence'] as String : 'low',
      notes: raw['notes'] is String ? raw['notes'] as String : null,
      weighed: raw['weighed'] == true,
    ));
  }
  final scale = j['scale'];
  final scaleGrams = scale is Map ? _d(scale['grams']) : null;
  return PhotoEstimateResult(
    items: items,
    caveats: [for (final c in (j['caveats'] as List<dynamic>? ?? const [])) if (c is String) c],
    scaleGrams: scaleGrams != null && scaleGrams > 0 ? scaleGrams : null,
    scaleApplied: scale is Map && scale['applied'] == true && scaleGrams != null && scaleGrams > 0,
  );
}

/// GS1 check digit for EAN-8, UPC-A (12), EAN-13 and GTIN-14.
bool isValidGtin(String code) {
  if (!RegExp(r'^\d+$').hasMatch(code) || !const {8, 12, 13, 14}.contains(code.length)) return false;
  final digits = code.split('').map(int.parse).toList();
  final check = digits.removeLast();
  var sum = 0;
  for (var i = 0; i < digits.length; i++) {
    sum += digits[digits.length - 1 - i] * (i.isEven ? 3 : 1);
  }
  return (10 - sum % 10) % 10 == check;
}

/// Validates a label reading. Values a food can't contain per 100 g are
/// dropped (shown as missing), never guessed.
LabelReading parseLabelReading(Map<String, dynamic> j) {
  double? within(Object? v, double max) {
    final x = _d(v);
    return x == null || x < 0 || x > max ? null : x;
  }

  String? text(Object? v) => v is String && v.trim().isNotEmpty ? v.trim() : null;
  final per = j['per100g'] is Map ? j['per100g'] as Map : const {};
  final serving = j['serving'];
  final servingGrams = serving is Map ? within(serving['grams'], 2000) : null;
  final barcode = j['barcode'] is String ? (j['barcode'] as String).replaceAll(RegExp(r'\D'), '') : '';
  return LabelReading(
    name: text(j['name']),
    brand: text(j['brand']),
    per100g: Nutrients(
      kcal: within(per['kcal'], 900),
      proteinG: within(per['protein'], 100),
      carbsG: within(per['carbs'], 100),
      fatG: within(per['fat'], 100),
      fiberG: within(per['fiber'], 100),
    ),
    serving: servingGrams != null && servingGrams > 0 ? ServingOption(text((serving as Map)['label']) ?? '1 serving', servingGrams) : null,
    barcode: isValidGtin(barcode) ? barcode : null,
    warnings: [for (final w in (j['warnings'] as List<dynamic>? ?? const [])) if (w is String) w],
    caveats: [for (final c in (j['caveats'] as List<dynamic>? ?? const [])) if (c is String) c],
  );
}

/// Validates a coach reply. Unknown proposal types are discarded.
CoachReply parseCoachReply(Map<String, dynamic> j) {
  final answer = j['answer'];
  if (answer is! String || answer.trim().isEmpty) {
    throw const BackendException('The coach returned an empty answer. Please try again.');
  }
  return CoachReply(
    answer: answer.trim(),
    citations: [
      for (final c in (j['citations'] as List<dynamic>? ?? const []))
        if (c is Map && c['label'] is String) CoachCitation(kind: c['kind'] is String ? c['kind'] as String : 'data', label: c['label'] as String),
    ],
    dataGaps: [for (final g in (j['dataGaps'] as List<dynamic>? ?? const [])) if (g is String) g],
    proposals: [
      for (final p in (j['proposals'] as List<dynamic>? ?? const []))
        if (p is Map &&
            const {'create_template', 'adjust_targets'}.contains(p['type']) &&
            p['title'] is String &&
            p['payload'] is Map)
          CoachProposal(
            type: p['type'] as String,
            title: p['title'] as String,
            rationale: p['rationale'] is String ? p['rationale'] as String : '',
            payload: Map<String, dynamic>.from(p['payload'] as Map),
          ),
    ],
  );
}
