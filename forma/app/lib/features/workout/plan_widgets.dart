import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../app/providers.dart';
import '../../core/theme/app_theme.dart';
import '../../core/theme/tokens.dart';
import '../../core/util/format.dart';
import '../../data/repositories/exercise_repository.dart';
import '../../data/repositories/workout_repository.dart';
import '../../domain/catalog.dart';
import '../../domain/training/progression_engine.dart';
import 'workout_providers.dart';

/// The load part of a recommendation: "82.5 kg", "BW + 10 kg", "45 s".
/// `null` when there is nothing to show yet (first time, no starting weight).
String? loadText(Recommendation r, TrackingType tracking, Units units) => switch (tracking) {
      TrackingType.weightReps || TrackingType.weightDistance => r.weightKg == null ? null : units.weight(r.weightKg),
      TrackingType.bodyweightReps => r.weightKg != null && r.weightKg! > 0 ? 'BW + ${units.weight(r.weightKg)}' : 'Bodyweight',
      TrackingType.duration => r.durationS == null ? null : '${r.durationS} s',
      TrackingType.distanceDuration => null,
    };

/// The next session's load for an exercise, right-aligned: the weight, the
/// reps and whether it goes up or down. The headline explains it on tap.
class NextLoad extends ConsumerWidget {
  const NextLoad(this.query, {super.key});
  final NextLoadQuery query;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final c = context.colors;
    final rec = ref.watch(nextLoadProvider(query)).value;
    if (rec == null) return const SizedBox(width: 48);
    final tracking = query.exercise.tracking;
    final load = loadText(rec, tracking, ref.watch(unitsProvider));
    final (IconData? icon, Color color) = switch (rec.action) {
      ProgressionAction.increaseLoad => (Icons.arrow_upward_rounded, c.positive),
      ProgressionAction.reduceLoad || ProgressionAction.deload => (Icons.arrow_downward_rounded, c.caution),
      _ => (null, c.textPrimary),
    };
    final detail = [
      if (tracking.usesReps && rec.reps != null) '× ${rec.reps}',
      if (rec.action == ProgressionAction.startingWeight) 'start',
    ].join(' · ');
    return Tooltip(
      message: rec.headline,
      triggerMode: TooltipTriggerMode.tap,
      child: Column(crossAxisAlignment: CrossAxisAlignment.end, mainAxisSize: MainAxisSize.min, children: [
        Row(mainAxisSize: MainAxisSize.min, children: [
          if (icon != null) ...[Icon(icon, size: 14, color: color), const SizedBox(width: 2)],
          Text(
            load ?? (tracking.usesWeight && tracking != TrackingType.bodyweightReps ? 'Set weight' : '—'),
            style: (load == null ? context.text.labelMedium : context.text.titleSmall)?.copyWith(
              color: load == null ? c.textTertiary : color,
              fontFeatures: tabularFigures,
            ),
          ),
        ]),
        if (detail.isNotEmpty) Text(detail, style: context.text.labelSmall?.copyWith(color: c.textSecondary)),
      ]),
    );
  }
}

/// "3 × 6–10" (or "3 sets" for exercises without reps).
String schemeText(int sets, int repMin, int repMax, TrackingType tracking) =>
    tracking.usesReps ? '$sets × ${repMin == repMax ? '$repMin' : '$repMin–$repMax'}' : '$sets sets';

/// One exercise of a plan: name and sets on the left, next load on the right.
class PlanExerciseRow extends StatelessWidget {
  const PlanExerciseRow(this.item, {super.key, this.dense = false});
  final TemplateItem item;
  final bool dense;

  @override
  Widget build(BuildContext context) {
    final r = item.row;
    return Padding(
      padding: EdgeInsets.symmetric(vertical: dense ? 3 : 5),
      child: Row(children: [
        Expanded(
          child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
            Text(item.exercise.name, maxLines: 1, overflow: TextOverflow.ellipsis, style: dense ? context.text.bodyMedium : context.text.bodyLarge),
            Text(schemeText(r.sets, r.repMin, r.repMax, item.exercise.tracking), style: context.text.labelSmall?.copyWith(color: context.colors.textSecondary)),
          ]),
        ),
        const SizedBox(width: Space.md),
        NextLoad(NextLoadQuery.of(item)),
      ]),
    );
  }
}
