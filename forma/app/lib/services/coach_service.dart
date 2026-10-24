import 'dart:convert';

import '../data/db/app_database.dart';
import '../data/remote/ai_api.dart';
import '../data/repositories/body_repository.dart';
import '../data/repositories/coach_repository.dart';
import '../data/repositories/exercise_repository.dart';
import '../data/repositories/nutrition_repository.dart';
import '../data/repositories/settings_repository.dart';
import '../data/repositories/workout_repository.dart';
import '../domain/dates.dart';
import '../domain/nutrition/energy.dart';
import '../domain/recovery/recovery.dart';
import '../domain/training/analytics.dart';
import '../domain/training/strength.dart';
import 'nutrition_service.dart';

/// Data categories the user can allow the coach to read.
enum CoachScope {
  training('Training', 'Workouts, templates, schedule, equipment and restrictions'),
  nutrition('Nutrition', 'Daily totals and targets (not individual foods)'),
  body('Body', 'Weight trend and measurements'),
  recovery('Recovery', 'Recovery status from Apple Health and check-ins'),
  goals('Goals', 'Your goals and profile basics (age range, experience)');

  const CoachScope(this.label, this.description);
  final String label;
  final String description;
}

/// Topics inferred from the question so only relevant data is sent.
Set<CoachScope> relevantScopes(String message) {
  final m = message.toLowerCase();
  bool any(List<String> words) => words.any(m.contains);
  final s = <CoachScope>{CoachScope.goals};
  if (any(['workout', 'train', 'lift', 'exercise', 'set', 'rep', 'squat', 'bench', 'deadlift', 'press', 'row', 'plateau', 'stall', 'program', 'plan', 'routine', 'template', 'strength', 'muscle', 'volume', 'deload', 'substitute', 'swap', 'pr', 'cardio', 'run'])) {
    s.add(CoachScope.training);
  }
  if (any(['eat', 'food', 'calor', 'kcal', 'protein', 'carb', 'fat', 'fiber', 'diet', 'meal', 'nutrition', 'macro', 'hungry', 'deficit', 'surplus'])) {
    s.add(CoachScope.nutrition);
  }
  if (any(['weight', 'weigh', 'scale', 'lose', 'gain', 'cut', 'bulk', 'waist', 'body', 'trend', 'fat'])) {
    s.add(CoachScope.body);
  }
  if (any(['sleep', 'tired', 'fatigue', 'recover', 'hrv', 'heart', 'rest', 'sore', 'energy'])) {
    s.add(CoachScope.recovery);
  }
  if (s.length == 1) s.addAll(CoachScope.values); // General question → compact summary of everything allowed.
  return s;
}

class ProposalCheck {
  const ProposalCheck({required this.ok, required this.problems, this.summary = const []});
  final bool ok;
  final List<String> problems;

  /// Human-readable description of exactly what will change.
  final List<String> summary;
}

class CoachService {
  CoachService({
    required this.api,
    required this.coach,
    required this.workouts,
    required this.exercises,
    required this.nutrition,
    required this.body,
    required this.settings,
    required this.nutritionService,
  });

  final AiApi api;
  final CoachRepository coach;
  final WorkoutRepository workouts;
  final ExerciseRepository exercises;
  final NutritionRepository nutrition;
  final BodyRepository body;
  final SettingsRepository settings;
  final NutritionService nutritionService;

