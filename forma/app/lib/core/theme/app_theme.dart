import 'package:flutter/cupertino.dart' show CupertinoPageTransitionsBuilder;
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

import 'tokens.dart';

const _fontFamily = 'Geist';
const tabularFigures = [FontFeature.tabularFigures()];

abstract final class AppTheme {
  static ThemeData dark() => _build(FormaColors.dark, Brightness.dark);
  static ThemeData light() => _build(FormaColors.light, Brightness.light);

  static TextTheme _textTheme(FormaColors c) {
    TextStyle s(double size, FontWeight w, {double ls = 0, double h = 1.3, Color? color}) => TextStyle(
          fontFamily: _fontFamily,
          fontSize: size,
          fontWeight: w,
          letterSpacing: ls,
          height: h,
          color: color ?? c.textPrimary,
        );
    return TextTheme(
      // Large numerals (calories left, weight, timers).
      displayLarge: s(56, FontWeight.w600, ls: -2.2, h: 1.0).copyWith(fontFeatures: tabularFigures),
      displayMedium: s(44, FontWeight.w600, ls: -1.6, h: 1.0).copyWith(fontFeatures: tabularFigures),
      displaySmall: s(32, FontWeight.w600, ls: -1.0, h: 1.05).copyWith(fontFeatures: tabularFigures),
      headlineLarge: s(30, FontWeight.w600, ls: -0.9, h: 1.15),
      headlineMedium: s(24, FontWeight.w600, ls: -0.6, h: 1.2),
      headlineSmall: s(20, FontWeight.w600, ls: -0.4, h: 1.25),
      titleLarge: s(18, FontWeight.w600, ls: -0.3),
      titleMedium: s(16, FontWeight.w600, ls: -0.2),
      titleSmall: s(14, FontWeight.w600, ls: -0.1),
      bodyLarge: s(16, FontWeight.w400, h: 1.45),
      bodyMedium: s(14, FontWeight.w400, h: 1.45, color: c.textSecondary),
      bodySmall: s(12.5, FontWeight.w400, h: 1.4, color: c.textSecondary),
      labelLarge: s(15, FontWeight.w600, ls: -0.1),
      labelMedium: s(13, FontWeight.w500, color: c.textSecondary),
      // Used for eyebrow labels (uppercase micro headings).
      labelSmall: s(11, FontWeight.w600, ls: 1.1, color: c.textTertiary),
    );
  }

