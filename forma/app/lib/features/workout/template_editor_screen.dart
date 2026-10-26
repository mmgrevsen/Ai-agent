import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../app/providers.dart';
import '../../core/theme/tokens.dart';
import '../../core/util/format.dart';
import '../../core/widgets/inputs.dart';
import '../../core/widgets/primitives.dart';
import '../../core/widgets/states.dart';
import '../../data/db/app_database.dart';
import '../../data/repositories/exercise_repository.dart';
import '../../data/repositories/workout_repository.dart';
import '../../domain/catalog.dart';
import '../../domain/training/models.dart';
import '../../domain/training/progression_engine.dart';
import 'exercise_library_screen.dart';
import 'plan_widgets.dart';
import 'workout_providers.dart';

class _Item {
  _Item(this.exercise, {this.sets = 3, this.repMin = 8, this.repMax = 12, this.rpe, this.rest, this.warmups = 0, this.superset, this.startWeightKg});
  Exercise exercise;
  int sets;
  int repMin;
  int repMax;
  double? rpe;
  int? rest;
  int warmups;
  int? superset;
  double? startWeightKg;

  NextLoadQuery get query =>
      NextLoadQuery(exercise, Prescription(sets: sets, repMin: repMin, repMax: repMax, targetRpe: rpe), startWeightKg: startWeightKg);
}

class TemplateEditorScreen extends ConsumerStatefulWidget {
  const TemplateEditorScreen({super.key, this.templateId});
  final String? templateId;

  @override
  ConsumerState<TemplateEditorScreen> createState() => _TemplateEditorScreenState();
}