  /// Builds a compact, minimised summary of the user's data for [scopes].
  /// Only aggregates are sent — no free-text notes, food names or exact dates
  /// of birth.
  Future<Map<String, dynamic>> buildContext({required DateTime today, required Set<CoachScope> scopes, RecoveryStatus? recovery}) async {
    final ctx = <String, dynamic>{'today': dayKey(today)};
    final profile = await settings.profile();
    final prefs = await settings.prefs();

    if (scopes.contains(CoachScope.goals)) {
      final age = ageFromBirthYear(profile.birthYear, today);
      ctx['profile'] = {
        'primaryGoal': profile.primaryGoal,
        'experience': profile.experience,
        'ageRange': age == null ? 'unknown' : (age < 18 ? 'under 18' : '${(age ~/ 10) * 10}s'),
        'units': prefs.unitSystem,
        'weeklyWorkoutTarget': prefs.weeklyWorkoutTarget,
      };
      ctx['goals'] = [
        for (final g in await settings.goals()) {'kind': g.kind, 'target': g.targetValue, 'unit': g.unit},
      ];
    }

    if (scopes.contains(CoachScope.training)) {
      final library = await exercises.all();
      final ctxEquip = await settings.equipment();
      final restrictions = await settings.restrictions();
      final history = await workouts.history(limit: 10);
      ctx['training'] = {
        'equipment': [for (final e in ctxEquip) e.equipment],
        'restrictions': [for (final r in restrictions) '${r.kind}:${r.value}'],
        'safetyLimits': {
          'maxIncreasePct': prefs.maxIncreasePct,
          'maxIncreaseUpperKg': prefs.maxIncreaseUpperKg,
          'maxIncreaseLowerKg': prefs.maxIncreaseLowerKg,
        },
        'recentWorkouts': [
          for (final w in history)
            {
              'ref': 'workout:${w.workout.id}',
              'date': dayKey(w.workout.startedAt.toLocal()),
              'name': w.workout.name,
              'source': w.workout.source,
              'workingSets': w.setCount,
              'volumeKg': w.volumeKg.round(),
              'exercises': w.exerciseNames.take(8).toList(),
            },
        ],
        'templates': [
          for (final t in await workouts.templates())
            {
              'name': t.template.name,
              'exercises': [for (final i in t.items) '${i.exercise.name} ${i.row.sets}x${i.row.repMin}-${i.row.repMax}'],
            },
        ],
        'schedule': {
          for (final e in ((await workouts.activeSchedule())?.days ?? const <int, String>{}).entries) '${e.key}': e.value,
        },
        'exerciseTrends': [
          for (final e in (await workouts.loggedExercises()).take(10))
            await _exerciseTrend(e.id, e.name),
        ],
        // Exercise ids the model may use in proposals (filtered by equipment and restrictions).
        'availableExercises': [
          for (final e in library)
            if (TrainingContext(available: {for (final q in ctxEquip) q.equipment}, restrictions: restrictions, increments: const {}).hasEquipmentFor(e) &&
                TrainingContext(available: const {}, restrictions: restrictions, increments: const {}).restrictionFor(e) == null)
              '${e.id}|${e.name}|${e.primaryMuscle}',
        ],
      };
      final rows = await workouts.summaryRows(since: addDays(today, -56));
      final cons = consistency(rows, today: today, target: prefs.weeklyWorkoutTarget);
      (ctx['training'] as Map<String, dynamic>)['consistency'] = {
        'thisWeek': cons.thisWeek,
        'streakWeeks': cons.streakWeeks,
        'hitRateLast8Weeks': (cons.hitRate * 100).round(),
      };
    }

    if (scopes.contains(CoachScope.nutrition) && prefs.nutritionEnabled) {
      final totals = await nutrition.dailyTotals(from: addDays(today, -14), to: today);
      final target = await settings.targetFor(today);
      final est = await nutritionService.estimate(today: today);
      ctx['nutrition'] = {
        'calorieTrackingEnabled': prefs.calorieTrackingEnabled,
        'target': target == null
            ? null
            : {'kcal': target.kcal, 'protein': target.proteinG, 'carbs': target.carbsG, 'fat': target.fatG, 'mode': target.mode},
        'expenditureEstimate': est == null ? null : {'kcal': est.kcal.round(), 'method': est.method.name, 'confidence': est.confidence.name},
        'days': [
          for (final e in totals.entries)
            {
              'ref': 'nutrition:${dayKey(e.key)}',
              'date': dayKey(e.key),
              'kcal': e.value.kcal.round(),
              'protein': e.value.proteinG.round(),
              'carbs': e.value.carbsG.round(),
              'fat': e.value.fatG.round(),
              'incomplete': e.value.incompleteFields.toList(),
            },
        ],
        'note': 'Days not listed were not logged (unknown intake, not zero).',
      };
    }

    if (scopes.contains(CoachScope.body) && prefs.weightTrackingEnabled) {
      final trend = BodyRepository.trendOf(await body.weights(since: addDays(today, -90)));
      ctx['body'] = {
        'latestTrendKg': trend.latest?.trendKg,
        'change7dKg': trend.changeOver(7),
        'change30dKg': trend.changeOver(30),
        'weighInsLast90d': trend.weighInCount,
        'weeklyTrend': [
          for (final p in trend.points)
            if (p.day.weekday == DateTime.monday) {'ref': 'weight:${dayKey(p.day)}', 'date': dayKey(p.day), 'trendKg': double.parse(p.trendKg.toStringAsFixed(2))},
        ],
      };
    }

    if (scopes.contains(CoachScope.recovery) && recovery != null) {
      ctx['recovery'] = {
        'band': recovery.band.name,
        'factors': [for (final f in recovery.factors) '${f.name}: ${f.detail}'],
        'missing': recovery.missing,
        'disclaimer': RecoveryStatus.disclaimer,
      };
    }
    return ctx;
  }

