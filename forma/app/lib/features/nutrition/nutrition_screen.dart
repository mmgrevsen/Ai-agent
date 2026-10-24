import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../app/providers.dart';
import '../../core/theme/app_theme.dart';
import '../../core/theme/tokens.dart';
import '../../core/util/format.dart';
import '../../core/widgets/inputs.dart';
import '../../core/widgets/primitives.dart';
import '../../core/widgets/states.dart';
import '../../data/db/app_database.dart';
import '../../data/repositories/nutrition_repository.dart';
import '../../domain/catalog.dart';
import '../../domain/dates.dart';
import '../../domain/nutrition/nutrients.dart';
import 'nutrition_providers.dart';

class NutritionScreen extends ConsumerWidget {
  const NutritionScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final prefs = ref.watch(prefsProvider).value;
    if (prefs != null && !prefs.nutritionEnabled) {
      return PageScaffold(title: 'Nutrition', slivers: [
        SliverToBoxAdapter(
          child: EmptyState(
            icon: Icons.restaurant_outlined,
            title: 'Nutrition tracking is off',
            message: 'You turned this off. Turn it back on in Settings whenever you want.',
            actionLabel: 'Open settings',
            onAction: () => context.push('/settings/features'),
          ),
        ),
      ]);
    }
    final day = ref.watch(selectedDayProvider);
    final today = ref.watch(todayProvider);
    final log = ref.watch(dayLogProvider(day));
    final target = ref.watch(targetForDayProvider(day)).value;
    final calories = prefs?.calorieTrackingEnabled ?? true;

    return PageScaffold(
      title: 'Nutrition',
      actions: [
        IconButton(tooltip: 'Targets', onPressed: () => context.go('/nutrition/targets'), icon: const Icon(Icons.tune_rounded)),
      ],
      slivers: [
        SliverToBoxAdapter(
          child: Padding(
            padding: const EdgeInsets.symmetric(horizontal: Space.sm),
            child: Row(children: [
              IconButton(tooltip: 'Previous day', onPressed: () => ref.read(selectedDayProvider.notifier).shift(-1), icon: const Icon(Icons.chevron_left_rounded)),
              Expanded(
                child: GestureDetector(
                  onTap: () async {
                    final picked = await showDatePicker(context: context, initialDate: day, firstDate: DateTime(2000), lastDate: today);
                    if (picked != null) ref.read(selectedDayProvider.notifier).set(picked);
                  },
                  child: Text(relativeDay(day, today: today), textAlign: TextAlign.center, style: context.text.titleMedium),
                ),
              ),
              IconButton(
                tooltip: 'Next day',
                onPressed: day.isBefore(today) ? () => ref.read(selectedDayProvider.notifier).shift(1) : null,
                icon: const Icon(Icons.chevron_right_rounded),
              ),
            ]),
          ),
        ),
        ...log.when(
          loading: () => [const SliverToBoxAdapter(child: LoadingState())],
          error: (e, _) => [SliverToBoxAdapter(child: ErrorState(message: describeError(e)))],
          data: (log) => [
            SliverPadding(
              padding: const EdgeInsets.fromLTRB(Space.gutter, Space.sm, Space.gutter, 0),
              sliver: SliverToBoxAdapter(child: DaySummaryCard(log: log, target: target, showCalories: calories)),
            ),
            SliverPadding(
              padding: const EdgeInsets.fromLTRB(Space.gutter, Space.md, Space.gutter, 0),
              sliver: SliverToBoxAdapter(child: _WaterCard(day: day, ml: log.waterMl, target: prefs?.waterTargetMl ?? 2500)),
            ),
            for (final meal in MealSlot.values)
              SliverPadding(
                padding: const EdgeInsets.fromLTRB(Space.gutter, Space.md, Space.gutter, 0),
                sliver: SliverToBoxAdapter(child: _MealCard(meal: meal, day: day, entries: log.byMeal[meal]!, showCalories: calories)),
              ),
          ],
        ),
      ],
    );
  }
}

/// Calories remaining ring and macro bars. Shared with Overview.
class DaySummaryCard extends StatelessWidget {
  const DaySummaryCard({super.key, required this.log, required this.target, required this.showCalories, this.onTap});

  final DayLog log;
  final NutritionTarget? target;
  final bool showCalories;
  final VoidCallback? onTap;

