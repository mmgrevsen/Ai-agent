import '../dates.dart';
import 'models.dart';
import 'strength.dart';

class PersonalRecord {
  const PersonalRecord({required this.kind, required this.value, required this.date, required this.label});

  final PrKind kind;
  final double value;
  final DateTime date;

  /// e.g. "100 kg × 5".
  final String label;
}

enum PrKind {
  estimatedOneRepMax('Best estimated 1RM'),
  heaviestWeight('Heaviest weight'),
  mostReps('Most reps in a set'),
  bestSessionVolume('Best session volume'),
  longestDuration('Longest hold');

  const PrKind(this.label);
  final String label;
}

/// Personal records for one exercise, computed from its sessions.
List<PersonalRecord> personalRecords(List<ExerciseSession> sessions) {
  PersonalRecord? e1rm, heaviest, reps, volume, duration;
  for (final s in sessions) {
    for (final set in s.workingSets) {
      final w = set.weightKg ?? 0;
      final r = set.reps ?? 0;
      final e = estimateOneRepMax(weightKg: set.weightKg, reps: set.reps, rpe: set.rpe);
      final label = w > 0 ? '${_fmt(w)} kg × $r' : '$r reps';
      if (e != null && (e1rm == null || e > e1rm.value)) {
        e1rm = PersonalRecord(kind: PrKind.estimatedOneRepMax, value: e, date: s.date, label: '${_fmt(e)} kg (from $label)');
      }
      if (w > 0 && (heaviest == null || w > heaviest.value)) {
        heaviest = PersonalRecord(kind: PrKind.heaviestWeight, value: w, date: s.date, label: label);
      }
      if (r > 0 && (reps == null || r > reps.value)) {
        reps = PersonalRecord(kind: PrKind.mostReps, value: r.toDouble(), date: s.date, label: label);
      }
      final d = set.durationS ?? 0;
      if (d > 0 && (duration == null || d > duration.value)) {
        duration = PersonalRecord(kind: PrKind.longestDuration, value: d.toDouble(), date: s.date, label: '${d}s');
      }
    }
    final v = s.volumeKg;
    if (v > 0 && (volume == null || v > volume.value)) {
      volume = PersonalRecord(kind: PrKind.bestSessionVolume, value: v, date: s.date, label: '${_fmt(v)} kg');
    }
  }
  return [?e1rm, ?heaviest, ?reps, ?volume, ?duration];
}

/// Records set in [session] that beat every earlier session.
List<PersonalRecord> newRecordsIn(ExerciseSession session, List<ExerciseSession> earlier) {
  final before = {for (final r in personalRecords(earlier)) r.kind: r.value};
  final now = personalRecords([session]);
  return [
    for (final r in now)
      if (before.isNotEmpty && (before[r.kind] == null || r.value > before[r.kind]! + 1e-6)) r,
  ];
}

class TrendSample {
  const TrendSample(this.date, this.value);
  final DateTime date;
  final double value;
}

/// Best e1RM per session, oldest first — the estimated strength trend.
List<TrendSample> strengthTrend(List<ExerciseSession> sessions) {
  final out = <TrendSample>[];
  for (final s in sessions) {
    final e = bestOneRepMax(s);
    if (e != null) out.add(TrendSample(s.date, e));
  }
  out.sort((a, b) => a.date.compareTo(b.date));
  return out;
}

/// A completed workout reduced to what analytics needs.
class WorkoutSummaryRow {
  const WorkoutSummaryRow({
    required this.date,
    required this.volumeKg,
    required this.workingSets,
    required this.durationMin,
    this.setsByMuscle = const {},
  });

  final DateTime date;
  final double volumeKg;
  final int workingSets;
  final double durationMin;
  final Map<String, int> setsByMuscle;
}

class WeekBucket {
  const WeekBucket({required this.weekStart, required this.workouts, required this.volumeKg, required this.sets});
  final DateTime weekStart;
  final int workouts;
  final double volumeKg;
  final int sets;
}

/// Groups workouts into ISO weeks, including empty weeks, oldest first.
List<WeekBucket> weeklyBuckets(List<WorkoutSummaryRow> rows, {required DateTime today, int weeks = 12}) {
  final current = startOfWeek(today);
  final buckets = <DateTime, List<WorkoutSummaryRow>>{
    for (var i = weeks - 1; i >= 0; i--) addDays(current, -7 * i): [],
  };
  for (final r in rows) {
    final key = startOfWeek(r.date);
    buckets[key]?.add(r);
  }
  return [
    for (final e in buckets.entries)
      WeekBucket(
        weekStart: e.key,
        workouts: e.value.length,
        volumeKg: e.value.fold(0, (a, r) => a + r.volumeKg),
        sets: e.value.fold(0, (a, r) => a + r.workingSets),
      ),
  ];
}

class Consistency {
  const Consistency({required this.thisWeek, required this.target, required this.streakWeeks, required this.hitRate});

  final int thisWeek;
  final int target;

  /// Consecutive completed weeks (excluding the current one) meeting target.
  final int streakWeeks;

  /// Share of the last 8 completed weeks that met the target.
  final double hitRate;
}

Consistency consistency(List<WorkoutSummaryRow> rows, {required DateTime today, required int target}) {
  final weeks = weeklyBuckets(rows, today: today, weeks: 9);
  final past = weeks.sublist(0, weeks.length - 1);
  var streak = 0;
  for (final w in past.reversed) {
    if (w.workouts >= target) {
      streak++;
    } else {
      break;
    }
  }
  final hits = past.where((w) => w.workouts >= target).length;
  return Consistency(
    thisWeek: weeks.last.workouts,
    target: target,
    streakWeeks: streak,
    hitRate: past.isEmpty ? 0 : hits / past.length,
  );
}

/// Working sets per primary muscle over the last [days] days.
Map<String, int> setsPerMuscle(List<WorkoutSummaryRow> rows, {required DateTime today, int days = 7}) {
  final out = <String, int>{};
  for (final r in rows) {
    if (daysBetween(dateOnly(r.date), dateOnly(today)) >= days) continue;
    r.setsByMuscle.forEach((m, n) => out[m] = (out[m] ?? 0) + n);
  }
  return out;
}

String _fmt(double v) => v.toStringAsFixed(v.truncateToDouble() == v ? 0 : 1);
