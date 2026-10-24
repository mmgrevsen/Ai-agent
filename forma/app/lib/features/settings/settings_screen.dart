import 'dart:convert';

import 'package:drift/drift.dart' show Value;
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:share_plus/share_plus.dart';

import '../../app/providers.dart';
import '../../core/theme/tokens.dart';
import '../../core/util/format.dart';
import '../../core/widgets/inputs.dart';
import '../../core/widgets/primitives.dart';
import '../../core/widgets/prompts.dart';
import '../../core/widgets/states.dart';
import '../../data/db/app_database.dart';
import '../../data/remote/backend.dart';
import '../../data/repositories/settings_repository.dart';
import '../../domain/catalog.dart';
import '../../services/coach_service.dart';
import '../../services/export_service.dart';
import '../../services/health_service.dart';
import '../../services/program_generator.dart';
import '../../services/sync_service.dart';
import '../health/health_providers.dart';
import '../overview/overview_screen.dart' show DashboardCard;
import '../sync/sync_controller.dart';

enum SettingsPage {
  profile('profile', 'Profile', Icons.person_outline_rounded),
  features('features', 'Features', Icons.toggle_on_outlined),
  dashboard('dashboard', 'Dashboard', Icons.dashboard_customize_outlined),
  training('training', 'Training & safety', Icons.fitness_center_outlined),
  restrictions('restrictions', 'Restrictions', Icons.block_outlined),
  health('health', 'Apple Health', Icons.favorite_border_rounded),
  coach('coach', 'AI coach data access', Icons.auto_awesome_outlined),
  privacy('privacy', 'Privacy & data', Icons.lock_outline_rounded),
  about('about', 'About & data sources', Icons.info_outline_rounded);

  const SettingsPage(this.path, this.title, this.icon);
  final String path;
  final String title;
  final IconData icon;
}

class SettingsScreen extends ConsumerWidget {
  const SettingsScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final backend = ref.watch(backendProvider);
    final user = ref.watch(authUserProvider).value;
    final sync = ref.watch(syncControllerProvider);
    return PageScaffold(
      showBack: true,
      title: 'Settings',
      slivers: [
        SliverPadding(
          padding: const EdgeInsets.fromLTRB(Space.gutter, Space.md, Space.gutter, 0),
          sliver: SliverToBoxAdapter(
            child: FCard(
              onTap: () => context.push('/settings/account'),
              child: Row(children: [
                Icon(user == null ? Icons.cloud_off_outlined : Icons.cloud_done_outlined, color: user == null ? context.colors.textSecondary : context.colors.positive),
                const SizedBox(width: Space.md),
                Expanded(
                  child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                    Text(user?.email ?? (backend.configured ? 'Not signed in' : 'Local-only mode'), style: context.text.titleSmall),
                    Text(
                      user == null
                          ? 'Data is stored only on this device.'
                          : sync.running
                              ? 'Syncing…'
                              : sync.error ?? (sync.lastSuccess == null ? 'Waiting to sync' : 'Synced ${relativeDay(sync.lastSuccess!)} ${TimeOfDay.fromDateTime(sync.lastSuccess!).format(context)}'),
                      style: context.text.bodySmall,
                    ),
                  ]),
                ),
                const Icon(Icons.chevron_right_rounded),
              ]),
            ),
          ),
        ),
        const SliverToBoxAdapter(child: SizedBox(height: Space.md)),
        SliverList.list(children: [
          for (final p in SettingsPage.values)
            ListTile(
              leading: Icon(p.icon),
              title: Text(p.title),
              trailing: const Icon(Icons.chevron_right_rounded),
              onTap: () => context.push('/settings/${p.path}'),
            ),
        ]),
      ],
    );
  }
}

