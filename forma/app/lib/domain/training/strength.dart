import 'dart:math' as math;

import '../catalog.dart';
import 'models.dart';

/// Estimated one-rep max (Epley), adjusted for reps in reserve when RPE is
/// known. Returns `null` for sets that can't produce a meaningful estimate
/// (no load, no reps, or very high rep sets where the formula is unreliable).
double? estimateOneRepMax({required double? weightKg, required int? reps, double? rpe}) {
  if (weightKg == null || reps == null || weightKg <= 0 || reps <= 0) return null;
  final rir = rpe == null ? 0.0 : (10 - rpe).clamp(0, 4).toDouble();
  final effectiveReps = reps + rir;
  if (effectiveReps > 15) return null;
  if (effectiveReps <= 1) return weightKg;
  return weightKg * (1 + effectiveReps / 30);
}

/// Best e1RM across the completed working sets of a session.
double? bestOneRepMax(ExerciseSession s) {
  double? best;
  for (final set in s.workingSets) {
    final e = estimateOneRepMax(weightKg: set.weightKg, reps: set.reps, rpe: set.rpe);
    if (e != null && (best == null || e > best)) best = e;
  }
  return best;
}

/// Rounds [kg] to a multiple of [increment].
double roundToIncrement(double kg, double increment, {RoundMode mode = RoundMode.nearest}) {
  if (increment <= 0) return kg;
  final steps = kg / increment;
  final rounded = switch (mode) {
    RoundMode.nearest => steps.roundToDouble(),
    RoundMode.down => (steps + 1e-9).floorToDouble(),
    RoundMode.up => (steps - 1e-9).ceilToDouble(),
  };
  // Avoid floating point noise such as 62.50000001.
  return double.parse((rounded * increment).toStringAsFixed(3));
}

enum RoundMode { nearest, down, up }

/// A suggested warm-up ramp toward [workingKg]. Empty when the working load
/// is light enough that a ramp adds nothing.
List<SetRecord> warmupRamp({
  required double workingKg,
  required double incrementKg,
  double minimumKg = 0,
  int count = 3,
}) {
  if (count <= 0 || workingKg <= 0) return const [];
  const schemes = [(0.5, 8), (0.7, 5), (0.85, 3), (0.92, 1)];
  final picks = schemes.take(math.min(count, schemes.length));
  final result = <SetRecord>[];
  double? last;
  for (final (pct, reps) in picks) {
    var kg = roundToIncrement(workingKg * pct, incrementKg, mode: RoundMode.down);
    if (kg < minimumKg) kg = minimumKg;
    if (kg >= workingKg || (last != null && kg <= last)) continue;
    result.add(SetRecord(kind: SetKind.warmup, weightKg: kg, reps: reps, completed: false));
    last = kg;
  }
  return result;
}