  @override
  Widget build(BuildContext context) {
    final c = context.colors;
    final t = log.totals;
    final kcalTarget = target?.kcal;
    final left = kcalTarget == null ? null : kcalTarget - t.kcal;
    return FCard(
      onTap: onTap,
      child: Column(children: [
        Row(crossAxisAlignment: CrossAxisAlignment.center, children: [
          if (showCalories) ...[
            ProgressRing(
              fraction: kcalTarget == null || kcalTarget <= 0 ? 0 : t.kcal / kcalTarget,
              color: left != null && left < 0 ? c.caution : c.accent,
              size: 118,
              child: Column(mainAxisSize: MainAxisSize.min, children: [
                Text(
                  left == null ? kcal(t.kcal) : kcal(left.abs()),
                  style: context.text.headlineMedium?.copyWith(fontFeatures: tabularFigures),
                ),
                Text(
                  left == null ? 'kcal eaten' : (left >= 0 ? 'kcal left' : 'kcal over'),
                  style: context.text.labelSmall,
                ),
              ]),
            ),
            const SizedBox(width: Space.xl),
          ],
          Expanded(
            child: Column(children: [
              LabeledBar(label: 'Protein', value: t.proteinG, target: target?.proteinG, color: c.protein, incomplete: t.incompleteFields.contains('protein')),
              const SizedBox(height: Space.md),
              if (showCalories) ...[
                LabeledBar(label: 'Carbs', value: t.carbsG, target: target?.carbsG, color: c.carbs, incomplete: t.incompleteFields.contains('carbs')),
                const SizedBox(height: Space.md),
                LabeledBar(label: 'Fat', value: t.fatG, target: target?.fatG, color: c.fat, incomplete: t.incompleteFields.contains('fat')),
                const SizedBox(height: Space.md),
              ],
              LabeledBar(label: 'Fiber', value: t.fiberG, target: target?.fiberG, color: c.fiber, incomplete: t.incompleteFields.contains('fiber')),
            ]),
          ),
        ]),
        if (showCalories && kcalTarget != null) ...[
          const SizedBox(height: Space.md),
          Row(children: [
            Text('${kcal(t.kcal)} eaten · ${kcal(kcalTarget)} target', style: context.text.bodySmall),
            const Spacer(),
            if (target?.mode == 'adaptive') const ProvenanceBadge(Provenance.estimated, compact: true),
          ]),
        ],
        if (t.isIncomplete) ...[
          const SizedBox(height: Space.sm),
          Text(
            '* Some foods are missing ${t.incompleteFields.join(', ')} data, so those totals are a lower bound.',
            style: context.text.bodySmall?.copyWith(color: c.caution),
          ),
        ],
        if (kcalTarget == null && showCalories) ...[
          const SizedBox(height: Space.sm),
          Text('No calorie target set. Add one under Targets, or log weight and food so Forma can estimate one.', style: context.text.bodySmall),
        ],
      ]),
    );
  }
}

class _WaterCard extends ConsumerWidget {
  const _WaterCard({required this.day, required this.ml, required this.target});
  final DateTime day;
  final int ml;
  final int target;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final c = context.colors;
    final repo = ref.read(nutritionRepositoryProvider);
    return FCard(
      padding: const EdgeInsets.fromLTRB(Space.lg, Space.md, Space.sm, Space.md),
      child: Row(children: [
        Icon(Icons.water_drop_outlined, color: c.water),
        const SizedBox(width: Space.md),
        Expanded(
          child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
            Text('Water', style: context.text.titleSmall),
            Text('${number(ml / 1000, maxDecimals: 2)} / ${number(target / 1000, maxDecimals: 1)} L', style: context.text.bodySmall?.copyWith(fontFeatures: tabularFigures)),
          ]),
        ),
        if (ml > 0) IconButton(tooltip: 'Undo last', onPressed: () => repo.undoWater(day), icon: const Icon(Icons.undo_rounded, size: 20)),
        TextButton(onPressed: () => repo.addWater(day, 250), child: const Text('+250')),
        TextButton(onPressed: () => repo.addWater(day, 500), child: const Text('+500')),
      ]),
    );
  }
}

