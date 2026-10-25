import '../content/content_bundle.dart';
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

/// Builds a starter program from the movement slots, layouts and
/// prescriptions in the active content ([ProgramCatalog]), filtered by the
/// user's equipment and restrictions.
class ProgramGenerator {
  const ProgramGenerator(this.catalog);
  final ProgramCatalog catalog;

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
    final layout = catalog.layoutFor(days);
    final sets = catalog.setsByExperience[experience] ?? catalog.setsByExperience['intermediate'] ?? 3;
    final templates = <PlannedTemplate>[];
    final weekdays = catalog.weekdays[days]!;
    for (final (i, template) in layout.templates.indexed) {
      final used = <String>{};
      final items = <TemplateItemInput>[];
      for (final slot in template.slots) {
        final pick = (catalog.slots[slot] ?? const <String>[])
            .map((id) => byId[id])
            .whereType<Exercise>()
            .where((e) => !used.contains(e.id) && context.hasEquipmentFor(e) && context.restrictionFor(e) == null)
            .firstOrNull;
        if (pick == null) {
          skipped.add(slot);
          continue;
        }
        used.add(pick.id);
        final compound = catalog.compoundSlots.contains(slot);
        final (repMin, repMax) = pick.trackingType == 'duration' ? (1, 1) : catalog.repRange(goal.code, compound: compound);
        items.add(TemplateItemInput(
          exerciseId: pick.id,
          sets: compound ? sets : catalog.isolationSets,
          repMin: repMin,
          repMax: repMax,
          targetRpe: compound ? catalog.compoundRpe : catalog.isolationRpe,
          restSeconds: compound ? (goal == TrainingGoal.strength ? catalog.restStrengthCompound : catalog.restCompound) : catalog.restIsolation,
          warmupSets: compound && pick.equipmentList.contains('barbell') ? catalog.barbellWarmupSets : 0,
        ));
      }
      // Rotate templates across the scheduled days (A, B, A, …).
      final assigned = [for (final (k, d) in weekdays.indexed) if (k % layout.templates.length == i) d];
      templates.add(PlannedTemplate(name: template.name, items: items, weekdays: assigned));
    }
    return GeneratedProgram(name: layout.nameFor(days), templates: templates, skippedSlots: skipped.toList());
  }
}
