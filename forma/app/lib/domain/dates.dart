/// Calendar helpers. Days are local calendar days stored as `yyyy-MM-dd`.
library;

DateTime dateOnly(DateTime t) => DateTime(t.year, t.month, t.day);

/// Calendar arithmetic that is safe across daylight-saving changes.
DateTime addDays(DateTime t, int days) => DateTime(t.year, t.month, t.day + days);

int daysBetween(DateTime a, DateTime b) =>
    DateTime.utc(b.year, b.month, b.day).difference(DateTime.utc(a.year, a.month, a.day)).inDays;

String dayKey(DateTime t) {
  final d = t.isUtc ? t.toLocal() : t;
  return '${d.year.toString().padLeft(4, '0')}-${d.month.toString().padLeft(2, '0')}-${d.day.toString().padLeft(2, '0')}';
}

DateTime parseDayKey(String key) {
  final p = key.split('-');
  return DateTime(int.parse(p[0]), int.parse(p[1]), int.parse(p[2]));
}

/// Monday of the week containing [t] (ISO weeks).
DateTime startOfWeek(DateTime t) {
  return addDays(dateOnly(t), -(t.weekday - DateTime.monday));
}

int? ageFromBirthYear(int? birthYear, DateTime today) => birthYear == null ? null : today.year - birthYear;
