import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../app/providers.dart';
import '../../core/theme/tokens.dart';
import '../../core/widgets/inputs.dart';
import '../../core/widgets/primitives.dart';
import '../../data/repositories/nutrition_repository.dart';
import '../../domain/nutrition/food.dart';
import '../../domain/nutrition/nutrients.dart';

class CustomFoodScreen extends ConsumerStatefulWidget {
  const CustomFoodScreen({super.key, this.barcode});
  final String? barcode;

  @override
  ConsumerState<CustomFoodScreen> createState() => _CustomFoodScreenState();
}

class _CustomFoodScreenState extends ConsumerState<CustomFoodScreen> {
  final _form = GlobalKey<FormState>();
  final _name = TextEditingController();
  final _brand = TextEditingController();
  late final _barcode = TextEditingController(text: widget.barcode ?? '');
  final _servingG = TextEditingController();
  final _servingLabel = TextEditingController(text: '1 serving');
  final _kcal = TextEditingController();
  final _protein = TextEditingController();
  final _carbs = TextEditingController();
  final _fat = TextEditingController();
  final _fiber = TextEditingController();
  bool _perServing = false;

  @override
  void dispose() {
    for (final c in [_name, _brand, _barcode, _servingG, _servingLabel, _kcal, _protein, _carbs, _fat, _fiber]) {
      c.dispose();
    }
    super.dispose();
  }

  Nutrients get _per100 {
    final serving = parseNumber(_servingG.text);
    final factor = _perServing && serving != null && serving > 0 ? 100 / serving : 1.0;
    double? v(TextEditingController c) {
      final x = parseNumber(c.text);
      return x == null ? null : x * factor;
    }

    return Nutrients(kcal: v(_kcal), proteinG: v(_protein), carbsG: v(_carbs), fatG: v(_fat), fiberG: v(_fiber));
  }

  Future<void> _save() async {
    if (!_form.currentState!.validate()) return;
    final serving = parseNumber(_servingG.text);
    final item = FoodItem(
      name: _name.text.trim(),
      brand: _brand.text.trim().isEmpty ? null : _brand.text.trim(),
      source: 'custom',
      sourceRef: _barcode.text.trim().isEmpty ? null : _barcode.text.trim(),
      provenance: Provenance.custom,
      per100g: _per100,
      servings: [
        if (serving != null && serving > 0) ServingOption(_servingLabel.text.trim().isEmpty ? '1 serving' : _servingLabel.text.trim(), serving),
        const ServingOption('100 g', 100),
      ],
    );
    final warnings = item.warnings;
    if (warnings.isNotEmpty) {
      final ok = await showDialog<bool>(
        context: context,
        builder: (c) => AlertDialog(
          title: const Text('Double-check these values'),
          content: Text(warnings.join('\n')),
          actions: [
            TextButton(onPressed: () => Navigator.pop(c, false), child: const Text('Edit')),
            FilledButton(onPressed: () => Navigator.pop(c, true), child: const Text('Save anyway')),
          ],
        ),
      );
      if (ok != true) return;
    }
    final food = await ref.read(nutritionRepositoryProvider).saveFood(item);
    // Return the saved food so the caller can log a portion right away.
    if (mounted) context.pop(food.toItem());
  }

  @override
  Widget build(BuildContext context) {
    String? required(String? v) => (v == null || v.trim().isEmpty) ? 'Required' : null;
    String? optionalNumber(String? v) {
      if (v == null || v.trim().isEmpty) return null;
      final n = parseNumber(v);
      return n == null || n < 0 ? 'Enter a positive number' : null;
    }

    return Scaffold(
      appBar: AppBar(
        title: const Text('Custom food'),
        actions: [Padding(padding: const EdgeInsets.only(right: Space.md), child: FilledButton(onPressed: _save, child: const Text('Save')))],
      ),
      body: Form(
        key: _form,
        child: ListView(
          padding: const EdgeInsets.fromLTRB(Space.gutter, Space.sm, Space.gutter, 120),
          children: [
            TextFormField(controller: _name, decoration: const InputDecoration(labelText: 'Name'), validator: required, textCapitalization: TextCapitalization.sentences),
            const SizedBox(height: Space.md),
            TextFormField(controller: _brand, decoration: const InputDecoration(labelText: 'Brand (optional)')),
            const SizedBox(height: Space.md),
            NumberField(controller: _barcode, label: 'Barcode (optional)', decimals: false),
            const SizedBox(height: Space.xl),
            const Eyebrow('Serving'),
            const SizedBox(height: Space.sm),
            Row(children: [
              Expanded(flex: 3, child: TextFormField(controller: _servingLabel, decoration: const InputDecoration(labelText: 'Serving name'))),
              const SizedBox(width: Space.md),
              Expanded(flex: 2, child: NumberField(controller: _servingG, label: 'Size', unit: 'g', validator: optionalNumber, onChanged: (_) => setState(() {}))),
            ]),
            const SizedBox(height: Space.xl),
            const Eyebrow('Nutrition values are'),
            const SizedBox(height: Space.sm),
            SegmentedPills<bool>(
              values: const [false, true],
              selected: _perServing,
              expand: true,
              labelOf: (v) => v ? 'Per serving' : 'Per 100 g',
              onChanged: (v) {
                if (v && (parseNumber(_servingG.text) ?? 0) <= 0) {
                  ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('Enter the serving size in grams first.')));
                  return;
                }
                setState(() => _perServing = v);
              },
            ),
            const SizedBox(height: Space.md),
            NumberField(controller: _kcal, label: 'Calories', unit: 'kcal', validator: optionalNumber),
            const SizedBox(height: Space.sm),
            Row(children: [
              Expanded(child: NumberField(controller: _protein, label: 'Protein', unit: 'g', validator: optionalNumber)),
              const SizedBox(width: Space.sm),
              Expanded(child: NumberField(controller: _carbs, label: 'Carbs', unit: 'g', validator: optionalNumber)),
            ]),
            const SizedBox(height: Space.sm),
            Row(children: [
              Expanded(child: NumberField(controller: _fat, label: 'Fat', unit: 'g', validator: optionalNumber)),
              const SizedBox(width: Space.sm),
              Expanded(child: NumberField(controller: _fiber, label: 'Fiber', unit: 'g', validator: optionalNumber)),
            ]),
            const SizedBox(height: Space.md),
            Text('Copy values from the nutrition label. Leave unknown values empty — they will be shown as missing, not zero.', style: context.text.bodySmall),
          ],
        ),
      ),
    );
  }
}
