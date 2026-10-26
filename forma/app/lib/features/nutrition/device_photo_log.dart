import 'dart:async';

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
import '../../data/repositories/nutrition_repository.dart';
import '../../domain/catalog.dart';
import '../../domain/nutrition/food.dart';
import '../../domain/nutrition/nutrients.dart';
import 'add_food_screen.dart' show referenceFoodItem;
import 'photo_input.dart';
import 'vision/label_reader.dart';
import 'vision/on_device_vision.dart';
import 'vision/scale_reader.dart';
import 'vision/vision_foods.dart';
import 'vision/vision_result.dart';

/// A food on the plate being built from a photo, with its portion.
class _PlateItem {
  _PlateItem(this.item, double grams) : grams = TextEditingController(text: number(grams, maxDecimals: 0));
  final FoodItem item;
  final TextEditingController grams;

  /// The portion is the scale's reading, not typed.
  bool fromScale = false;

  double? get g {
    final v = parseNumber(grams.text);
    return v == null || v <= 0 || v > 5000 ? null : v;
  }

  Nutrients? get nutrients => g == null ? null : item.per100g.scale(g! / 100);
}

/// Photo logging that runs entirely on the device: Apple Vision recognises
/// the food and reads a kitchen scale, and the user picks from Forma's
/// reference foods. Values come from the food data, not from a guess; only
/// the portion is the user's (or the scale's).
class DevicePhotoLogScreen extends ConsumerStatefulWidget {
  const DevicePhotoLogScreen({super.key, required this.meal, required this.day});
  final MealSlot meal;
  final DateTime day;

  @override
  ConsumerState<DevicePhotoLogScreen> createState() => _DevicePhotoLogScreenState();
}

class _DevicePhotoLogScreenState extends ConsumerState<DevicePhotoLogScreen> {
  PickedPhoto? _photo;
  bool _busy = false;
  String? _error;
  VisionResult? _result;
  List<FoodSuggestionGroup> _groups = const [];
  List<FoodItem> _yours = const [];
  ScaleReading? _scale;
  bool _useScale = false;
  LabelReading? _label;
  final List<_PlateItem> _plate = [];
  final _search = TextEditingController();
  List<FoodItem> _hits = const [];
  Timer? _debounce;
  bool _saveMeal = false;
  final _mealName = TextEditingController();

  @override
  void dispose() {
    _debounce?.cancel();
    _search.dispose();
    _mealName.dispose();
    for (final p in _plate) {
      p.grams.dispose();
    }
    super.dispose();
  }

