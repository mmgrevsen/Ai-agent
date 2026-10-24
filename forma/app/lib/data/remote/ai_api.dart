import 'dart:convert';
import 'dart:typed_data';

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
  });

  final String name;
  final double grams;
  final double gramsLow;
  final double gramsHigh;
  final Nutrients nutrients;

  /// low | medium | high
  final String confidence;
  final String? notes;
}

class PhotoEstimateResult {
  const PhotoEstimateResult({required this.items, required this.caveats});
  final List<PhotoFoodEstimate> items;
  final List<String> caveats;
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
    ));
  }
  return PhotoEstimateResult(items: items, caveats: [for (final c in (j['caveats'] as List<dynamic>? ?? const [])) if (c is String) c]);
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
