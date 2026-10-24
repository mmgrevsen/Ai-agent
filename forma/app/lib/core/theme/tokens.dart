import 'package:flutter/material.dart';

/// Spacing scale (4pt grid). Use these instead of literal paddings.
abstract final class Space {
  static const double xxs = 2;
  static const double xs = 4;
  static const double sm = 8;
  static const double md = 12;
  static const double lg = 16;
  static const double xl = 20;
  static const double xxl = 24;
  static const double xxxl = 32;
  static const double huge = 48;

  /// Horizontal page gutter.
  static const double gutter = 20;
}

abstract final class Radii {
  static const double sm = 10;
  static const double md = 14;
  static const double lg = 20;
  static const double xl = 28;
  static const double pill = 999;
}

abstract final class Motion {
  static const Duration fast = Duration(milliseconds: 140);
  static const Duration medium = Duration(milliseconds: 240);
  static const Duration slow = Duration(milliseconds: 420);
  static const Curve standard = Curves.easeOutCubic;
  static const Curve emphasized = Curves.easeInOutCubicEmphasized;
}

/// Minimum hit target for in-workout controls (larger than the 48dp default
/// so they are easy to hit one-handed with sweaty hands).
const double kWorkoutHitTarget = 56;

/// Semantic color palette. Components read colors from here rather than from
/// raw hex values so dark and light themes stay consistent.
@immutable
class FormaColors extends ThemeExtension<FormaColors> {
  const FormaColors({
    required this.background,
    required this.surface,
    required this.surfaceRaised,
    required this.surfaceSunken,
    required this.outline,
    required this.outlineStrong,
    required this.textPrimary,
    required this.textSecondary,
    required this.textTertiary,
    required this.accent,
    required this.onAccent,
    required this.accentMuted,
    required this.positive,
    required this.caution,
    required this.negative,
    required this.protein,
    required this.carbs,
    required this.fat,
    required this.fiber,
    required this.water,
    required this.chartGrid,
  });

  final Color background;
  final Color surface;
  final Color surfaceRaised;
  final Color surfaceSunken;
  final Color outline;
  final Color outlineStrong;
  final Color textPrimary;
  final Color textSecondary;
  final Color textTertiary;
  final Color accent;
  final Color onAccent;
  final Color accentMuted;
  final Color positive;
  final Color caution;
  final Color negative;
  final Color protein;
  final Color carbs;
  final Color fat;
  final Color fiber;
  final Color water;
  final Color chartGrid;

  static const dark = FormaColors(
    background: Color(0xFF000000),
    surface: Color(0xFF0F0F11),
    surfaceRaised: Color(0xFF18181B),
    surfaceSunken: Color(0xFF09090A),
    outline: Color(0xFF232327),
    outlineStrong: Color(0xFF34343A),
    textPrimary: Color(0xFFF4F4F5),
    textSecondary: Color(0xFFA1A1AA),
    textTertiary: Color(0xFF6B6B74),
    accent: Color(0xFFD4F25A),
    onAccent: Color(0xFF0B0D02),
    accentMuted: Color(0x1FD4F25A),
    positive: Color(0xFF5AD69A),
    caution: Color(0xFFF2B35A),
    negative: Color(0xFFF2766B),
    protein: Color(0xFF7FA8FF),
    carbs: Color(0xFFE9C46A),
    fat: Color(0xFFE88B7D),
    fiber: Color(0xFF8CCB8F),
    water: Color(0xFF6CC4E8),
    chartGrid: Color(0xFF1C1C20),
  );

  static const light = FormaColors(
    background: Color(0xFFF4F4F2),
    surface: Color(0xFFFFFFFF),
    surfaceRaised: Color(0xFFFAFAF8),
    surfaceSunken: Color(0xFFEAEAE6),
    outline: Color(0xFFE2E2DD),
    outlineStrong: Color(0xFFCBCBC4),
    textPrimary: Color(0xFF0C0C0D),
    textSecondary: Color(0xFF55555C),
    textTertiary: Color(0xFF8A8A92),
    accent: Color(0xFF4A6B00),
    onAccent: Color(0xFFFFFFFF),
    accentMuted: Color(0x1A4A6B00),
    positive: Color(0xFF1F8A55),
    caution: Color(0xFFB36B00),
    negative: Color(0xFFC0392B),
    protein: Color(0xFF3563D9),
    carbs: Color(0xFFB08400),
    fat: Color(0xFFC2533F),
    fiber: Color(0xFF3E8E41),
    water: Color(0xFF1B88B5),
    chartGrid: Color(0xFFEAEAE6),
  );

  @override
  FormaColors copyWith({Color? accent}) => FormaColors(
        background: background,
        surface: surface,
        surfaceRaised: surfaceRaised,
        surfaceSunken: surfaceSunken,
        outline: outline,
        outlineStrong: outlineStrong,
        textPrimary: textPrimary,
        textSecondary: textSecondary,
        textTertiary: textTertiary,
        accent: accent ?? this.accent,
        onAccent: onAccent,
        accentMuted: accentMuted,
        positive: positive,
        caution: caution,
        negative: negative,
        protein: protein,
        carbs: carbs,
        fat: fat,
        fiber: fiber,
        water: water,
        chartGrid: chartGrid,
      );

  @override
  FormaColors lerp(FormaColors? other, double t) {
    if (other == null) return this;
    Color l(Color a, Color b) => Color.lerp(a, b, t)!;
    return FormaColors(
      background: l(background, other.background),
      surface: l(surface, other.surface),
      surfaceRaised: l(surfaceRaised, other.surfaceRaised),
      surfaceSunken: l(surfaceSunken, other.surfaceSunken),
      outline: l(outline, other.outline),
      outlineStrong: l(outlineStrong, other.outlineStrong),
      textPrimary: l(textPrimary, other.textPrimary),
      textSecondary: l(textSecondary, other.textSecondary),
      textTertiary: l(textTertiary, other.textTertiary),
      accent: l(accent, other.accent),
      onAccent: l(onAccent, other.onAccent),
      accentMuted: l(accentMuted, other.accentMuted),
      positive: l(positive, other.positive),
      caution: l(caution, other.caution),
      negative: l(negative, other.negative),
      protein: l(protein, other.protein),
      carbs: l(carbs, other.carbs),
      fat: l(fat, other.fat),
      fiber: l(fiber, other.fiber),
      water: l(water, other.water),
      chartGrid: l(chartGrid, other.chartGrid),
    );
  }
}

extension FormaThemeX on BuildContext {
  FormaColors get colors => Theme.of(this).extension<FormaColors>()!;
  TextTheme get text => Theme.of(this).textTheme;
}