  Future<void> _take(ImageSource source) async {
    final photo = await ref.read(photoPickerProvider).pick(source);
    if (photo == null || !mounted) return;
    setState(() {
      _photo = photo;
      _busy = true;
      _error = null;
      _result = null;
    });
    try {
      final result = await ref.read(onDeviceVisionProvider).analyze(photo.bytes);
      final groups = ref.read(visionFoodMatcherProvider).suggest(result.labels);
      final label = readNutritionLabel(result.lines);
      // Foods logged before that look like what was recognised come first.
      final repo = ref.read(nutritionRepositoryProvider);
      final yours = <FoodItem>[];
      final seen = <String>{};
      for (final g in groups) {
        for (final f in await repo.searchLocal(g.title, limit: 3)) {
          if (yours.length < 4 && seen.add(f.id)) yours.add(await repo.foodItem(f.id) ?? f.toItem());
        }
      }
      if (!mounted) return;
      setState(() {
        _result = result;
        _groups = groups;
        _yours = yours;
        _scale = readScale(result.lines);
        _useScale = _scale?.hasUnit ?? false;
        final found = label == null ? 0 : [label.per100g.kcal, label.per100g.proteinG, label.per100g.carbsG, label.per100g.fatG].whereType<double>().length;
        _label = found >= 3 ? label : null;
        if (_useScale && _plate.length == 1) _applyScale(_plate.single);
      });
    } on VisionException catch (e) {
      if (mounted) setState(() => _error = e.message);
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  void _applyScale(_PlateItem p) {
    final s = _scale;
    if (s == null) return;
    p.grams.text = number(s.grams, maxDecimals: 0);
    p.fromScale = true;
  }

  bool _onPlate(FoodItem item) => _plate.any((p) => p.item.source == item.source && p.item.sourceRef == item.sourceRef && p.item.name == item.name);

  void _toggle(FoodItem item) {
    final existing = _plate.where((p) => p.item.source == item.source && p.item.sourceRef == item.sourceRef && p.item.name == item.name).firstOrNull;
    setState(() {
      if (existing != null) {
        _plate.remove(existing);
        existing.grams.dispose();
      } else {
        final serving = item.servings.where((s) => s.grams != 100).firstOrNull;
        final p = _PlateItem(item, serving?.grams ?? 100);
        // The scale's weight goes to the first food; with more foods the user splits it.
        if (_useScale && _plate.isEmpty) _applyScale(p);
        _plate.add(p);
      }
      _saveMeal = _plate.length > 1;
      _mealName.text = [for (final p in _plate) p.item.name.split(',').first.trim()].join(', ');
    });
  }

  void _onSearch(String q) {
    _debounce?.cancel();
    if (q.trim().length < 2) {
      setState(() => _hits = const []);
      return;
    }
    _debounce = Timer(const Duration(milliseconds: 300), () async {
      final local = await ref.read(nutritionRepositoryProvider).searchLocal(q, limit: 4);
      final reference = ref.read(visionFoodMatcherProvider).search(q, limit: 8);
      if (!mounted || _search.text != q) return;
      setState(() => _hits = [for (final f in local) f.toItem(), for (final f in reference) referenceFoodItem(f)]);
    });
  }

  Future<void> _createFromLabel() async {
    final created = await context.push<FoodItem>('/nutrition/custom', extra: _label);
    if (created != null && mounted) _toggle(created);
  }

  Future<void> _log() async {
    final repo = ref.read(nutritionRepositoryProvider);
    final saved = <(String, double)>[];
    for (final p in _plate) {
      final g = p.g;
      if (g == null) continue;
      final food = await repo.saveFood(p.item);
      await repo.logFood(food: food, grams: g, meal: widget.meal, day: widget.day);
      saved.add((food.id, g));
    }
    final asMeal = _saveMeal && saved.length > 1;
    if (asMeal) {
      await repo.saveMealItems(_mealName.text.trim().isEmpty ? 'Photo meal' : _mealName.text.trim(), saved);
    }
    if (!mounted) return;
    final n = saved.length;
    ScaffoldMessenger.of(context).showSnackBar(SnackBar(
      content: Text('Logged $n food${n == 1 ? '' : 's'}. Log ${n == 1 ? 'it' : 'them'} again from ${asMeal ? 'Meals or Recent' : 'Recent'} — no new photo needed.'),
    ));
    context.go('/nutrition');
  }

  NutrientTotals get _totals {
    var t = const NutrientTotals();
    for (final p in _plate) {
      final n = p.nutrients;
      if (n != null) t = t.add(n);
    }
    return t;
  }

  @override
  Widget build(BuildContext context) {
    final c = context.colors;
    final camera = ref.watch(photoCameraAvailableProvider);
    final result = _result;
    final ready = _plate.isNotEmpty && _plate.every((p) => p.g != null);
    return Scaffold(
      appBar: AppBar(title: Text('Photo · ${widget.meal.label}')),
      body: ListView(
        padding: const EdgeInsets.fromLTRB(Space.gutter, Space.sm, Space.gutter, 140),
        children: [
          if (_photo == null) _intro(context) else _photoPreview(context),
          const SizedBox(height: Space.md),
          Row(children: [
            if (camera) ...[
              Expanded(
                child: FilledButton.icon(
                  onPressed: _busy ? null : () => _take(ImageSource.camera),
                  icon: const Icon(Icons.photo_camera_outlined),
                  label: Text(_photo == null ? 'Take photo' : 'New photo'),
                ),
              ),
              const SizedBox(width: Space.sm),
            ],
            Expanded(
              child: camera
                  ? OutlinedButton.icon(
                      onPressed: _busy ? null : () => _take(ImageSource.gallery),
                      icon: const Icon(Icons.photo_library_outlined),
                      label: const Text('Library'),
                    )
                  : FilledButton.icon(
                      onPressed: _busy ? null : () => _take(ImageSource.gallery),
                      icon: const Icon(Icons.photo_library_outlined),
                      label: Text(_photo == null ? 'Choose photo' : 'Another photo'),
                    ),
            ),
          ]),
          if (_busy) const Padding(padding: EdgeInsets.all(Space.xl), child: LoadingState(compact: true)),
          if (_error != null)
            Padding(
              padding: const EdgeInsets.only(top: Space.lg),
              child: Text(_error!, style: context.text.bodyMedium?.copyWith(color: c.caution)),
            ),
          if (result != null) ..._recognised(context, result),
          if (_photo != null && !_busy) ..._searchSection(context),
          if (_plate.isNotEmpty) ..._plateSection(context),
        ],
      ),
      bottomNavigationBar: _plate.isEmpty
          ? null
          : SafeArea(
              minimum: const EdgeInsets.fromLTRB(Space.gutter, Space.sm, Space.gutter, Space.md),
              child: FilledButton(
                onPressed: ready ? _log : null,
                child: Text('Log ${_plate.length} food${_plate.length == 1 ? '' : 's'} · ${kcal(_totals.kcal)} kcal'),
              ),
            ),
    );
  }

  Widget _intro(BuildContext context) {
    final c = context.colors;
    return FCard(
      color: c.surfaceRaised,
      child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        Row(children: [
          Icon(Icons.center_focus_strong_outlined, color: c.accent),
          const SizedBox(width: Space.sm),
          Expanded(child: Text('Snap your plate', style: context.text.titleMedium)),
        ]),
        const SizedBox(height: Space.sm),
        Text(
          'Forma recognises the food on this device — the photo isn’t uploaded and no account is needed. '
          'Pick what’s on the plate; the nutrition comes from Forma’s food data, and you set the grams.',
          style: context.text.bodyMedium,
        ),
        const SizedBox(height: Space.md),
        Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
          Icon(Icons.scale_outlined, size: 18, color: c.accent),
          const SizedBox(width: Space.sm),
          Expanded(
            child: Text(
              'Most precise: put the plate on a kitchen scale (zeroed with the plate on it) and keep the display in the photo. Forma reads the weight.',
              style: context.text.bodySmall,
            ),
          ),
        ]),
        const SizedBox(height: Space.sm),
        Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
          Icon(Icons.document_scanner_outlined, size: 18, color: c.accent),
          const SizedBox(width: Space.sm),
          Expanded(child: Text('A photo of a nutrition label becomes a new food with its values filled in.', style: context.text.bodySmall)),
        ]),
      ]),
    );
  }

  Widget _photoPreview(BuildContext context) {
    final c = context.colors;
    return ClipRRect(
      borderRadius: BorderRadius.circular(Radii.lg),
      child: Image.memory(
        _photo!.bytes,
        height: 200,
        width: double.infinity,
        fit: BoxFit.cover,
        gaplessPlayback: true,
        errorBuilder: (_, _, _) => Container(
          height: 120,
          color: c.surfaceSunken,
          alignment: Alignment.center,
          child: Icon(Icons.image_outlined, color: c.textTertiary),
        ),
      ),
    );
  }

  List<Widget> _recognised(BuildContext context, VisionResult result) {
    final c = context.colors;
    final scale = _scale;
    final looksLikeText = result.labels.take(3).any((l) => visionDocument.contains(l.id));
    return [
      if (_groups.isNotEmpty) ...[
        const SizedBox(height: Space.lg),
        Wrap(spacing: Space.xs, runSpacing: Space.xs, children: [
          for (final g in _groups)
            Chip(
              avatar: Icon(Icons.auto_awesome_outlined, size: 16, color: c.accent),
              label: Text('${g.title} · ${(g.label.confidence * 100).round()} %'),
              visualDensity: VisualDensity.compact,
            ),
        ]),
      ],
      if (scale != null) ...[
        const SizedBox(height: Space.md),
        FCard(
          color: c.accentMuted,
          padding: const EdgeInsets.fromLTRB(Space.lg, Space.sm, Space.sm, Space.sm),
          child: Row(children: [
            Icon(Icons.scale_rounded, color: c.accent),
            const SizedBox(width: Space.sm),
            Expanded(
              child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                Text('Scale shows ${scale.text}${scale.hasUnit ? '' : ' g?'}', style: context.text.titleSmall),
                Text(
                  _useScale ? 'Used as the weight of the first food you pick.' : 'Turn on to use it as the weight.',
                  style: context.text.bodySmall,
                ),
              ]),
            ),
            Switch(
              value: _useScale,
              onChanged: (v) => setState(() {
                _useScale = v;
                if (v && _plate.isNotEmpty) _applyScale(_plate.first);
              }),
            ),
          ]),
        ),
      ],
      if (_label != null) ...[
        const SizedBox(height: Space.md),
        FCard(
          onTap: _createFromLabel,
          child: Row(children: [
            Icon(Icons.document_scanner_outlined, color: c.accent),
            const SizedBox(width: Space.md),
            Expanded(
              child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                Text('Nutrition label found', style: context.text.titleSmall),
                Text(
                  '${kcal(_label!.per100g.kcal)} kcal per 100 g. Create a food from it to check and save the values.',
                  style: context.text.bodySmall,
                ),
              ]),
            ),
            const Icon(Icons.chevron_right_rounded),
          ]),
        ),
      ],
      if (_yours.isNotEmpty) ...[
        const SectionHeader('Logged before', padding: EdgeInsets.fromLTRB(0, Space.xl, 0, Space.xs)),
        for (final f in _yours) _FoodRow(item: f, selected: _onPlate(f), onTap: () => _toggle(f)),
      ],
      for (final g in _groups) ...[
        SectionHeader(g.title, padding: const EdgeInsets.fromLTRB(0, Space.xl, 0, Space.xs)),
        for (final f in g.foods)
          Builder(builder: (_) {
            final item = referenceFoodItem(f);
            return _FoodRow(item: item, selected: _onPlate(item), onTap: () => _toggle(item));
          }),
      ],
      if (_groups.isEmpty && _label == null)
        Padding(
          padding: const EdgeInsets.only(top: Space.lg),
          child: Text(
            looksLikeText
                ? 'This looks like printed text, but no nutrition table could be read. Try a sharper, straight-on photo of the table, or scan the barcode.'
                : 'Forma couldn’t tell which food this is. Search for it below, or try a closer photo in good light.',
            style: context.text.bodyMedium,
          ),
        ),
    ];
  }

  List<Widget> _searchSection(BuildContext context) => [
        const SizedBox(height: Space.xl),
        TextField(
          controller: _search,
          onChanged: _onSearch,
          textInputAction: TextInputAction.search,
          decoration: InputDecoration(
            hintText: _groups.isEmpty ? 'Search for the food' : 'Something else? Search all foods',
            prefixIcon: const Icon(Icons.search_rounded),
          ),
        ),
        for (final f in _hits) _FoodRow(item: f, selected: _onPlate(f), onTap: () => _toggle(f)),
      ];

  List<Widget> _plateSection(BuildContext context) {
    final c = context.colors;
    final totals = _totals;
    final plateGrams = _plate.fold<double>(0, (s, p) => s + (p.g ?? 0));
    final scale = _scale;
    return [
      const SectionHeader('On your plate', padding: EdgeInsets.fromLTRB(0, Space.xxl, 0, Space.xs)),
      for (final p in _plate)
        Padding(
          padding: const EdgeInsets.only(bottom: Space.sm),
          child: FCard(
            padding: const EdgeInsets.fromLTRB(Space.lg, Space.md, Space.sm, Space.md),
            child: Row(children: [
              Expanded(
                child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                  Text(p.item.name, style: context.text.titleSmall, maxLines: 2, overflow: TextOverflow.ellipsis),
                  const SizedBox(height: Space.xs),
                  Row(children: [
                    ProvenanceBadge(p.item.provenance, compact: true, incomplete: p.item.per100g.isIncomplete),
                    const SizedBox(width: Space.sm),
                    Flexible(child: Text('${kcal(p.nutrients?.kcal)} kcal', style: context.text.bodySmall, overflow: TextOverflow.ellipsis)),
                    if (p.fromScale) ...[
                      const SizedBox(width: Space.xs),
                      Tooltip(message: 'Weighed on the scale', child: Icon(Icons.scale_rounded, size: 16, color: c.accent)),
                    ],
                  ]),
                ]),
              ),
              const SizedBox(width: Space.sm),
              SizedBox(
                width: 96,
                child: NumberField(
                  controller: p.grams,
                  label: 'Grams',
                  unit: 'g',
                  onChanged: (_) => setState(() => p.fromScale = false),
                ),
              ),
              IconButton(tooltip: 'Remove', icon: const Icon(Icons.close_rounded), onPressed: () => _toggle(p.item)),
            ]),
          ),
        ),
      Padding(
        padding: const EdgeInsets.only(top: Space.xs),
        child: Text(
          [
            '${kcal(totals.kcal)} kcal',
            '${number(totals.proteinG, maxDecimals: 0)} g protein',
            '${number(totals.carbsG, maxDecimals: 0)} g carbs',
            '${number(totals.fatG, maxDecimals: 0)} g fat',
            if (totals.isIncomplete) 'some values unknown',
          ].join(' · '),
          style: context.text.bodyMedium?.copyWith(color: c.textSecondary),
        ),
      ),
      if (scale != null && _plate.length > 1)
        Padding(
          padding: const EdgeInsets.only(top: Space.xs),
          child: Text(
            'Scale ${number(scale.grams, maxDecimals: 0)} g · plate ${number(plateGrams, maxDecimals: 0)} g. Split the weight between the foods.',
            style: context.text.bodySmall?.copyWith(color: (plateGrams - scale.grams).abs() > 5 ? c.caution : c.textSecondary),
          ),
        ),
      if (_plate.length > 1) ...[
        const SizedBox(height: Space.md),
        SwitchListTile(
          contentPadding: EdgeInsets.zero,
          value: _saveMeal,
          onChanged: (v) => setState(() => _saveMeal = v),
          title: const Text('Save as a meal'),
          subtitle: const Text('Log the whole plate again with one tap. Each food is also kept under Recent.'),
        ),
        if (_saveMeal) TextField(controller: _mealName, decoration: const InputDecoration(labelText: 'Meal name')),
      ],
    ];
  }
}

class _FoodRow extends StatelessWidget {
  const _FoodRow({required this.item, required this.selected, required this.onTap});
  final FoodItem item;
  final bool selected;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final c = context.colors;
    final n = item.per100g;
    final serving = item.servings.where((s) => s.grams != 100).firstOrNull;
    return ListTile(
      contentPadding: EdgeInsets.zero,
      onTap: onTap,
      title: Text(item.name, maxLines: 2, overflow: TextOverflow.ellipsis),
      subtitle: Row(children: [
        ProvenanceBadge(item.provenance, compact: true, incomplete: n.isIncomplete),
        const SizedBox(width: Space.sm),
        Expanded(
          child: Text(
            serving != null
                ? '${kcal(n.kcal == null ? null : n.kcal! * serving.grams / 100)} kcal / ${serving.label}'
                : '${kcal(n.kcal)} kcal / 100 g',
            maxLines: 1,
            overflow: TextOverflow.ellipsis,
          ),
        ),
      ]),
      trailing: Icon(selected ? Icons.check_circle_rounded : Icons.add_circle_outline_rounded, color: selected ? c.accent : null),
    );
  }
}