class SettingsDetailScreen extends ConsumerWidget {
  const SettingsDetailScreen({super.key, required this.page});
  final SettingsPage page;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final prefs = ref.watch(prefsProvider);
    final profile = ref.watch(profileProvider);
    return PageScaffold(
      showBack: true,
      title: page.title,
      slivers: [
        SliverToBoxAdapter(
          child: AsyncView(
            value: prefs,
            data: (p) => AsyncView(
              value: profile,
              data: (pr) => switch (page) {
                SettingsPage.profile => _ProfilePage(profile: pr, prefs: p),
                SettingsPage.features => _FeaturesPage(prefs: p),
                SettingsPage.dashboard => _DashboardPage(prefs: p),
                SettingsPage.training => _TrainingPage(prefs: p),
                SettingsPage.restrictions => const _RestrictionsPage(),
                SettingsPage.health => _HealthPage(prefs: p),
                SettingsPage.coach => _CoachPage(prefs: p),
                SettingsPage.privacy => const _PrivacyPage(),
                SettingsPage.about => const _AboutPage(),
              },
            ),
          ),
        ),
      ],
    );
  }
}

SettingsRepository _repo(WidgetRef ref) => ref.read(settingsRepositoryProvider);

// ------------------------------------------------------------------ profile

class _ProfilePage extends ConsumerStatefulWidget {
  const _ProfilePage({required this.profile, required this.prefs});
  final Profile profile;
  final UserPrefs prefs;

  @override
  ConsumerState<_ProfilePage> createState() => _ProfilePageState();
}

class _ProfilePageState extends ConsumerState<_ProfilePage> {
  late final _name = TextEditingController(text: widget.profile.displayName ?? '');
  late final _birth = TextEditingController(text: widget.profile.birthYear?.toString() ?? '');
  late final _height = TextEditingController(
    text: widget.profile.heightCm == null ? '' : number(widget.prefs.unitSystem == 'imperial' ? widget.profile.heightCm! / 2.54 : widget.profile.heightCm!),
  );

  @override
  void dispose() {
    _name.dispose();
    _birth.dispose();
    _height.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final pr = widget.profile;
    final imperial = widget.prefs.unitSystem == 'imperial';
    final age = pr.birthYear == null ? null : DateTime.now().year - pr.birthYear!;
    return Padding(
      padding: const EdgeInsets.fromLTRB(Space.gutter, Space.md, Space.gutter, 0),
      child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
        TextField(
          controller: _name,
          decoration: const InputDecoration(labelText: 'First name'),
          onChanged: (v) => _repo(ref).updateProfile(ProfilesCompanion(displayName: Value(v.trim().isEmpty ? null : v.trim()))),
        ),
        const SizedBox(height: Space.md),
        NumberField(
          controller: _birth,
          label: 'Birth year',
          decimals: false,
          onChanged: (v) {
            final y = int.tryParse(v);
            final now = DateTime.now().year;
            if (v.isEmpty || (y != null && y > now - 100 && y <= now - 13)) {
              _repo(ref).updateProfile(ProfilesCompanion(birthYear: Value(y)));
            }
          },
        ),
        const SizedBox(height: Space.md),
        NumberField(
          controller: _height,
          label: 'Height',
          unit: imperial ? 'in' : 'cm',
          onChanged: (v) {
            final h = parseNumber(v);
            _repo(ref).updateProfile(ProfilesCompanion(heightCm: Value(h == null ? null : (imperial ? h * 2.54 : h))));
          },
        ),
        const SizedBox(height: Space.xl),
        const Eyebrow('Goal'),
        const SizedBox(height: Space.sm),
        for (final g in TrainingGoal.values) ...[
          OptionCard(
            title: g.label,
            selected: pr.primaryGoal == g.code,
            enabled: !(g == TrainingGoal.loseFat && age != null && age < 18),
            onTap: () => _repo(ref).updateProfile(ProfilesCompanion(primaryGoal: Value(g.code))),
          ),
          const SizedBox(height: Space.sm),
        ],
        const SizedBox(height: Space.lg),
        const Eyebrow('Experience'),
        const SizedBox(height: Space.sm),
        SegmentedPills<String>(
          values: const ['beginner', 'intermediate', 'advanced'],
          selected: pr.experience,
          expand: true,
          labelOf: (v) => v[0].toUpperCase() + v.substring(1),
          onChanged: (v) => _repo(ref).updateProfile(ProfilesCompanion(experience: Value(v))),
        ),
        const SizedBox(height: Space.lg),
        const Eyebrow('Sex (for energy formulas only)'),
        const SizedBox(height: Space.sm),
        Wrap(spacing: Space.sm, children: [
          for (final (v, l) in const [('female', 'Female'), ('male', 'Male'), ('unspecified', 'Prefer not to say')])
            ToggleChip(label: l, selected: pr.sex == v, onTap: () => _repo(ref).updateProfile(ProfilesCompanion(sex: Value(v)))),
        ]),
        const SizedBox(height: Space.lg),
        const Eyebrow('Daily activity'),
        const SizedBox(height: Space.sm),
        Wrap(spacing: Space.sm, runSpacing: Space.sm, children: [
          for (final (v, l) in const [('sedentary', 'Mostly sitting'), ('light', 'Light'), ('moderate', 'Moderate'), ('high', 'Very active')])
            ToggleChip(label: l, selected: pr.activityLevel == v, onTap: () => _repo(ref).updateProfile(ProfilesCompanion(activityLevel: Value(v)))),
        ]),
        const SizedBox(height: Space.lg),
        const Eyebrow('Units & appearance'),
        const SizedBox(height: Space.sm),
        SegmentedPills<String>(
          values: const ['metric', 'imperial'],
          selected: widget.prefs.unitSystem,
          expand: true,
          labelOf: (v) => v == 'metric' ? 'kg / cm' : 'lb / in',
          onChanged: (v) => _repo(ref).updatePrefs(UserPreferencesCompanion(unitSystem: Value(v))),
        ),
        const SizedBox(height: Space.sm),
        SegmentedPills<String>(
          values: const ['dark', 'light', 'system'],
          selected: widget.prefs.themeMode,
          expand: true,
          labelOf: (v) => v[0].toUpperCase() + v.substring(1),
          onChanged: (v) => _repo(ref).updatePrefs(UserPreferencesCompanion(themeMode: Value(v))),
        ),
      ]),
    );
  }
}

