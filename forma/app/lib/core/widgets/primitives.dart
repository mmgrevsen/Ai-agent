import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

import '../../domain/provenance.dart';
import '../theme/app_theme.dart';
import '../theme/tokens.dart';

export '../../domain/provenance.dart';

/// Subtle scale-down feedback for tappable surfaces.
class Pressable extends StatefulWidget {
  const Pressable({super.key, required this.child, this.onTap, this.onLongPress, this.haptic = false});

  final Widget child;
  final VoidCallback? onTap;
  final VoidCallback? onLongPress;
  final bool haptic;

  @override
  State<Pressable> createState() => _PressableState();
}

class _PressableState extends State<Pressable> {
  bool _down = false;

  void _set(bool v) {
    if (widget.onTap == null && widget.onLongPress == null) return;
    setState(() => _down = v);
  }

  @override
  Widget build(BuildContext context) {
    return GestureDetector(
      behavior: HitTestBehavior.opaque,
      onTapDown: (_) => _set(true),
      onTapUp: (_) => _set(false),
      onTapCancel: () => _set(false),
      onTap: widget.onTap == null
          ? null
          : () {
              if (widget.haptic) HapticFeedback.selectionClick();
              widget.onTap!();
            },
      onLongPress: widget.onLongPress,
      child: AnimatedScale(
        scale: _down ? 0.975 : 1,
        duration: Motion.fast,
        curve: Motion.standard,
        child: widget.child,
      ),
    );
  }
}

/// The standard surface: flat, hairline outline, generous radius.
class FCard extends StatelessWidget {
  const FCard({
    super.key,
    required this.child,
    this.onTap,
    this.padding = const EdgeInsets.all(Space.lg),
    this.color,
    this.borderColor,
  });

  final Widget child;
  final VoidCallback? onTap;
  final EdgeInsetsGeometry padding;
  final Color? color;
  final Color? borderColor;

  @override
  Widget build(BuildContext context) {
    final c = context.colors;
    final card = Container(
      padding: padding,
      decoration: BoxDecoration(
        color: color ?? c.surface,
        borderRadius: BorderRadius.circular(Radii.lg),
        border: Border.all(color: borderColor ?? c.outline),
      ),
      child: child,
    );
    if (onTap == null) return card;
    return Pressable(onTap: onTap, child: card);
  }
}

/// Uppercase micro-heading.
class Eyebrow extends StatelessWidget {
  const Eyebrow(this.text, {super.key, this.color});
  final String text;
  final Color? color;

  @override
  Widget build(BuildContext context) =>
      Text(text.toUpperCase(), style: context.text.labelSmall?.copyWith(color: color));
}

class SectionHeader extends StatelessWidget {
  const SectionHeader(this.title, {super.key, this.action, this.onAction, this.padding});

  final String title;
  final String? action;
  final VoidCallback? onAction;
  final EdgeInsetsGeometry? padding;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: padding ?? const EdgeInsets.fromLTRB(Space.gutter, Space.xxl, Space.gutter, Space.sm),
      child: Row(
        children: [
          Expanded(child: Eyebrow(title)),
          if (action != null && onAction != null)
            GestureDetector(
              onTap: onAction,
              child: Text(action!, style: context.text.labelMedium?.copyWith(color: context.colors.accent)),
            ),
        ],
      ),
    );
  }
}

/// A large number with a unit, e.g. "1 840 kcal".
class MetricValue extends StatelessWidget {
  const MetricValue({
    super.key,
    required this.value,
    this.unit,
    this.style,
    this.color,
  });

  final String value;
  final String? unit;
  final TextStyle? style;
  final Color? color;

  @override
  Widget build(BuildContext context) {
    final base = (style ?? context.text.displaySmall)!.copyWith(color: color);
    return Text.rich(
      TextSpan(
        children: [
          TextSpan(text: value, style: base),
          if (unit != null)
            TextSpan(
              text: ' $unit',
              style: context.text.labelMedium?.copyWith(
                fontSize: (base.fontSize ?? 20) * 0.38 + 6,
                color: context.colors.textTertiary,
              ),
            ),
        ],
      ),
      maxLines: 1,
      overflow: TextOverflow.fade,
      softWrap: false,
    );
  }
}