  Future<Map<String, dynamic>> _exerciseTrend(String id, String name) async {
    final sessions = await workouts.exerciseHistory(id, limit: 6);
    return {
      'exercise': name,
      'sessions': [
        for (final s in sessions)
          {
            'ref': 'workout:${s.workoutId}',
            'date': dayKey(s.date),
            'sets': [for (final x in s.workingSets) '${x.weightKg ?? 0}kg x ${x.reps ?? x.durationS ?? 0}${x.rpe == null ? '' : ' @${x.rpe}'}'],
            'e1rmKg': bestOneRepMax(s)?.round(),
          },
      ],
    };
  }

  /// Sends a message, stores both sides of the exchange and any proposals.
  Future<CoachReply> ask({required String message, required DateTime today, required Set<CoachScope> allowed, RecoveryStatus? recovery}) async {
    final scopes = relevantScopes(message).intersection(allowed);
    final history = await coach.recent(limit: 8);
    await coach.addMessage(role: 'user', content: message);
    final context = await buildContext(today: today, scopes: scopes, recovery: recovery);
    final reply = await api.ask(
      message: message,
      history: [for (final m in history) {'role': m.role, 'content': m.content}],
      context: context,
    );
    final proposalIds = <String>[];
    for (final p in reply.proposals) {
      proposalIds.add(await coach.addRecommendation(
        kind: p.type,
        title: p.title,
        explanation: p.rationale,
        payload: jsonEncode(p.payload),
      ));
    }
    await coach.addMessage(
      role: 'assistant',
      content: reply.answer,
      payload: jsonEncode({
        'citations': [for (final c in reply.citations) {'kind': c.kind, 'label': c.label}],
        'dataGaps': reply.dataGaps,
        'proposals': proposalIds,
        'scopes': [for (final s in scopes) s.name],
      }),
    );
    return reply;
  }

  /// Re-validates a stored proposal against current data and safety rules.
  Future<ProposalCheck> check(AiRecommendation rec, {required DateTime today}) async {
    final payload = rec.payload == null ? null : jsonDecode(rec.payload!) as Map<String, dynamic>;
    if (payload == null) return const ProposalCheck(ok: false, problems: ['The proposal has no content.']);
    switch (rec.kind) {
      case 'create_template':
        return _checkTemplate(payload);
      case 'adjust_targets':
        return _checkTargets(payload, today);
      default:
        return ProposalCheck(ok: false, problems: ['Unsupported proposal type “${rec.kind}”.']);
    }
  }

