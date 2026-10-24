import 'dart:convert';

import 'package:intl/intl.dart';

import '../data/db/app_database.dart';
import '../data/repositories/exercise_repository.dart';
import '../data/repositories/settings_repository.dart';
import '../data/repositories/workout_repository.dart';
import '../domain/catalog.dart';
import '../domain/training/models.dart';
import '../domain/training/progression_engine.dart';
import '../domain/training/strength.dart';
import 'program_generator.dart';

/// Serialisable snapshot of a [Recommendation] stored on the session row, so
/// the logger can show exactly what was suggested and why.
class StoredRecommendation {
  const StoredRecommendation({
    required this.action,
    required this.headline,
    required this.reasons,
    this.weightKg,
    this.reps,
    this.durationS,
    this.safetyCapped = false,
  });

  factory StoredRecommendation.from(Recommendation r) => StoredRecommendation(
    action: r.action.name,
    headline: r.headline,
    reasons: r.reasons,
    weightKg: r.weightKg,
    reps: r.reps,
    durationS: r.durationS,
    safetyCapped: r.safetyCapped,
  );

  static StoredRecommendation? parse(String? json) {
    if (json == null || json.isEmpty) return null;
    try {
      final m = jsonDecode(json) as Map<String, dynamic>;
      return StoredRecommendation(
        action: m['action'] as String,
        headline: m['headline'] as String,
        reasons: (m['reasons'] as List<dynamic>).cast<String>(),
        weightKg: (m['weightKg'] as num?)?.toDouble(),
        reps: m['reps'] as int?,
        durationS: m['durationS'] as int?,
        safetyCapped: m['safetyCapped'] as bool? ?? false,
      );
    } on Object {
      return null;
    }
  }

  final String action;
  final String headline;
  final List<String> reasons;
  final double? weightKg;
  final int? reps;
  final int? durationS;
  final bool safetyCapped;

  bool get isBaseline => action == ProgressionAction.baseline.name;

  String encode() => jsonEncode({
    'action': action,
    'headline': headline,
    'reasons': reasons,
    'weightKg': weightKg,
    'reps': reps,
    'durationS': durationS,
    'safetyCapped': safetyCapped,
  });
}

class TrainingService {
  TrainingService({required this.workouts, required this.exercises, required this.settings, this.engine = const ProgressionEngine()});

  final WorkoutRepository workouts;
  final ExerciseRepository exercises;
  final SettingsRepository settings;
  final ProgressionEngine engine;

  Future<TrainingContext> _context() async {
    final equipment = await settings.equipment();
    return TrainingContext(
      available: {for (final e in equipment) e.equipment},
      restrictions: await settings.restrictions(),
      increments: {for (final e in equipment) e.equipment: e.incrementKg},
    );
  }

  /// Computes the recommendation for [exercise] from recorded history.
  Future<Recommendation> recommend({
    required Exercise exercise,
    required Prescription prescription,
    String? excludeWorkoutId,
    bool deload = false,
    bool lowReadiness = false,
    TrainingContext? context,
    UserPrefs? prefs,
  }) async {
    final ctx = context ?? await _context();
    final p = prefs ?? await settings.prefs();
    final history = await workouts.exerciseHistory(exercise.id, limit: 8, excludeWorkoutId: excludeWorkoutId);
    return engine.recommend(
      ProgressionInput(
        tracking: exercise.tracking,
        lowerBody: exercise.lowerBody,
        prescription: prescription,
        history: history,
        limits: SettingsRepository.limitsOf(p),
        incrementKg: ctx.incrementFor(exercise),
        deloadWeek: deload,
        lowReadiness: lowReadiness,
      ),
    );
  }

  /// Starts a session, optionally from a template. Each exercise gets a
  /// recommendation and planned (empty) sets; suggested values are shown as
  /// placeholders, never recorded until the user completes the set.
  Future<String> startWorkout({String? templateId, String? name, bool lowReadiness = false, DateTime? now}) =>
      // One transaction: watchers are notified once instead of after every insert.
      workouts.db.transaction(() => _startWorkout(templateId: templateId, name: name, lowReadiness: lowReadiness, now: now));