/// Small label that makes the origin of a value explicit.
class ProvenanceBadge extends StatelessWidget {
  const ProvenanceBadge(this.provenance, {super.key, this.incomplete = false, this.compact = false});

  final Provenance provenance;
  final bool incomplete;
  final bool compact;

  Color _color(FormaColors c) => switch (provenance) {
        Provenance.recorded => c.textSecondary,
        Provenance.imported => c.water,
        Provenance.calculated => c.textSecondary,
        Provenance.estimated => c.caution,
        Provenance.aiEstimate => c.caution,
        Provenance.verified => c.positive,
        Provenance.community => c.protein,
        Provenance.custom => c.textSecondary,
      };

  @override
  Widget build(BuildContext context) {
    final c = context.colors;
    final color = incomplete ? c.caution : _color(c);
    final label = incomplete ? '${provenance.label} · incomplete' : provenance.label;
    final tooltip = incomplete
        ? '${provenance.explanation} Some nutrient values are missing, so totals may be underestimated.'
        : provenance.explanation;
    return Tooltip(
      message: tooltip,
      triggerMode: TooltipTriggerMode.tap,
      child: Container(
        padding: EdgeInsets.symmetric(horizontal: compact ? 6 : 8, vertical: compact ? 2 : 3),
        decoration: BoxDecoration(
          borderRadius: BorderRadius.circular(Radii.pill),
          border: Border.all(color: color.withValues(alpha: 0.45)),
        ),
        child: Text(
          label,
          style: context.text.labelSmall?.copyWith(
            color: color,
            letterSpacing: 0.3,
            fontSize: compact ? 10 : 11,
          ),
        ),
      ),
    );
  }
}

/// Segmented control rendered as pills.
class SegmentedPills<T> extends StatelessWidget {
  const SegmentedPills({
    super.key,
    required this.values,
    required this.selected,
    required this.labelOf,
    required this.onChanged,
    this.expand = false,
  });

  final List<T> values;
  final T selected;
  final String Function(T) labelOf;
  final ValueChanged<T> onChanged;
  final bool expand;

  @override
  Widget build(BuildContext context) {
    final c = context.colors;
    final pills = [
      for (final v in values)
        _wrap(
          GestureDetector(
            onTap: () {
              HapticFeedback.selectionClick();
              onChanged(v);
            },
            child: AnimatedContainer(
              duration: Motion.fast,
              curve: Motion.standard,
              alignment: Alignment.center,
              padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 9),
              decoration: BoxDecoration(
                color: v == selected ? c.textPrimary : Colors.transparent,
                borderRadius: BorderRadius.circular(Radii.pill),
              ),
              child: Text(
                labelOf(v),
                style: context.text.labelMedium?.copyWith(
                  color: v == selected ? c.background : c.textSecondary,
                  fontWeight: FontWeight.w600,
                ),
              ),
            ),
          ),
        ),
    ];
    return Container(
      padding: const EdgeInsets.all(3),
      decoration: BoxDecoration(
        color: c.surfaceRaised,
        borderRadius: BorderRadius.circular(Radii.pill),
        border: Border.all(color: c.outline),
      ),
      child: Row(mainAxisSize: expand ? MainAxisSize.max : MainAxisSize.min, children: pills),
    );
  }

  Widget _wrap(Widget w) => expand ? Expanded(child: w) : w;
}

/// Linear progress with label, used for macros and water.
class LabeledBar extends StatelessWidget {
  const LabeledBar({
    super.key,
    required this.label,
    required this.value,
    required this.target,
    required this.color,
    this.unit = 'g',
    this.incomplete = false,
  });

  final String label;
  final double value;
  final double? target;
  final Color color;
  final String unit;
  final bool incomplete;