class _MealCard extends ConsumerWidget {
  const _MealCard({required this.meal, required this.day, required this.entries, required this.showCalories});
  final MealSlot meal;
  final DateTime day;
  final List<NutritionEntry> entries;
  final bool showCalories;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final c = context.colors;
    final totals = NutrientTotals.of(entries.map((e) => e.nutrients));
    return FCard(
      padding: EdgeInsets.zero,
      child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
        Padding(
          padding: const EdgeInsets.fromLTRB(Space.lg, Space.md, Space.xs, Space.xs),
          child: Row(children: [
            Expanded(child: Text(meal.label, style: context.text.titleMedium)),
            if (entries.isNotEmpty)
              Text(
                showCalories ? '${kcal(totals.kcal)} kcal${totals.incompleteFields.contains('kcal') ? '*' : ''}' : '${number(totals.proteinG, maxDecimals: 0)} g protein',
                style: context.text.labelMedium?.copyWith(fontFeatures: tabularFigures),
              ),
            PopupMenuButton<String>(
              tooltip: '${meal.label} options',
              onSelected: (v) => _menu(context, ref, v),
              itemBuilder: (_) => [
                const PopupMenuItem(value: 'copy', child: Text('Copy from yesterday')),
                if (entries.isNotEmpty) const PopupMenuItem(value: 'save', child: Text('Save as meal')),
                const PopupMenuItem(value: 'quick', child: Text('Quick add')),
                const PopupMenuItem(value: 'photo', child: Text('Estimate from photo')),
              ],
            ),
          ]),
        ),
        for (final e in entries) _EntryTile(entry: e, showCalories: showCalories),
        InkWell(
          onTap: () => context.go('/nutrition/add?meal=${meal.name}&day=${dayKey(day)}'),
          child: Padding(
            padding: const EdgeInsets.symmetric(horizontal: Space.lg, vertical: 14),
            child: Row(children: [
              Icon(Icons.add_rounded, color: c.accent, size: 20),
              const SizedBox(width: Space.sm),
              Text('Add food', style: context.text.labelLarge?.copyWith(color: c.accent)),
            ]),
          ),
        ),
      ]),
    );
  }

  Future<void> _menu(BuildContext context, WidgetRef ref, String action) async {
    final repo = ref.read(nutritionRepositoryProvider);
    final messenger = ScaffoldMessenger.of(context);
    switch (action) {
      case 'copy':
        final n = await repo.copyMeal(from: addDays(day, -1), meal: meal, to: day);
        messenger.showSnackBar(SnackBar(content: Text(n == 0 ? 'Nothing logged for ${meal.label.toLowerCase()} yesterday.' : 'Copied $n item${n == 1 ? '' : 's'}.')));
      case 'save':
        final name = await _askName(context, meal.label);
        if (name == null) return;
        final n = await repo.saveMeal(name, entries);
        messenger.showSnackBar(SnackBar(content: Text(n == 0 ? 'Only foods from the database can be saved as a meal.' : 'Saved “$name” with $n item${n == 1 ? '' : 's'}.')));
      case 'quick':
        if (context.mounted) await showQuickAdd(context, ref, meal: meal, day: day);
      case 'photo':
        if (context.mounted) context.go('/nutrition/photo?meal=${meal.name}&day=${dayKey(day)}');
    }
  }

  Future<String?> _askName(BuildContext context, String initial) async {
    final controller = TextEditingController(text: initial);
    final name = await showDialog<String>(
      context: context,
      builder: (c) => AlertDialog(
        title: const Text('Save meal'),
        content: TextField(controller: controller, autofocus: true, decoration: const InputDecoration(labelText: 'Name')),
        actions: [
          TextButton(onPressed: () => Navigator.pop(c), child: const Text('Cancel')),
          FilledButton(onPressed: () => Navigator.pop(c, controller.text.trim()), child: const Text('Save')),
        ],
      ),
    );
    controller.dispose();
    return name == null || name.isEmpty ? null : name;
  }
}

