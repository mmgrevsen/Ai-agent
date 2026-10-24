import '../catalog.dart';

/// A logged set, independent of storage.
class SetRecord {
  const SetRecord({
    this.kind = SetKind.working,
    this.weightKg,
    this.reps,
    this.durationS,
    this.distanceM,
    this.rpe,
    this.completed = true,
  });

  final SetKind kind;
  final double? weightKg;
  final int? reps;
  final int? durationS;
  final double? distanceM;
  final double? rpe;
  final bool completed;

  bool get isWorking => kind != SetKind.warmup;

  /// Load × reps for completed working sets; 0 otherwise.
  double get volumeKg =>
      completed && isWorking && weightKg != null && reps != null ? weightKg! * reps! : 0;
}

/// All sets of one exercise within one workout.
class ExerciseSession {
  const ExerciseSession({
    required this.workoutId,
    required this.date,
    required this.sets,
    this.repMin,
    this.repMax,
    this.targetRpe,
    this.isDeload = false,
  });

  final String workoutId;
  final DateTime date;
  final List<SetRecord> sets;
  final int? repMin;
  final int? repMax;
  final double? targetRpe;
  final bool isDeload;

  List<SetRecord> get workingSets => [for (final s in sets) if (s.completed && s.isWorking) s];

  double get volumeKg => sets.fold(0, (sum, s) => sum + s.volumeKg);
}

/// What the plan asks for on an exercise.
class Prescription {
  const Prescription({this.sets = 3, this.repMin = 8, this.repMax = 12, this.targetRpe});

  final int sets;
  final int repMin;
  final int repMax;

  /// Target effort (RPE 1–10). `null` means "not specified" and defaults to 8.
  final double? targetRpe;

  double get effectiveTargetRpe => targetRpe ?? 8;
}

/// User-configurable caps on how much load may be added between sessions.
class SafetyLimits {
  const SafetyLimits({
    this.maxIncreasePct = 5,
    this.maxIncreaseUpperKg = 2.5,
    this.maxIncreaseLowerKg = 5,
  });

  final double maxIncreasePct;
  final double maxIncreaseUpperKg;
  final double maxIncreaseLowerKg;

  /// Largest allowed absolute increase from [currentKg].
  double maxJumpKg(double currentKg, {required bool lowerBody}) {
    final pct = currentKg * maxIncreasePct / 100;
    final abs = lowerBody ? maxIncreaseLowerKg : maxIncreaseUpperKg;
    return pct < abs ? pct : abs;
  }
}
