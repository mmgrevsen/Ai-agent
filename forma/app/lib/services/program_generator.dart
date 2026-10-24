import '../data/db/app_database.dart';
import '../data/repositories/exercise_repository.dart';
import '../data/repositories/workout_repository.dart';

enum TrainingGoal {
  strength('build_strength', 'Build strength'),
  muscle('build_muscle', 'Build muscle'),
  loseFat('lose_fat', 'Lose fat'),
  maintain('maintain', 'Maintain'),
  general('general', 'General fitness');

  const TrainingGoal(this.code, this.label);
  final String code;
  final String label;

  static TrainingGoal fromCode(String c) => values.firstWhere((g) => g.code == c, orElse: () => general);
}

class PlannedTemplate {
  const PlannedTemplate({required this.name, required this.items, required this.weekdays});
  final String name;
  final List<TemplateItemInput> items;
  final List<int> weekdays;
}

class GeneratedProgram {
  const GeneratedProgram({required this.name, required this.templates, required this.skippedSlots});
  final String name;
  final List<PlannedTemplate> templates;

  /// Movement slots with no allowed exercise (missing equipment or restricted).
  final List<String> skippedSlots;
}

/// Ordered preferences per movement slot. The first exercise the user has
/// equipment for (and has not restricted) is chosen.
const _slots = <String, List<String>>{
  'squat': ['barbell-back-squat', 'hack-squat', 'leg-press', 'goblet-squat', 'smith-squat', 'bodyweight-squat'],
  'hinge': ['romanian-deadlift', 'dumbbell-romanian-deadlift', 'hip-thrust', 'kettlebell-swing', 'back-extension', 'nordic-curl'],
  'hinge_heavy': ['conventional-deadlift', 'trap-bar-deadlift', 'romanian-deadlift', 'dumbbell-romanian-deadlift', 'kettlebell-swing'],
  'press': ['barbell-bench-press', 'dumbbell-bench-press', 'machine-chest-press', 'smith-bench-press', 'push-up'],
  'incline_press': ['incline-dumbbell-press', 'incline-barbell-bench-press', 'machine-chest-press', 'push-up'],
  'overhead_press': ['overhead-press', 'dumbbell-shoulder-press', 'machine-shoulder-press', 'landmine-press'],
  'row': ['barbell-row', 'chest-supported-row', 'seated-cable-row', 'dumbbell-row', 'machine-row', 'inverted-row'],
  'pulldown': ['pull-up', 'lat-pulldown', 'assisted-pull-up', 'chin-up'],
  'lunge': ['bulgarian-split-squat', 'walking-lunge', 'step-up', 'reverse-lunge'],
  'leg_curl': ['lying-leg-curl', 'seated-leg-curl', 'nordic-curl'],
  'leg_extension': ['leg-extension'],
  'calf': ['standing-calf-raise', 'seated-calf-raise'],
  'chest_fly': ['cable-fly', 'pec-deck', 'dumbbell-fly'],
  'lateral_raise': ['dumbbell-lateral-raise', 'cable-lateral-raise'],
  'rear_delt': ['face-pull', 'rear-delt-fly'],
  'biceps': ['dumbbell-curl', 'ez-bar-curl', 'barbell-curl', 'cable-curl', 'hammer-curl'],
  'triceps': ['triceps-pushdown', 'overhead-triceps-extension', 'dumbbell-overhead-extension', 'skull-crusher', 'dip'],
  'core': ['plank', 'cable-crunch', 'hanging-leg-raise', 'dead-bug'],
};

const _compoundSlots = {'squat', 'hinge', 'hinge_heavy', 'press', 'incline_press', 'overhead_press', 'row', 'pulldown', 'lunge'};

const _weekdays = <int, List<int>>{
  1: [1],
  2: [1, 4],
  3: [1, 3, 5],
  4: [1, 2, 4, 5],
  5: [1, 2, 3, 4, 5],
  6: [1, 2, 3, 4, 5, 6],
};

class ProgramGenerator {
  const ProgramGenerator();

  GeneratedProgram generate({
    required List<Exercise> library,
    required TrainingContext context,
    required int daysPerWeek,
    required TrainingGoal goal,
    required String experience,
  }) {
    final days = daysPerWeek.clamp(1, 6);
    final byId = {for (final e in library) e.id: e};
    final skipped = <String>{};

    final (programName, layout) = switch (days) {
      <= 3 => (
          days == 1 ? 'Full body' : 'Full body A/B',
          [
            ('Full body A', ['squat', 'press', 'row', 'hinge', 'lateral_raise', 'core']),
            ('Full body B', ['hinge_heavy', 'overhead_press', 'pulldown', 'lunge', 'biceps', 'triceps']),
          ],
        ),
      4 => (
          'Upper / Lower',
          [
            ('Upper', ['press', 'row', 'overhead_press', 'pulldown', 'biceps', 'triceps']),
            ('Lower', ['squat', 'hinge', 'lunge', 'leg_curl', 'calf', 'core']),
          ],
        ),
      _ => (
          'Push / Pull / Legs',
          [
            ('Push', ['press', 'overhead_press', 'incline_press', 'lateral_raise', 'triceps']),
            ('Pull', ['pulldown', 'row', 'rear_delt', 'biceps', 'core']),
            ('Legs', ['squat', 'hinge', 'leg_extension', 'leg_curl', 'calf']),
          ],
        ),
    };

    final sets = experience == 'beginner' ? 3 : (experience == 'advanced' ? 4 : 3);
    final templates = <PlannedTemplate>[];
    final weekdays = _weekdays[days]!;
    for (final (i, (name, slots)) in layout.indexed) {
      final used = <String>{};
      final items = <TemplateItemInput>[];
      for (final slot in slots) {
        final pick = _slots[slot]!
            .map((id) => byId[id])
            .whereType<Exercise>()
            .where((e) => !used.contains(e.id) && context.hasEquipmentFor(e) && context.restrictionFor(e) == null)
            .firstOrNull;
        if (pick == null) {
          skipped.add(slot);
          continue;
        }
        used.add(pick.id);
        final compound = _compoundSlots.contains(slot);
        final (repMin, repMax) = _repRange(goal, compound: compound, tracking: pick.trackingType);
        items.add(TemplateItemInput(
          exerciseId: pick.id,
          sets: compound ? sets : 3,
          repMin: repMin,
          repMax: repMax,
          targetRpe: compound ? 8 : 9,
          restSeconds: compound ? (goal == TrainingGoal.strength ? 180 : 150) : 90,
          warmupSets: compound && pick.equipmentList.contains('barbell') ? 2 : 0,
        ));
      }
      // Rotate templates across the scheduled days (A, B, A, …).
      final assigned = [for (final (k, d) in weekdays.indexed) if (k % layout.length == i) d];
      templates.add(PlannedTemplate(name: name, items: items, weekdays: assigned));
    }
    return GeneratedProgram(name: programName, templates: templates, skippedSlots: skipped.toList());
  }

  (int, int) _repRange(TrainingGoal goal, {required bool compound, required String tracking}) {
    if (tracking == 'duration') return (1, 1);
    return switch (goal) {
      TrainingGoal.strength => compound ? (4, 6) : (8, 12),
      TrainingGoal.muscle => compound ? (6, 10) : (10, 15),
      _ => compound ? (8, 12) : (10, 15),
    };
  }
}