  Future<ProposalCheck> _checkTemplate(Map<String, dynamic> p) async {
    final problems = <String>[];
    final summary = <String>[];
    final name = p['name'];
    if (name is! String || name.trim().isEmpty || name.length > 60) problems.add('Missing or invalid template name.');
    final items = p['exercises'];
    if (items is! List || items.isEmpty || items.length > 12) {
      problems.add('A template needs 1–12 exercises.');
      return ProposalCheck(ok: false, problems: problems);
    }
    final equipment = await settings.equipment();
    final restrictions = await settings.restrictions();
    final ctx = TrainingContext(available: {for (final e in equipment) e.equipment}, restrictions: restrictions, increments: const {});
    for (final raw in items) {
      if (raw is! Map) {
        problems.add('Invalid exercise entry.');
        continue;
      }
      final e = raw['exerciseId'] is String ? await exercises.byId(raw['exerciseId'] as String) : null;
      if (e == null) {
        problems.add('Unknown exercise “${raw['exerciseId']}”.');
        continue;
      }
      if (!ctx.hasEquipmentFor(e)) problems.add('${e.name} needs equipment you haven\'t marked as available.');
      final r = ctx.restrictionFor(e);
      if (r != null) problems.add('${e.name} is restricted: $r');
      final sets = raw['sets'], lo = raw['repMin'], hi = raw['repMax'];
      if (sets is! int || sets < 1 || sets > 8) problems.add('${e.name}: sets must be 1–8.');
      if (lo is! int || hi is! int || lo < 1 || hi > 30 || lo > hi) problems.add('${e.name}: invalid rep range.');
      final rpe = raw['targetRpe'];
      if (rpe != null && (rpe is! num || rpe < 5 || rpe > 10)) problems.add('${e.name}: RPE must be 5–10.');
      summary.add('${e.name} — ${raw['sets']} × ${raw['repMin']}–${raw['repMax']}${rpe == null ? '' : ' @ RPE $rpe'}');
    }
    final days = p['weekdays'];
    if (days != null && (days is! List || days.any((d) => d is! int || d < 1 || d > 7))) problems.add('Invalid weekdays.');
    if (days is List && days.isNotEmpty) {
      summary.add('Scheduled on: ${days.map((d) => const ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'][(d as int) - 1]).join(', ')} (replaces what is planned on those days)');
    }
    return ProposalCheck(ok: problems.isEmpty, problems: problems, summary: summary);
  }

  Future<ProposalCheck> _checkTargets(Map<String, dynamic> p, DateTime today) async {
    final problems = <String>[];
    final kcal = (p['kcal'] as num?)?.toDouble();
    final protein = (p['proteinG'] as num?)?.toDouble();
    final carbs = (p['carbsG'] as num?)?.toDouble();
    final fat = (p['fatG'] as num?)?.toDouble();
    final profile = await settings.profile();
    final age = ageFromBirthYear(profile.birthYear, today);
    final est = await nutritionService.estimate(today: today);
    final trend = await nutritionService.trend(since: addDays(today, -60));
    final weight = trend.latest?.trendKg;
    final bmr = basalMetabolicRate(
      weightKg: weight,
      heightCm: profile.heightCm,
      age: age,
      sex: Sex.values.firstWhere((s) => s.name == profile.sex, orElse: () => Sex.unspecified),
    );
    if (kcal == null || kcal < 800 || kcal > 6000) {
      problems.add('Calories missing or out of range.');
    } else {
      final floor = [1200.0, ?bmr].reduce((a, b) => a > b ? a : b);
      if (kcal < floor) problems.add('Calories below the safety floor of ${floor.round()} kcal.');
      if (est != null && kcal < est.kcal * 0.75) problems.add('More than a 25% deficit from your estimated expenditure.');
      if (age != null && age < 18 && est != null && kcal < est.kcal * 0.97) problems.add('No calorie deficits are set for users under 18.');
    }
    if (protein != null && weight != null && (protein < weight * 0.8 || protein > weight * 3)) problems.add('Protein outside 0.8–3 g/kg.');
    if (fat != null && weight != null && fat < weight * 0.5) problems.add('Fat below 0.5 g/kg.');
    if (carbs != null && carbs < 0) problems.add('Negative carbs.');
    return ProposalCheck(
      ok: problems.isEmpty,
      problems: problems,
      summary: [
        if (kcal != null) 'Calories: ${kcal.round()} kcal',
        if (protein != null) 'Protein: ${protein.round()} g',
        if (carbs != null) 'Carbs: ${carbs.round()} g',
        if (fat != null) 'Fat: ${fat.round()} g',
      ],
    );
  }

  /// Applies a proposal after the user confirmed it. Re-checks first.
  Future<ProposalCheck> apply(AiRecommendation rec, {required DateTime today}) async {
    final check = await this.check(rec, today: today);
    if (!check.ok) return check;
    final p = jsonDecode(rec.payload!) as Map<String, dynamic>;
    if (rec.kind == 'create_template') {
      final id = await workouts.saveTemplate(
        name: (p['name'] as String).trim(),
        notes: 'Created with the AI coach.',
        items: [
          for (final raw in (p['exercises'] as List<dynamic>).cast<Map<String, dynamic>>())
            TemplateItemInput(
              exerciseId: raw['exerciseId'] as String,
              sets: raw['sets'] as int,
              repMin: raw['repMin'] as int,
              repMax: raw['repMax'] as int,
              targetRpe: (raw['targetRpe'] as num?)?.toDouble(),
              restSeconds: raw['restSeconds'] is int ? raw['restSeconds'] as int : null,
            ),
        ],
      );
      for (final d in (p['weekdays'] as List<dynamic>? ?? const [])) {
        await workouts.setScheduleDay(d as int, id);
      }
    } else if (rec.kind == 'adjust_targets') {
      await settings.setTargets(
        kcal: (p['kcal'] as num?)?.toDouble(),
        proteinG: (p['proteinG'] as num?)?.toDouble(),
        carbsG: (p['carbsG'] as num?)?.toDouble(),
        fatG: (p['fatG'] as num?)?.toDouble(),
        mode: 'manual',
        rationale: 'Proposed by the AI coach and confirmed by you: ${rec.explanation}',
      );
    }
    await coach.decide(rec.id, accepted: true);
    return check;
  }
}
