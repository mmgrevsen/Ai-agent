import 'package:intl/intl.dart';

import '../../domain/dates.dart';

const _lbPerKg = 2.2046226218;

/// Converts and formats loads and body weight in the user's unit system.
/// Everything is stored in kilograms.
class Units {
  const Units({this.imperial = false});

  factory Units.of(String unitSystem) => Units(imperial: unitSystem == 'imperial');

  final bool imperial;

  String get weightLabel => imperial ? 'lb' : 'kg';

  double toDisplay(double kg) => imperial ? kg * _lbPerKg : kg;
  double fromDisplay(double v) => imperial ? v / _lbPerKg : v;

  /// "62.5 kg" / "137.5 lb"
  String weight(double? kg, {bool unit = true, int maxDecimals = 1}) {
    if (kg == null) return '—';
    final v = toDisplay(kg);
    final s = number(v, maxDecimals: maxDecimals);
    return unit ? '$s $weightLabel' : s;
  }

  /// Signed change, e.g. "−0.4 kg".
  String delta(double kg, {int maxDecimals = 1}) {
    final v = toDisplay(kg);
    final s = number(v.abs(), maxDecimals: maxDecimals);
    if (v.abs() < 0.05) return '±0 $weightLabel';
    return '${v < 0 ? '−' : '+'}$s $weightLabel';
  }

  String volume(double kg) {
    final v = toDisplay(kg);
    if (v >= 10000) return imperial ? '${number(v / 1000, maxDecimals: 1)}k lb' : '${number(v / 1000, maxDecimals: 1)} t';
    return '${NumberFormat.decimalPattern().format(v.round())} $weightLabel';
  }

  /// Default load increments when switching unit systems (2.5 kg ↔ 5 lb).
  double defaultIncrementKg(double metricDefault) =>
      imperial ? (metricDefault <= 2.5 ? 5 : 10) / _lbPerKg : metricDefault;
}

/// Formats with up to [maxDecimals] decimals and no trailing zeros.
String number(double v, {int maxDecimals = 1}) {
  final fixed = v.toStringAsFixed(maxDecimals);
  if (!fixed.contains('.')) return fixed;
  return fixed.replaceFirst(RegExp(r'\.?0+$'), '');
}

String kcal(double? v) => v == null ? '—' : NumberFormat.decimalPattern().format(v.round());

String grams(double? v) => v == null ? '—' : '${number(v, maxDecimals: v < 10 ? 1 : 0)} g';

String duration(Duration d) {
  final h = d.inHours;
  final m = d.inMinutes.remainder(60);
  final s = d.inSeconds.remainder(60);
  if (h > 0) return '${h}h ${m.toString().padLeft(2, '0')}m';
  if (m > 0) return '${m}m ${s.toString().padLeft(2, '0')}s';
  return '${s}s';
}

/// mm:ss for timers.
String clock(Duration d) {
  final neg = d.isNegative;
  final a = d.abs();
  final m = a.inMinutes;
  final s = a.inSeconds.remainder(60).toString().padLeft(2, '0');
  return '${neg ? '-' : ''}$m:$s';
}

String relativeDay(DateTime day, {DateTime? today}) {
  final t = dateOnly(today ?? DateTime.now());
  final d = dateOnly(day);
  final diff = daysBetween(d, t);
  if (diff == 0) return 'Today';
  if (diff == 1) return 'Yesterday';
  if (diff == -1) return 'Tomorrow';
  if (diff > 0 && diff < 7) return DateFormat('EEEE').format(d);
  if (d.year == t.year) return DateFormat('EEE d MMM').format(d);
  return DateFormat('d MMM y').format(d);
}

String shortDate(DateTime d) => DateFormat('d MMM').format(d);
String weekdayShort(int weekday) => const ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'][weekday - 1];
String weekdayLong(int weekday) =>
    const ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'][weekday - 1];
