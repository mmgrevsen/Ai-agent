import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../app/providers.dart';
import '../../core/theme/tokens.dart';
import '../../core/widgets/inputs.dart';
import '../../core/widgets/primitives.dart';
import '../../core/widgets/states.dart';
import '../../data/db/app_database.dart';
import '../../data/repositories/exercise_repository.dart';
import '../../domain/catalog.dart';

/// Opens the library as a picker and returns the chosen exercise.
Future<Exercise?> showExercisePicker(BuildContext context, {String title = 'Add exercise'}) =>
    Navigator.of(context, rootNavigator: true).push<Exercise>(
      MaterialPageRoute(fullscreenDialog: true, builder: (_) => ExerciseLibraryScreen(pickTitle: title)),
    );

class ExerciseLibraryScreen extends ConsumerStatefulWidget {
  const ExerciseLibraryScreen({super.key, this.pickTitle});

  /// Non-null → picker mode: tapping an exercise returns it.
  final String? pickTitle;

  @override
  ConsumerState<ExerciseLibraryScreen> createState() => _ExerciseLibraryScreenState();
}

class _ExerciseLibraryScreenState extends ConsumerState<ExerciseLibraryScreen> {
  final _query = TextEditingController();
  String? _muscle;
  bool _availableOnly = true;

  bool get _picking => widget.pickTitle != null;

  @override
  void dispose() {
    _query.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final library = ref.watch(exerciseLibraryProvider);
    final ctx = ref.watch(trainingContextProvider);
    final c = context.colors;

    return Scaffold(
      appBar: AppBar(
        title: Text(widget.pickTitle ?? 'Exercises'),
        leading: _picking ? IconButton(icon: const Icon(Icons.close_rounded), onPressed: () => Navigator.pop(context)) : null,
        actions: [
          TextButton.icon(
            onPressed: () async {
              final created = await _createCustom(context);
              if (created != null && _picking && context.mounted) Navigator.pop(context, created);
            },
            icon: const Icon(Icons.add_rounded),
            label: const Text('Custom'),
          ),
        ],
      ),
      body: Column(
        children: [
          Padding(
            padding: const EdgeInsets.fromLTRB(Space.gutter, Space.sm, Space.gutter, Space.sm),
            child: TextField(
              controller: _query,
              autofocus: _picking,
              onChanged: (_) => setState(() {}),
              decoration: InputDecoration(
                hintText: 'Search exercises',
                prefixIcon: const Icon(Icons.search_rounded),
                suffixIcon: _query.text.isEmpty
                    ? null
                    : IconButton(
                        icon: const Icon(Icons.close_rounded),
                        onPressed: () => setState(_query.clear),
                      ),
              ),
            ),
          ),
          SizedBox(
            height: 44,
            child: ListView(
              scrollDirection: Axis.horizontal,
              padding: const EdgeInsets.symmetric(horizontal: Space.gutter),
              children: [
                if (ctx.available.isNotEmpty) ...[
                  ToggleChip(
                    label: 'My equipment',
                    selected: _availableOnly,
                    onTap: () => setState(() => _availableOnly = !_availableOnly),
                  ),
                  const SizedBox(width: Space.sm),
                ],
                for (final m in muscleLabels.entries) ...[
                  ToggleChip(
                    label: m.value,
                    selected: _muscle == m.key,
                    onTap: () => setState(() => _muscle = _muscle == m.key ? null : m.key),
                  ),
                  const SizedBox(width: Space.sm),
                ],
              ],
            ),
          ),
          const SizedBox(height: Space.sm),
          Expanded(
            child: AsyncView(
              value: library,
              data: (all) {
                var list = ExerciseRepository.search(all, _query.text, muscle: _muscle);
                if (_availableOnly) list = [for (final e in list) if (ctx.hasEquipmentFor(e)) e];
                if (list.isEmpty) {
                  return EmptyState(
                    icon: Icons.search_off_rounded,
                    title: 'No matches',
                    message: _availableOnly && ctx.available.isNotEmpty
                        ? 'Try turning off “My equipment”, or create a custom exercise.'
                        : 'Create a custom exercise to track it.',
                  );
                }
                return ListView.separated(
                  padding: const EdgeInsets.only(bottom: 120),
                  itemCount: list.length,
                  separatorBuilder: (_, _) => Divider(indent: Space.gutter, color: c.outline),
                  itemBuilder: (context, i) {
                    final e = list[i];
                    final restricted = ctx.restrictionFor(e);
                    final missing = ctx.hasEquipmentFor(e) ? null : 'Needs ${e.equipmentList.where((x) => !ctx.available.contains(x)).map((x) => equipmentInfo(x)?.label ?? x).join(', ')}';
                    return ListTile(
                      onTap: () {
                        if (_picking) {
                          Navigator.pop(context, e);
                        } else {
                          context.go('/workout/exercises/${e.id}');
                        }
                      },
                      title: Row(
                        children: [
                          Flexible(child: Text(e.name)),
                          if (e.isCustom) ...[const SizedBox(width: Space.sm), const ProvenanceBadge(Provenance.custom, compact: true)],
                        ],
                      ),
                      subtitle: Text(
                        [
                          muscleLabel(e.primaryMuscle),
                          if (e.equipmentList.isNotEmpty) e.equipmentList.map((x) => equipmentInfo(x)?.label ?? x).join(' + ') else 'Bodyweight',
                          ?restricted,
                          ?missing,
                        ].join(' · '),
                        style: context.text.bodySmall?.copyWith(color: restricted != null ? c.caution : null),
                      ),
                      trailing: _picking ? Icon(Icons.add_circle_outline_rounded, color: c.textSecondary) : const Icon(Icons.chevron_right_rounded),
                    );
                  },
                );
              },
            ),
          ),
        ],
      ),
    );
  }

