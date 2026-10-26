import 'dart:math' as math;

import 'package:intl/intl.dart';

import '../catalog.dart';
import 'models.dart';
import 'strength.dart';

enum ProgressionAction {
  /// No usable history: the user establishes a starting load.
  baseline,

  /// No usable history, but the user set a starting load in the plan.
  startingWeight,
  increaseLoad,
  increaseReps,
  increaseDuration,
  maintain,
  reduceLoad,
  deload,
}

class ProgressionInput {
  const ProgressionInput({
    required this.tracking,
    required this.lowerBody,
    required this.prescription,
    required this.history,
    required this.limits,
    this.incrementKg,
    this.deloadWeek = false,
    this.lowReadiness = false,
    this.startWeightKg,
  });

  final TrackingType tracking;
  final bool lowerBody;
  final Prescription prescription;

  /// Previous sessions of this exercise, newest first. Sessions without a
  /// completed working set are ignored.
  final List<ExerciseSession> history;
  final SafetyLimits limits;

  /// Smallest load jump available for this exercise's equipment. `null`
  /// means load progression is not possible (e.g. bodyweight only).
  final double? incrementKg;
  final bool deloadWeek;

  /// Set when recovery signals are below the user's baseline; the engine then
  /// holds instead of adding load (it never reduces load for this alone).
  final bool lowReadiness;

  /// The user's own starting load from the plan, used only while there is
  /// no history. It is never invented by the engine.
  final double? startWeightKg;
}

class Recommendation {
  const Recommendation({
    required this.action,
    required this.headline,
    required this.reasons,
    required this.sets,
    this.weightKg,
    this.reps,
    this.durationS,
    this.safetyCapped = false,
    this.basedOn,
  });

  final ProgressionAction action;

  /// One short sentence, e.g. "Add 2.5 kg → 62.5 kg × 8".
  final String headline;

  /// Plain-language explanation that only references recorded data.
  final List<String> reasons;
  final int sets;

  /// Suggested load. `null` when there is no recorded basis for one.
  final double? weightKg;

  /// Suggested reps per working set.
  final int? reps;
  final int? durationS;

  /// True when the engine wanted a larger jump but the safety limit applied.
  final bool safetyCapped;

  /// The session the recommendation is based on.
  final DateTime? basedOn;
}

/// Deterministic double-progression engine with effort (RPE) awareness.
///
/// Rules, in order:
/// 1. No history → baseline (never invent a load), or the starting load the
///    user set in the plan.
/// 2. Deload week → ~90% load, ~60% of sets.
/// 3. Hit the top of the rep range on every prescribed set at acceptable
///    effort → smallest load increase (two increments after repeated easy
///    success), always within the safety limits.
/// 4. Inside the rep range → keep load, add reps.
/// 5. Missed the bottom of the range once → keep load. Twice in a row at the
///    same load → reduce load ~10%.
/// 6. No progress for 3+ sessions at the same load → suggest a deload or a
///    substitution.
class ProgressionEngine {
  const ProgressionEngine({this.tuning = const ProgressionTuning()});

  /// Bounded knobs that can be updated with content (deload depth, plateau
  /// length). Users' load-jump safety limits come from their settings.
  final ProgressionTuning tuning;

  static final _date = DateFormat('MMM d');

  Recommendation recommend(ProgressionInput input) {
    final p = input.prescription;
    final history = [for (final s in input.history) if (s.workingSets.isNotEmpty) s];

    if (history.isEmpty) return _baseline(input);

    return switch (input.tracking) {
      TrackingType.duration => _duration(input, history),
      TrackingType.distanceDuration => _cardio(input, history),
      _ => _load(input, history, p),
    };
  }

  // ------------------------------------------------------------------ load

