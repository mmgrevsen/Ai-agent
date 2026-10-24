import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

import '../../../core/theme/app_theme.dart';
import '../../../core/theme/tokens.dart';
import '../../../core/util/format.dart';
import '../../../core/widgets/inputs.dart';
import '../../../core/widgets/primitives.dart';
import '../../../domain/catalog.dart';

class SetEditResult {
  const SetEditResult({
    required this.kind,
    this.weightKg,
    this.reps,
    this.durationS,
    this.distanceM,
    this.rpe,
    this.complete = false,
    this.delete = false,
  });

  final SetKind kind;
  final double? weightKg;
  final int? reps;
  final int? durationS;
  final double? distanceM;
  final double? rpe;
  final bool complete;
  final bool delete;
}

/// Bottom sheet for editing one set with large one-handed controls.
Future<SetEditResult?> showSetEditor(
  BuildContext context, {
  required String title,
  required TrackingType tracking,
  required Units units,
  required double incrementKg,
  required SetKind kind,
  double? weightKg,
  int? reps,
  int? durationS,
  double? distanceM,
  double? rpe,
  bool completed = false,
}) {
  return showModalBottomSheet<SetEditResult>(
    context: context,
    isScrollControlled: true,
    useSafeArea: true,
    builder: (_) => _SetEditor(
      title: title,
      tracking: tracking,
      units: units,
      incrementKg: incrementKg,
      kind: kind,
      weightKg: weightKg,
      reps: reps,
      durationS: durationS,
      distanceM: distanceM,
      rpe: rpe,
      completed: completed,
    ),
  );
}

class _SetEditor extends StatefulWidget {
  const _SetEditor({
    required this.title,
    required this.tracking,
    required this.units,
    required this.incrementKg,
    required this.kind,
    this.weightKg,
    this.reps,
    this.durationS,
    this.distanceM,
    this.rpe,
    required this.completed,
  });

  final String title;
  final TrackingType tracking;
  final Units units;
  final double incrementKg;
  final SetKind kind;
  final double? weightKg;
  final int? reps;
  final int? durationS;
  final double? distanceM;
  final double? rpe;
  final bool completed;

  @override
  State<_SetEditor> createState() => _SetEditorState();
}

class _SetEditorState extends State<_SetEditor> {
  late SetKind _kind = widget.kind;
  late final _weight = TextEditingController(text: widget.weightKg == null ? '' : number(widget.units.toDisplay(widget.weightKg!), maxDecimals: 2));
  late final _reps = TextEditingController(text: widget.reps?.toString() ?? '');
  late final _minutes = TextEditingController(text: widget.durationS == null ? '' : '${widget.durationS! ~/ 60}');
  late final _seconds = TextEditingController(text: widget.durationS == null ? '' : '${widget.durationS! % 60}');
  late final _distance = TextEditingController(text: widget.distanceM == null ? '' : number(widget.distanceM! / 1000, maxDecimals: 2));
  late double? _rpe = widget.rpe;

  @override
  void dispose() {
    _weight.dispose();
    _reps.dispose();
    _minutes.dispose();
    _seconds.dispose();
    _distance.dispose();
    super.dispose();
  }

  double get _step => widget.units.toDisplay(widget.incrementKg);

  void _bump(TextEditingController c, double delta, {int decimals = 2, double min = 0}) {
    HapticFeedback.selectionClick();
    final v = (parseNumber(c.text) ?? 0) + delta;
    c.text = number(v < min ? min : v, maxDecimals: decimals);
    setState(() {});
  }

  SetEditResult _result({bool complete = false}) {
    final w = parseNumber(_weight.text);
    final m = int.tryParse(_minutes.text) ?? 0;
    final s = int.tryParse(_seconds.text) ?? 0;
    final d = parseNumber(_distance.text);
    return SetEditResult(
      kind: _kind,
      weightKg: w == null ? null : widget.units.fromDisplay(w),
      reps: int.tryParse(_reps.text),
      durationS: widget.tracking.usesDuration && (m > 0 || s > 0) ? m * 60 + s : null,
      distanceM: d == null ? null : d * 1000,
      rpe: _rpe,
      complete: complete,
    );
  }

  String? get _missing {
    final r = _result();
    if (widget.tracking.usesReps && (r.reps == null || r.reps! <= 0)) return 'Enter reps';
    if (widget.tracking == TrackingType.weightReps && r.weightKg == null) return 'Enter weight';
    if (widget.tracking.usesDuration && r.durationS == null) return 'Enter time';
    if (widget.tracking == TrackingType.weightDistance && r.distanceM == null) return 'Enter distance';
    return null;
  }