  Future<Exercise?> _createCustom(BuildContext context) async {
    final id = await showModalBottomSheet<String>(
      context: context,
      isScrollControlled: true,
      useSafeArea: true,
      builder: (_) => const _CustomExerciseSheet(),
    );
    if (id == null) return null;
    return ref.read(exerciseRepositoryProvider).byId(id);
  }
}

class _CustomExerciseSheet extends ConsumerStatefulWidget {
  const _CustomExerciseSheet();

  @override
  ConsumerState<_CustomExerciseSheet> createState() => _CustomExerciseSheetState();
}

class _CustomExerciseSheetState extends ConsumerState<_CustomExerciseSheet> {
  final _name = TextEditingController();
  final _notes = TextEditingController();
  String _muscle = 'chest';
  String _pattern = 'horizontal_push';
  TrackingType _tracking = TrackingType.weightReps;
  final Set<String> _equipment = {};

  @override
  void dispose() {
    _name.dispose();
    _notes.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: EdgeInsets.only(bottom: MediaQuery.viewInsetsOf(context).bottom),
      child: SingleChildScrollView(
        padding: const EdgeInsets.fromLTRB(Space.gutter, 0, Space.gutter, Space.xl),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text('Custom exercise', style: context.text.titleLarge),
            const SizedBox(height: Space.lg),
            TextField(controller: _name, autofocus: true, decoration: const InputDecoration(labelText: 'Name'), onChanged: (_) => setState(() {})),
            const SizedBox(height: Space.lg),
            const Eyebrow('Tracks'),
            const SizedBox(height: Space.sm),
            Wrap(spacing: Space.sm, runSpacing: Space.sm, children: [
              for (final (t, l) in const [
                (TrackingType.weightReps, 'Weight × reps'),
                (TrackingType.bodyweightReps, 'Bodyweight reps'),
                (TrackingType.duration, 'Time'),
                (TrackingType.distanceDuration, 'Distance + time'),
                (TrackingType.weightDistance, 'Weight + distance'),
              ])
                ToggleChip(label: l, selected: _tracking == t, onTap: () => setState(() => _tracking = t)),
            ]),
            const SizedBox(height: Space.lg),
            const Eyebrow('Primary muscle'),
            const SizedBox(height: Space.sm),
            Wrap(spacing: Space.sm, runSpacing: Space.sm, children: [
              for (final m in muscleLabels.entries) ToggleChip(label: m.value, selected: _muscle == m.key, onTap: () => setState(() => _muscle = m.key)),
            ]),
            const SizedBox(height: Space.lg),
            const Eyebrow('Movement (used for substitutions)'),
            const SizedBox(height: Space.sm),
            Wrap(spacing: Space.sm, runSpacing: Space.sm, children: [
              for (final p in patternLabels.entries) ToggleChip(label: p.value, selected: _pattern == p.key, onTap: () => setState(() => _pattern = p.key)),
            ]),
            const SizedBox(height: Space.lg),
            const Eyebrow('Equipment'),
            const SizedBox(height: Space.sm),
            Wrap(spacing: Space.sm, runSpacing: Space.sm, children: [
              for (final e in equipmentCatalog)
                ToggleChip(
                  label: e.label,
                  selected: _equipment.contains(e.code),
                  onTap: () => setState(() => _equipment.contains(e.code) ? _equipment.remove(e.code) : _equipment.add(e.code)),
                ),
            ]),
            const SizedBox(height: Space.lg),
            TextField(controller: _notes, maxLines: 3, decoration: const InputDecoration(labelText: 'Instructions (optional)')),
            const SizedBox(height: Space.xl),
            SizedBox(
              width: double.infinity,
              child: FilledButton(
                onPressed: _name.text.trim().isEmpty
                    ? null
                    : () async {
                        final id = await ref.read(exerciseRepositoryProvider).createCustom(
                              name: _name.text,
                              primaryMuscle: _muscle,
                              pattern: _pattern,
                              tracking: _tracking,
                              equipment: _equipment.toList(),
                              instructions: _notes.text,
                            );
                        if (context.mounted) Navigator.pop(context, id);
                      },
                child: const Text('Create exercise'),
              ),
            ),
          ],
        ),
      ),
    );
  }
}