  @override
  Widget build(BuildContext context) {
    final c = context.colors;
    final t = target;
    final fraction = t == null || t <= 0 ? 0.0 : (value / t).clamp(0.0, 1.0);
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Row(
          children: [
            Expanded(child: Text(label, style: context.text.labelMedium)),
            Text(
              t == null ? '${value.round()}$unit${incomplete ? '*' : ''}' : '${value.round()} / ${t.round()}$unit${incomplete ? '*' : ''}',
              style: context.text.labelMedium?.copyWith(color: c.textPrimary, fontFeatures: tabularFigures),
            ),
          ],
        ),
        const SizedBox(height: 6),
        ClipRRect(
          borderRadius: BorderRadius.circular(Radii.pill),
          child: Stack(
            children: [
              Container(height: 6, color: c.surfaceRaised),
              AnimatedFractionallySizedBox(
                duration: Motion.slow,
                curve: Motion.standard,
                widthFactor: fraction,
                child: Container(height: 6, color: color),
              ),
            ],
          ),
        ),
      ],
    );
  }
}

/// Circular progress ring (calories, workout completion).
class ProgressRing extends StatelessWidget {
  const ProgressRing({
    super.key,
    required this.fraction,
    required this.child,
    this.size = 132,
    this.stroke = 10,
    this.color,
  });

  final double fraction;
  final Widget child;
  final double size;
  final double stroke;
  final Color? color;

  @override
  Widget build(BuildContext context) {
    final c = context.colors;
    return SizedBox.square(
      dimension: size,
      child: TweenAnimationBuilder<double>(
        tween: Tween(begin: 0, end: fraction.clamp(0, 1)),
        duration: Motion.slow,
        curve: Motion.standard,
        builder: (context, v, _) => CustomPaint(
          painter: _RingPainter(v, stroke, color ?? c.accent, c.surfaceRaised),
          child: Center(child: child),
        ),
      ),
    );
  }
}

class _RingPainter extends CustomPainter {
  _RingPainter(this.fraction, this.stroke, this.color, this.track);
  final double fraction;
  final double stroke;
  final Color color;
  final Color track;

  @override
  void paint(Canvas canvas, Size size) {
    final rect = Offset.zero & size;
    final r = rect.deflate(stroke / 2);
    final base = Paint()
      ..style = PaintingStyle.stroke
      ..strokeWidth = stroke
      ..strokeCap = StrokeCap.round;
    canvas.drawArc(r, 0, 6.2832, false, base..color = track);
    if (fraction > 0) {
      canvas.drawArc(r, -1.5708, 6.2832 * fraction, false, base..color = color);
    }
  }

  @override
  bool shouldRepaint(_RingPainter old) =>
      old.fraction != fraction || old.color != color || old.track != track;
}

/// Minimal sparkline for cards. Draws nothing when there are < 2 points.
class Sparkline extends StatelessWidget {
  const Sparkline({super.key, required this.values, this.color, this.height = 36});

  final List<double> values;
  final Color? color;
  final double height;

  @override
  Widget build(BuildContext context) {
    return SizedBox(
      height: height,
      width: double.infinity,
      child: CustomPaint(painter: _SparkPainter(values, color ?? context.colors.accent)),
    );
  }
}

class _SparkPainter extends CustomPainter {
  _SparkPainter(this.values, this.color);
  final List<double> values;
  final Color color;

  @override
  void paint(Canvas canvas, Size size) {
    if (values.length < 2) return;
    var lo = values.reduce((a, b) => a < b ? a : b);
    var hi = values.reduce((a, b) => a > b ? a : b);
    if (hi - lo < 1e-9) {
      lo -= 1;
      hi += 1;
    }
    final path = Path();
    for (var i = 0; i < values.length; i++) {
      final x = size.width * i / (values.length - 1);
      final y = size.height - (values[i] - lo) / (hi - lo) * (size.height - 4) - 2;
      i == 0 ? path.moveTo(x, y) : path.lineTo(x, y);
    }
    canvas.drawPath(
      path,
      Paint()
        ..color = color
        ..style = PaintingStyle.stroke
        ..strokeWidth = 2
        ..strokeJoin = StrokeJoin.round
        ..strokeCap = StrokeCap.round,
    );
  }

  @override
  bool shouldRepaint(_SparkPainter old) => old.values != values || old.color != color;
}
