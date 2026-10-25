import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:image_picker/image_picker.dart';

import '../../app/providers.dart';
import '../../core/theme/tokens.dart';
import '../../core/util/format.dart';
import '../../core/widgets/inputs.dart';
import '../../core/widgets/primitives.dart';
import '../../core/widgets/states.dart';
import '../../data/remote/ai_api.dart';
import '../../data/remote/backend.dart';
import '../../domain/catalog.dart';
import '../../domain/dates.dart';
import '../../domain/nutrition/nutrients.dart';
import 'photo_input.dart';

class _Editable {
  _Editable(PhotoFoodEstimate e)
      : estimate = e,
        name = TextEditingController(text: e.name),
        grams = TextEditingController(text: number(e.grams, maxDecimals: 0)),
        kcal = TextEditingController(),
        protein = TextEditingController(),
        carbs = TextEditingController(),
        fat = TextEditingController() {
    _fill(e.grams);
  }

  final PhotoFoodEstimate estimate;
  final TextEditingController name, grams, kcal, protein, carbs, fat;
  bool include = true;

  /// Rescales the nutrients from the estimate when the portion is corrected,
  /// so a changed weight never leaves stale calories behind.
  void onGramsChanged() {
    final g = parseNumber(grams.text);
    if (g != null && g > 0) _fill(g);
  }

  void _fill(double g) {
    final n = estimate.nutrients.scale(g / estimate.grams);
    kcal.text = n.kcal == null ? '' : number(n.kcal!, maxDecimals: 0);
    protein.text = n.proteinG == null ? '' : number(n.proteinG!);
    carbs.text = n.carbsG == null ? '' : number(n.carbsG!);
    fat.text = n.fatG == null ? '' : number(n.fatG!);
  }

  Nutrients get nutrients {
    final g = parseNumber(grams.text);
    return Nutrients(
      kcal: parseNumber(kcal.text),
      proteinG: parseNumber(protein.text),
      carbsG: parseNumber(carbs.text),
      fatG: parseNumber(fat.text),
      fiberG: estimate.nutrients.fiberG == null || g == null ? null : estimate.nutrients.fiberG! * g / estimate.grams,
    );
  }

  /// Portion still matches the scale reading.
  bool get stillWeighed => estimate.weighed && parseNumber(grams.text) == estimate.grams;

  void dispose() {
    for (final c in [name, grams, kcal, protein, carbs, fat]) {
      c.dispose();
    }
  }
}

class PhotoLogScreen extends ConsumerStatefulWidget {
  const PhotoLogScreen({super.key, this.meal, this.day});
  final String? meal;
  final String? day;

  @override
  ConsumerState<PhotoLogScreen> createState() => _PhotoLogScreenState();
}

class _PhotoLogScreenState extends ConsumerState<PhotoLogScreen> {
  bool _busy = false;
  String? _error;
  List<_Editable> _items = [];
  List<String> _caveats = const [];
  PhotoEstimateResult? _result;
  bool _saveMeal = false;
  final _mealName = TextEditingController();
  final _hint = TextEditingController();

  late final MealSlot _meal = widget.meal == null ? MealSlot.forTime(DateTime.now()) : MealSlot.fromName(widget.meal!);
  late final DateTime _day = widget.day == null ? ref.read(todayProvider) : parseDayKey(widget.day!);

  @override
  void dispose() {
    for (final i in _items) {
      i.dispose();
    }
    _hint.dispose();
    _mealName.dispose();
    super.dispose();
  }

