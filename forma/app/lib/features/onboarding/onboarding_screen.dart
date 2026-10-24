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
import '../../data/repositories/exercise_repository.dart';
import '../../domain/catalog.dart';
import '../../services/program_generator.dart';
import '../nutrition/nutrition_providers.dart';
import '../workout/workout_providers.dart';

const _presets = <String, (String, Set<String>)>{
  'gym': ('Full gym', {
    'barbell', 'rack', 'bench', 'dumbbell', 'kettlebell', 'cable', 'machine', 'smith_machine', 'ez_bar', 'trap_bar',
    'pullup_bar', 'dip_station', 'ab_wheel', 'treadmill', 'bike', 'rower',
  }),
  'home': ('Home gym', {'barbell', 'rack', 'bench', 'dumbbell', 'pullup_bar'}),
  'dumbbells': ('Dumbbells only', {'dumbbell', 'bench'}),
  'bodyweight': ('Bodyweight only', <String>{}),
};

class OnboardingScreen extends ConsumerStatefulWidget {
  const OnboardingScreen({super.key});

  @override
  ConsumerState<OnboardingScreen> createState() => _OnboardingScreenState();
}

class _OnboardingScreenState extends ConsumerState<OnboardingScreen> {
  final _page = PageController();
  int _step = 0;
  bool _saving = false;

  // About you
  final _name = TextEditingController();
  final _birthYear = TextEditingController();
  final _height = TextEditingController();
  final _weight = TextEditingController();
  String _sex = 'unspecified';
  bool _imperial = false;
  String _activity = 'moderate';

  // Goal
  TrainingGoal _goal = TrainingGoal.general;
  String _experience = 'intermediate';
  int _days = 3;

  // Equipment
  String _preset = 'gym';
  Set<String> _equipment = {..._presets['gym']!.$2};

  // Features
  bool _nutrition = true;
  bool _calories = true;
  bool _weightTracking = true;
  bool _coach = true;
  bool _createPlan = true;

  static const _stepCount = 5;

  int? get _age {
    final y = int.tryParse(_birthYear.text);
    return y == null ? null : DateTime.now().year - y;
  }

  bool get _minor => _age != null && _age! < 18;

  @override
  void dispose() {
    _page.dispose();
    _name.dispose();
    _birthYear.dispose();
    _height.dispose();
    _weight.dispose();
    super.dispose();
  }

  void _go(int step) {
    FocusScope.of(context).unfocus();
    setState(() => _step = step);
    _page.animateToPage(step, duration: Motion.medium, curve: Motion.standard);
  }

  String? _validateAbout() {
    final y = _birthYear.text.isEmpty ? null : int.tryParse(_birthYear.text);
    final now = DateTime.now().year;
    if (_birthYear.text.isNotEmpty && (y == null || y < now - 100 || y > now - 13)) {
      return 'Forma is for people aged 13 and over. Enter a valid birth year or leave it empty.';
    }
    final units = Units(imperial: _imperial);
    final h = _height.text.isEmpty ? null : parseNumber(_height.text);
    if (_height.text.isNotEmpty && (h == null || h < (_imperial ? 40 : 100) || h > (_imperial ? 100 : 250))) {
      return 'Enter your height in ${_imperial ? 'inches' : 'cm'}, or leave it empty.';
    }
    final w = _weight.text.isEmpty ? null : parseNumber(_weight.text);
    if (_weight.text.isNotEmpty && (w == null || units.fromDisplay(w) < 30 || units.fromDisplay(w) > 300)) {
      return 'Enter a body weight between ${units.weight(30)} and ${units.weight(300)}, or leave it empty.';
    }
    return null;
  }

