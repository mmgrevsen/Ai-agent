import 'package:drift/drift.dart';
import 'package:uuid/uuid.dart';

const _uuid = Uuid();
String newId() => _uuid.v4();
DateTime nowUtc() => DateTime.now().toUtc();

/// Columns shared by every synchronised table.
///
/// * `id` is generated on the client so upserts are idempotent.
/// * `updatedAt` (client clock) resolves conflicts (last write wins).
/// * `deletedAt` is a soft delete so deletions propagate through sync.
/// * `dirty` marks rows that still need to be pushed.
mixin SyncColumns on Table {
  TextColumn get id => text().clientDefault(newId)();
  DateTimeColumn get createdAt => dateTime().clientDefault(nowUtc)();
  DateTimeColumn get updatedAt => dateTime().clientDefault(nowUtc)();
  DateTimeColumn get deletedAt => dateTime().nullable()();
  BoolColumn get dirty => boolean().withDefault(const Constant(true))();

  @override
  Set<Column<Object>> get primaryKey => {id};
}

// ---------------------------------------------------------------- user

/// Single row (id = 'me'). Biometric inputs are optional and only used for
/// formula estimates; the app works without them.
class Profiles extends Table with SyncColumns {
  TextColumn get displayName => text().nullable()();
  IntColumn get birthYear => integer().nullable()();
  TextColumn get sex => text().nullable()(); // female | male | unspecified
  RealColumn get heightCm => real().nullable()();
  TextColumn get activityLevel => text().withDefault(const Constant('moderate'))();
  TextColumn get experience => text().withDefault(const Constant('intermediate'))();
  TextColumn get primaryGoal => text().withDefault(const Constant('general'))();
  BoolColumn get onboardingCompleted => boolean().withDefault(const Constant(false))();
}

/// Single row (id = 'me').
@DataClassName('UserPrefs')
class UserPreferences extends Table with SyncColumns {
  TextColumn get unitSystem => text().withDefault(const Constant('metric'))();
  TextColumn get themeMode => text().withDefault(const Constant('dark'))();
  BoolColumn get nutritionEnabled => boolean().withDefault(const Constant(true))();
  BoolColumn get calorieTrackingEnabled => boolean().withDefault(const Constant(true))();
  BoolColumn get weightTrackingEnabled => boolean().withDefault(const Constant(true))();
  BoolColumn get adaptiveTargetsEnabled => boolean().withDefault(const Constant(true))();
  BoolColumn get healthEnabled => boolean().withDefault(const Constant(false))();
  BoolColumn get syncHealthData => boolean().withDefault(const Constant(false))();
  BoolColumn get coachEnabled => boolean().withDefault(const Constant(true))();
  BoolColumn get autoFillSuggestions => boolean().withDefault(const Constant(true))();
  IntColumn get defaultRestSeconds => integer().withDefault(const Constant(120))();
  RealColumn get maxIncreasePct => real().withDefault(const Constant(5))();
  RealColumn get maxIncreaseUpperKg => real().withDefault(const Constant(2.5))();
  RealColumn get maxIncreaseLowerKg => real().withDefault(const Constant(5))();
  IntColumn get weeklyWorkoutTarget => integer().withDefault(const Constant(3))();
  IntColumn get waterTargetMl => integer().withDefault(const Constant(2500))();

  /// JSON list of dashboard card ids, in display order.
  TextColumn get dashboardCards => text().withDefault(
        const Constant('["workout","nutrition","weight","recovery","consistency","insights"]'),
      )();

  /// JSON list of data categories the AI coach may read.
  TextColumn get coachScopes => text().withDefault(
        const Constant('["training","nutrition","body","recovery","goals"]'),
      )();
}

@DataClassName('EquipmentItem')
class UserEquipment extends Table with SyncColumns {
  TextColumn get equipment => text()();
  RealColumn get incrementKg => real().nullable()();
}

/// Something the user does not want programmed: a specific exercise, a
/// muscle, a movement pattern or a piece of equipment.
@DataClassName('Restriction')
class ExerciseRestrictions extends Table with SyncColumns {
  TextColumn get kind => text()(); // exercise | muscle | pattern | equipment
  TextColumn get value => text()();
  TextColumn get note => text().nullable()();
}