class _TemplateEditorScreenState extends ConsumerState<TemplateEditorScreen> {
  final _name = TextEditingController();
  final _notes = TextEditingController();
  final List<_Item> _items = [];
  bool _loading = true;
  bool _saving = false;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    final id = widget.templateId;
    if (id != null) {
      final t = await ref.read(workoutRepositoryProvider).template(id);
      if (t != null) {
        _name.text = t.template.name;
        _notes.text = t.template.notes ?? '';
        for (final i in t.items) {
          _items.add(_Item(
            i.exercise,
            sets: i.row.sets,
            repMin: i.row.repMin,
            repMax: i.row.repMax,
            rpe: i.row.targetRpe,
            rest: i.row.restSeconds,
            warmups: i.row.warmupSets,
            superset: i.row.supersetGroup,
            startWeightKg: i.row.startWeightKg,
          ));
        }
      }
    }
    if (mounted) setState(() => _loading = false);
  }

  @override
  void dispose() {
    _name.dispose();
    _notes.dispose();
    super.dispose();
  }

  Future<void> _save() async {
    if (_name.text.trim().isEmpty) {
      ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('Give the template a name.')));
      return;
    }
    setState(() => _saving = true);
    await ref.read(workoutRepositoryProvider).saveTemplate(
          id: widget.templateId,
          name: _name.text,
          notes: _notes.text.trim().isEmpty ? null : _notes.text.trim(),
          items: [
            for (final i in _items)
              TemplateItemInput(
                exerciseId: i.exercise.id,
                sets: i.sets,
                repMin: i.repMin,
                repMax: i.repMax,
                targetRpe: i.rpe,
                restSeconds: i.rest,
                warmupSets: i.warmups,
                supersetGroup: i.superset,
                startWeightKg: i.startWeightKg,
              ),
          ],
        );
    if (mounted) context.pop();
  }

  Future<void> _delete() async {
    final ok = await showDialog<bool>(
      context: context,
      builder: (c) => AlertDialog(
        title: const Text('Delete template?'),
        content: const Text('Past workouts are kept. Days using this template in your schedule become rest days.'),
        actions: [
          TextButton(onPressed: () => Navigator.pop(c, false), child: const Text('Cancel')),
          TextButton(onPressed: () => Navigator.pop(c, true), style: TextButton.styleFrom(foregroundColor: context.colors.negative), child: const Text('Delete')),
        ],
      ),
    );
    if (ok != true) return;
    await ref.read(workoutRepositoryProvider).deleteTemplate(widget.templateId!);
    if (mounted) context.pop();
  }

  @override
  Widget build(BuildContext context) {
    if (_loading) return const Scaffold(body: LoadingState());
    return Scaffold(
      appBar: AppBar(
        title: Text(widget.templateId == null ? 'New template' : 'Edit template'),
        actions: [
          if (widget.templateId != null) IconButton(tooltip: 'Delete', onPressed: _delete, icon: const Icon(Icons.delete_outline_rounded)),
          Padding(
            padding: const EdgeInsets.only(right: Space.md),
            child: FilledButton(
              onPressed: _saving ? null : _save,
              style: FilledButton.styleFrom(minimumSize: const Size(0, 40)),
              child: const Text('Save'),
            ),
          ),
        ],
      ),
      body: ReorderableListView(
        padding: const EdgeInsets.fromLTRB(Space.gutter, Space.sm, Space.gutter, 120),
        onReorderItem: (a, b) => setState(() => _items.insert(b, _items.removeAt(a))),
        header: Column(children: [
          TextField(controller: _name, decoration: const InputDecoration(labelText: 'Name'), textCapitalization: TextCapitalization.sentences),
          const SizedBox(height: Space.md),
          TextField(controller: _notes, decoration: const InputDecoration(labelText: 'Notes (optional)'), maxLines: 2),
          const SizedBox(height: Space.lg),
        ]),
        footer: Padding(
          padding: const EdgeInsets.only(top: Space.sm),
          child: OutlinedButton.icon(
            onPressed: () async {
              final e = await showExercisePicker(context);
              if (e != null) {
                final compound = e.mechanic == 'compound';
                setState(() => _items.add(_Item(e, repMin: compound ? 6 : 10, repMax: compound ? 10 : 15, rpe: 8, rest: compound ? 150 : 90)));
              }
            },
            icon: const Icon(Icons.add_rounded),
            label: const Text('Add exercise'),
          ),
        ),
        children: [
          for (final (i, item) in _items.indexed)
            Padding(
              key: ObjectKey(item),
              padding: const EdgeInsets.only(bottom: Space.sm),
              child: FCard(
                onTap: () => _editItem(item),
                child: Row(children: [
                  ReorderableDragStartListener(index: i, child: const Padding(padding: EdgeInsets.only(right: Space.md), child: Icon(Icons.drag_indicator_rounded))),
                  Expanded(
                    child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                      if (item.superset != null) Eyebrow('Superset ${String.fromCharCode(64 + item.superset!)}', color: context.colors.accent),
                      Text(item.exercise.name, style: context.text.titleSmall),
                      const SizedBox(height: 2),
                      Text(
                        [
                          if (item.warmups > 0) '${item.warmups} warm-up',
                          schemeText(item.sets, item.repMin, item.repMax, item.exercise.tracking),
                          if (item.rpe != null) 'RPE ${number(item.rpe!)}',
                          if (item.rest != null) 'rest ${clock(Duration(seconds: item.rest!))}',
                        ].join(' · '),
                        style: context.text.bodySmall,
                      ),
                    ]),
                  ),
                  const SizedBox(width: Space.sm),
                  NextLoad(item.query),
                  IconButton(onPressed: () => setState(() => _items.removeAt(i)), icon: const Icon(Icons.close_rounded), tooltip: 'Remove'),
                ]),
              ),
            ),
        ],
      ),
    );
  }

  Future<void> _editItem(_Item item) async {
    await showModalBottomSheet<void>(
      context: context,
      isScrollControlled: true,
      useSafeArea: true,
      builder: (c) => StatefulBuilder(
        builder: (c, set) {
          void update(VoidCallback f) {
            f();
            set(() {});
            setState(() {});
          }

          return SingleChildScrollView(
            padding: const EdgeInsets.fromLTRB(Space.gutter, 0, Space.gutter, Space.xxl),
            child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
              Text(item.exercise.name, style: c.text.titleLarge, textAlign: TextAlign.center),
              const SizedBox(height: Space.lg),
              _LoadSection(item: item, onStartWeight: (kg) => update(() => item.startWeightKg = kg)),
              const SizedBox(height: Space.xl),
              BigStepper(label: 'Working sets', value: item.sets.toDouble(), step: 1, min: 1, max: 10, decimals: 0, onChanged: (v) => update(() => item.sets = v.round())),
              if (item.exercise.tracking.usesReps) ...[
                const SizedBox(height: Space.lg),
                BigStepper(
                  label: 'Rep range — minimum',
                  value: item.repMin.toDouble(),
                  step: 1,
                  min: 1,
                  max: 50,
                  decimals: 0,
                  onChanged: (v) => update(() {
                    item.repMin = v.round();
                    if (item.repMax < item.repMin) item.repMax = item.repMin;
                  }),
                ),
                const SizedBox(height: Space.lg),
                BigStepper(
                  label: 'Rep range — maximum',
                  value: item.repMax.toDouble(),
                  step: 1,
                  min: 1,
                  max: 60,
                  decimals: 0,
                  onChanged: (v) => update(() {
                    item.repMax = v.round();
                    if (item.repMin > item.repMax) item.repMin = item.repMax;
                  }),
                ),
                const SizedBox(height: Space.lg),
                const Eyebrow('Target effort (RPE)'),
                const SizedBox(height: Space.sm),
                Wrap(spacing: Space.sm, runSpacing: Space.sm, children: [
                  ToggleChip(label: 'None', selected: item.rpe == null, onTap: () => update(() => item.rpe = null)),
                  for (final v in const [6.0, 7.0, 7.5, 8.0, 8.5, 9.0, 10.0])
                    ToggleChip(label: number(v), selected: item.rpe == v, onTap: () => update(() => item.rpe = v)),
                ]),
              ],
              const SizedBox(height: Space.lg),
              const Eyebrow('Warm-up sets'),
              const SizedBox(height: Space.sm),
              SegmentedPills<int>(values: const [0, 1, 2, 3], selected: item.warmups, labelOf: (v) => '$v', expand: true, onChanged: (v) => update(() => item.warmups = v)),
              const SizedBox(height: Space.lg),
              const Eyebrow('Rest'),
              const SizedBox(height: Space.sm),
              Wrap(spacing: Space.sm, runSpacing: Space.sm, children: [
                ToggleChip(label: 'Default', selected: item.rest == null, onTap: () => update(() => item.rest = null)),
                for (final s in const [60, 90, 120, 150, 180, 240])
                  ToggleChip(label: clock(Duration(seconds: s)), selected: item.rest == s, onTap: () => update(() => item.rest = s)),
              ]),
              const SizedBox(height: Space.lg),
              const Eyebrow('Superset group'),
              const SizedBox(height: Space.sm),
              Wrap(spacing: Space.sm, runSpacing: Space.sm, children: [
                ToggleChip(label: 'None', selected: item.superset == null, onTap: () => update(() => item.superset = null)),
                for (final g in const [1, 2, 3])
                  ToggleChip(label: String.fromCharCode(64 + g), selected: item.superset == g, onTap: () => update(() => item.superset = g)),
              ]),
              const SizedBox(height: Space.xs),
              Text('Exercises with the same letter are done back-to-back; rest starts after the last one.', style: c.text.bodySmall),
            ]),
          );
        },
      ),
    );
  }
}