  Future<String> _startWorkout({String? templateId, String? name, bool lowReadiness = false, DateTime? now}) async {
    final at = now ?? DateTime.now();
    final template = templateId == null ? null : await workouts.template(templateId);
    final schedule = await workouts.activeSchedule();
    final deload = schedule != null && WorkoutRepository.isDeloadWeek(schedule.schedule, at);
    final workoutId = await workouts.createWorkout(
      name: name ?? template?.template.name ?? _defaultName(at),
      templateId: templateId,
      isDeload: deload,
      startedAt: at,
    );
    if (template == null) return workoutId;

    final ctx = await _context();
    final prefs = await settings.prefs();
    for (final item in template.items) {
      await addExerciseToWorkout(
        workoutId: workoutId,
        exercise: item.exercise,
        prescription: Prescription(sets: item.row.sets, repMin: item.row.repMin, repMax: item.row.repMax, targetRpe: item.row.targetRpe),
        warmupSets: item.row.warmupSets,
        restSeconds: item.row.restSeconds,
        supersetGroup: item.row.supersetGroup,
        deload: deload,
        lowReadiness: lowReadiness,
        context: ctx,
        prefs: prefs,
      );
    }
    return workoutId;
  }

  Future<String> addExerciseToWorkout({
    required String workoutId,
    required Exercise exercise,
    Prescription prescription = const Prescription(),
    int warmupSets = 0,
    int? restSeconds,
    int? supersetGroup,
    bool deload = false,
    bool lowReadiness = false,
    String? substitutedFromId,
    int? position,
    TrainingContext? context,
    UserPrefs? prefs,
  }) async {
    final ctx = context ?? await _context();
    final rec = await recommend(
      exercise: exercise,
      prescription: prescription,
      excludeWorkoutId: workoutId,
      deload: deload,
      lowReadiness: lowReadiness,
      context: ctx,
      prefs: prefs,
    );
    final weId = await workouts.addExercise(
      workoutId: workoutId,
      exerciseId: exercise.id,
      repMin: prescription.repMin,
      repMax: prescription.repMax,
      targetRpe: prescription.targetRpe,
      restSeconds: restSeconds,
      supersetGroup: supersetGroup,
      recommendation: StoredRecommendation.from(rec).encode(),
      substitutedFromId: substitutedFromId,
      position: position,
    );
    final suggested = rec.weightKg;
    if (warmupSets > 0 && suggested != null) {
      final inc = ctx.incrementFor(exercise) ?? 2.5;
      final ramp = warmupRamp(
        workingKg: suggested,
        incrementKg: inc,
        minimumKg: exercise.equipmentList.contains('barbell') ? 20 : 0,
        count: warmupSets,
      );
      for (final w in ramp) {
        await workouts.addSet(weId, kind: SetKind.warmup, weightKg: w.weightKg, reps: w.reps);
      }
    }
    final setCount = exercise.tracking == TrackingType.distanceDuration ? 1 : rec.sets;
    for (var i = 0; i < setCount; i++) {
      await workouts.addSet(weId);
    }
    return weId;
  }

  /// Replaces an exercise in a running session with [replacement], keeping
  /// its position and prescription. Completed sets stay with the original.
  Future<void> substitute({required SessionExercise current, required Exercise replacement, required String workoutId}) =>
      workouts.db.transaction(() => _substitute(current: current, replacement: replacement, workoutId: workoutId));

  Future<void> _substitute({required SessionExercise current, required Exercise replacement, required String workoutId}) async {
    final hasCompleted = current.sets.any((s) => s.completed);
    final row = current.row;
    if (!hasCompleted) await workouts.removeExercise(row.id);
    await addExerciseToWorkout(
      workoutId: workoutId,
      exercise: replacement,
      prescription: Prescription(
        sets: current.sets.where((s) => s.kind != 'warmup').length.clamp(1, 10),
        repMin: row.repMin ?? 8,
        repMax: row.repMax ?? 12,
        targetRpe: row.targetRpe,
      ),
      restSeconds: row.restSeconds,
      substitutedFromId: current.exercise.id,
      position: hasCompleted ? null : row.position,
    );
  }

  /// Saves a generated program as templates plus a weekly schedule.
  Future<void> installProgram(GeneratedProgram program) => workouts.db.transaction(() async {
    for (final t in program.templates) {
      final id = await workouts.saveTemplate(name: t.name, items: t.items);
      for (final d in t.weekdays) {
        await workouts.setScheduleDay(d, id);
      }
    }
  });

  static String _defaultName(DateTime t) {
    final h = t.hour;
    final part = h < 11
        ? 'Morning'
        : h < 14
        ? 'Midday'
        : h < 18
        ? 'Afternoon'
        : 'Evening';
    return '$part workout · ${DateFormat('EEE').format(t)}';
  }
}