  Recommendation _load(ProgressionInput input, List<ExerciseSession> history, Prescription p) {
    final last = history.first;
    final working = last.workingSets;
    final weights = [for (final s in working) s.weightKg ?? 0];
    final workingKg = weights.reduce(math.max);
    final usesLoad = workingKg > 0;
    final inc = input.incrementKg;
    final when = _date.format(last.date);
    final summary = _describe(working, input.tracking);

    if (input.deloadWeek) {
      final sets = math.max(1, (p.sets * tuning.deloadSetFactor).round());
      double? kg;
      if (usesLoad) {
        kg = inc == null ? workingKg * tuning.deloadFactor : roundToIncrement(workingKg * tuning.deloadFactor, inc, mode: RoundMode.down);
      }
      return Recommendation(
        action: ProgressionAction.deload,
        headline: kg == null ? 'Deload: $sets × ${p.repMin}' : 'Deload: ${_kg(kg)} × ${p.repMin}, $sets sets',
        reasons: [
          'This is a planned deload week.',
          'Last session ($when): $summary.',
          'Lighter load and fewer sets let fatigue drop so you can progress again next week.',
        ],
        sets: sets,
        weightKg: kg,
        reps: p.repMin,
        basedOn: last.date,
      );
    }

    final atTop = [for (final s in working) if (usesLoad ? s.weightKg == workingKg : true) s];
    final reps = [for (final s in atTop) s.reps ?? 0];
    final rpes = [for (final s in atTop) if (s.rpe != null) s.rpe!];
    final avgRpe = rpes.isEmpty ? null : rpes.reduce((a, b) => a + b) / rpes.length;
    final maxRpe = rpes.isEmpty ? null : rpes.reduce(math.max);
    final target = p.effectiveTargetRpe;

    final completedPrescribed = atTop.length >= p.sets;
    final allTop = completedPrescribed && reps.every((r) => r >= p.repMax);
    final allMin = reps.every((r) => r >= p.repMin);
    final grinding = (maxRpe != null && maxRpe >= 9.5) || (avgRpe != null && avgRpe > target + 1);
    final rpeNote = rpes.isEmpty ? 'No effort (RPE) was recorded, so the engine judged by reps alone.' : null;

    // Stall: same load, no e1RM improvement across the last 3 sessions.
    final stalled = usesLoad && _stalledSessions(history, workingKg) >= tuning.plateauSessions;
    if (stalled && !allTop) {
      final kg = inc == null ? workingKg * tuning.deloadFactor : roundToIncrement(workingKg * tuning.deloadFactor, inc, mode: RoundMode.down);
      return Recommendation(
        action: ProgressionAction.deload,
        headline: 'Reset: ${_kg(kg)} × ${p.repMax}',
        reasons: [
          'Your last ${_stalledSessions(history, workingKg)} sessions at ${_kg(workingKg)} did not improve your estimated strength.',
          'A short reset to about ${(tuning.deloadFactor * 100).round()}% usually breaks a plateau. Swapping to a similar exercise for a few weeks is another option.',
        ],
        sets: p.sets,
        weightKg: kg,
        reps: p.repMax,
        basedOn: last.date,
      );
    }

    if (allTop) {
      if (!usesLoad || inc == null) {
        return Recommendation(
          action: ProgressionAction.increaseReps,
          headline: 'Aim for ${p.repMax + 1}+ reps',
          reasons: [
            'Last session ($when): $summary — every set reached the top of your ${p.repMin}–${p.repMax} range.',
            inc == null
                ? 'There is no load increment set for this equipment, so progress with reps or a harder variation.'
                : 'Add reps, or add external load once you can do ${p.repMax + 2} on every set.',
          ],
          sets: p.sets,
          weightKg: usesLoad ? workingKg : null,
          reps: p.repMax + 1,
          basedOn: last.date,
        );
      }
      if (grinding) {
        return Recommendation(
          action: ProgressionAction.maintain,
          headline: 'Repeat ${_kg(workingKg)} × ${p.repMax}',
          reasons: [
            'Last session ($when): $summary.',
            'You hit the top of the range, but effort was very high (RPE ${_rpe(maxRpe ?? avgRpe!)}). Repeat the load until it feels more controlled.',
          ],
          sets: p.sets,
          weightKg: workingKg,
          reps: p.repMax,
          basedOn: last.date,
        );
      }
      if (input.lowReadiness) {
        return Recommendation(
          action: ProgressionAction.maintain,
          headline: 'Hold ${_kg(workingKg)} today',
          reasons: [
            'Last session ($when): $summary — you earned an increase.',
            'Your recovery signals are below your usual range today, so hold the load. You can still override this.',
          ],
          sets: p.sets,
          weightKg: workingKg,
          reps: p.repMax,
          basedOn: last.date,
        );
      }

      // Repeated easy success at this load → two increments.
      final previous = history.length > 1 ? history[1] : null;
      final repeated = previous != null && _hitTopAt(previous, workingKg, p);
      final easy = avgRpe != null && avgRpe <= target - 2;
      final desiredSteps = repeated && easy ? 2 : 1;

      final cap = input.limits.maxJumpKg(workingKg, lowerBody: input.lowerBody);
      final allowedSteps = (cap / inc + 1e-9).floor();
      if (allowedSteps < 1) {
        return Recommendation(
          action: ProgressionAction.increaseReps,
          headline: 'Aim for ${p.repMax + 1} reps at ${_kg(workingKg)}',
          reasons: [
            'Last session ($when): $summary — every set reached the top of the range.',
            'The smallest available jump (${_kg(inc)}) would be a ${(inc / workingKg * 100).toStringAsFixed(0)}% increase, above your safety limit '
                '(${input.limits.maxIncreasePct.toStringAsFixed(0)}% / ${_kg(cap)}). Add reps first, or adjust the limit in Settings.',
          ],
          sets: p.sets,
          weightKg: workingKg,
          reps: p.repMax + 1,
          safetyCapped: true,
          basedOn: last.date,
        );
      }
      final steps = math.min(desiredSteps, allowedSteps);
      final next = roundToIncrement(workingKg + steps * inc, inc, mode: RoundMode.down);
      return Recommendation(
        action: ProgressionAction.increaseLoad,
        headline: 'Add ${_kg(next - workingKg)} → ${_kg(next)} × ${p.repMin}',
        reasons: [
          'Last session ($when): $summary — every set reached the top of your ${p.repMin}–${p.repMax} range.',
          if (steps == 2) 'You also did this at ${_date.format(previous!.date)} with effort to spare, so a slightly bigger step is reasonable.',
          if (desiredSteps > steps) 'A bigger jump was held back by your safety limit.',
          'Start the new load at ${p.repMin} reps and build back up to ${p.repMax}.',
          ?rpeNote,
        ],
        sets: p.sets,
        weightKg: next,
        reps: p.repMin,
        safetyCapped: desiredSteps > steps,
        basedOn: last.date,
      );
    }

    if (allMin) {
      final lowest = reps.reduce(math.min);
      final goal = math.min(p.repMax, lowest + 1);
      return Recommendation(
        action: ProgressionAction.increaseReps,
        headline: usesLoad ? '${_kg(workingKg)} × $goal' : '$goal reps per set',
        reasons: [
          'Last session ($when): $summary.',
          'You are inside your ${p.repMin}–${p.repMax} range. Keep the load and add a rep where you can; '
              'increase the load once every set reaches ${p.repMax}.',
          ?rpeNote,
        ],
        sets: p.sets,
        weightKg: usesLoad ? workingKg : null,
        reps: goal,
        basedOn: last.date,
      );
    }

    // Missed the bottom of the range.
    final previous = history.length > 1 ? history[1] : null;
    final missedBefore = previous != null && _missedMinAt(previous, workingKg, p);
    if (missedBefore && usesLoad) {
      final kg = inc == null ? workingKg * tuning.deloadFactor : roundToIncrement(workingKg * tuning.deloadFactor, inc, mode: RoundMode.down);
      return Recommendation(
        action: ProgressionAction.reduceLoad,
        headline: 'Drop to ${_kg(kg)} × ${p.repMin}',
        reasons: [
          'Last session ($when): $summary.',
          'This is the second session in a row below ${p.repMin} reps at ${_kg(workingKg)} '
              '(also on ${_date.format(previous.date)}). A ~10% lighter load lets you build back up with good reps.',
        ],
        sets: p.sets,
        weightKg: kg,
        reps: p.repMin,
        basedOn: last.date,
      );
    }
    final missed = reps.where((r) => r < p.repMin).length;
    return Recommendation(
      action: ProgressionAction.maintain,
      headline: usesLoad ? 'Repeat ${_kg(workingKg)} × ${p.repMin}' : 'Repeat: ${p.repMin} reps per set',
      reasons: [
        'Last session ($when): $summary.',
        '$missed set${missed == 1 ? '' : 's'} fell below ${p.repMin} reps. One tough session is not a trend — repeat the load and aim for ${p.repMin}+.',
      ],
      sets: p.sets,
      weightKg: usesLoad ? workingKg : null,
      reps: p.repMin,
      basedOn: last.date,
    );
  }

