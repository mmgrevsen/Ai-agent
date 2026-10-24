import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../app/providers.dart';
import '../../core/theme/tokens.dart';
import '../../core/util/format.dart';
import '../../core/widgets/primitives.dart';
import '../../core/widgets/states.dart';
import '../../data/repositories/workout_repository.dart';
import '../health/health_providers.dart';
import 'workout_providers.dart';

/// Starts a workout (from a template or empty) and opens the logger.
/// Guards against having two sessions in progress.
Future<void> startWorkout(BuildContext context, WidgetRef ref, {String? templateId}) async {
  final active = await ref.read(workoutRepositoryProvider).watchActiveWorkout().first;
  if (!context.mounted) return;
  if (active != null) {
    final resume = await showDialog<bool>(
      context: context,
      builder: (c) => AlertDialog(
        title: const Text('Workout in progress'),
        content: Text('“${active.name}” is still running. Resume it, or finish it before starting another.'),
        actions: [
          TextButton(onPressed: () => Navigator.pop(c, false), child: const Text('Cancel')),
          FilledButton(onPressed: () => Navigator.pop(c, true), child: const Text('Resume')),
        ],
      ),
    );
    if (resume == true && context.mounted) await context.push('/session/${active.id}');
    return;
  }
  final id = await ref.read(trainingServiceProvider).startWorkout(
        templateId: templateId,
        lowReadiness: ref.read(lowReadinessProvider),
      );
  if (context.mounted) await context.push('/session/$id');
}

class WorkoutHomeScreen extends ConsumerWidget {
  const WorkoutHomeScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final templates = ref.watch(templatesProvider);
    final history = ref.watch(historyProvider);
    final today = ref.watch(todaysTemplateProvider);
    final active = ref.watch(activeWorkoutProvider).value;
    final schedule = ref.watch(scheduleProvider).value;
    final units = ref.watch(unitsProvider);

    return PageScaffold(
      title: 'Workout',
      actions: [
        IconButton(
          tooltip: 'Exercise library',
          onPressed: () => context.go('/workout/exercises'),
          icon: const Icon(Icons.menu_book_rounded),
        ),
        IconButton(
          tooltip: 'Settings',
          onPressed: () => context.push('/settings'),
          icon: const Icon(Icons.settings_outlined),
        ),
      ],
      slivers: [
        SliverPadding(
          padding: const EdgeInsets.fromLTRB(Space.gutter, Space.lg, Space.gutter, 0),
          sliver: SliverToBoxAdapter(
            child: active != null
                ? FCard(
                    color: context.colors.accentMuted,
                    borderColor: context.colors.accent,
                    onTap: () => context.push('/session/${active.id}'),
                    child: Row(
                      children: [
                        Expanded(
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              const Eyebrow('In progress'),
                              const SizedBox(height: Space.xs),
                              Text(active.name, style: context.text.titleLarge),
                            ],
                          ),
                        ),
                        FilledButton(onPressed: () => context.push('/session/${active.id}'), child: const Text('Resume')),
                      ],
                    ),
                  )
                : _TodayCard(template: today, hasSchedule: schedule != null && schedule.days.isNotEmpty),
          ),
        ),
        SliverPadding(
          padding: const EdgeInsets.fromLTRB(Space.gutter, Space.md, Space.gutter, 0),
          sliver: SliverToBoxAdapter(
            child: OutlinedButton.icon(
              onPressed: active != null ? null : () => startWorkout(context, ref),
              icon: const Icon(Icons.add_rounded),
              label: const Text('Start empty workout'),
            ),
          ),
        ),
        SliverToBoxAdapter(
          child: SectionHeader('This week', action: 'Edit schedule', onAction: () => context.go('/workout/schedule')),
        ),
        SliverToBoxAdapter(child: _WeekStrip(schedule: schedule, templates: templates.value ?? const [])),
        SliverToBoxAdapter(
          child: SectionHeader('Templates', action: 'New', onAction: () => context.go('/workout/templates/new')),
        ),
        ...templates.when(
          data: (list) => list.isEmpty
              ? [
                  SliverToBoxAdapter(
                    child: EmptyState(
                      icon: Icons.view_list_rounded,
                      title: 'No templates yet',
                      message: 'Save a routine once and start it with one tap.',
                      actionLabel: 'Create template',
                      onAction: () => context.go('/workout/templates/new'),
                      compact: true,
                    ),
                  ),
                ]
              : [
                  SliverPadding(
                    padding: const EdgeInsets.symmetric(horizontal: Space.gutter),
                    sliver: SliverList.separated(
                      itemCount: list.length,
                      separatorBuilder: (_, _) => const SizedBox(height: Space.sm),
                      itemBuilder: (context, i) => _TemplateCard(item: list[i], disabled: active != null),
                    ),
                  ),
                ],
          loading: () => [const SliverToBoxAdapter(child: LoadingState(compact: true))],
          error: (e, _) => [SliverToBoxAdapter(child: ErrorState(message: describeError(e), compact: true))],
        ),
        const SliverToBoxAdapter(child: SectionHeader('History')),
        ...history.when(
          data: (list) => list.isEmpty
              ? [
                  const SliverToBoxAdapter(
                    child: EmptyState(
                      icon: Icons.history_rounded,
                      title: 'No workouts logged',
                      message: 'Finished workouts appear here. You can open and edit any of them.',
                      compact: true,
                    ),
                  ),
                ]
              : [
                  SliverList.builder(
                    itemCount: list.length,
                    itemBuilder: (context, i) => _HistoryRow(item: list[i], units: units),
                  ),
                ],
          loading: () => [const SliverToBoxAdapter(child: LoadingState(compact: true))],
          error: (e, _) => [SliverToBoxAdapter(child: ErrorState(message: describeError(e), compact: true))],
        ),
      ],
    );
  }
}

