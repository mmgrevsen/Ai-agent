import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

import '../theme/app_theme.dart';
import '../theme/tokens.dart';
import '../util/format.dart';
import 'primitives.dart';

/// A large selectable card used for single choices (goals, presets).
class OptionCard extends StatelessWidget {
  const OptionCard({
    super.key,
    required this.title,
    required this.selected,
    required this.onTap,
    this.subtitle,
    this.icon,
    this.enabled = true,
  });

  final String title;
  final String? subtitle;
  final IconData? icon;
  final bool selected;
  final bool enabled;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final c = context.colors;
    return Opacity(
      opacity: enabled ? 1 : 0.4,
      child: Pressable(
        onTap: enabled ? onTap : null,
        haptic: true,
        child: AnimatedContainer(
          duration: Motion.fast,
          padding: const EdgeInsets.symmetric(horizontal: Space.lg, vertical: 14),
          decoration: BoxDecoration(
            color: selected ? c.accentMuted : c.surface,
            borderRadius: BorderRadius.circular(Radii.md),
            border: Border.all(color: selected ? c.accent : c.outline, width: selected ? 1.4 : 1),
          ),
          child: Row(
            children: [
              if (icon != null) ...[
                Icon(icon, color: selected ? c.accent : c.textSecondary, size: 22),
                const SizedBox(width: Space.md),
              ],
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(title, style: context.text.titleSmall),
                    if (subtitle != null) ...[
                      const SizedBox(height: 2),
                      Text(subtitle!, style: context.text.bodySmall),
                    ],
                  ],
                ),
              ),
              AnimatedOpacity(
                opacity: selected ? 1 : 0,
                duration: Motion.fast,
                child: Icon(Icons.check_circle_rounded, color: c.accent, size: 20),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

/// Multi-select chip.
class ToggleChip extends StatelessWidget {
  const ToggleChip({super.key, required this.label, required this.selected, required this.onTap});

  final String label;
  final bool selected;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final c = context.colors;
    return GestureDetector(
      onTap: () {
        HapticFeedback.selectionClick();
        onTap();
      },
      child: AnimatedContainer(
        duration: Motion.fast,
        padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 9),
        decoration: BoxDecoration(
          color: selected ? c.textPrimary : c.surface,
          borderRadius: BorderRadius.circular(Radii.pill),
          border: Border.all(color: selected ? c.textPrimary : c.outline),
        ),
        child: Text(
          label,
          style: context.text.labelMedium?.copyWith(
            color: selected ? c.background : c.textSecondary,
            fontWeight: FontWeight.w600,
          ),
        ),
      ),
    );
  }
}

/// Labelled numeric text field with unit suffix and validation.
class NumberField extends StatelessWidget {
  const NumberField({
    super.key,
    required this.controller,
    required this.label,
    this.unit,
    this.decimals = true,
    this.hint,
    this.autofocus = false,
    this.onChanged,
    this.validator,
  });

  final TextEditingController controller;
  final String label;
  final String? unit;
  final bool decimals;
  final String? hint;
  final bool autofocus;
  final ValueChanged<String>? onChanged;
  final FormFieldValidator<String>? validator;

  @override
  Widget build(BuildContext context) {
    return TextFormField(
      controller: controller,
      autofocus: autofocus,
      keyboardType: TextInputType.numberWithOptions(decimal: decimals),
      inputFormatters: [FilteringTextInputFormatter.allow(RegExp(decimals ? r'[0-9.,]' : r'[0-9]'))],
      style: context.text.bodyLarge?.copyWith(fontFeatures: tabularFigures),
      decoration: InputDecoration(labelText: label, suffixText: unit, hintText: hint),
      onChanged: onChanged,
      validator: validator,
    );
  }
}

/// Parses user number input, accepting comma decimals.
double? parseNumber(String s) => double.tryParse(s.trim().replaceAll(',', '.'));

/// Big −/+ stepper for one-handed adjustments (weight, reps).
class BigStepper extends StatelessWidget {
  const BigStepper({
    super.key,
    required this.value,
    required this.onChanged,
    required this.step,
    this.min = 0,
    this.max = 9999,
    this.label,
    this.unit,
    this.decimals = 1,
  });

  final double value;
  final ValueChanged<double> onChanged;
  final double step;
  final double min;
  final double max;
  final String? label;
  final String? unit;
  final int decimals;

  @override
  Widget build(BuildContext context) {
    final c = context.colors;
    Widget btn(IconData icon, double delta) => SizedBox.square(
          dimension: kWorkoutHitTarget,
          child: Material(
            color: c.surfaceRaised,
            shape: CircleBorder(side: BorderSide(color: c.outline)),
            child: InkWell(
              customBorder: const CircleBorder(),
              onTap: () {
                HapticFeedback.selectionClick();
                onChanged((value + delta).clamp(min, max).toDouble());
              },
              child: Icon(icon, size: 26),
            ),
          ),
        );
    return Column(
      children: [
        if (label != null) Eyebrow(label!),
        const SizedBox(height: Space.sm),
        Row(
          children: [
            btn(Icons.remove_rounded, -step),
            Expanded(
              child: Center(
                child: MetricValue(value: number(value, maxDecimals: decimals), unit: unit, style: context.text.displayMedium),
              ),
            ),
            btn(Icons.add_rounded, step),
          ],
        ),
      ],
    );
  }
}

/// A settings row with a trailing switch.
class SwitchRow extends StatelessWidget {
  const SwitchRow({super.key, required this.title, required this.value, required this.onChanged, this.subtitle});

  final String title;
  final String? subtitle;
  final bool value;
  final ValueChanged<bool> onChanged;

  @override
  Widget build(BuildContext context) {
    return SwitchListTile.adaptive(
      contentPadding: const EdgeInsets.symmetric(horizontal: Space.gutter),
      title: Text(title, style: context.text.titleSmall),
      subtitle: subtitle == null ? null : Text(subtitle!, style: context.text.bodySmall),
      value: value,
      onChanged: onChanged,
    );
  }
}