  // ------------------------------------------------------------------ others

  Recommendation _duration(ProgressionInput input, List<ExerciseSession> history) {
    final last = history.first;
    final best = last.workingSets.map((s) => s.durationS ?? 0).reduce(math.max);
    final next = best + (best < 60 ? 5 : 10);
    return Recommendation(
      action: input.deloadWeek ? ProgressionAction.deload : ProgressionAction.increaseDuration,
      headline: input.deloadWeek ? 'Easy holds this week' : 'Hold for ${next}s',
      reasons: [
        'Last session (${_date.format(last.date)}): best hold ${best}s.',
        if (!input.deloadWeek) 'Add a few seconds while keeping good form.',
      ],
      sets: input.prescription.sets,
      durationS: input.deloadWeek ? best : next,
      basedOn: last.date,
    );
  }

  Recommendation _cardio(ProgressionInput input, List<ExerciseSession> history) {
    final last = history.first;
    final s = last.workingSets.first;
    return Recommendation(
      action: ProgressionAction.maintain,
      headline: 'Last time: ${_describe([s], input.tracking)}',
      reasons: ['Cardio is not auto-progressed. Use the previous session as a reference.'],
      sets: 1,
      durationS: s.durationS,
      basedOn: last.date,
    );
  }

  Recommendation _baseline(ProgressionInput input) {
    final p = input.prescription;
    final start = input.startWeightKg;
    final weighted = input.tracking == TrackingType.weightReps || input.tracking == TrackingType.weightDistance;
    if (start != null && start > 0 && weighted) {
      final reps = input.tracking.usesReps ? p.repMax : null;
      return Recommendation(
        action: ProgressionAction.startingWeight,
        headline: 'Starting weight from your plan: ${_kg(start)}${reps == null ? '' : ' × $reps'}',
        reasons: [
          'No previous sessions recorded, so Forma uses the starting weight you set in the plan.',
          'Log what you actually lift. From the next session, progression works from your logged sets.',
        ],
        sets: p.sets,
        weightKg: start,
        reps: reps,
      );
    }
    final reasons = switch (input.tracking) {
      TrackingType.duration => ['No previous sessions recorded. Hold for as long as you can with good form.'],
      TrackingType.distanceDuration => ['No previous sessions recorded. Log distance and time to build a reference.'],
      _ => [
          'No previous sessions recorded for this exercise, so there is no basis for a load suggestion.',
          'Pick a weight you could lift for about ${p.repMax} reps with 2–3 reps to spare. Forma will progress from what you log.',
        ],
    };
    return Recommendation(
      action: ProgressionAction.baseline,
      headline: 'First time — find your working weight',
      reasons: reasons,
      sets: p.sets,
      reps: input.tracking.usesReps ? p.repMax : null,
    );
  }

