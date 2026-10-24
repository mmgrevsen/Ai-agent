import 'dart:io' show Platform;

import 'package:flutter/foundation.dart';
import 'package:health/health.dart';

import '../domain/dates.dart';

/// Data categories Forma can read. Each is requested separately, with the
/// reason shown before the system prompt.
enum HealthCategory {
  sleep('Sleep', 'Compares last night\'s sleep with your usual to inform recovery insights.'),
  heart('Resting heart rate & HRV', 'Spots days when your body may be under more stress than usual. HRV needs an Apple Watch or similar device.'),
  heartRate('Heart rate', 'Shows your daily average heart rate next to recovery insights.'),
  activity('Steps & active energy', 'Shows daily activity. Active energy is a device estimate and is never used to set calorie targets.'),
  weight('Body weight', 'Imports weigh-ins from smart scales and other apps.'),
  workouts('Workouts', 'Imports workouts recorded by other apps and saves Forma workouts to Apple Health.');

  const HealthCategory(this.label, this.reason);
  final String label;
  final String reason;
}

/// A sample read from the platform, already converted to Forma's units.
class HealthSample {
  const HealthSample({
    required this.id,
    required this.type,
    required this.start,
    required this.end,
    required this.value,
    required this.unit,
    this.sourceName,
  });

  /// Stable platform identifier — used to make imports idempotent.
  final String id;

  /// resting_hr | hrv_sdnn | heart_rate | sleep | active_energy | steps | weight
  final String type;
  final DateTime start;
  final DateTime end;
  final double value;
  final String unit;
  final String? sourceName;
}

class HealthWorkoutSample {
  const HealthWorkoutSample({
    required this.id,
    required this.activity,
    required this.start,
    required this.end,
    this.energyKcal,
    this.distanceM,
    this.sourceName,
  });

  final String id;
  final String activity;
  final DateTime start;
  final DateTime end;
  final double? energyKcal;
  final double? distanceM;
  final String? sourceName;
}

abstract interface class HealthPlatform {
  bool get isSupported;
  Future<bool> requestAccess(Set<HealthCategory> categories);
  Future<List<HealthSample>> readSamples(Set<HealthCategory> categories, DateTime from, DateTime to);
  Future<List<HealthWorkoutSample>> readWorkouts(DateTime from, DateTime to);
  Future<bool> writeStrengthWorkout({required DateTime start, required DateTime end, required String title});
}

/// Used on platforms without a health store (desktop, tests).
class UnsupportedHealthPlatform implements HealthPlatform {
  const UnsupportedHealthPlatform();
  @override
  bool get isSupported => false;
  @override
  Future<bool> requestAccess(Set<HealthCategory> categories) async => false;
  @override
  Future<List<HealthSample>> readSamples(Set<HealthCategory> categories, DateTime from, DateTime to) async => const [];
  @override
  Future<List<HealthWorkoutSample>> readWorkouts(DateTime from, DateTime to) async => const [];
  @override
  Future<bool> writeStrengthWorkout({required DateTime start, required DateTime end, required String title}) async => false;
}

/// Apple Health (and Health Connect on Android) via the `health` package.
class HealthKitPlatform implements HealthPlatform {
  HealthKitPlatform() : _health = Health();

  final Health _health;
  bool _configured = false;

  static HealthPlatform create() {
    if (kIsWeb) return const UnsupportedHealthPlatform();
    if (Platform.isIOS || Platform.isAndroid) return HealthKitPlatform();
    return const UnsupportedHealthPlatform();
  }

  @override
  bool get isSupported => true;

  static const _types = <HealthCategory, List<HealthDataType>>{
    HealthCategory.sleep: [HealthDataType.SLEEP_ASLEEP, HealthDataType.SLEEP_LIGHT, HealthDataType.SLEEP_DEEP, HealthDataType.SLEEP_REM],
    HealthCategory.heart: [HealthDataType.RESTING_HEART_RATE, HealthDataType.HEART_RATE_VARIABILITY_SDNN],
    HealthCategory.heartRate: [HealthDataType.HEART_RATE],
    HealthCategory.activity: [HealthDataType.STEPS, HealthDataType.ACTIVE_ENERGY_BURNED],
    HealthCategory.weight: [HealthDataType.WEIGHT],
    HealthCategory.workouts: [HealthDataType.WORKOUT],
  };

  List<HealthDataType> _typesFor(Set<HealthCategory> cats) => [
        for (final c in cats)
          for (final t in _types[c]!)
            if (_health.isDataTypeAvailable(t)) t,
      ];

  Future<void> _configure() async {
    if (_configured) return;
    await _health.configure();
    _configured = true;
  }

  @override
  Future<bool> requestAccess(Set<HealthCategory> categories) async {
    await _configure();
    final types = _typesFor(categories);
    if (types.isEmpty) return false;
    final permissions = [
      for (final t in types)
        t == HealthDataType.WORKOUT ? HealthDataAccess.READ_WRITE : HealthDataAccess.READ,
    ];
    // iOS never reveals whether read access was granted; missing data is
    // shown as "no data" rather than assumed to be zero.
    return _health.requestAuthorization(types, permissions: permissions);
  }