// ------------------------------------------------------------------ features

class _FeaturesPage extends ConsumerWidget {
  const _FeaturesPage({required this.prefs});
  final UserPrefs prefs;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    void set(UserPreferencesCompanion c) => _repo(ref).updatePrefs(c);
    return Column(children: [
      SwitchRow(title: 'Nutrition tracking', subtitle: 'Food diary, water and targets', value: prefs.nutritionEnabled, onChanged: (v) => set(UserPreferencesCompanion(nutritionEnabled: Value(v)))),
      SwitchRow(
        title: 'Calorie numbers',
        subtitle: 'Off: track protein, fiber and food quality without calories',
        value: prefs.calorieTrackingEnabled,
        onChanged: prefs.nutritionEnabled ? (v) => set(UserPreferencesCompanion(calorieTrackingEnabled: Value(v))) : (_) {},
      ),
      SwitchRow(title: 'Body weight', subtitle: 'Weigh-ins, trend and goal weight', value: prefs.weightTrackingEnabled, onChanged: (v) => set(UserPreferencesCompanion(weightTrackingEnabled: Value(v)))),
      SwitchRow(title: 'Adaptive targets', subtitle: 'Suggest target updates from your intake and weight trend', value: prefs.adaptiveTargetsEnabled, onChanged: (v) => set(UserPreferencesCompanion(adaptiveTargetsEnabled: Value(v)))),
      SwitchRow(title: 'AI coach', subtitle: 'Chat about your data (needs an account)', value: prefs.coachEnabled, onChanged: (v) => set(UserPreferencesCompanion(coachEnabled: Value(v)))),
      const Padding(
        padding: EdgeInsets.all(Space.gutter),
        child: Text('Turning a feature off hides it; your existing data is kept unless you delete it under Privacy & data.'),
      ),
      ListTile(
        title: const Text('Water target'),
        trailing: DropdownButton<int>(
          value: const [1500, 2000, 2500, 3000, 3500].contains(prefs.waterTargetMl) ? prefs.waterTargetMl : 2500,
          underline: const SizedBox.shrink(),
          items: [for (final ml in const [1500, 2000, 2500, 3000, 3500]) DropdownMenuItem(value: ml, child: Text('${number(ml / 1000)} L'))],
          onChanged: (v) => set(UserPreferencesCompanion(waterTargetMl: Value(v ?? 2500))),
        ),
      ),
    ]);
  }
}