class Goals extends Table with SyncColumns {
  TextColumn get kind => text()(); // target_weight | weekly_workouts | strength | protein
  RealColumn get targetValue => real()();
  TextColumn get unit => text().nullable()();
  TextColumn get exerciseId => text().nullable()();
  TextColumn get targetDate => text().nullable()();
  RealColumn get weeklyRateKg => real().nullable()();
  BoolColumn get active => boolean().withDefault(const Constant(true))();
}

/// History of daily nutrition targets. The latest row with
/// `effectiveFrom <= day` applies to a day.
class NutritionTargets extends Table with SyncColumns {
  TextColumn get effectiveFrom => text()(); // yyyy-MM-dd
  RealColumn get kcal => real().nullable()();
  RealColumn get proteinG => real().nullable()();
  RealColumn get carbsG => real().nullable()();
  RealColumn get fatG => real().nullable()();
  RealColumn get fiberG => real().nullable()();
  TextColumn get mode => text().withDefault(const Constant('manual'))(); // manual | adaptive
  TextColumn get rationale => text().nullable()();
}

// ---------------------------------------------------------------- training

/// Global library rows (`isCustom = false`) are seeded from
/// `assets/exercises.json` and never pushed; custom rows sync.
class Exercises extends Table with SyncColumns {
  TextColumn get name => text()();
  TextColumn get primaryMuscle => text()();
  TextColumn get secondaryMuscles => text().withDefault(const Constant(''))(); // comma separated
  TextColumn get equipment => text().withDefault(const Constant(''))(); // comma separated, all required
  TextColumn get pattern => text()();
  TextColumn get mechanic => text().withDefault(const Constant('compound'))();
  TextColumn get trackingType => text().withDefault(const Constant('weight_reps'))();
  TextColumn get instructions => text().withDefault(const Constant(''))(); // newline separated steps
  BoolColumn get isCustom => boolean().withDefault(const Constant(false))();
  BoolColumn get archived => boolean().withDefault(const Constant(false))();
}

class WorkoutTemplates extends Table with SyncColumns {
  TextColumn get name => text()();
  TextColumn get notes => text().nullable()();
  IntColumn get position => integer().withDefault(const Constant(0))();
}

