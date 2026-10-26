import 'dart:math' as math;

/// What Apple Vision thinks a photo shows, e.g. `pizza` at 0.82.
class VisionLabel {
  const VisionLabel(this.id, this.confidence);
  final String id;
  final double confidence;

  @override
  String toString() => '$id ${confidence.toStringAsFixed(2)}';
}

/// One piece of text found in a photo. The box is normalised to 0–1 with
/// the origin top left.
class VisionTextLine {
  const VisionTextLine(this.text, {this.confidence = 1, this.x = 0, this.y = 0, this.w = 0, this.h = 0});
  final String text;
  final double confidence;
  final double x, y, w, h;

  double get centerY => y + h / 2;
  double get bottom => y + h;

  @override
  String toString() => text;
}

/// The result of on-device analysis of one photo.
class VisionResult {
  const VisionResult({this.labels = const [], this.lines = const []});

  /// Best first.
  final List<VisionLabel> labels;
  final List<VisionTextLine> lines;

  /// Parses the platform channel's reply. Malformed entries are skipped.
  factory VisionResult.fromJson(Map<Object?, Object?> j) {
    double num0(Object? v) => v is num && v.isFinite ? v.toDouble() : 0;
    final labels = <VisionLabel>[
      for (final l in (j['labels'] as List<Object?>? ?? const []))
        if (l is Map && l['id'] is String) VisionLabel(l['id'] as String, num0(l['confidence']).clamp(0, 1).toDouble()),
    ]..sort((a, b) => b.confidence.compareTo(a.confidence));
    final lines = <VisionTextLine>[
      for (final l in (j['lines'] as List<Object?>? ?? const []))
        if (l is Map && l['text'] is String && (l['text'] as String).trim().isNotEmpty)
          VisionTextLine(
            l['text'] as String,
            confidence: num0(l['confidence']),
            x: num0(l['x']),
            y: num0(l['y']),
            w: math.max(0, num0(l['w'])),
            h: math.max(0, num0(l['h'])),
          ),
    ];
    return VisionResult(labels: labels, lines: lines);
  }
}