// ------------------------------------------------------------------ dashboard

class _DashboardPage extends ConsumerWidget {
  const _DashboardPage({required this.prefs});
  final UserPrefs prefs;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final shown = SettingsRepository.dashboardCardsOf(prefs);
    final hidden = [for (final c in DashboardCard.values) if (!shown.contains(c.name)) c.name];
    final order = [...shown, ...hidden];
    void save(List<String> list) => _repo(ref).updatePrefs(UserPreferencesCompanion(dashboardCards: Value(jsonEncode(list))));
    return Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
      const Padding(
        padding: EdgeInsets.fromLTRB(Space.gutter, Space.md, Space.gutter, Space.sm),
        child: Text('Show only what helps you. Drag to reorder.'),
      ),
      ReorderableListView(
        shrinkWrap: true,
        physics: const NeverScrollableScrollPhysics(),
        onReorderItem: (a, b) {
          final list = [...order];
          list.insert(b, list.removeAt(a));
          save([for (final n in list) if (shown.contains(n)) n]);
        },
        children: [
          for (final n in order)
            SwitchListTile.adaptive(
              key: ValueKey(n),
              title: Text(DashboardCard.values.firstWhere((c) => c.name == n).label),
              value: shown.contains(n),
              onChanged: (v) => save(v ? [...shown, n] : [for (final s in shown) if (s != n) s]),
            ),
        ],
      ),
    ]);
  }
}

// ------------------------------------------------------------------ training

class _TrainingPage extends ConsumerWidget {
  const _TrainingPage({required this.prefs});
  final UserPrefs prefs;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final equipment = ref.watch(equipmentProvider).value ?? const [];
    final units = ref.watch(unitsProvider);
    final have = {for (final e in equipment) e.equipment: e};
    void set(UserPreferencesCompanion c) => _repo(ref).updatePrefs(c);