  // ------------------------------------------------------------------ helpers

  bool _hitTopAt(ExerciseSession s, double kg, Prescription p) {
    final at = [for (final x in s.workingSets) if ((x.weightKg ?? 0) == kg) x];
    return at.length >= p.sets && at.every((x) => (x.reps ?? 0) >= p.repMax);
  }

  bool _missedMinAt(ExerciseSession s, double kg, Prescription p) {
    final at = [for (final x in s.workingSets) if ((x.weightKg ?? 0) == kg) x];
    return at.isNotEmpty && at.any((x) => (x.reps ?? 0) < p.repMin);
  }

  /// Consecutive most-recent sessions at [kg] with no e1RM improvement.
  int _stalledSessions(List<ExerciseSession> history, double kg) {
    var count = 0;
    double? bestSoFar;
    // Walk oldest → newest within the run of sessions at this top load.
    final run = <ExerciseSession>[];
    for (final s in history) {
      final top = s.workingSets.map((x) => x.weightKg ?? 0).fold<double>(0, math.max);
      if (top != kg) break;
      run.add(s);
    }
    for (final s in run.reversed) {
      final e = bestOneRepMax(s) ?? 0;
      if (bestSoFar == null || e > bestSoFar * 1.005) {
        bestSoFar = e;
        count = 1;
      } else {
        count++;
      }
    }
    return count;
  }

  static String _describe(List<SetRecord> sets, TrackingType tracking) {
    if (tracking == TrackingType.distanceDuration) {
      final s = sets.first;
      final km = s.distanceM == null ? null : (s.distanceM! / 1000).toStringAsFixed(2);
      final min = s.durationS == null ? null : (s.durationS! / 60).toStringAsFixed(0);
      return [if (km != null) '$km km', if (min != null) '$min min'].join(' in ');
    }
    // Group identical sets: "3 × 8 @ 60 kg".
    final parts = <String>[];
    var i = 0;
    while (i < sets.length) {
      var j = i;
      while (j + 1 < sets.length && sets[j + 1].weightKg == sets[i].weightKg && sets[j + 1].reps == sets[i].reps) {
        j++;
      }
      final n = j - i + 1;
      final s = sets[i];
      final load = (s.weightKg ?? 0) > 0 ? ' @ ${_kg(s.weightKg!)}' : '';
      parts.add('${n > 1 ? '$n × ' : ''}${s.reps ?? 0} reps$load');
      i = j + 1;
    }
    final rpes = [for (final s in sets) if (s.rpe != null) s.rpe!];
    final rpe = rpes.isEmpty ? '' : ', RPE ${_rpe(rpes.reduce(math.max))}';
    return '${parts.join(', ')}$rpe';
  }

  static String _kg(double kg) {
    final s = kg.toStringAsFixed(kg.truncateToDouble() == kg ? 0 : (kg * 10).truncateToDouble() == kg * 10 ? 1 : 2);
    return '$s kg';
  }

  static String _rpe(double r) => r.toStringAsFixed(r.truncateToDouble() == r ? 0 : 1);
}