  @override
  Future<List<HealthSample>> readSamples(Set<HealthCategory> categories, DateTime from, DateTime to) async {
    await _configure();
    final types = _typesFor(categories)..remove(HealthDataType.WORKOUT);
    if (types.isEmpty) return const [];
    final points = await _health.getHealthDataFromTypes(types: types, startTime: from, endTime: to);
    final out = <HealthSample>[];
    for (final p in points) {
      final v = p.value;
      if (v is! NumericHealthValue) continue;
      final type = switch (p.type) {
        HealthDataType.RESTING_HEART_RATE => 'resting_hr',
        HealthDataType.HEART_RATE_VARIABILITY_SDNN => 'hrv_sdnn',
        HealthDataType.HEART_RATE => 'heart_rate',
        HealthDataType.STEPS => 'steps',
        HealthDataType.ACTIVE_ENERGY_BURNED => 'active_energy',
        HealthDataType.WEIGHT => 'weight',
        HealthDataType.SLEEP_ASLEEP || HealthDataType.SLEEP_LIGHT || HealthDataType.SLEEP_DEEP || HealthDataType.SLEEP_REM => 'sleep',
        _ => null,
      };
      if (type == null) continue;
      final unit = switch (type) {
        'resting_hr' || 'heart_rate' => 'bpm',
        'hrv_sdnn' => 'ms',
        'steps' => 'count',
        'active_energy' => 'kcal',
        'weight' => 'kg',
        _ => 'min',
      };
      final value = type == 'sleep' ? p.dateTo.difference(p.dateFrom).inSeconds / 60 : v.numericValue.toDouble();
      out.add(HealthSample(
        id: p.uuid,
        type: type,
        start: p.dateFrom,
        end: p.dateTo,
        value: value,
        unit: unit,
        sourceName: p.sourceName,
      ));
    }
    return out;
  }

  @override
  Future<List<HealthWorkoutSample>> readWorkouts(DateTime from, DateTime to) async {
    await _configure();
    if (!_health.isDataTypeAvailable(HealthDataType.WORKOUT)) return const [];
    final points = await _health.getHealthDataFromTypes(types: [HealthDataType.WORKOUT], startTime: from, endTime: to);
    return [
      for (final p in points)
        if (p.value is WorkoutHealthValue)
          HealthWorkoutSample(
            id: p.uuid,
            activity: (p.value as WorkoutHealthValue).workoutActivityType.name,
            start: p.dateFrom,
            end: p.dateTo,
            energyKcal: (p.value as WorkoutHealthValue).totalEnergyBurned?.toDouble(),
            distanceM: (p.value as WorkoutHealthValue).totalDistance?.toDouble(),
            sourceName: p.sourceName,
          ),
    ];
  }

  @override
  Future<bool> writeStrengthWorkout({required DateTime start, required DateTime end, required String title}) async {
    await _configure();
    return _health.writeWorkoutData(
      activityType: HealthWorkoutActivityType.TRADITIONAL_STRENGTH_TRAINING,
      start: start,
      end: end,
      title: title,
    );
  }
}

/// Reduces raw samples to one value per local day for each metric.
///
/// * resting HR, HRV, heart rate → mean of the day's samples
/// * steps, active energy → sum
/// * sleep → union of asleep intervals, attributed to the day you woke up
Map<String, Map<DateTime, double>> aggregateDaily(Iterable<HealthSample> samples) {
  final out = <String, Map<DateTime, double>>{};
  final means = <String, Map<DateTime, List<double>>>{};
  final sleep = <DateTime, List<(DateTime, DateTime)>>{};

  for (final s in samples) {
    final day = dateOnly(s.end.toLocal());
    switch (s.type) {
      case 'resting_hr' || 'hrv_sdnn' || 'heart_rate':
        means.putIfAbsent(s.type, () => {}).putIfAbsent(day, () => []).add(s.value);
      case 'steps' || 'active_energy':
        final m = out.putIfAbsent(s.type, () => {});
        m[day] = (m[day] ?? 0) + s.value;
      case 'sleep':
        sleep.putIfAbsent(day, () => []).add((s.start, s.end));
    }
  }
  means.forEach((type, byDay) {
    out[type] = {for (final e in byDay.entries) e.key: e.value.reduce((a, b) => a + b) / e.value.length};
  });
  if (sleep.isNotEmpty) {
    out['sleep'] = {for (final e in sleep.entries) e.key: _unionMinutes(e.value)};
  }
  return out;
}

double _unionMinutes(List<(DateTime, DateTime)> intervals) {
  final sorted = [...intervals]..sort((a, b) => a.$1.compareTo(b.$1));
  var total = Duration.zero;
  DateTime? curStart;
  DateTime? curEnd;
  for (final (s, e) in sorted) {
    if (curEnd == null || s.isAfter(curEnd)) {
      if (curStart != null) total += curEnd!.difference(curStart);
      curStart = s;
      curEnd = e;
    } else if (e.isAfter(curEnd)) {
      curEnd = e;
    }
  }
  if (curStart != null) total += curEnd!.difference(curStart);
  return total.inSeconds / 60;
}