    return Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
      const SectionHeader('Load progression safety limits'),
      Padding(
        padding: const EdgeInsets.symmetric(horizontal: Space.gutter),
        child: Text(
          'Suggested increases never exceed the smaller of these limits. You can always enter any weight yourself.',
          style: context.text.bodySmall,
        ),
      ),
      _SliderRow(
        label: 'Max increase per session',
        value: prefs.maxIncreasePct,
        min: 2,
        max: 10,
        divisions: 16,
        format: (v) => '${number(v)}%',
        onChanged: (v) => set(UserPreferencesCompanion(maxIncreasePct: Value(v))),
      ),
      _SliderRow(
        label: 'Max upper-body jump',
        value: prefs.maxIncreaseUpperKg,
        min: 1,
        max: 5,
        divisions: 8,
        format: units.weight,
        onChanged: (v) => set(UserPreferencesCompanion(maxIncreaseUpperKg: Value(v))),
      ),
      _SliderRow(
        label: 'Max lower-body jump',
        value: prefs.maxIncreaseLowerKg,
        min: 2.5,
        max: 10,
        divisions: 6,
        format: units.weight,
        onChanged: (v) => set(UserPreferencesCompanion(maxIncreaseLowerKg: Value(v))),
      ),
      SwitchRow(
        title: 'Pre-fill suggested values',
        subtitle: 'Off: show your previous session\'s values instead of suggestions',
        value: prefs.autoFillSuggestions,
        onChanged: (v) => set(UserPreferencesCompanion(autoFillSuggestions: Value(v))),
      ),
      ListTile(
        title: const Text('Default rest timer'),
        trailing: DropdownButton<int>(
          value: const [60, 90, 120, 150, 180, 240].contains(prefs.defaultRestSeconds) ? prefs.defaultRestSeconds : 120,
          underline: const SizedBox.shrink(),
          items: [for (final s in const [60, 90, 120, 150, 180, 240]) DropdownMenuItem(value: s, child: Text(clock(Duration(seconds: s))))],
          onChanged: (v) => set(UserPreferencesCompanion(defaultRestSeconds: Value(v ?? 120))),
        ),
      ),
      ListTile(
        title: const Text('Workouts per week'),
        trailing: DropdownButton<int>(
          value: prefs.weeklyWorkoutTarget.clamp(1, 7),
          underline: const SizedBox.shrink(),
          items: [for (var d = 1; d <= 7; d++) DropdownMenuItem(value: d, child: Text('$d'))],
          onChanged: (v) {
            set(UserPreferencesCompanion(weeklyWorkoutTarget: Value(v ?? 3)));
            _repo(ref).setGoal(kind: 'weekly_workouts', targetValue: (v ?? 3).toDouble(), unit: 'sessions');
          },
        ),
      ),
      const SectionHeader('Equipment & smallest increments'),
      for (final info in equipmentCatalog)
        ListTile(
          title: Text(info.label),
          subtitle: have.containsKey(info.code) && info.defaultIncrementKg != null
              ? Text('Smallest jump: ${units.weight(have[info.code]!.incrementKg ?? info.defaultIncrementKg!)}')
              : null,
          onTap: have.containsKey(info.code) && info.defaultIncrementKg != null ? () => _editIncrement(context, ref, info, have[info.code]!) : null,
          trailing: Switch.adaptive(
            value: have.containsKey(info.code),
            onChanged: (v) => _repo(ref).setEquipmentAvailable(info.code, available: v, incrementKg: units.defaultIncrementKg(info.defaultIncrementKg ?? 0)),
          ),
        ),
    ]);
  }

  Future<void> _editIncrement(BuildContext context, WidgetRef ref, EquipmentInfo info, EquipmentItem item) async {
    final units = ref.read(unitsProvider);
    final v = await promptNumber(
      context,
      title: '${info.label} increment',
      label: 'Smallest load jump',
      unit: units.weightLabel,
      initial: double.parse(number(units.toDisplay(item.incrementKg ?? info.defaultIncrementKg!), maxDecimals: 2)),
      helper: 'e.g. two 1.25 kg plates = 2.5 kg; dumbbells often go up in 2 kg steps.',
    );
    if (v != null && v > 0 && v <= 25) await _repo(ref).setEquipmentIncrement(info.code, units.fromDisplay(v));
  }
}

class _SliderRow extends StatelessWidget {
  const _SliderRow({required this.label, required this.value, required this.min, required this.max, required this.divisions, required this.format, required this.onChanged});
  final String label;
  final double value;
  final double min;
  final double max;
  final int divisions;
  final String Function(double) format;
  final ValueChanged<double> onChanged;

  @override
  Widget build(BuildContext context) => Padding(
        padding: const EdgeInsets.fromLTRB(Space.gutter, Space.md, Space.gutter, 0),
        child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
          Row(children: [Expanded(child: Text(label, style: context.text.titleSmall)), Text(format(value), style: context.text.labelLarge)]),
          Slider(value: value.clamp(min, max), min: min, max: max, divisions: divisions, onChanged: onChanged),
        ]),
      );
}

// ------------------------------------------------------------------ restrictions