/// The weight for this exercise: what the next session will use (from the
/// logged sets), or a starting weight to set while there is no history.
class _LoadSection extends ConsumerStatefulWidget {
  const _LoadSection({required this.item, required this.onStartWeight});
  final _Item item;
  final ValueChanged<double?> onStartWeight;

  @override
  ConsumerState<_LoadSection> createState() => _LoadSectionState();
}

class _LoadSectionState extends ConsumerState<_LoadSection> {
  late final _start = TextEditingController(
    text: widget.item.startWeightKg == null ? '' : number(ref.read(unitsProvider).toDisplay(widget.item.startWeightKg!), maxDecimals: 2),
  );

  @override
  void dispose() {
    _start.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final c = context.colors;
    final units = ref.watch(unitsProvider);
    final tracking = widget.item.exercise.tracking;
    final rec = ref.watch(nextLoadProvider(widget.item.query)).value;
    if (rec == null) return const SizedBox(height: 56);
    final noHistory = rec.action == ProgressionAction.baseline || rec.action == ProgressionAction.startingWeight;
    final weighted = tracking == TrackingType.weightReps || tracking == TrackingType.weightDistance;
    if (noHistory && weighted) {
      return Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
        NumberField(
          controller: _start,
          label: 'Starting weight',
          unit: units.weightLabel,
          hint: 'The weight you want to begin with',
          onChanged: (v) {
            final x = parseNumber(v);
            widget.onStartWeight(x == null || x <= 0 ? null : units.fromDisplay(x));
          },
        ),
        const SizedBox(height: Space.xs),
        Text(
          'Used the first time you train it. After that Forma suggests the weight from what you log.',
          style: context.text.bodySmall,
        ),
      ]);
    }
    final load = loadText(rec, tracking, units);
    final summary = [?load, if (tracking.usesReps && rec.reps != null) '× ${rec.reps}'].join(' ');
    return FCard(
      color: c.surfaceRaised,
      child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        const Eyebrow('Next time'),
        const SizedBox(height: Space.xs),
        if (summary.isNotEmpty) ...[
          Text(summary, style: context.text.headlineSmall),
          const SizedBox(height: Space.xs),
        ],
        Text(rec.headline, style: context.text.bodyMedium),
        for (final r in rec.reasons) Text(r, style: context.text.bodySmall),
      ]),
    );
  }
}
