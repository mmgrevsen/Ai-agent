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

class _Editable {
  _Editable(PhotoFoodEstimate e)
      : estimate = e,
        name = TextEditingController(text: e.name),
        grams = TextEditingController(text: number(e.grams, maxDecimals: 0)),
        kcal = TextEditingController(text: e.nutrients.kcal == null ? '' : number(e.nutrients.kcal!, maxDecimals: 0)),
        protein = TextEditingController(text: e.nutrients.proteinG == null ? '' : number(e.nutrients.proteinG!)),
        carbs = TextEditingController(text: e.nutrients.carbsG == null ? '' : number(e.nutrients.carbsG!)),
        fat = TextEditingController(text: e.nutrients.fatG == null ? '' : number(e.nutrients.fatG!));

  final PhotoFoodEstimate estimate;
  final TextEditingController name, grams, kcal, protein, carbs, fat;
  bool include = true;

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
  final _hint = TextEditingController();

  late final MealSlot _meal = widget.meal == null ? MealSlot.forTime(DateTime.now()) : MealSlot.fromName(widget.meal!);
  late final DateTime _day = widget.day == null ? ref.read(todayProvider) : parseDayKey(widget.day!);

  @override
  void dispose() {
    for (final i in _items) {
      i.dispose();
    }
    _hint.dispose();
    super.dispose();
  }

  Future<void> _pick(ImageSource source) async {
    final file = await ImagePicker().pickImage(source: source, maxWidth: 1280, maxHeight: 1280, imageQuality: 80);
    if (file == null) return;
    setState(() {
      _busy = true;
      _error = null;
    });
    try {
      final bytes = await file.readAsBytes();
      final result = await ref.read(aiApiProvider).estimatePhoto(
            bytes,
            mimeType: file.mimeType ?? 'image/jpeg',
            hint: _hint.text.trim().isEmpty ? null : _hint.text.trim(),
          );
      if (!mounted) return;
      setState(() {
        for (final i in _items) {
          i.dispose();
        }
        _items = [for (final e in result.items) _Editable(e)];
        _caveats = result.caveats;
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
    var count = 0;
    for (final i in _items.where((i) => i.include)) {
      await repo.logQuick(
        name: i.name.text.trim().isEmpty ? i.estimate.name : i.name.text.trim(),
        grams: parseNumber(i.grams.text),
        nutrients: Nutrients(
          kcal: parseNumber(i.kcal.text),
          proteinG: parseNumber(i.protein.text),
          carbsG: parseNumber(i.carbs.text),
          fatG: parseNumber(i.fat.text),
          fiberG: i.estimate.nutrients.fiberG,
        ),
        meal: _meal,
        day: _day,
        provenance: Provenance.aiEstimate,
      );
      count++;
    }
    if (!mounted) return;
    ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text('Logged $count item${count == 1 ? '' : 's'} as AI estimates.')));
    context.go('/nutrition');
  }

  @override
  Widget build(BuildContext context) {
    final backend = ref.watch(backendProvider);
    ref.watch(authUserProvider);
    final c = context.colors;
    return Scaffold(
      appBar: AppBar(title: Text('Photo estimate · ${_meal.label}')),
      body: !backend.signedIn
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
                child: Text(
                  'Portions and nutrients from a photo are rough estimates — often off by 20–50%. '
                  'Review every value before logging. Entries are marked “AI estimate”.',
                  style: context.text.bodyMedium,
                ),
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
                          '${i.estimate.confidence} confidence · likely ${number(i.estimate.gramsLow, maxDecimals: 0)}–${number(i.estimate.gramsHigh, maxDecimals: 0)} g',
                          style: context.text.bodySmall,
                        ),
                      ),
                    ]),
                    if (i.estimate.notes != null) Text(i.estimate.notes!, style: context.text.bodySmall),
                    const SizedBox(height: Space.sm),
                    Row(children: [
                      Expanded(child: NumberField(controller: i.grams, label: 'Grams')),
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
                FilledButton(onPressed: _items.any((i) => i.include) ? _log : null, child: const Text('Log selected')),
              ],
            ]),
    );
  }
}