class _RestrictionsPage extends ConsumerWidget {
  const _RestrictionsPage();

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final list = ref.watch(restrictionsProvider).value ?? const [];
    final library = ref.watch(exerciseLibraryProvider).value ?? const [];
    String describe(Restriction r) => switch (r.kind) {
          'exercise' => 'Exercise: ${library.where((e) => e.id == r.value).firstOrNull?.name ?? r.value}',
          'muscle' => 'Muscle: ${muscleLabel(r.value)}',
          'pattern' => 'Movement: ${patternLabels[r.value] ?? r.value}',
          'equipment' => 'Equipment: ${equipmentInfo(r.value)?.label ?? r.value}',
          _ => r.value,
        };
    return Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
      const Padding(
        padding: EdgeInsets.fromLTRB(Space.gutter, Space.md, Space.gutter, 0),
        child: Text('Restricted movements are excluded from generated plans, substitutions and AI coach proposals. '
            'If something hurts, consider seeing a healthcare professional.'),
      ),
      const SizedBox(height: Space.md),
      if (list.isEmpty) const EmptyState(icon: Icons.check_circle_outline_rounded, title: 'No restrictions', message: 'Add one if you need to avoid a movement.', compact: true),
      for (final r in list)
        ListTile(
          title: Text(describe(r)),
          subtitle: r.note == null ? null : Text(r.note!),
          trailing: IconButton(tooltip: 'Remove', icon: const Icon(Icons.close_rounded), onPressed: () => _repo(ref).removeRestriction(r.id)),
        ),
      Padding(
        padding: const EdgeInsets.all(Space.gutter),
        child: OutlinedButton.icon(onPressed: () => _add(context, ref), icon: const Icon(Icons.add_rounded), label: const Text('Add restriction')),
      ),
    ]);
  }

  Future<void> _add(BuildContext context, WidgetRef ref) async {
    final r = await showModalBottomSheet<(String, String, String?)>(
      context: context,
      isScrollControlled: true,
      useSafeArea: true,
      builder: (_) => const _RestrictionSheet(),
    );
    if (r != null) await _repo(ref).addRestriction(r.$1, r.$2, note: r.$3);
  }
}

class _RestrictionSheet extends StatefulWidget {
  const _RestrictionSheet();

  @override
  State<_RestrictionSheet> createState() => _RestrictionSheetState();
}

class _RestrictionSheetState extends State<_RestrictionSheet> {
  final _note = TextEditingController();
  String _kind = 'pattern';
  String? _value;

  @override
  void dispose() {
    _note.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final options = switch (_kind) {
      'muscle' => muscleLabels,
      'equipment' => {for (final e in equipmentCatalog) e.code: e.label},
      _ => patternLabels,
    };
    return Padding(
      padding: EdgeInsets.fromLTRB(Space.gutter, 0, Space.gutter, MediaQuery.viewInsetsOf(context).bottom + Space.xl),
      child: SingleChildScrollView(
        child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
          Text('Avoid…', style: context.text.titleLarge),
          const SizedBox(height: Space.md),
          SegmentedPills<String>(
            values: const ['pattern', 'muscle', 'equipment'],
            selected: _kind,
            expand: true,
            labelOf: (v) => switch (v) {
              'pattern' => 'Movement',
              'muscle' => 'Muscle',
              _ => 'Equipment',
            },
            onChanged: (v) => setState(() {
              _kind = v;
              _value = null;
            }),
          ),
          const SizedBox(height: Space.md),
          Wrap(spacing: Space.sm, runSpacing: Space.sm, children: [
            for (final o in options.entries) ToggleChip(label: o.value, selected: _value == o.key, onTap: () => setState(() => _value = o.key)),
          ]),
          const SizedBox(height: Space.md),
          TextField(controller: _note, decoration: const InputDecoration(labelText: 'Reason (optional, e.g. shoulder pain)')),
          const SizedBox(height: Space.lg),
          FilledButton(
            onPressed: _value == null ? null : () => Navigator.pop(context, (_kind, _value!, _note.text.trim().isEmpty ? null : _note.text.trim())),
            child: const Text('Add'),
          ),
          const SizedBox(height: Space.sm),
          Text('To avoid a single exercise, open it in the library and turn on “Avoid this exercise”.', style: context.text.bodySmall),
        ]),
      ),
    );
  }
}

// ------------------------------------------------------------------ health

