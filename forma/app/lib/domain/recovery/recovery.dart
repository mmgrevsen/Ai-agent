import 'dart:math' as math;

import '../dates.dart';

/// One value per day for a metric (e.g. last night's sleep, morning RHR).
class DailyMetric {
  const DailyMetric(this.day, this.value);
  final DateTime day;
  final double value;
}

class SubjectiveCheckin {
  const SubjectiveCheckin({required this.day, required this.energy, required this.soreness, required this.sleepQuality});
  final DateTime day;

  /// 1 (poor) … 5 (great). For soreness, 5 means *not sore*.
  final int energy;
  final int soreness;
  final int sleepQuality;
}

enum Signal { better, usual, worse, unknown }

class RecoveryFactor {
  const RecoveryFactor({
    required this.name,
    required this.signal,
    required this.detail,
    this.imported = true,
  });

  final String name;
  final Signal signal;
  final String detail;

  /// Whether the factor comes from a device (vs. the user's own check-in or
  /// the training log).
  final bool imported;
}

enum ReadinessBand {
  /// Signals at or above the user's baseline.
  ready('Ready to train', 'Your signals are at or above your usual range.'),
  normal('Normal', 'Nothing stands out compared with your usual range.'),
  strained('Take it easier', 'Several signals are below your usual range. Consider holding loads or reducing volume today.'),
  unknown('Not enough data', 'Connect Apple Health or do a quick check-in to see recovery insights.');

  const ReadinessBand(this.label, this.message);
  final String label;
  final String message;
}

class RecoveryStatus {
  const RecoveryStatus({required this.band, required this.factors, required this.missing});

  final ReadinessBand band;
  final List<RecoveryFactor> factors;

  /// Metrics that could not be evaluated (no data or not enough history).
  final List<String> missing;

  static const disclaimer = 'Recovery insights compare today with your own recent baseline. '
      'They are guidance for training decisions, not a medical measurement.';
}

/// Compares the latest values of each metric with the user's 28-day
/// baseline. Requires at least [minBaselineDays] of history per metric.
class RecoveryEngine {
  const RecoveryEngine({this.baselineDays = 28, this.minBaselineDays = 7});

  final int baselineDays;
  final int minBaselineDays;

  RecoveryStatus evaluate({
    required DateTime today,
    List<DailyMetric> hrvMs = const [],
    List<DailyMetric> restingHr = const [],
    List<DailyMetric> sleepMinutes = const [],
    SubjectiveCheckin? checkin,
    List<DailyMetric> trainingLoad = const [],
  }) {
    final factors = <RecoveryFactor>[];
    final missing = <String>[];
    final day = dateOnly(today);

    void metric(String name, List<DailyMetric> series, {required bool higherIsBetter, required double minSd, required String Function(double) fmt}) {
      final latest = _latestWithin(series, day, 1);
      if (latest == null) {
        missing.add(name);
        return;
      }
      final baseline = [
        for (final m in series)
          if (dateOnly(m.day).isBefore(dateOnly(latest.day)) && daysBetween(dateOnly(m.day), day) <= baselineDays) m.value,
      ];
      if (baseline.length < minBaselineDays) {
        factors.add(RecoveryFactor(
          name: name,
          signal: Signal.unknown,
          detail: '${fmt(latest.value)} — building your baseline (${baseline.length}/$minBaselineDays days)',
        ));
        return;
      }
      final mean = baseline.reduce((a, b) => a + b) / baseline.length;
      final variance = baseline.map((v) => (v - mean) * (v - mean)).reduce((a, b) => a + b) / baseline.length;
      final sd = math.max(math.sqrt(variance), minSd);
      final z = (latest.value - mean) / sd * (higherIsBetter ? 1 : -1);
      final signal = z <= -1 ? Signal.worse : z >= 1 ? Signal.better : Signal.usual;
      final rel = switch (signal) {
        Signal.worse => higherIsBetter ? 'lower than usual' : 'higher than usual',
        Signal.better => higherIsBetter ? 'higher than usual' : 'lower than usual',
        _ => 'within your usual range',
      };
      factors.add(RecoveryFactor(name: name, signal: signal, detail: '${fmt(latest.value)} — $rel (avg ${fmt(mean)})'));
    }

    metric('Heart-rate variability', hrvMs, higherIsBetter: true, minSd: 4, fmt: (v) => '${v.round()} ms');
    metric('Resting heart rate', restingHr, higherIsBetter: false, minSd: 2, fmt: (v) => '${v.round()} bpm');
    metric('Sleep', sleepMinutes, higherIsBetter: true, minSd: 30, fmt: _hm);

    if (checkin != null && daysBetween(dateOnly(checkin.day), day) == 0) {
      final low = [checkin.energy, checkin.soreness, checkin.sleepQuality].where((v) => v <= 2).length;
      final high = [checkin.energy, checkin.soreness, checkin.sleepQuality].where((v) => v >= 4).length;
      factors.add(RecoveryFactor(
        name: 'Check-in',
        imported: false,
        signal: low >= 2 ? Signal.worse : high >= 2 ? Signal.better : Signal.usual,
        detail: 'Energy ${checkin.energy}/5 · Soreness ${checkin.soreness}/5 · Sleep ${checkin.sleepQuality}/5',
      ));
    } else {
      missing.add('Check-in');
    }

    // Recent training load (last 3 days) vs the baseline average.
    final recent = trainingLoad.where((m) => daysBetween(dateOnly(m.day), day) < 3 && !dateOnly(m.day).isAfter(day));
    final base = trainingLoad.where((m) {
      final d = daysBetween(dateOnly(m.day), day);
      return d >= 3 && d <= baselineDays;
    });
    if (base.length >= 4) {
      final recentPerDay = recent.fold<double>(0, (a, m) => a + m.value) / 3;
      final basePerDay = base.fold<double>(0, (a, m) => a + m.value) / (baselineDays - 3);
      if (basePerDay > 0) {
        final ratio = recentPerDay / basePerDay;
        factors.add(RecoveryFactor(
          name: 'Training load',
          imported: false,
          signal: ratio > 1.6 ? Signal.worse : Signal.usual,
          detail: ratio > 1.6
              ? 'Last 3 days: ${(ratio * 100 - 100).round()}% above your usual load'
              : 'Last 3 days: in line with your usual load',
        ));
      }
    }

    final evaluated = factors.where((f) => f.signal != Signal.unknown).toList();
    if (evaluated.isEmpty) {
      return RecoveryStatus(band: ReadinessBand.unknown, factors: factors, missing: missing);
    }
    final worse = evaluated.where((f) => f.signal == Signal.worse).length;
    final better = evaluated.where((f) => f.signal == Signal.better).length;
    final band = worse >= 2 || (worse == 1 && evaluated.length == 1)
        ? ReadinessBand.strained
        : better >= 2 && worse == 0
            ? ReadinessBand.ready
            : ReadinessBand.normal;
    return RecoveryStatus(band: band, factors: factors, missing: missing);
  }

  static DailyMetric? _latestWithin(List<DailyMetric> series, DateTime day, int maxAgeDays) {
    DailyMetric? best;
    for (final m in series) {
      final age = daysBetween(dateOnly(m.day), day);
      if (age < 0 || age > maxAgeDays) continue;
      if (best == null || m.day.isAfter(best.day)) best = m;
    }
    return best;
  }

  static String _hm(double minutes) {
    final h = minutes ~/ 60;
    final m = (minutes % 60).round();
    return '${h}h ${m.toString().padLeft(2, '0')}m';
  }
}