class _EntryTile extends ConsumerWidget {
  const _EntryTile({required this.entry, required this.showCalories});
  final NutritionEntry entry;
  final bool showCalories;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final e = entry;
    final amount = e.servings != null && e.servingLabel != null
        ? '${number(e.servings!)} × ${e.servingLabel}'
        : e.grams != null
            ? '${number(e.grams!)} g'
            : null;
    final n = e.nutrients;
    return Dismissible(
      key: ValueKey(e.id),
      direction: DismissDirection.endToStart,
      background: Container(
        color: context.colors.negative,
        alignment: Alignment.centerRight,
        padding: const EdgeInsets.only(right: Space.xl),
        child: const Icon(Icons.delete_outline_rounded, color: Colors.white),
      ),
      onDismissed: (_) {
        ref.read(nutritionRepositoryProvider).deleteEntry(e.id);
        ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text('Removed ${e.name}')));
      },
      child: ListTile(
        dense: true,
        onTap: () => _edit(context, ref),
        title: Row(children: [
          Flexible(child: Text(e.name, maxLines: 1, overflow: TextOverflow.ellipsis)),
          if (e.source != Provenance.verified && e.source != Provenance.custom && e.source != Provenance.recorded) ...[
            const SizedBox(width: Space.sm),
            ProvenanceBadge(e.source, compact: true, incomplete: n.isIncomplete),
          ] else if (n.isIncomplete) ...[
            const SizedBox(width: Space.sm),
            ProvenanceBadge(e.source, compact: true, incomplete: true),
          ],
        ]),
        subtitle: Text([?e.brand, ?amount, 'P ${grams(n.proteinG)}'].join(' · ')),
        trailing: showCalories
            ? Text(n.kcal == null ? '— kcal' : '${kcal(n.kcal)} kcal', style: context.text.labelMedium?.copyWith(fontFeatures: tabularFigures))
            : null,
      ),
    );
  }

  Future<void> _edit(BuildContext context, WidgetRef ref) async {
    await showModalBottomSheet<void>(
      context: context,
      isScrollControlled: true,
      useSafeArea: true,
      builder: (c) => _EntryEditor(entry: entry),
    );
  }
}

class _EntryEditor extends ConsumerStatefulWidget {
  const _EntryEditor({required this.entry});
  final NutritionEntry entry;

  @override
  ConsumerState<_EntryEditor> createState() => _EntryEditorState();
}

class _EntryEditorState extends ConsumerState<_EntryEditor> {
  late final _amount = TextEditingController(
    text: number(widget.entry.servings ?? widget.entry.grams ?? 1),
  );
  late final _kcal = TextEditingController(text: widget.entry.kcal == null ? '' : number(widget.entry.kcal!));
  late final _protein = TextEditingController(text: widget.entry.proteinG == null ? '' : number(widget.entry.proteinG!));
  late final _carbs = TextEditingController(text: widget.entry.carbsG == null ? '' : number(widget.entry.carbsG!));
  late final _fat = TextEditingController(text: widget.entry.fatG == null ? '' : number(widget.entry.fatG!));
  late MealSlot _meal = MealSlot.fromName(widget.entry.meal);

  bool get _byServings => widget.entry.servings != null;

  /// Quick-add and AI-estimated entries have no food row, so their values
  /// are corrected directly.
  bool get _direct => widget.entry.foodId == null && widget.entry.recipeId == null;

