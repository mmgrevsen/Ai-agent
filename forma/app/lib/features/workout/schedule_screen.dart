import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../app/providers.dart';
import '../../content/content_providers.dart';
import '../../core/theme/tokens.dart';
import '../../core/util/format.dart';
import '../../core/widgets/primitives.dart';
import '../../core/widgets/states.dart';
import '../../services/program_generator.dart';
import 'workout_providers.dart';

class ScheduleScreen extends ConsumerWidget {
  const ScheduleScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final schedule = ref.watch(scheduleProvider);
    final templates = ref.watch(templatesProvider).value ?? const [];
    final repo = ref.watch(workoutRepositoryProvider);

    return PageScaffold(
      showBack: true,
      title: 'Schedule',
      slivers: [
        SliverToBoxAdapter(
          child: AsyncView(
            value: schedule,
            compact: true,
            data: (s) => Column(children: [
              for (var day = 1; day <= 7; day++)
                ListTile(
                  title: Text(weekdayLong(day)),
                  trailing: DropdownButton<String?>(
                    value: templates.any((t) => t.template.id == s?.days[day]) ? s?.days[day] : null,
                    underline: const SizedBox.shrink(),
                    hint: const Text('Rest'),
                    items: [
                      const DropdownMenuItem<String?>(value: null, child: Text('Rest')),
                      for (final t in templates) DropdownMenuItem<String?>(value: t.template.id, child: Text(t.template.name)),
                    ],
                    onChanged: (id) => repo.setScheduleDay(day, id),
                  ),
                ),
              const SectionHeader('Deload'),
              ListTile(
                title: const Text('Planned deload'),
                subtitle: const Text('Every Nth week, suggestions use ~90% load and fewer sets.'),
                trailing: DropdownButton<int?>(
                  value: s?.schedule.deloadEveryWeeks,
                  underline: const SizedBox.shrink(),
                  items: const [
                    DropdownMenuItem<int?>(value: null, child: Text('Off')),
                    DropdownMenuItem<int?>(value: 4, child: Text('Every 4 weeks')),
                    DropdownMenuItem<int?>(value: 5, child: Text('Every 5 weeks')),
                    DropdownMenuItem<int?>(value: 6, child: Text('Every 6 weeks')),
                    DropdownMenuItem<int?>(value: 8, child: Text('Every 8 weeks')),
                  ],
                  onChanged: repo.setDeloadFrequency,
                ),
              ),
            ]),
          ),
        ),
        const SliverToBoxAdapter(child: SectionHeader('Generate a plan')),
        SliverPadding(
          padding: const EdgeInsets.symmetric(horizontal: Space.gutter),
          sliver: SliverToBoxAdapter(
            child: FCard(
              child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                Text('Build a new plan from your goal, equipment and restrictions.', style: context.text.bodyMedium),
                const SizedBox(height: Space.md),
                OutlinedButton(onPressed: () => _generate(context, ref), child: const Text('Generate plan')),
              ]),
            ),
          ),
        ),
      ],
    );
  }

  Future<void> _generate(BuildContext context, WidgetRef ref) async {
    final profile = await ref.read(settingsRepositoryProvider).profile();
    final prefs = await ref.read(settingsRepositoryProvider).prefs();
    final library = await ref.read(exerciseRepositoryProvider).all();
    final program = ProgramGenerator(ref.read(programCatalogProvider)).generate(
      library: library,
      context: ref.read(trainingContextProvider),
      daysPerWeek: prefs.weeklyWorkoutTarget,
      goal: TrainingGoal.fromCode(profile.primaryGoal),
      experience: profile.experience,
    );
    if (!context.mounted) return;
    final ok = await showDialog<bool>(
      context: context,
      builder: (c) => AlertDialog(
        title: Text(program.name),
        content: SingleChildScrollView(
          child: Column(crossAxisAlignment: CrossAxisAlignment.start, mainAxisSize: MainAxisSize.min, children: [
            Text('${prefs.weeklyWorkoutTarget} days per week. New templates are added; existing ones are kept.', style: c.text.bodyMedium),
            for (final t in program.templates) ...[
              const SizedBox(height: Space.md),
              Text('${t.name} · ${t.weekdays.map(weekdayShort).join(', ')}', style: c.text.titleSmall),
              Text('${t.items.length} exercises', style: c.text.bodySmall),
            ],
            if (program.skippedSlots.isNotEmpty) ...[
              const SizedBox(height: Space.md),
              Text('Skipped (no suitable exercise for your equipment/restrictions): ${program.skippedSlots.join(', ')}', style: c.text.bodySmall),
            ],
          ]),
        ),
        actions: [
          TextButton(onPressed: () => Navigator.pop(c, false), child: const Text('Cancel')),
          FilledButton(onPressed: () => Navigator.pop(c, true), child: const Text('Create')),
        ],
      ),
    );
    if (ok == true) {
      await ref.read(trainingServiceProvider).installProgram(program);
      if (context.mounted) context.go('/workout');
    }
  }
}
