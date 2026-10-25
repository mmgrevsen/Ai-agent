import 'package:flutter/material.dart';

import '../../core/theme/app_theme.dart';
import '../../core/theme/tokens.dart';
import '../../core/util/format.dart';
import '../../core/widgets/inputs.dart';
import '../../core/widgets/primitives.dart';
import '../../domain/catalog.dart';
import '../../domain/nutrition/food.dart';
import '../../domain/nutrition/nutrients.dart';

class PortionChoice {
  const PortionChoice({required this.grams, required this.meal, this.servings, this.servingLabel});
  final double grams;
  final MealSlot meal;
  final double? servings;
  final String? servingLabel;
}

Future<PortionChoice?> showPortionSheet(
  BuildContext context, {
  required FoodItem food,
  required MealSlot meal,
  double? initialGrams,
  String actionLabel = 'Add',
}) =>
    showModalBottomSheet<PortionChoice>(
      context: context,
      isScrollControlled: true,
      useSafeArea: true,
      builder: (_) => _PortionSheet(food: food, meal: meal, initialGrams: initialGrams, actionLabel: actionLabel),
    );

class _PortionSheet extends StatefulWidget {
  const _PortionSheet({required this.food, required this.meal, required this.actionLabel, this.initialGrams});
  final FoodItem food;
  final MealSlot meal;
  final double? initialGrams;
  final String actionLabel;

  @override
  State<_PortionSheet> createState() => _PortionSheetState();
}

class _PortionSheetState extends State<_PortionSheet> {
  late List<ServingOption> _options;
  late ServingOption _serving;
  late final TextEditingController _amount;
  late MealSlot _meal = widget.meal;

  @override
  void initState() {
    super.initState();
    const grams = ServingOption('grams', 1);
    _options = [...widget.food.servings.where((s) => s.grams != 100 || !s.label.startsWith('100')), grams];
    if (widget.initialGrams != null) {
      _serving = grams;
      _amount = TextEditingController(text: number(widget.initialGrams!));
    } else {
      _serving = _options.first;
      _amount = TextEditingController(text: _serving == grams ? '100' : '1');
    }
  }

  @override
  void dispose() {
    _amount.dispose();
    super.dispose();
  }

  double get _grams => (parseNumber(_amount.text) ?? 0) * _serving.grams;

  @override
  Widget build(BuildContext context) {
    final c = context.colors;
    final f = widget.food;
    final n = f.forGrams(_grams);
    final warnings = f.warnings;
    final missing = [
      if (f.per100g.kcal == null) 'calories',
      if (f.per100g.proteinG == null) 'protein',
      if (f.per100g.carbsG == null) 'carbs',
      if (f.per100g.fatG == null) 'fat',
      if (f.per100g.fiberG == null) 'fiber',
    ];
    return Padding(
      padding: EdgeInsets.only(bottom: MediaQuery.viewInsetsOf(context).bottom),
      child: SingleChildScrollView(
        padding: const EdgeInsets.fromLTRB(Space.gutter, 0, Space.gutter, Space.xl),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(f.name, style: context.text.titleLarge),
            if (f.brand != null) Text(f.brand!, style: context.text.bodyMedium),
            const SizedBox(height: Space.sm),
            Row(children: [
              ProvenanceBadge(f.provenance, incomplete: missing.isNotEmpty),
              const SizedBox(width: Space.sm),
              Flexible(child: Text('Source: ${f.sourceLabel}${f.sourceRef != null && f.source == 'off' ? ' · ${f.sourceRef}' : ''}', style: context.text.bodySmall)),
            ]),
            if (f.note != null) ...[
              const SizedBox(height: Space.xs),
              Text(f.note!, style: context.text.bodySmall),
            ],
            if (missing.isNotEmpty) ...[
              const SizedBox(height: Space.sm),
              Text(
                'Not provided by the source: ${missing.join(', ')}. These are left blank, not counted as zero.',
                style: context.text.bodySmall?.copyWith(color: c.caution),
              ),
            ],
            for (final w in warnings) ...[
              const SizedBox(height: Space.xs),
              Text('Check this data: $w', style: context.text.bodySmall?.copyWith(color: c.caution)),
            ],
            const SizedBox(height: Space.xl),
            Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
              SizedBox(
                width: 110,
                child: NumberField(controller: _amount, label: 'Amount', onChanged: (_) => setState(() {}), autofocus: true),
              ),
              const SizedBox(width: Space.md),
              Expanded(
                child: Wrap(spacing: Space.sm, runSpacing: Space.sm, children: [
                  for (final s in _options)
                    ToggleChip(
                      label: s.label == 'grams' ? 'g' : '${s.label} (${number(s.grams)} g)',
                      selected: identical(s, _serving),
                      onTap: () => setState(() {
                        final grams = _grams;
                        _serving = s;
                        _amount.text = s.label == 'grams' ? number(grams) : '1';
                      }),
                    ),
                ]),
              ),
            ]),
            const SizedBox(height: Space.xl),
            _NutrientRow(n: n, grams: _grams),
            const SizedBox(height: Space.xl),
            SegmentedPills<MealSlot>(values: MealSlot.values, selected: _meal, labelOf: (m) => m.label, expand: true, onChanged: (m) => setState(() => _meal = m)),
            const SizedBox(height: Space.lg),
            SizedBox(
              width: double.infinity,
              child: FilledButton(
                onPressed: _grams <= 0
                    ? null
                    : () => Navigator.pop(
                          context,
                          PortionChoice(
                            grams: _grams,
                            meal: _meal,
                            servings: _serving.label == 'grams' ? null : parseNumber(_amount.text),
                            servingLabel: _serving.label == 'grams' ? null : _serving.label,
                          ),
                        ),
                child: Text('${widget.actionLabel} · ${n.kcal == null ? '? kcal' : '${kcal(n.kcal)} kcal'}'),
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _NutrientRow extends StatelessWidget {
  const _NutrientRow({required this.n, required this.grams});
  final Nutrients n;
  final double grams;

  @override
  Widget build(BuildContext context) {
    final c = context.colors;
    Widget cell(String label, double? v, Color color, {String unit = 'g'}) => Expanded(
          child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
            Text(label.toUpperCase(), style: context.text.labelSmall?.copyWith(color: color)),
            const SizedBox(height: 2),
            Text(
              v == null ? '—' : '${number(v, maxDecimals: v < 10 ? 1 : 0)}${unit == 'kcal' ? '' : ' $unit'}',
              style: context.text.titleMedium?.copyWith(fontFeatures: tabularFigures, color: v == null ? c.textTertiary : null),
            ),
          ]),
        );
    return Row(children: [
      cell('kcal', n.kcal, c.textSecondary, unit: 'kcal'),
      cell('Protein', n.proteinG, c.protein),
      cell('Carbs', n.carbsG, c.carbs),
      cell('Fat', n.fatG, c.fat),
      cell('Fiber', n.fiberG, c.fiber),
    ]);
  }
}