class _HealthPage extends ConsumerWidget {
  const _HealthPage({required this.prefs});
  final UserPrefs prefs;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final platform = ref.watch(healthPlatformProvider);
    final cats = ref.watch(healthCategoriesProvider).value ?? const <HealthCategory>{};
    final import = ref.watch(healthImportProvider);
    return Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
      Padding(
        padding: const EdgeInsets.fromLTRB(Space.gutter, Space.md, Space.gutter, Space.sm),
        child: Text(
          platform.isSupported
              ? 'Forma reads only the categories you turn on, and only when you turn them on. Apple doesn\'t tell apps whether read access was granted, '
                  'so if a category stays empty, check Settings › Health › Data Access. Not every device records every type — HRV needs a watch.'
              : 'Apple Health is not available on this device. Recovery insights can still use your daily check-ins and training log.',
          style: context.text.bodyMedium,
        ),
      ),
      if (platform.isSupported) ...[
        SwitchRow(
          title: 'Use Apple Health',
          value: prefs.healthEnabled,
          onChanged: (v) => _repo(ref).updatePrefs(UserPreferencesCompanion(healthEnabled: Value(v))),
        ),
        if (prefs.healthEnabled) ...[
          for (final c in HealthCategory.values)
            SwitchListTile.adaptive(
              contentPadding: const EdgeInsets.symmetric(horizontal: Space.gutter),
              title: Text(c.label),
              subtitle: Text(c.reason),
              value: cats.contains(c),
              onChanged: (v) => v ? ref.read(healthCategoriesProvider.notifier).enable(c) : ref.read(healthCategoriesProvider.notifier).disable(c),
            ),
          ListTile(
            title: const Text('Import now'),
            subtitle: Text(import.error ?? import.lastResult ?? (import.lastImport == null ? 'Not imported yet' : 'Last import ${relativeDay(import.lastImport!)}')),
            trailing: import.running ? const SizedBox.square(dimension: 20, child: CircularProgressIndicator(strokeWidth: 2)) : const Icon(Icons.sync_rounded),
            onTap: import.running ? null : () => ref.read(healthImportProvider.notifier).importRecent(force: true),
          ),
          SwitchRow(
            title: 'Back up health data to my account',
            subtitle: 'Off by default. When off, imported health samples stay on this device only.',
            value: prefs.syncHealthData,
            onChanged: (v) => _repo(ref).updatePrefs(UserPreferencesCompanion(syncHealthData: Value(v))),
          ),
        ],
      ],
      ListTile(
        title: Text('Delete imported health data', style: TextStyle(color: context.colors.negative)),
        subtitle: const Text('Removes imported samples, weigh-ins and workouts from Forma. Apple Health is not changed.'),
        onTap: () async {
          await ref.read(healthRepositoryProvider).deleteImported();
          if (context.mounted) ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('Imported health data deleted from Forma.')));
        },
      ),
      const Padding(
        padding: EdgeInsets.all(Space.gutter),
        child: Text('Calories from phones and watches are device estimates, not measurements. Forma shows them for reference only.'),
      ),
    ]);
  }
}

// ------------------------------------------------------------------ coach

class _CoachPage extends ConsumerWidget {
  const _CoachPage({required this.prefs});
  final UserPrefs prefs;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final scopes = SettingsRepository.coachScopesOf(prefs);
    return Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
      const Padding(
        padding: EdgeInsets.fromLTRB(Space.gutter, Space.md, Space.gutter, Space.sm),
        child: Text(
          'When you ask a question, Forma sends a compact summary of only the relevant, allowed categories to the server, which forwards it to the AI model. '
          'It doesn\'t send notes, food names, your exact birth date or contact details. The AI provider (Anthropic) does not use API data to train its models. '
          'Plan or target changes are only applied after you confirm them.',
        ),
      ),
      for (final s in CoachScope.values)
        SwitchListTile.adaptive(
          contentPadding: const EdgeInsets.symmetric(horizontal: Space.gutter),
          title: Text(s.label),
          subtitle: Text(s.description),
          value: scopes.contains(s.name),
          onChanged: (v) => _repo(ref).updatePrefs(UserPreferencesCompanion(
            coachScopes: Value(jsonEncode(v ? [...scopes, s.name] : [for (final x in scopes) if (x != s.name) x])),
          )),
        ),
      ListTile(
        title: const Text('Clear conversation history'),
        onTap: () => ref.read(coachRepositoryProvider).clearThread(),
      ),
    ]);
  }
}

// ------------------------------------------------------------------ privacy