@TableIndex(name: 'idx_template_exercises_template', columns: {#templateId})
class TemplateExercises extends Table with SyncColumns {
  TextColumn get templateId => text().references(WorkoutTemplates, #id)();
  TextColumn get exerciseId => text().references(Exercises, #id)();
  IntColumn get position => integer()();
  IntColumn get supersetGroup => integer().nullable()();
  IntColumn get sets => integer().withDefault(const Constant(3))();
  IntColumn get warmupSets => integer().withDefault(const Constant(0))();
  IntColumn get repMin => integer().withDefault(const Constant(8))();
  IntColumn get repMax => integer().withDefault(const Constant(12))();
  RealColumn get targetRpe => real().nullable()();
  IntColumn get restSeconds => integer().nullable()();
  TextColumn get notes => text().nullable()();
}

@DataClassName('TrainingSchedule')
class TrainingSchedules extends Table with SyncColumns {
  TextColumn get name => text()();
  BoolColumn get isActive => boolean().withDefault(const Constant(true))();
  TextColumn get startDate => text().nullable()();
  IntColumn get deloadEveryWeeks => integer().nullable()();
}

@DataClassName('ScheduleDay')
class ScheduleDays extends Table with SyncColumns {
  TextColumn get scheduleId => text().references(TrainingSchedules, #id)();
  IntColumn get weekday => integer()(); // 1 = Monday … 7 = Sunday
  TextColumn get templateId => text().references(WorkoutTemplates, #id)();
}

/// A training session. `endedAt == null` means it is in progress.
@TableIndex(name: 'idx_workouts_started', columns: {#startedAt})
class Workouts extends Table with SyncColumns {
  TextColumn get templateId => text().nullable()();
  TextColumn get name => text()();
  DateTimeColumn get startedAt => dateTime()();
  DateTimeColumn get endedAt => dateTime().nullable()();
  TextColumn get notes => text().nullable()();
  RealColumn get sessionRpe => real().nullable()();
  BoolColumn get isDeload => boolean().withDefault(const Constant(false))();
  TextColumn get source => text().withDefault(const Constant('recorded'))(); // recorded | imported
  TextColumn get externalId => text().nullable()();
  TextColumn get activityType => text().nullable()();
  RealColumn get energyKcal => real().nullable()();
  RealColumn get distanceM => real().nullable()();
}

@TableIndex(name: 'idx_workout_exercises_workout', columns: {#workoutId})
@TableIndex(name: 'idx_workout_exercises_exercise', columns: {#exerciseId})
class WorkoutExercises extends Table with SyncColumns {
  TextColumn get workoutId => text().references(Workouts, #id)();
  TextColumn get exerciseId => text().references(Exercises, #id)();
  IntColumn get position => integer()();
  IntColumn get supersetGroup => integer().nullable()();
  IntColumn get repMin => integer().nullable()();
  IntColumn get repMax => integer().nullable()();
  RealColumn get targetRpe => real().nullable()();
  IntColumn get restSeconds => integer().nullable()();
  TextColumn get notes => text().nullable()();
  TextColumn get recommendation => text().nullable()();
  TextColumn get substitutedFromId => text().nullable()();
}

@TableIndex(name: 'idx_workout_sets_we', columns: {#workoutExerciseId})
class WorkoutSets extends Table with SyncColumns {
  TextColumn get workoutExerciseId => text().references(WorkoutExercises, #id)();
  IntColumn get position => integer()();
  TextColumn get kind => text().withDefault(const Constant('working'))();
  RealColumn get weightKg => real().nullable()();
  IntColumn get reps => integer().nullable()();
  IntColumn get durationS => integer().nullable()();
  RealColumn get distanceM => real().nullable()();
  RealColumn get rpe => real().nullable()();
  BoolColumn get completed => boolean().withDefault(const Constant(false))();
  DateTimeColumn get completedAt => dateTime().nullable()();
}

/// Subjective readiness, 1 (poor) … 5 (great).
class ReadinessCheckins extends Table with SyncColumns {
  TextColumn get date => text()();
  IntColumn get energy => integer()();
  IntColumn get soreness => integer()();
  IntColumn get sleepQuality => integer()();
  TextColumn get notes => text().nullable()();
}

// ---------------------------------------------------------------- nutrition

/// Nutrient values are per 100 g. `null` means unknown — never treat it as 0.
@TableIndex(name: 'idx_foods_source_ref', columns: {#sourceRef})
class Foods extends Table with SyncColumns {
  TextColumn get name => text()();
  TextColumn get brand => text().nullable()();
  TextColumn get source => text()(); // off | usda | custom | ai
  TextColumn get sourceRef => text().nullable()(); // barcode or database id
  TextColumn get provenance => text()(); // verified | community | custom | aiEstimate
  RealColumn get kcal100 => real().nullable()();
  RealColumn get protein100 => real().nullable()();
  RealColumn get carbs100 => real().nullable()();
  RealColumn get fat100 => real().nullable()();
  RealColumn get fiber100 => real().nullable()();
  RealColumn get servingG => real().nullable()();
  TextColumn get servingLabel => text().nullable()();
  BoolColumn get favorite => boolean().withDefault(const Constant(false))();
  DateTimeColumn get lastUsedAt => dateTime().nullable()();
}

class FoodServings extends Table with SyncColumns {
  TextColumn get foodId => text().references(Foods, #id)();
  TextColumn get label => text()();
  RealColumn get grams => real()();
}

class Recipes extends Table with SyncColumns {
  TextColumn get name => text()();
  RealColumn get servings => real().withDefault(const Constant(1))();
  TextColumn get notes => text().nullable()();
}

class RecipeIngredients extends Table with SyncColumns {
  TextColumn get recipeId => text().references(Recipes, #id)();
  TextColumn get foodId => text().references(Foods, #id)();
  RealColumn get grams => real()();
  IntColumn get position => integer().withDefault(const Constant(0))();
}

class SavedMeals extends Table with SyncColumns {
  TextColumn get name => text()();
}

class SavedMealItems extends Table with SyncColumns {
  TextColumn get mealId => text().references(SavedMeals, #id)();
  TextColumn get foodId => text().references(Foods, #id)();
  RealColumn get grams => real()();
}

/// A diary line. Nutrients are snapshotted at log time so later edits to a
/// food never silently rewrite history.
@TableIndex(name: 'idx_nutrition_entries_date', columns: {#date})
@DataClassName('NutritionEntry')
class NutritionEntries extends Table with SyncColumns {
  TextColumn get date => text()(); // yyyy-MM-dd (local day)
  TextColumn get meal => text()();
  TextColumn get foodId => text().nullable()();
  TextColumn get recipeId => text().nullable()();
  TextColumn get name => text()();
  TextColumn get brand => text().nullable()();
  RealColumn get grams => real().nullable()();
  RealColumn get servings => real().nullable()();
  TextColumn get servingLabel => text().nullable()();
  RealColumn get kcal => real().nullable()();
  RealColumn get proteinG => real().nullable()();
  RealColumn get carbsG => real().nullable()();
  RealColumn get fatG => real().nullable()();
  RealColumn get fiberG => real().nullable()();
  TextColumn get provenance => text()();
  DateTimeColumn get loggedAt => dateTime().clientDefault(nowUtc)();
}

@TableIndex(name: 'idx_water_entries_date', columns: {#date})
class WaterEntries extends Table with SyncColumns {
  TextColumn get date => text()();
  IntColumn get ml => integer()();
  DateTimeColumn get loggedAt => dateTime().clientDefault(nowUtc)();
}

// ---------------------------------------------------------------- body & health

@TableIndex(name: 'idx_body_weights_date', columns: {#date})
class BodyWeights extends Table with SyncColumns {
  TextColumn get date => text()();
  DateTimeColumn get measuredAt => dateTime()();
  RealColumn get weightKg => real()();
  TextColumn get source => text().withDefault(const Constant('recorded'))(); // recorded | imported
  TextColumn get externalId => text().nullable()();
}

@TableIndex(name: 'idx_body_measurements_date', columns: {#date})
class BodyMeasurements extends Table with SyncColumns {
  TextColumn get date => text()();
  TextColumn get kind => text()(); // waist | chest | hips | arm | thigh | neck | body_fat
  RealColumn get value => real()();
  TextColumn get unit => text()(); // cm | %
}

/// Imported samples from Apple Health. Stored locally; pushed to the server
/// only when the user opts in (`syncHealthData`).
@TableIndex(name: 'idx_health_obs_type_start', columns: {#type, #startAt})
class HealthObservations extends Table with SyncColumns {
  TextColumn get type => text()(); // resting_hr | hrv_sdnn | sleep | active_energy | steps | heart_rate
  DateTimeColumn get startAt => dateTime()();
  DateTimeColumn get endAt => dateTime()();
  RealColumn get value => real()();
  TextColumn get unit => text()();
  TextColumn get sourceName => text().nullable()();
  TextColumn get externalId => text().nullable().unique()();
}

// ---------------------------------------------------------------- AI

class AiRecommendations extends Table with SyncColumns {
  TextColumn get kind => text()(); // plan_change | progression | nutrition | insight
  TextColumn get status => text().withDefault(const Constant('proposed'))(); // proposed | accepted | rejected
  TextColumn get title => text()();
  TextColumn get explanation => text()();
  TextColumn get payload => text().nullable()(); // validated JSON
  TextColumn get source => text().withDefault(const Constant('ai'))(); // ai | engine
  DateTimeColumn get decidedAt => dateTime().nullable()();
}

@TableIndex(name: 'idx_coach_messages_thread', columns: {#threadId})
class CoachMessages extends Table with SyncColumns {
  TextColumn get threadId => text()();
  TextColumn get role => text()(); // user | assistant
  TextColumn get content => text()();
  TextColumn get payload => text().nullable()(); // citations / data gaps / proposal ids (JSON)
}

// ---------------------------------------------------------------- local only

/// Local key/value metadata (seed versions, sync cursors). Never synced.
@DataClassName('MetaEntry')
class Meta extends Table {
  TextColumn get key => text()();
  TextColumn get value => text()();

  @override
  Set<Column<Object>> get primaryKey => {key};
}