class _TodayCard extends ConsumerWidget {
  const _TodayCard({required this.template, required this.hasSchedule});
  final TemplateWithItems? template;
  final bool hasSchedule;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final c = context.colors;
    final t = template;
    if (t == null) {
      return FCard(
        child: Row(
          children: [
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Eyebrow(weekdayLong(ref.watch(todayProvider).weekday)),
                  const SizedBox(height: Space.xs),
                  Text(hasSchedule ? 'Rest day' : 'No plan for today', style: context.text.titleLarge),
                  const SizedBox(height: Space.xs),
                  Text(
                    hasSchedule ? 'Recovery is part of training. Start a template below if you want to train anyway.' : 'Assign templates to weekdays to see your plan here.',
                    style: context.text.bodyMedium,
                  ),
                ],
              ),
            ),
          ],
        ),
      );
    }
    final sets = t.items.fold<int>(0, (a, i) => a + i.row.sets);
    return FCard(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Eyebrow('Today · ${weekdayLong(ref.watch(todayProvider).weekday)}', color: c.accent),
          const SizedBox(height: Space.xs),
          Text(t.template.name, style: context.text.headlineMedium),
          const SizedBox(height: Space.xs),
          Text('${t.items.length} exercises · $sets working sets', style: context.text.bodyMedium),
          const SizedBox(height: Space.md),
          for (final item in t.items.take(6))
            Padding(
              padding: const EdgeInsets.symmetric(vertical: 3),
              child: Row(
                children: [
                  Expanded(child: Text(item.exercise.name, style: context.text.bodyLarge)),
                  Text(
                    '${item.row.sets} × ${item.row.repMin}–${item.row.repMax}',
                    style: context.text.labelMedium,
                  ),
                ],
              ),
            ),
          const SizedBox(height: Space.lg),
          SizedBox(
            width: double.infinity,
            child: FilledButton.icon(
              onPressed: () => startWorkout(context, ref, templateId: t.template.id),
              icon: const Icon(Icons.play_arrow_rounded),
              label: const Text('Start workout'),
            ),
          ),
        ],
      ),
    );
  }
}

