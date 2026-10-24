import 'dart:math' as math;

import '../dates.dart';

class WeighIn {
  const WeighIn(this.day, this.kg);

  /// Local calendar day.
  final DateTime day;
  final double kg;
}

class TrendPoint {
  const TrendPoint({required this.day, required this.trendKg, this.scaleKg});

  final DateTime day;
  final double trendKg;

  /// The day's (averaged) scale weight, or `null` on days without a weigh-in.
  final double? scaleKg;
}

/// Exponentially smoothed weight trend.
///
/// Daily scale weight swings by 1–2 kg with water and food; the trend damps
/// this so real change becomes visible. Gaps are handled by applying the
/// smoothing factor once per elapsed day.
class WeightTrend {
  WeightTrend._(this.points);

  /// Smoothing per day. 0.1 ≈ a 10-day memory.
  static const alpha = 0.1;

  final List<TrendPoint> points;

  bool get isEmpty => points.isEmpty;
  TrendPoint? get latest => points.isEmpty ? null : points.last;

  factory WeightTrend.compute(Iterable<WeighIn> weighIns) {
    // Average multiple weigh-ins on the same day.
    final byDay = <DateTime, List<double>>{};
    for (final w in weighIns) {
      byDay.putIfAbsent(dateOnly(w.day), () => []).add(w.kg);
    }
    final days = byDay.keys.toList()..sort();
    if (days.isEmpty) return WeightTrend._(const []);

    final points = <TrendPoint>[];
    double? trend;
    DateTime? prev;
    for (final day in days) {
      final values = byDay[day]!;
      final kg = values.reduce((a, b) => a + b) / values.length;
      if (trend == null) {
        trend = kg;
      } else {
        // Fill the gap so charts show a continuous trend line.
        final gap = daysBetween(prev!, day);
        for (var i = 1; i < gap; i++) {
          points.add(TrendPoint(day: addDays(prev, i), trendKg: trend));
        }
        final a = 1 - math.pow(1 - alpha, gap).toDouble();
        trend = trend + a * (kg - trend);
      }
      points.add(TrendPoint(day: day, trendKg: trend, scaleKg: kg));
      prev = day;
    }
    return WeightTrend._(points);
  }

  /// Trend value on [day] (the last known value on or before it).
  double? trendOn(DateTime day) {
    final d = dateOnly(day);
    double? value;
    for (final p in points) {
      if (p.day.isAfter(d)) break;
      value = p.trendKg;
    }
    return value;
  }

  /// Change in trend over the last [days] days ending at the latest point.
  /// `null` when the data does not span that period.
  double? changeOver(int days) {
    final last = latest;
    if (last == null) return null;
    final start = addDays(last.day, -days);
    if (points.first.day.isAfter(start)) return null;
    final from = trendOn(start);
    return from == null ? null : last.trendKg - from;
  }

  int get weighInCount => points.where((p) => p.scaleKg != null).length;
}
