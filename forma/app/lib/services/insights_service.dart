import '../core/util/format.dart';
import '../data/repositories/body_repository.dart';
import '../data/repositories/nutrition_repository.dart';
import '../data/repositories/settings_repository.dart';
import '../data/repositories/workout_repository.dart';
import '../domain/dates.dart';
import '../domain/recovery/recovery.dart';
import '../domain/training/analytics.dart';
import '../domain/training/strength.dart';
import 'nutrition_service.dart';

enum InsightTone { positive, neutral, attention }

/// A deterministic observation computed from recorded data.
class Insight {
  const Insight({required this.title, required this.body, this.route, this.tone = InsightTone.neutral, this.priority = 0});
  final String title;
  final String body;
  final String? route;
  final InsightTone tone;

  /// Higher shows first.
  final int priority;
}

/// Rule-based insights. These never call an AI model and only state what
/// the data shows, so they work offline and without an account.
class InsightsService {
  InsightsService({required this.workouts, required this.nutrition, required this.body, required this.settings});

  final WorkoutRepository workouts;
  final NutritionRepository nutrition;
  final BodyRepository body;
  final SettingsRepository settings;

  Future<List<Insight>> compute({required DateTime today, required Units units, RecoveryStatus? recovery}) async {
    final out = <Insight>[];
    final prefs = await settings.prefs();
    final profile = await settings.profile();

    // Consistency.
    final rows = await workouts.summaryRows(since: addDays(today, -70));
    final cons = consistency(rows, today: today, target: prefs.weeklyWorkoutTarget);
    if (rows.isNotEmpty) {
      final left = cons.target - cons.thisWeek;
      final daysLeft = 7 - today.weekday;
      if (left <= 0) {
        out.add(Insight(title: 'Weekly target reached', body: '${cons.thisWeek} workouts this week (target ${cons.target}).', tone: InsightTone.positive, priority: 2));
      } else if (left > daysLeft + 1) {
        out.add(Insight(
          title: 'Weekly target is out of reach',
          body: '$left more workouts needed with $daysLeft days left. A shorter session still counts — or adjust your weekly target.',
          route: '/workout',
          tone: InsightTone.attention,
          priority: 3,
        ));
      }
      if (cons.streakWeeks >= 3) {
        out.add(Insight(title: '${cons.streakWeeks}-week streak', body: 'You\'ve met your weekly target ${cons.streakWeeks} weeks in a row.', tone: InsightTone.positive, priority: 1));
      }
    }

    // Plateaus: same top load, no e1RM improvement in 3+ sessions.
    for (final e in (await workouts.loggedExercises()).take(25)) {
      final sessions = await workouts.exerciseHistory(e.id, limit: 4);
      if (sessions.length < 3) continue;
      final recent = sessions.take(3).map(bestOneRepMax).whereType<double>().toList();
      if (recent.length < 3) continue;
      final latest = recent.first;
      final oldest = recent.last;
      if (latest <= oldest * 1.005 && daysBetween(dateOnly(sessions.first.date), today) <= 21) {
        out.add(Insight(
          title: '${e.name} has stalled',
          body: 'No estimated-strength gain across your last 3 sessions (${units.weight(oldest)} → ${units.weight(latest)}). '
              'A short deload or a similar substitute exercise can help.',
          route: '/progress/exercise/${e.id}',
          tone: InsightTone.attention,
          priority: 2,
        ));
      }
    }

    // Protein vs target.
    if (prefs.nutritionEnabled) {
      final target = await settings.targetFor(today);
      final totals = await nutrition.dailyTotals(from: addDays(today, -7), to: addDays(today, -1));
      if (target?.proteinG != null && totals.length >= 4) {
        final avg = totals.values.fold<double>(0, (a, t) => a + t.proteinG) / totals.length;
        final ratio = avg / target!.proteinG!;
        if (ratio < 0.8) {
          out.add(Insight(
            title: 'Protein below target',
            body: 'Averaging ${avg.round()} g on ${totals.length} logged days vs a ${target.proteinG!.round()} g target.',
            route: '/nutrition',
            tone: InsightTone.attention,
            priority: 2,
          ));
        } else if (ratio >= 0.95) {
          out.add(Insight(title: 'Protein on target', body: 'Averaging ${avg.round()} g over ${totals.length} logged days.', tone: InsightTone.positive));
        }
      }
    }

    // Weight trend vs goal direction.
    if (prefs.weightTrackingEnabled) {
      final trend = BodyRepository.trendOf(await body.weights(since: addDays(today, -60)));
      final change = trend.changeOver(14);
      final goal = NutritionService.weightGoalFor(profile.primaryGoal);
      if (change != null && trend.latest != null) {
        final weekly = change / 2;
        final pct = weekly / trend.latest!.trendKg * 100;
        final direction = weekly.abs() < 0.05 ? 'stable' : (weekly < 0 ? 'down' : 'up');
        final body0 = 'Trend ${units.delta(weekly)}/week (${pct.abs().toStringAsFixed(2)}% of body weight).';
        if (goal.name == 'lose' && pct < -1.0) {
          out.add(Insight(title: 'Losing faster than recommended', body: '$body0 Faster than ~1%/week raises the risk of muscle loss and fatigue — consider eating a bit more.', route: '/progress/weight', tone: InsightTone.attention, priority: 3));
        } else if (goal.name == 'lose' && direction != 'down') {
          out.add(Insight(title: 'Weight trend is $direction', body: '$body0 Your goal is fat loss; Forma\'s expenditure estimate will adapt as you keep logging.', route: '/progress/weight', priority: 1));
        } else if (goal.name == 'gain' && direction == 'down') {
          out.add(Insight(title: 'Weight trend is down', body: '$body0 Your goal is building muscle, which usually needs a small surplus.', route: '/progress/weight', priority: 1));
        } else {
          out.add(Insight(title: 'Weight trend is $direction', body: body0, route: '/progress/weight'));
        }
      }
    }

    if (recovery != null && recovery.band == ReadinessBand.strained) {
      out.add(const Insight(
        title: 'Recovery signals are below your usual',
        body: 'Load suggestions will hold rather than increase today. Easier sessions are fine — this is guidance, not a diagnosis.',
        tone: InsightTone.attention,
        priority: 3,
      ));
    }

    out.sort((a, b) => b.priority.compareTo(a.priority));
    return out;
  }
}
