/// Static vocabularies shared by the exercise library, engines and UI.
library;

enum TrackingType {
  weightReps('weight_reps'),
  bodyweightReps('bodyweight_reps'),
  duration('duration'),
  distanceDuration('distance_duration'),
  weightDistance('weight_distance');

  const TrackingType(this.code);
  final String code;

  static TrackingType fromCode(String code) =>
      values.firstWhere((t) => t.code == code, orElse: () => TrackingType.weightReps);

  bool get usesWeight => this == weightReps || this == bodyweightReps || this == weightDistance;
  bool get usesReps => this == weightReps || this == bodyweightReps;
  bool get usesDuration => this == duration || this == distanceDuration;
  bool get usesDistance => this == distanceDuration || this == weightDistance;
}

class EquipmentInfo {
  const EquipmentInfo(this.code, this.label, {this.defaultIncrementKg});
  final String code;
  final String label;

  /// Smallest practical load jump. `null` when load does not apply.
  final double? defaultIncrementKg;
}

/// Equipment the user can mark as available. Increments are conservative
/// defaults (e.g. 2 × 1.25 kg plates on a barbell) and are user-editable.
const equipmentCatalog = <EquipmentInfo>[
  EquipmentInfo('barbell', 'Barbell', defaultIncrementKg: 2.5),
  EquipmentInfo('rack', 'Squat rack'),
  EquipmentInfo('bench', 'Bench'),
  EquipmentInfo('dumbbell', 'Dumbbells', defaultIncrementKg: 2),
  EquipmentInfo('kettlebell', 'Kettlebells', defaultIncrementKg: 4),
  EquipmentInfo('cable', 'Cable station', defaultIncrementKg: 2.5),
  EquipmentInfo('machine', 'Machines', defaultIncrementKg: 5),
  EquipmentInfo('smith_machine', 'Smith machine', defaultIncrementKg: 2.5),
  EquipmentInfo('ez_bar', 'EZ bar', defaultIncrementKg: 2.5),
  EquipmentInfo('trap_bar', 'Trap bar', defaultIncrementKg: 2.5),
  EquipmentInfo('pullup_bar', 'Pull-up bar', defaultIncrementKg: 2.5),
  EquipmentInfo('dip_station', 'Dip station', defaultIncrementKg: 2.5),
  EquipmentInfo('ab_wheel', 'Ab wheel'),
  EquipmentInfo('treadmill', 'Treadmill'),
  EquipmentInfo('bike', 'Bike'),
  EquipmentInfo('rower', 'Rowing machine'),
  EquipmentInfo('jump_rope', 'Jump rope'),
];

EquipmentInfo? equipmentInfo(String code) {
  for (final e in equipmentCatalog) {
    if (e.code == code) return e;
  }
  return null;
}

const muscleLabels = <String, String>{
  'chest': 'Chest',
  'shoulders': 'Shoulders',
  'triceps': 'Triceps',
  'biceps': 'Biceps',
  'forearms': 'Forearms',
  'lats': 'Lats',
  'upper_back': 'Upper back',
  'traps': 'Traps',
  'lower_back': 'Lower back',
  'abs': 'Abs',
  'obliques': 'Obliques',
  'quads': 'Quads',
  'hamstrings': 'Hamstrings',
  'glutes': 'Glutes',
  'adductors': 'Adductors',
  'calves': 'Calves',
  'cardio': 'Cardio',
};

String muscleLabel(String code) => muscleLabels[code] ?? code;

const patternLabels = <String, String>{
  'squat': 'Squat',
  'hinge': 'Hinge',
  'lunge': 'Lunge',
  'horizontal_push': 'Horizontal push',
  'vertical_push': 'Overhead push',
  'vertical_push_down': 'Dip',
  'horizontal_pull': 'Horizontal pull',
  'vertical_pull': 'Vertical pull',
  'chest_isolation': 'Chest isolation',
  'shoulder_isolation': 'Shoulder isolation',
  'elbow_flexion': 'Arm curl',
  'elbow_extension': 'Arm extension',
  'knee_extension': 'Knee extension',
  'knee_flexion': 'Knee flexion',
  'hip_isolation': 'Hip isolation',
  'calf': 'Calf',
  'shrug': 'Shrug',
  'wrist': 'Wrist',
  'core': 'Core',
  'carry': 'Carry',
  'cardio': 'Cardio',
};

const _lowerBodyMuscles = {'quads', 'hamstrings', 'glutes', 'adductors', 'calves'};
const _lowerBodyPatterns = {'squat', 'hinge', 'lunge', 'knee_extension', 'knee_flexion', 'calf', 'hip_isolation'};

/// Lower-body lifts tolerate (and usually need) larger absolute load jumps.
bool isLowerBody({required String primaryMuscle, required String pattern}) =>
    _lowerBodyMuscles.contains(primaryMuscle) || _lowerBodyPatterns.contains(pattern);

enum MealSlot {
  breakfast('Breakfast'),
  lunch('Lunch'),
  dinner('Dinner'),
  snack('Snacks');

  const MealSlot(this.label);
  final String label;

  static MealSlot fromName(String name) => values.firstWhere((m) => m.name == name, orElse: () => snack);

  /// A sensible default slot for the time of day.
  static MealSlot forTime(DateTime t) {
    final h = t.hour;
    if (h < 10) return breakfast;
    if (h < 15) return lunch;
    if (h >= 17 && h < 22) return dinner;
    return snack;
  }
}

enum SetKind {
  warmup('W'),
  working(''),
  drop('D'),
  failure('F');

  const SetKind(this.short);
  final String short;

  static SetKind fromName(String name) => values.firstWhere((k) => k.name == name, orElse: () => working);
}