class _WeekStrip extends ConsumerWidget {
  const _WeekStrip({required this.schedule, required this.templates});
  final ScheduleWithDays? schedule;
  final List<TemplateWithItems> templates;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final c = context.colors;
    final today = ref.watch(todayProvider).weekday;
    final names = {for (final t in templates) t.template.id: t.template.name};
    return SizedBox(
      height: 76,
      child: ListView.separated(
        padding: const EdgeInsets.symmetric(horizontal: Space.gutter),
        scrollDirection: Axis.horizontal,
        itemCount: 7,
        separatorBuilder: (_, _) => const SizedBox(width: Space.sm),
        itemBuilder: (context, i) {
          final day = i + 1;
          final name = names[schedule?.days[day]];
          final isToday = day == today;
          return Container(
            width: 92,
            padding: const EdgeInsets.all(Space.md),
            decoration: BoxDecoration(
              color: c.surface,
              borderRadius: BorderRadius.circular(Radii.md),
              border: Border.all(color: isToday ? c.textPrimary : c.outline),
            ),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              mainAxisAlignment: MainAxisAlignment.spaceBetween,
              children: [
                Eyebrow(weekdayShort(day), color: isToday ? c.textPrimary : null),
                Text(
                  name ?? 'Rest',
                  maxLines: 2,
                  overflow: TextOverflow.ellipsis,
                  style: context.text.labelMedium?.copyWith(color: name == null ? c.textTertiary : c.textPrimary),
                ),
              ],
            ),
          );
        },
      ),
    );
  }
}

class _TemplateCard extends ConsumerWidget {
  const _TemplateCard({required this.item, required this.disabled});
  final TemplateWithItems item;
  final bool disabled;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    return FCard(
      onTap: () => context.go('/workout/templates/${item.template.id}'),
      child: Row(
        children: [
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(item.template.name, style: context.text.titleMedium),
                const SizedBox(height: Space.xs),
                Text(
                  item.items.isEmpty ? 'No exercises' : item.items.map((i) => i.exercise.name).join(' · '),
                  maxLines: 2,
                  overflow: TextOverflow.ellipsis,
                  style: context.text.bodySmall,
                ),
              ],
            ),
          ),
          const SizedBox(width: Space.md),
          IconButton.filledTonal(
            tooltip: 'Start ${item.template.name}',
            onPressed: disabled || item.items.isEmpty ? null : () => startWorkout(context, ref, templateId: item.template.id),
            icon: const Icon(Icons.play_arrow_rounded),
          ),
        ],
      ),
    );
  }
}

class _HistoryRow extends StatelessWidget {
  const _HistoryRow({required this.item, required this.units});
  final WorkoutListItem item;
  final Units units;

  @override
  Widget build(BuildContext context) {
    final w = item.workout;
    final imported = w.source == 'imported';
    final mins = w.endedAt == null ? 0 : w.endedAt!.difference(w.startedAt).inMinutes;
    return ListTile(
      onTap: imported ? null : () => context.push('/session/${w.id}'),
      title: Row(
        children: [
          Flexible(child: Text(w.name, maxLines: 1, overflow: TextOverflow.ellipsis)),
          if (imported) ...[const SizedBox(width: Space.sm), const ProvenanceBadge(Provenance.imported, compact: true)],
        ],
      ),
      subtitle: Text(
        imported
            ? '${relativeDay(w.startedAt.toLocal())} · $mins min${w.energyKcal != null ? ' · ${kcal(w.energyKcal)} kcal (device estimate)' : ''}'
            : '${relativeDay(w.startedAt.toLocal())} · $mins min · ${item.setCount} sets · ${units.volume(item.volumeKg)}',
      ),
      trailing: imported ? null : const Icon(Icons.chevron_right_rounded),
    );
  }
}