class _PrivacyPage extends ConsumerWidget {
  const _PrivacyPage();

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final backend = ref.watch(backendProvider);
    final user = ref.watch(authUserProvider).value;
    final c = context.colors;
    return Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
      const Padding(
        padding: EdgeInsets.fromLTRB(Space.gutter, Space.md, Space.gutter, Space.sm),
        child: Text(
          'Your data is stored on this device. With an account it is also synced to Forma\'s database, where row-level security '
          'means only you can read it. Forma never sells or shares your data.',
        ),
      ),
      ListTile(
        leading: const Icon(Icons.download_outlined),
        title: const Text('Export my data'),
        subtitle: const Text('All workouts, nutrition, body and health data as JSON'),
        onTap: () async {
          try {
            final file = await ExportService(ref.read(databaseProvider)).writeFile();
            await SharePlus.instance.share(ShareParams(files: [XFile(file.path)], subject: 'Forma data export'));
          } catch (e) {
            if (context.mounted) ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text('Export failed: ${describeError(e)}')));
          }
        },
      ),
      const Divider(),
      ListTile(
        leading: Icon(Icons.delete_outline_rounded, color: c.negative),
        title: Text('Delete data on this device', style: TextStyle(color: c.negative)),
        subtitle: Text(user == null ? 'Erases everything and restarts setup.' : 'Erases this device\'s copy. Your account data remains on the server.'),
        onTap: () => _confirmWipe(context, ref, account: false),
      ),
      if (backend.configured && user != null)
        ListTile(
          leading: Icon(Icons.person_remove_outlined, color: c.negative),
          title: Text('Delete my account', style: TextStyle(color: c.negative)),
          subtitle: const Text('Permanently deletes your account and all server data, then this device\'s copy.'),
          onTap: () => _confirmWipe(context, ref, account: true),
        ),
    ]);
  }

  Future<void> _confirmWipe(BuildContext context, WidgetRef ref, {required bool account}) async {
    final ok = await confirmTyped(
      context,
      title: account ? 'Delete account?' : 'Delete data on this device?',
      message: account
          ? 'This permanently deletes your Forma account and all synced data. It cannot be undone. Consider exporting first.'
          : 'This erases all workouts, food logs, weights and settings on this device. Consider exporting first.',
    );
    if (ok != true) return;
    try {
      final backend = ref.read(backendProvider);
      if (account) {
        await backend.invoke('delete-account', {'confirm': true});
      }
      if (backend.signedIn) await backend.signOut();
      await wipeUserData(ref.read(databaseProvider));
      if (context.mounted) context.go('/onboarding');
    } on BackendException catch (e) {
      if (context.mounted) ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text('Could not delete account: ${e.message}')));
    }
  }
}

// ------------------------------------------------------------------ about

class _AboutPage extends StatelessWidget {
  const _AboutPage();

  @override
  Widget build(BuildContext context) {
    Widget section(String title, String body) => Padding(
          padding: const EdgeInsets.fromLTRB(Space.gutter, Space.lg, Space.gutter, 0),
          child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
            Eyebrow(title),
            const SizedBox(height: Space.xs),
            Text(body, style: context.text.bodyMedium),
          ]),
        );
    return Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
      section('Data labels', [for (final p in Provenance.values) '${p.label}: ${p.explanation}'].join('\n')),
      section('Food data', 'Packaged foods come from Open Food Facts, a community database (ODbL licence) — values can contain errors. '
          'With an account, generic foods also come from USDA FoodData Central (laboratory reference data). '
          'Missing values are shown as missing, never as zero.'),
      section('Estimates', 'Energy expenditure, estimated 1RM, weight trend and recovery status are calculations or estimates from your data. '
          'They are not medical measurements. Phones and watches estimate calories; they don\'t measure them precisely.'),
      section('Health', 'Forma is a fitness tool, not a medical device. If you have a medical condition, are pregnant, have a history of '
          'disordered eating, or are under 18, talk to a qualified professional before changing your diet or training.'),
      section('Fonts & libraries', 'Geist typeface © Vercel, SIL Open Font License 1.1. Exercise instructions written for Forma.'),
      const SizedBox(height: Space.xl),
    ]);
  }
}