  @override
  void dispose() {
    for (final c in [_amount, _kcal, _protein, _carbs, _fat]) {
      c.dispose();
    }
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final e = widget.entry;
    return Padding(
      padding: EdgeInsets.only(bottom: MediaQuery.viewInsetsOf(context).bottom),
      child: SingleChildScrollView(
        padding: const EdgeInsets.fromLTRB(Space.gutter, 0, Space.gutter, Space.xl),
        child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
          Text(e.name, style: context.text.titleLarge),
          const SizedBox(height: Space.xs),
          Row(children: [ProvenanceBadge(e.source, incomplete: e.nutrients.isIncomplete)]),
          const SizedBox(height: Space.lg),
          if (_direct) ...[
            Text(
              e.source == Provenance.aiEstimate ? 'AI estimates can be off by a wide margin. Correct anything that looks wrong.' : 'Edit the values you logged.',
              style: context.text.bodySmall,
            ),
            const SizedBox(height: Space.md),
            Row(children: [
              Expanded(child: NumberField(controller: _kcal, label: 'kcal')),
              const SizedBox(width: Space.sm),
              Expanded(child: NumberField(controller: _protein, label: 'Protein', unit: 'g')),
            ]),
            const SizedBox(height: Space.sm),
            Row(children: [
              Expanded(child: NumberField(controller: _carbs, label: 'Carbs', unit: 'g')),
              const SizedBox(width: Space.sm),
              Expanded(child: NumberField(controller: _fat, label: 'Fat', unit: 'g')),
            ]),
          ] else
            NumberField(controller: _amount, label: _byServings ? 'Servings (${e.servingLabel})' : 'Amount', unit: _byServings ? null : 'g', autofocus: true),
          const SizedBox(height: Space.lg),
          SegmentedPills<MealSlot>(values: MealSlot.values, selected: _meal, labelOf: (m) => m.label, expand: true, onChanged: (m) => setState(() => _meal = m)),
          const SizedBox(height: Space.xl),
          Row(children: [
            TextButton(
              onPressed: () async {
                await ref.read(nutritionRepositoryProvider).deleteEntry(e.id);
                if (context.mounted) Navigator.pop(context);
              },
              style: TextButton.styleFrom(foregroundColor: context.colors.negative),
              child: const Text('Delete'),
            ),
            const Spacer(),
            FilledButton(
              onPressed: () async {
                final repo = ref.read(nutritionRepositoryProvider);
                if (_direct) {
                  await repo.correctEntry(
                    e.id,
                    Nutrients(
                      kcal: parseNumber(_kcal.text),
                      proteinG: parseNumber(_protein.text),
                      carbsG: parseNumber(_carbs.text),
                      fatG: parseNumber(_fat.text),
                      fiberG: e.fiberG,
                    ),
                  );
                } else {
                  final v = parseNumber(_amount.text);
                  if (v != null && v > 0) {
                    await repo.updateEntryAmount(e, grams: _byServings ? null : v, servings: _byServings ? v : null);
                  }
                }
                if (_meal.name != e.meal) await repo.moveEntry(e.id, _meal);
                if (context.mounted) Navigator.pop(context);
              },
              child: const Text('Save'),
            ),
          ]),
        ]),
      ),
    );
  }
}

/// Manual entry of calories and macros without a food.
Future<void> showQuickAdd(BuildContext context, WidgetRef ref, {required MealSlot meal, required DateTime day}) async {
  final name = TextEditingController(text: 'Quick add');
  final kcalC = TextEditingController();
  final p = TextEditingController();
  final cc = TextEditingController();
  final f = TextEditingController();
  final ok = await showModalBottomSheet<bool>(
    context: context,
    isScrollControlled: true,
    useSafeArea: true,
    builder: (c) => Padding(
      padding: EdgeInsets.only(bottom: MediaQuery.viewInsetsOf(c).bottom),
      child: SingleChildScrollView(
        padding: const EdgeInsets.fromLTRB(Space.gutter, 0, Space.gutter, Space.xl),
        child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
          Text('Quick add · ${meal.label}', style: c.text.titleLarge),
          const SizedBox(height: Space.lg),
          TextField(controller: name, decoration: const InputDecoration(labelText: 'Description')),
          const SizedBox(height: Space.sm),
          NumberField(controller: kcalC, label: 'Calories', unit: 'kcal', autofocus: true),
          const SizedBox(height: Space.sm),
          Row(children: [
            Expanded(child: NumberField(controller: p, label: 'Protein', unit: 'g')),
            const SizedBox(width: Space.sm),
            Expanded(child: NumberField(controller: cc, label: 'Carbs', unit: 'g')),
            const SizedBox(width: Space.sm),
            Expanded(child: NumberField(controller: f, label: 'Fat', unit: 'g')),
          ]),
          const SizedBox(height: Space.xs),
          Text('Leave a field empty if you don\'t know it — it won\'t be counted as zero.', style: c.text.bodySmall),
          const SizedBox(height: Space.lg),
          FilledButton(onPressed: () => Navigator.pop(c, true), child: const Text('Add')),
        ]),
      ),
    ),
  );
  if (ok == true && (parseNumber(kcalC.text) != null || parseNumber(p.text) != null)) {
    await ref.read(nutritionRepositoryProvider).logQuick(
          name: name.text.trim().isEmpty ? 'Quick add' : name.text.trim(),
          nutrients: Nutrients(kcal: parseNumber(kcalC.text), proteinG: parseNumber(p.text), carbsG: parseNumber(cc.text), fatG: parseNumber(f.text)),
          meal: meal,
          day: day,
          provenance: Provenance.recorded,
        );
  }
  for (final c in [name, kcalC, p, cc, f]) {
    c.dispose();
  }
}
