import 'package:drift/drift.dart' show Value;
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../app/providers.dart';
import '../../core/theme/tokens.dart';
import '../../core/util/format.dart';
import '../../core/widgets/inputs.dart';
import '../../core/widgets/primitives.dart';
import '../../core/widgets/states.dart';
import '../../data/db/app_database.dart';
import '../../domain/nutrition/energy.dart';
import '../../services/nutrition_service.dart';
import '../../services/program_generator.dart';
import 'nutrition_providers.dart';

final targetProposalProvider = FutureProvider<TargetProposal?>((ref) {
  ref.watch(profileProvider);
  ref.watch(goalsProvider);
  ref.watch(dayLogProvider(ref.watch(todayProvider)));
  return ref.watch(nutritionServiceProvider).propose(today: ref.watch(todayProvider));
});

final energyEstimateProvider = FutureProvider<EnergyEstimate?>((ref) {
  ref.watch(profileProvider);
  ref.watch(dayLogProvider(ref.watch(todayProvider)));
  return ref.watch(nutritionServiceProvider).estimate(today: ref.watch(todayProvider));
});

class NutritionTargetsScreen extends ConsumerStatefulWidget {
  const NutritionTargetsScreen({super.key});

  @override
  ConsumerState<NutritionTargetsScreen> createState() => _NutritionTargetsScreenState();
}

class _NutritionTargetsScreenState extends ConsumerState<NutritionTargetsScreen> {
  final _kcal = TextEditingController();
  final _protein = TextEditingController();
  final _carbs = TextEditingController();
  final _fat = TextEditingController();
  final _fiber = TextEditingController();
  bool _filled = false;

  @override
  void dispose() {
    for (final c in [_kcal, _protein, _carbs, _fat, _fiber]) {
      c.dispose();
    }
    super.dispose();
  }

  void _fill(NutritionTarget? t) {
    if (_filled || t == null) return;
    _filled = true;
    String f(double? v) => v == null ? '' : number(v, maxDecimals: 0);
    _kcal.text = f(t.kcal);
    _protein.text = f(t.proteinG);
    _carbs.text = f(t.carbsG);
    _fat.text = f(t.fatG);
    _fiber.text = f(t.fiberG);
  }