  static ThemeData _build(FormaColors c, Brightness brightness) {
    final scheme = ColorScheme(
      brightness: brightness,
      primary: c.accent,
      onPrimary: c.onAccent,
      secondary: c.textSecondary,
      onSecondary: c.background,
      error: c.negative,
      onError: c.background,
      surface: c.surface,
      onSurface: c.textPrimary,
      surfaceContainerLowest: c.surfaceSunken,
      surfaceContainerLow: c.surface,
      surfaceContainer: c.surface,
      surfaceContainerHigh: c.surfaceRaised,
      surfaceContainerHighest: c.surfaceRaised,
      outline: c.outlineStrong,
      outlineVariant: c.outline,
    );
    final text = _textTheme(c);
    final isDark = brightness == Brightness.dark;

    return ThemeData(
      useMaterial3: true,
      brightness: brightness,
      colorScheme: scheme,
      fontFamily: _fontFamily,
      textTheme: text,
      scaffoldBackgroundColor: c.background,
      canvasColor: c.background,
      splashFactory: InkSparkle.splashFactory,
      extensions: [c],
      dividerTheme: DividerThemeData(color: c.outline, thickness: 1, space: 1),
      appBarTheme: AppBarTheme(
        backgroundColor: c.background,
        surfaceTintColor: Colors.transparent,
        elevation: 0,
        scrolledUnderElevation: 0,
        centerTitle: false,
        titleTextStyle: text.titleLarge,
        foregroundColor: c.textPrimary,
        systemOverlayStyle: isDark ? SystemUiOverlayStyle.light : SystemUiOverlayStyle.dark,
      ),
      iconTheme: IconThemeData(color: c.textPrimary, size: 22),
      cardTheme: CardThemeData(
        color: c.surface,
        elevation: 0,
        margin: EdgeInsets.zero,
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(Radii.lg),
          side: BorderSide(color: c.outline),
        ),
      ),
      filledButtonTheme: FilledButtonThemeData(
        style: FilledButton.styleFrom(
          backgroundColor: c.accent,
          foregroundColor: c.onAccent,
          disabledBackgroundColor: c.surfaceRaised,
          disabledForegroundColor: c.textTertiary,
          minimumSize: const Size(64, 52),
          textStyle: text.labelLarge,
          shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(Radii.md)),
        ),
      ),
      outlinedButtonTheme: OutlinedButtonThemeData(
        style: OutlinedButton.styleFrom(
          foregroundColor: c.textPrimary,
          minimumSize: const Size(64, 52),
          side: BorderSide(color: c.outlineStrong),
          textStyle: text.labelLarge,
          shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(Radii.md)),
        ),
      ),
      textButtonTheme: TextButtonThemeData(
        style: TextButton.styleFrom(
          foregroundColor: c.accent,
          textStyle: text.labelLarge,
          minimumSize: const Size(48, 44),
        ),
      ),
      inputDecorationTheme: InputDecorationTheme(
        filled: true,
        fillColor: c.surfaceRaised,
        hintStyle: text.bodyLarge?.copyWith(color: c.textTertiary),
        labelStyle: text.bodyMedium,
        contentPadding: const EdgeInsets.symmetric(horizontal: Space.lg, vertical: 14),
        border: OutlineInputBorder(
          borderRadius: BorderRadius.circular(Radii.md),
          borderSide: BorderSide(color: c.outline),
        ),
        enabledBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(Radii.md),
          borderSide: BorderSide(color: c.outline),
        ),
        focusedBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(Radii.md),
          borderSide: BorderSide(color: c.accent, width: 1.4),
        ),
        errorBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(Radii.md),
          borderSide: BorderSide(color: c.negative),
        ),
      ),
      bottomSheetTheme: BottomSheetThemeData(
        backgroundColor: c.surface,
        surfaceTintColor: Colors.transparent,
        showDragHandle: true,
        dragHandleColor: c.outlineStrong,
        shape: const RoundedRectangleBorder(
          borderRadius: BorderRadius.vertical(top: Radius.circular(Radii.xl)),
        ),
      ),
      dialogTheme: DialogThemeData(
        backgroundColor: c.surface,
        surfaceTintColor: Colors.transparent,
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(Radii.lg)),
        titleTextStyle: text.titleLarge,
        contentTextStyle: text.bodyMedium,
      ),
      snackBarTheme: SnackBarThemeData(
        backgroundColor: c.surfaceRaised,
        contentTextStyle: text.bodyMedium?.copyWith(color: c.textPrimary),
        behavior: SnackBarBehavior.floating,
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(Radii.md),
          side: BorderSide(color: c.outline),
        ),
      ),
      switchTheme: SwitchThemeData(
        thumbColor: WidgetStateProperty.resolveWith(
          (s) => s.contains(WidgetState.selected) ? c.onAccent : c.textSecondary,
        ),
        trackColor: WidgetStateProperty.resolveWith(
          (s) => s.contains(WidgetState.selected) ? c.accent : c.surfaceRaised,
        ),
        trackOutlineColor: WidgetStateProperty.all(c.outline),
      ),
      sliderTheme: SliderThemeData(
        activeTrackColor: c.accent,
        inactiveTrackColor: c.surfaceRaised,
        thumbColor: c.accent,
        overlayColor: c.accentMuted,
      ),
      progressIndicatorTheme: ProgressIndicatorThemeData(
        color: c.accent,
        linearTrackColor: c.surfaceRaised,
        circularTrackColor: c.surfaceRaised,
      ),
      chipTheme: ChipThemeData(
        backgroundColor: c.surfaceRaised,
        selectedColor: c.accentMuted,
        side: BorderSide(color: c.outline),
        labelStyle: text.labelMedium,
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(Radii.pill)),
      ),
      listTileTheme: ListTileThemeData(
        iconColor: c.textSecondary,
        titleTextStyle: text.titleSmall,
        subtitleTextStyle: text.bodySmall,
        contentPadding: const EdgeInsets.symmetric(horizontal: Space.gutter),
      ),
      pageTransitionsTheme: const PageTransitionsTheme(
        builders: {
          TargetPlatform.iOS: CupertinoPageTransitionsBuilder(),
          TargetPlatform.android: FadeForwardsPageTransitionsBuilder(),
          TargetPlatform.linux: FadeForwardsPageTransitionsBuilder(),
        },
      ),
    );
  }
}