  @override
  Widget build(BuildContext context) {
    final c = context.colors;
    final t = widget.tracking;
    final missing = _missing;
    return Padding(
      padding: EdgeInsets.only(bottom: MediaQuery.viewInsetsOf(context).bottom),
      child: SingleChildScrollView(
        padding: const EdgeInsets.fromLTRB(Space.gutter, 0, Space.gutter, Space.xl),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Text(widget.title, style: context.text.titleLarge, textAlign: TextAlign.center),
            const SizedBox(height: Space.lg),
            SegmentedPills<SetKind>(
              values: SetKind.values,
              selected: _kind,
              expand: true,
              labelOf: (k) => switch (k) {
                SetKind.warmup => 'Warm-up',
                SetKind.working => 'Working',
                SetKind.drop => 'Drop',
                SetKind.failure => 'Failure',
              },
              onChanged: (k) => setState(() => _kind = k),
            ),
            const SizedBox(height: Space.xl),
            if (t.usesWeight)
              _StepperField(
                label: t == TrackingType.bodyweightReps ? 'Added weight (${widget.units.weightLabel})' : 'Weight (${widget.units.weightLabel})',
                controller: _weight,
                onMinus: () => _bump(_weight, -_step),
                onPlus: () => _bump(_weight, _step),
                onChanged: () => setState(() {}),
              ),
            if (t.usesReps) ...[
              const SizedBox(height: Space.lg),
              _StepperField(
                label: 'Reps',
                controller: _reps,
                decimals: false,
                onMinus: () => _bump(_reps, -1, decimals: 0),
                onPlus: () => _bump(_reps, 1, decimals: 0),
                onChanged: () => setState(() {}),
              ),
            ],
            if (t.usesDuration) ...[
              const SizedBox(height: Space.lg),
              Row(
                children: [
                  Expanded(child: NumberField(controller: _minutes, label: 'Minutes', decimals: false, onChanged: (_) => setState(() {}))),
                  const SizedBox(width: Space.md),
                  Expanded(child: NumberField(controller: _seconds, label: 'Seconds', decimals: false, onChanged: (_) => setState(() {}))),
                ],
              ),
            ],
            if (t.usesDistance) ...[
              const SizedBox(height: Space.md),
              NumberField(controller: _distance, label: 'Distance', unit: 'km', onChanged: (_) => setState(() {})),
            ],
            if (t.usesReps) ...[
              const SizedBox(height: Space.xl),
              Row(
                children: [
                  const Eyebrow('Effort (RPE)'),
                  const SizedBox(width: Space.sm),
                  Expanded(
                    child: Text(
                      '10 = max effort · 8 ≈ 2 reps left',
                      style: context.text.bodySmall,
                      textAlign: TextAlign.right,
                    ),
                  ),
                ],
              ),
              const SizedBox(height: Space.sm),
              Wrap(
                spacing: Space.sm,
                runSpacing: Space.sm,
                children: [
                  ToggleChip(label: 'None', selected: _rpe == null, onTap: () => setState(() => _rpe = null)),
                  for (final v in const [6.0, 7.0, 7.5, 8.0, 8.5, 9.0, 9.5, 10.0])
                    ToggleChip(label: number(v), selected: _rpe == v, onTap: () => setState(() => _rpe = v)),
                ],
              ),
            ],
            const SizedBox(height: Space.xxl),
            Row(
              children: [
                TextButton(
                  onPressed: () => Navigator.pop(context, SetEditResult(kind: _kind, delete: true)),
                  style: TextButton.styleFrom(foregroundColor: c.negative),
                  child: const Text('Delete set'),
                ),
                const Spacer(),
                OutlinedButton(onPressed: () => Navigator.pop(context, _result()), child: const Text('Save')),
                const SizedBox(width: Space.sm),
                FilledButton.icon(
                  onPressed: missing != null ? null : () => Navigator.pop(context, _result(complete: true)),
                  icon: const Icon(Icons.check_rounded),
                  label: Text(missing ?? (widget.completed ? 'Save done' : 'Done')),
                ),
              ],
            ),
          ],
        ),
      ),
    );
  }
}

class _StepperField extends StatelessWidget {
  const _StepperField({
    required this.label,
    required this.controller,
    required this.onMinus,
    required this.onPlus,
    required this.onChanged,
    this.decimals = true,
  });

  final String label;
  final TextEditingController controller;
  final VoidCallback onMinus;
  final VoidCallback onPlus;
  final VoidCallback onChanged;
  final bool decimals;

  @override
  Widget build(BuildContext context) {
    final c = context.colors;
    Widget btn(IconData icon, VoidCallback onTap, String semantics) => SizedBox.square(
          dimension: kWorkoutHitTarget + 8,
          child: Material(
            color: c.surfaceRaised,
            shape: CircleBorder(side: BorderSide(color: c.outline)),
            child: InkWell(
              customBorder: const CircleBorder(),
              onTap: onTap,
              child: Semantics(label: semantics, button: true, child: Icon(icon, size: 28)),
            ),
          ),
        );
    return Column(
      children: [
        Eyebrow(label),
        const SizedBox(height: Space.sm),
        Row(
          children: [
            btn(Icons.remove_rounded, onMinus, 'Decrease $label'),
            Expanded(
              child: TextField(
                controller: controller,
                textAlign: TextAlign.center,
                keyboardType: TextInputType.numberWithOptions(decimal: decimals),
                inputFormatters: [FilteringTextInputFormatter.allow(RegExp(decimals ? r'[0-9.,]' : r'[0-9]'))],
                style: context.text.displayMedium?.copyWith(fontFeatures: tabularFigures),
                onChanged: (_) => onChanged(),
                decoration: const InputDecoration(
                  filled: false,
                  border: InputBorder.none,
                  enabledBorder: InputBorder.none,
                  focusedBorder: InputBorder.none,
                  hintText: '—',
                ),
              ),
            ),
            btn(Icons.add_rounded, onPlus, 'Increase $label'),
          ],
        ),
      ],
    );
  }
}