  Future<void> _finish() async {
    setState(() => _saving = true);
    try {
      final settings = ref.read(settingsRepositoryProvider);
      final units = Units(imperial: _imperial);
      final heightRaw = parseNumber(_height.text);
      final weightRaw = parseNumber(_weight.text);
      final goal = _minor && _goal == TrainingGoal.loseFat ? TrainingGoal.general : _goal;

      await settings.updateProfile(ProfilesCompanion(
        displayName: Value(_name.text.trim().isEmpty ? null : _name.text.trim()),
        birthYear: Value(int.tryParse(_birthYear.text)),
        sex: Value(_sex),
        heightCm: Value(heightRaw == null ? null : (_imperial ? heightRaw * 2.54 : heightRaw)),
        activityLevel: Value(_activity),
        experience: Value(_experience),
        primaryGoal: Value(goal.code),
      ));
      await settings.updatePrefs(UserPreferencesCompanion(
        unitSystem: Value(_imperial ? 'imperial' : 'metric'),
        nutritionEnabled: Value(_nutrition),
        calorieTrackingEnabled: Value(_nutrition && _calories),
        weightTrackingEnabled: Value(_weightTracking),
        coachEnabled: Value(_coach),
        weeklyWorkoutTarget: Value(_days),
      ));
      await settings.setEquipmentSet(_equipment);
      if (_imperial) {
        for (final code in _equipment) {
          final d = equipmentInfo(code)?.defaultIncrementKg;
          if (d != null) await settings.setEquipmentIncrement(code, units.defaultIncrementKg(d));
        }
      }
      await settings.setGoal(kind: 'weekly_workouts', targetValue: _days.toDouble(), unit: 'sessions');
      if (weightRaw != null && _weightTracking) {
        await ref.read(bodyRepositoryProvider).addWeight(units.fromDisplay(weightRaw));
      }
      if (_createPlan) {
        final library = await ref.read(exerciseRepositoryProvider).all();
        final equipment = await settings.equipment();
        final program = const ProgramGenerator().generate(
          library: library,
          context: TrainingContext(
            available: {for (final e in equipment) e.equipment},
            restrictions: const [],
            increments: {for (final e in equipment) e.equipment: e.incrementKg},
          ),
          daysPerWeek: _days,
          goal: goal,
          experience: _experience,
        );
        await ref.read(trainingServiceProvider).installProgram(program);
      }
      if (_nutrition && _calories) {
        final service = ref.read(nutritionServiceProvider);
        final proposal = await service.propose(today: ref.read(todayProvider));
        if (proposal != null) await service.applyProposal(proposal);
      }
      // Completing onboarding triggers the router redirect to Overview.
      await settings.updateProfile(const ProfilesCompanion(onboardingCompleted: Value(true)));
    } catch (e) {
      if (mounted) {
        setState(() => _saving = false);
        ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text('Could not save: ${describeError(e)}')));
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    final c = context.colors;
    final backend = ref.watch(backendProvider);
    return Scaffold(
      body: SafeArea(
        child: Column(
          children: [
            Padding(
              padding: const EdgeInsets.fromLTRB(Space.sm, Space.sm, Space.gutter, 0),
              child: Row(
                children: [
                  if (_step > 0)
                    IconButton(onPressed: () => _go(_step - 1), icon: const Icon(Icons.arrow_back_rounded))
                  else
                    const SizedBox(width: 48, height: 48),
                  const SizedBox(width: Space.sm),
                  Expanded(
                    child: ClipRRect(
                      borderRadius: BorderRadius.circular(Radii.pill),
                      child: TweenAnimationBuilder<double>(
                        tween: Tween(end: (_step + 1) / (_stepCount + 1)),
                        duration: Motion.medium,
                        builder: (_, v, _) => LinearProgressIndicator(value: v, minHeight: 3),
                      ),
                    ),
                  ),
                ],
              ),
            ),
            Expanded(
              child: PageView(
                controller: _page,
                physics: const NeverScrollableScrollPhysics(),
                children: [
                  _welcome(backend.configured),
                  _about(),
                  _goalStep(),
                  _equipmentStep(),
                  _featuresStep(),
                ],
              ),
            ),
            Container(
              padding: const EdgeInsets.fromLTRB(Space.gutter, Space.md, Space.gutter, Space.lg),
              decoration: BoxDecoration(border: Border(top: BorderSide(color: c.outline))),
              child: SizedBox(
                width: double.infinity,
                child: FilledButton(
                  onPressed: _saving
                      ? null
                      : () {
                          if (_step == 1) {
                            final error = _validateAbout();
                            if (error != null) {
                              ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(error)));
                              return;
                            }
                          }
                          if (_step < _stepCount - 1) {
                            _go(_step + 1);
                          } else {
                            _finish();
                          }
                        },
                  child: _saving
                      ? const SizedBox.square(dimension: 20, child: CircularProgressIndicator(strokeWidth: 2))
                      : Text(switch (_step) {
                          0 => 'Get started',
                          4 => 'Finish setup',
                          _ => 'Continue',
                        }),
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _stepBody({required String eyebrow, required String title, String? subtitle, required List<Widget> children}) {
    return ListView(
      padding: const EdgeInsets.fromLTRB(Space.gutter, Space.xxl, Space.gutter, Space.xxl),
      children: [
        Eyebrow(eyebrow),
        const SizedBox(height: Space.sm),
        Text(title, style: context.text.headlineLarge),
        if (subtitle != null) ...[
          const SizedBox(height: Space.sm),
          Text(subtitle, style: context.text.bodyMedium),
        ],
        const SizedBox(height: Space.xxl),
        ...children,
      ],
    );
  }

  Widget _welcome(bool backendConfigured) {
    final c = context.colors;
    return Padding(
      padding: const EdgeInsets.all(Space.gutter),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const Spacer(),
          Container(
            width: 56,
            height: 56,
            decoration: BoxDecoration(color: c.accent, borderRadius: BorderRadius.circular(Radii.md)),
            child: Icon(Icons.change_history_rounded, color: c.onAccent, size: 30),
          ),
          const SizedBox(height: Space.xxl),
          Text('Train, eat and recover\nwith a plan that learns\nfrom you.', style: context.text.headlineLarge),
          const SizedBox(height: Space.lg),
          Text(
            'Forma logs your workouts, nutrition and body weight, and turns your own data into clear next steps. '
            'Everything works offline and stays on this device unless you create an account.',
            style: context.text.bodyMedium,
          ),
          const Spacer(flex: 2),
          if (backendConfigured)
            TextButton(
              onPressed: () => context.push('/settings/account'),
              child: const Text('I already have an account'),
            ),
        ],
      ),
    );
  }

  Widget _about() {
    final units = Units(imperial: _imperial);
    return _stepBody(
      eyebrow: 'Step 1 of 4',
      title: 'About you',
      subtitle: 'All optional. Birth year enables age-appropriate safeguards; height, weight and sex improve the '
          'starting estimate of your energy needs.',
      children: [
        SegmentedPills<bool>(
          values: const [false, true],
          selected: _imperial,
          labelOf: (v) => v ? 'Imperial (lb, in)' : 'Metric (kg, cm)',
          onChanged: (v) => setState(() => _imperial = v),
          expand: true,
        ),
        const SizedBox(height: Space.lg),
        TextField(controller: _name, decoration: const InputDecoration(labelText: 'First name'), textCapitalization: TextCapitalization.words),
        const SizedBox(height: Space.md),
        NumberField(controller: _birthYear, label: 'Birth year', decimals: false, onChanged: (_) => setState(() {})),
        if (_minor) ...[
          const SizedBox(height: Space.sm),
          Text(
            'Under 18: Forma focuses on training and healthy habits and won\'t set calorie deficits.',
            style: context.text.bodySmall?.copyWith(color: context.colors.caution),
          ),
        ],
        const SizedBox(height: Space.md),
        Row(
          children: [
            Expanded(child: NumberField(controller: _height, label: 'Height', unit: _imperial ? 'in' : 'cm')),
            const SizedBox(width: Space.md),
            Expanded(child: NumberField(controller: _weight, label: 'Weight', unit: units.weightLabel)),
          ],
        ),
        const SizedBox(height: Space.xl),
        const Eyebrow('Sex (for energy formulas only)'),
        const SizedBox(height: Space.sm),
        Wrap(
          spacing: Space.sm,
          runSpacing: Space.sm,
          children: [
            for (final (v, l) in const [('female', 'Female'), ('male', 'Male'), ('unspecified', 'Prefer not to say')])
              ToggleChip(label: l, selected: _sex == v, onTap: () => setState(() => _sex = v)),
          ],
        ),
        const SizedBox(height: Space.xl),
        const Eyebrow('Daily activity outside training'),
        const SizedBox(height: Space.sm),
        Wrap(
          spacing: Space.sm,
          runSpacing: Space.sm,
          children: [
            for (final (v, l) in const [('sedentary', 'Mostly sitting'), ('light', 'Light'), ('moderate', 'Moderate'), ('high', 'Very active')])
              ToggleChip(label: l, selected: _activity == v, onTap: () => setState(() => _activity = v)),
          ],
        ),
      ],
    );
  }

  Widget _goalStep() {
    return _stepBody(
      eyebrow: 'Step 2 of 4',
      title: 'What are you working toward?',
      subtitle: 'This shapes rep ranges, suggested nutrition targets and coaching. You can change it any time.',
      children: [
        for (final g in TrainingGoal.values) ...[
          OptionCard(
            title: g.label,
            subtitle: switch (g) {
              TrainingGoal.strength => 'Heavier, lower-rep compound lifts',
              TrainingGoal.muscle => 'Moderate reps, more volume, small surplus',
              TrainingGoal.loseFat => _minor ? 'Not available under 18' : 'Keep strength while gradually losing fat',
              TrainingGoal.maintain => 'Keep current weight and performance',
              TrainingGoal.general => 'Balanced training for health',
            },
            selected: _goal == g,
            enabled: !(g == TrainingGoal.loseFat && _minor),
            onTap: () => setState(() => _goal = g),
          ),
          const SizedBox(height: Space.sm),
        ],
        const SizedBox(height: Space.lg),
        const Eyebrow('Training experience'),
        const SizedBox(height: Space.sm),
        SegmentedPills<String>(
          values: const ['beginner', 'intermediate', 'advanced'],
          selected: _experience,
          labelOf: (v) => v[0].toUpperCase() + v.substring(1),
          onChanged: (v) => setState(() => _experience = v),
          expand: true,
        ),
        const SizedBox(height: Space.xl),
        const Eyebrow('Workouts per week'),
        const SizedBox(height: Space.sm),
        SegmentedPills<int>(
          values: const [2, 3, 4, 5, 6],
          selected: _days,
          labelOf: (v) => '$v',
          onChanged: (v) => setState(() => _days = v),
          expand: true,
        ),
      ],
    );
  }

  Widget _equipmentStep() {
    return _stepBody(
      eyebrow: 'Step 3 of 4',
      title: 'What equipment do you have?',
      subtitle: 'Forma only suggests exercises and substitutions you can actually do.',
      children: [
        for (final e in _presets.entries) ...[
          OptionCard(
            title: e.value.$1,
            selected: _preset == e.key,
            onTap: () => setState(() {
              _preset = e.key;
              _equipment = {...e.value.$2};
            }),
          ),
          const SizedBox(height: Space.sm),
        ],
        const SizedBox(height: Space.lg),
        const Eyebrow('Fine-tune'),
        const SizedBox(height: Space.sm),
        Wrap(
          spacing: Space.sm,
          runSpacing: Space.sm,
          children: [
            for (final e in equipmentCatalog)
              ToggleChip(
                label: e.label,
                selected: _equipment.contains(e.code),
                onTap: () => setState(() {
                  _preset = 'custom';
                  _equipment.contains(e.code) ? _equipment.remove(e.code) : _equipment.add(e.code);
                }),
              ),
          ],
        ),
      ],
    );
  }

  Widget _featuresStep() {
    return _stepBody(
      eyebrow: 'Step 4 of 4',
      title: 'Choose what to track',
      subtitle: 'Turn off anything you don\'t want. Apple Health access is requested later, only if you enable it.',
      children: [
        FCard(
          padding: EdgeInsets.zero,
          child: Column(
            children: [
              SwitchRow(
                title: 'Nutrition',
                subtitle: 'Food diary, protein and water',
                value: _nutrition,
                onChanged: (v) => setState(() => _nutrition = v),
              ),
              if (_nutrition)
                SwitchRow(
                  title: 'Calorie targets',
                  subtitle: 'Turn off to track food without counting calories',
                  value: _calories,
                  onChanged: (v) => setState(() => _calories = v),
                ),
              SwitchRow(
                title: 'Body weight',
                subtitle: 'Weigh-ins and a smoothed trend',
                value: _weightTracking,
                onChanged: (v) => setState(() => _weightTracking = v),
              ),
              SwitchRow(
                title: 'AI coach',
                subtitle: 'Questions about your own data (needs an account)',
                value: _coach,
                onChanged: (v) => setState(() => _coach = v),
              ),
            ],
          ),
        ),
        const SizedBox(height: Space.lg),
        OptionCard(
          title: 'Create a starter plan',
          subtitle: '$_days days per week, built from your goal and equipment. Edit it any time.',
          icon: Icons.calendar_month_rounded,
          selected: _createPlan,
          onTap: () => setState(() => _createPlan = !_createPlan),
        ),
      ],
    );
  }
}