  @override
  Widget build(BuildContext context) {
    final today = ref.watch(todayProvider);
    final current = ref.watch(targetForDayProvider(today));
    final proposal = ref.watch(targetProposalProvider);
    final profile = ref.watch(profileProvider).value;
    final goals = ref.watch(goalsProvider).value ?? const [];
    final rate = goals.where((g) => g.kind == NutritionService.rateGoalKind).firstOrNull?.targetValue;
    final c = context.colors;
    _fill(current.value);

    final goal = profile == null ? WeightGoal.maintain : NutritionService.weightGoalFor(profile.primaryGoal);

    return PageScaffold(
      showBack: true,
      title: 'Targets',
      slivers: [
        SliverPadding(
          padding: const EdgeInsets.fromLTRB(Space.gutter, Space.md, Space.gutter, 0),
          sliver: SliverToBoxAdapter(
            child: AsyncView(
              value: proposal,
              compact: true,
              data: (p) {
                if (p == null) {
                  return FCard(
                    child: Text(
                      'Log your body weight (and ideally your height, birth year and activity in Settings) so Forma can estimate your energy needs. '
                      'You can always set targets manually below.',
                      style: context.text.bodyMedium,
                    ),
                  );
                }
                final e = p.estimate;
                return FCard(
                  child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                    const Row(children: [
                      Eyebrow('Estimated expenditure'),
                      Spacer(),
                      ProvenanceBadge(Provenance.estimated, compact: true),
                    ]),
                    const SizedBox(height: Space.sm),
                    MetricValue(value: kcal(e.kcal), unit: 'kcal / day'),
                    const SizedBox(height: Space.xs),
                    Text(
                      '${switch (e.method) {
                        EnergyMethod.formula => 'Formula estimate',
                        EnergyMethod.adaptive => 'From your data',
                        EnergyMethod.blended => 'Mostly from your data',
                      }} · ${e.confidence.name} confidence',
                      style: context.text.labelMedium,
                    ),
                    const SizedBox(height: Space.sm),
                    Text(e.explanation, style: context.text.bodySmall),
                    const Divider(height: Space.xxl),
                    const Eyebrow('Suggested daily targets'),
                    const SizedBox(height: Space.sm),
                    Text(
                      '${kcal(p.targets.kcal)} kcal · P ${number(p.targets.proteinG)} g · C ${number(p.targets.carbsG)} g · F ${number(p.targets.fatG)} g · Fiber ${number(p.targets.fiberG)} g',
                      style: context.text.titleSmall,
                    ),
                    const SizedBox(height: Space.xs),
                    Text(
                      switch (p.targets.effectiveGoal) {
                        WeightGoal.lose => 'Aims for about ${number(p.targets.weeklyRatePct, maxDecimals: 2)}% of body weight per week loss.',
                        WeightGoal.gain => 'Aims for about ${number(p.targets.weeklyRatePct, maxDecimals: 2)}% of body weight per week gain.',
                        WeightGoal.maintain => 'Aims to keep your weight stable.',
                      },
                      style: context.text.bodySmall,
                    ),
                    for (final n in p.targets.notes) Padding(padding: const EdgeInsets.only(top: 4), child: Text(n, style: context.text.bodySmall?.copyWith(color: c.caution))),
                    const SizedBox(height: Space.md),
                    FilledButton(
                      onPressed: () async {
                        await ref.read(nutritionServiceProvider).applyProposal(p);
                        _filled = false;
                        if (context.mounted) ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('Targets updated.')));
                      },
                      child: const Text('Use suggested targets'),
                    ),
                  ]),
                );
              },
            ),
          ),
        ),
        if (goal != WeightGoal.maintain) ...[
          SliverToBoxAdapter(child: SectionHeader(goal == WeightGoal.lose ? 'Rate of loss' : 'Rate of gain')),
          SliverPadding(
            padding: const EdgeInsets.symmetric(horizontal: Space.gutter),
            sliver: SliverToBoxAdapter(
              child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                Wrap(spacing: Space.sm, runSpacing: Space.sm, children: [
                  for (final r in goal == WeightGoal.lose ? const [0.25, 0.5, 0.75, 1.0] : const [0.1, 0.25, 0.5])
                    ToggleChip(
                      label: '${number(r, maxDecimals: 2)}% / week',
                      selected: (rate ?? (goal == WeightGoal.gain ? 0.25 : 0.5)) == r,
                      onTap: () => ref.read(settingsRepositoryProvider).setGoal(kind: NutritionService.rateGoalKind, targetValue: r, unit: '%/week'),
                    ),
                ]),
                const SizedBox(height: Space.xs),
                Text(
                  goal == WeightGoal.lose
                      ? 'Slower loss is easier to sustain and better preserves muscle. Faster than 1% per week is not offered.'
                      : 'A slow gain limits fat gain while building muscle.',
                  style: context.text.bodySmall,
                ),
              ]),
            ),
          ),
        ],
        const SliverToBoxAdapter(child: SectionHeader('Your targets')),
        SliverPadding(
          padding: const EdgeInsets.symmetric(horizontal: Space.gutter),
          sliver: SliverToBoxAdapter(
            child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
              if (current.value?.rationale != null) Padding(padding: const EdgeInsets.only(bottom: Space.md), child: Text(current.value!.rationale!, style: context.text.bodySmall)),
              NumberField(controller: _kcal, label: 'Calories', unit: 'kcal'),
              const SizedBox(height: Space.sm),
              Row(children: [
                Expanded(child: NumberField(controller: _protein, label: 'Protein', unit: 'g')),
                const SizedBox(width: Space.sm),
                Expanded(child: NumberField(controller: _carbs, label: 'Carbs', unit: 'g')),
              ]),
              const SizedBox(height: Space.sm),
              Row(children: [
                Expanded(child: NumberField(controller: _fat, label: 'Fat', unit: 'g')),
                const SizedBox(width: Space.sm),
                Expanded(child: NumberField(controller: _fiber, label: 'Fiber', unit: 'g')),
              ]),
              const SizedBox(height: Space.md),
              OutlinedButton(
                onPressed: () async {
                  final k = parseNumber(_kcal.text);
                  if (k != null && k < 1200) {
                    final ok = await showDialog<bool>(
                      context: context,
                      builder: (c) => AlertDialog(
                        title: const Text('Very low calorie target'),
                        content: const Text(
                          'Targets below 1,200 kcal are rarely appropriate without medical supervision. Are you sure?',
                        ),
                        actions: [
                          TextButton(onPressed: () => Navigator.pop(c, false), child: const Text('Change it')),
                          TextButton(onPressed: () => Navigator.pop(c, true), child: const Text('Keep')),
                        ],
                      ),
                    );
                    if (ok != true) return;
                  }
                  await ref.read(settingsRepositoryProvider).setTargets(
                        kcal: k,
                        proteinG: parseNumber(_protein.text),
                        carbsG: parseNumber(_carbs.text),
                        fatG: parseNumber(_fat.text),
                        fiberG: parseNumber(_fiber.text),
                        rationale: 'Set manually.',
                      );
                  if (context.mounted) ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('Targets saved.')));
                },
                child: const Text('Save manual targets'),
              ),
            ]),
          ),
        ),
        const SliverToBoxAdapter(child: SectionHeader('Preferences')),
        SliverToBoxAdapter(
          child: Consumer(builder: (context, ref, _) {
            final prefs = ref.watch(prefsProvider).value;
            if (prefs == null) return const SizedBox.shrink();
            return Column(children: [
              SwitchRow(
                title: 'Calorie tracking',
                subtitle: 'Turn off to track food quality and protein without calorie numbers.',
                value: prefs.calorieTrackingEnabled,
                onChanged: (v) => ref.read(settingsRepositoryProvider).updatePrefs(UserPreferencesCompanion(calorieTrackingEnabled: Value(v))),
              ),
              ListTile(
                title: const Text('Primary goal'),
                subtitle: Text(TrainingGoal.fromCode(profile?.primaryGoal ?? 'general').label),
                trailing: const Icon(Icons.chevron_right_rounded),
                onTap: () => context.push('/settings/profile'),
              ),
            ]);
          }),
        ),
      ],
    );
  }
}