  Future<void> _pick(ImageSource source) async {
    final photo = await ref.read(photoPickerProvider).pick(source);
    if (photo == null) return;
    setState(() {
      _busy = true;
      _error = null;
    });
    try {
      final result = await ref.read(aiApiProvider).estimatePhoto(
            photo.bytes,
            mimeType: photo.mimeType,
            hint: _hint.text.trim().isEmpty ? null : _hint.text.trim(),
          );
      if (!mounted) return;
      setState(() {
        for (final i in _items) {
          i.dispose();
        }
        _result = result;
        _items = [for (final e in result.items) _Editable(e)];
        _caveats = result.caveats;
        _saveMeal = _items.length > 1;
        _mealName.text = [for (final e in result.items) e.name].join(', ');
        if (_items.isEmpty) _error = 'No food could be identified. Try another photo or log it manually.';
      });
    } on BackendException catch (e) {
      if (mounted) setState(() => _error = e.message);
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _log() async {
    final repo = ref.read(nutritionRepositoryProvider);
    final saved = <(String, double)>[];
    var count = 0;
    for (final i in _items.where((i) => i.include)) {
      final grams = parseNumber(i.grams.text);
      final r = await repo.logEstimate(
        name: i.name.text.trim().isEmpty ? i.estimate.name : i.name.text.trim(),
        grams: grams,
        nutrients: i.nutrients,
        meal: _meal,
        day: _day,
        weighed: i.stillWeighed,
      );
      if (r.food != null && grams != null) saved.add((r.food!.id, grams));
      count++;
    }
    final asMeal = _saveMeal && saved.isNotEmpty;
    if (asMeal) {
      await repo.saveMealItems(_mealName.text.trim().isEmpty ? 'Photo meal' : _mealName.text.trim(), saved);
    }
    if (!mounted) return;
    ScaffoldMessenger.of(context).showSnackBar(SnackBar(
      content: Text('Logged $count item${count == 1 ? '' : 's'}. Log ${count == 1 ? 'it' : 'them'} again from ${asMeal ? 'Meals or Recent' : 'Recent'} — no new photo needed.'),
    ));
    context.go('/nutrition');
  }

  @override
  Widget build(BuildContext context) {
    final available = ref.watch(photoAiAvailableProvider);
    final backend = ref.watch(backendProvider);
    final c = context.colors;
    final result = _result;
    return Scaffold(
      appBar: AppBar(title: Text('Photo estimate · ${_meal.label}')),
      body: !available
          ? EmptyState(
              icon: Icons.photo_camera_outlined,
              title: backend.configured ? 'Sign in to use photo estimates' : 'Photo estimates need the Forma server',
              message: 'Photos are analysed on the server so no AI keys are stored in the app. You can still search, scan or quick-add food.',
              actionLabel: backend.configured ? 'Sign in' : null,
              onAction: backend.configured ? () => context.push('/settings/account') : null,
            )
          : ListView(padding: const EdgeInsets.fromLTRB(Space.gutter, Space.sm, Space.gutter, 120), children: [
              FCard(
                color: c.surfaceRaised,
                child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                  Text(
                    'Portions guessed from a photo are often off by 20–50%. Review every value before logging. Entries are marked “AI estimate”.',
                    style: context.text.bodyMedium,
                  ),
                  const SizedBox(height: Space.sm),
                  Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
                    Icon(Icons.scale_outlined, size: 18, color: c.accent),
                    const SizedBox(width: Space.sm),
                    Expanded(
                      child: Text(
                        'Most precise: put the food on a kitchen scale (zeroed with the plate on it) and keep the display in the photo. The scale’s weight is used instead of a guess.',
                        style: context.text.bodySmall,
                      ),
                    ),
                  ]),
                ]),
              ),
              const SizedBox(height: Space.md),
              TextField(controller: _hint, decoration: const InputDecoration(labelText: 'Optional hint (e.g. “chicken curry, half a plate of rice”)')),
              const SizedBox(height: Space.md),
              Row(children: [
                Expanded(child: FilledButton.icon(onPressed: _busy ? null : () => _pick(ImageSource.camera), icon: const Icon(Icons.photo_camera_outlined), label: const Text('Take photo'))),
                const SizedBox(width: Space.sm),
                Expanded(child: OutlinedButton.icon(onPressed: _busy ? null : () => _pick(ImageSource.gallery), icon: const Icon(Icons.photo_library_outlined), label: const Text('Library'))),
              ]),
              if (_busy) const Padding(padding: EdgeInsets.all(Space.xl), child: LoadingState(compact: true)),
              if (_error != null) Padding(padding: const EdgeInsets.only(top: Space.lg), child: Text(_error!, style: context.text.bodyMedium?.copyWith(color: c.caution))),
              if (result != null && result.scaleApplied)
                Padding(
                  padding: const EdgeInsets.only(top: Space.lg),
                  child: FCard(
                    color: c.accentMuted,
                    child: Row(children: [
                      Icon(Icons.scale_rounded, color: c.accent),
                      const SizedBox(width: Space.sm),
                      Expanded(child: Text('Scale reading used: ${number(result.scaleGrams!, maxDecimals: 1)} g', style: context.text.titleSmall)),
                    ]),
                  ),
                ),
              for (final cv in _caveats) Padding(padding: const EdgeInsets.only(top: Space.sm), child: Text('• $cv', style: context.text.bodySmall)),
              for (final i in _items) ...[
                const SizedBox(height: Space.md),
                FCard(
                  child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                    Row(children: [
                      Checkbox(value: i.include, onChanged: (v) => setState(() => i.include = v ?? false)),
                      Expanded(child: TextField(controller: i.name, decoration: const InputDecoration(labelText: 'Food'))),
                    ]),
                    const SizedBox(height: Space.sm),
                    Row(children: [
                      const ProvenanceBadge(Provenance.aiEstimate, compact: true),
                      const SizedBox(width: Space.sm),
                      Expanded(
                        child: Text(
                          i.estimate.weighed
                              ? 'Weighed on the scale · ${number(i.estimate.gramsLow, maxDecimals: 0)}–${number(i.estimate.gramsHigh, maxDecimals: 0)} g'
                              : '${i.estimate.confidence} confidence · likely ${number(i.estimate.gramsLow, maxDecimals: 0)}–${number(i.estimate.gramsHigh, maxDecimals: 0)} g',
                          style: context.text.bodySmall,
                        ),
                      ),
                    ]),
                    if (i.estimate.notes != null) Text(i.estimate.notes!, style: context.text.bodySmall),
                    const SizedBox(height: Space.sm),
                    Row(children: [
                      Expanded(child: NumberField(controller: i.grams, label: 'Grams', onChanged: (_) => setState(i.onGramsChanged))),
                      const SizedBox(width: Space.sm),
                      Expanded(child: NumberField(controller: i.kcal, label: 'kcal')),
                    ]),
                    const SizedBox(height: Space.sm),
                    Row(children: [
                      Expanded(child: NumberField(controller: i.protein, label: 'Protein')),
                      const SizedBox(width: Space.sm),
                      Expanded(child: NumberField(controller: i.carbs, label: 'Carbs')),
                      const SizedBox(width: Space.sm),
                      Expanded(child: NumberField(controller: i.fat, label: 'Fat')),
                    ]),
                  ]),
                ),
              ],
              if (_items.isNotEmpty) ...[
                const SizedBox(height: Space.lg),
                SwitchListTile(
                  contentPadding: EdgeInsets.zero,
                  value: _saveMeal,
                  onChanged: (v) => setState(() => _saveMeal = v),
                  title: const Text('Save as a meal'),
                  subtitle: const Text('Log the whole plate again with one tap. Each food is also kept under Recent.'),
                ),
                if (_saveMeal) TextField(controller: _mealName, decoration: const InputDecoration(labelText: 'Meal name')),
                const SizedBox(height: Space.lg),
                FilledButton(onPressed: _items.any((i) => i.include) ? _log : null, child: const Text('Log selected')),
              ],
            ]),
    );
  }
}
