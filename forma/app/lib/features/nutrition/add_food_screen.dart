import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:image_picker/image_picker.dart';
import 'package:mobile_scanner/mobile_scanner.dart';

import '../../app/providers.dart';
import '../../core/theme/tokens.dart';
import '../../core/util/format.dart';
import '../../core/widgets/inputs.dart';
import '../../core/widgets/primitives.dart';
import '../../core/widgets/prompts.dart';
import '../../core/widgets/states.dart';
import '../../data/db/app_database.dart';
import '../../data/remote/backend.dart';
import '../../data/remote/food_api.dart';
import '../../data/repositories/nutrition_repository.dart';
import '../../domain/catalog.dart';
import '../../domain/dates.dart';
import '../../domain/nutrition/food.dart';
import 'food_portion_sheet.dart';
import 'nutrition_providers.dart';
import 'nutrition_screen.dart' show showQuickAdd;
import 'photo_input.dart';

class AddFoodScreen extends ConsumerStatefulWidget {
  const AddFoodScreen({super.key, this.meal, this.day});
  final String? meal;
  final String? day;

  @override
  ConsumerState<AddFoodScreen> createState() => _AddFoodScreenState();
}

enum _Tab { recent, mine, recipes, meals }

class _AddFoodScreenState extends ConsumerState<AddFoodScreen> {
  final _query = TextEditingController();
  Timer? _debounce;
  _Tab _tab = _Tab.recent;
  bool _searching = false;
  List<FoodItem> _remote = const [];
  List<Food> _local = const [];
  String? _error;
  int _requestId = 0;

  late final MealSlot _meal = widget.meal == null ? MealSlot.forTime(DateTime.now()) : MealSlot.fromName(widget.meal!);
  late final DateTime _day = widget.day == null ? ref.read(todayProvider) : parseDayKey(widget.day!);

  @override
  void dispose() {
    _debounce?.cancel();
    _query.dispose();
    super.dispose();
  }

  void _onQuery(String q) {
    _debounce?.cancel();
    setState(() {});
    if (q.trim().length < 2) {
      setState(() {
        _remote = const [];
        _local = const [];
        _error = null;
        _searching = false;
      });
      return;
    }
    _debounce = Timer(const Duration(milliseconds: 350), () => _search(q));
  }

  Future<void> _search(String q) async {
    final id = ++_requestId;
    setState(() {
      _searching = true;
      _error = null;
    });
    final local = await ref.read(nutritionRepositoryProvider).searchLocal(q);
    if (id != _requestId || !mounted) return;
    setState(() => _local = local);
    try {
      final remote = await ref.read(foodDataSourceProvider).search(q);
      if (id != _requestId || !mounted) return;
      setState(() => _remote = remote);
    } on FoodApiException catch (e) {
      if (id == _requestId && mounted) setState(() => _error = e.message);
    } finally {
      if (id == _requestId && mounted) setState(() => _searching = false);
    }
  }

  Future<void> _pick(FoodItem item) async {
    // A lingering snackbar would sit on top of the sheet's Add button.
    ScaffoldMessenger.of(context).hideCurrentSnackBar();
    final choice = await showPortionSheet(context, food: item, meal: _meal);
    if (choice == null || !mounted) return;
    final repo = ref.read(nutritionRepositoryProvider);
    final food = await repo.saveFood(item);
    await repo.logFood(food: food, grams: choice.grams, meal: choice.meal, day: _day, servings: choice.servings, servingLabel: choice.servingLabel);
    if (!mounted) return;
    ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text('Added ${item.name} to ${choice.meal.label.toLowerCase()}')));
  }

  /// Opens the custom food form; a saved food goes straight to the portion sheet.
  Future<void> _createCustom({String? barcode}) async {
    final created = await context.push<FoodItem>(barcode == null ? '/nutrition/custom' : '/nutrition/custom?barcode=$barcode');
    if (created != null && mounted) await _pick(created);
  }

  Future<void> _scan() async {
    final code = await Navigator.of(context, rootNavigator: true).push<String>(
      MaterialPageRoute(fullscreenDialog: true, builder: (_) => const BarcodeScanScreen()),
    );
    if (code == null || !mounted) return;
    await _lookupBarcode(code);
  }

  /// Reads the barcode from a still photo, e.g. the back of a package.
  Future<void> _scanPhoto() async {
    final code = await readBarcodeFromPhoto(context, ref);
    if (code != null && mounted) await _lookupBarcode(code);
  }

  Future<void> _lookupBarcode(String code) async {
    setState(() => _searching = true);
    try {
      final local = await ref.read(nutritionRepositoryProvider).foodByBarcode(code);
      final item = local ?? await ref.read(foodDataSourceProvider).barcode(code);
      if (!mounted) return;
      setState(() => _searching = false);
      if (item == null) {
        final canRead = ref.read(photoAiAvailableProvider);
        final choice = await showDialog<String>(
          context: context,
          builder: (c) => AlertDialog(
            title: const Text('Product not found'),
            content: Text(
              'Barcode $code isn\'t in the food database yet. '
              '${canRead ? 'Take a photo of the nutrition label and the values are filled in for you to check.' : 'You can add it from the nutrition label.'}',
            ),
            actions: [
              TextButton(onPressed: () => Navigator.pop(c), child: const Text('Cancel')),
              if (canRead) TextButton(onPressed: () => Navigator.pop(c, 'manual'), child: const Text('Type it in')),
              FilledButton(onPressed: () => Navigator.pop(c, canRead ? 'label' : 'manual'), child: Text(canRead ? 'Photo of label' : 'Add from label')),
            ],
          ),
        );
        if (!mounted) return;
        if (choice == 'label') await _labelPhoto(barcode: code);
        if (choice == 'manual') await _createCustom(barcode: code);
        return;
      }
      await _pick(item);
    } on FoodApiException catch (e) {
      if (mounted) {
        setState(() => _searching = false);
        ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(e.message)));
      }
    }
  }

  /// Photographs a nutrition label; the values open in the custom-food form
  /// for review, so the product is known the next time it's scanned.
  Future<void> _labelPhoto({String? barcode}) async {
    if (!ref.read(photoAiAvailableProvider)) {
      ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('Reading labels needs the Forma server and an account. You can type the values in instead.')));
      return _createCustom(barcode: barcode);
    }
    final photo = await ref.read(photoPickerProvider).pick(ImageSource.camera);
    if (photo == null || !mounted) return;
    setState(() => _searching = true);
    try {
      final reading = await ref.read(aiApiProvider).readLabel(photo.bytes, mimeType: photo.mimeType);
      if (!mounted) return;
      setState(() => _searching = false);
      if (reading.isEmpty) {
        ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('No nutrition values could be read. Try a sharper photo of the table, or type them in.')));
        return;
      }
      final created = await context.push<FoodItem>(
        barcode == null ? '/nutrition/custom' : '/nutrition/custom?barcode=$barcode',
        extra: reading,
      );
      if (created != null && mounted) await _pick(created);
    } on BackendException catch (e) {
      if (mounted) {
        setState(() => _searching = false);
        ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(e.message)));
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    final searching = _query.text.trim().length >= 2;
    return Scaffold(
      appBar: AppBar(title: Text('Add to ${_meal.label.toLowerCase()} · ${relativeDay(_day)}')),
      body: Column(children: [
        Padding(
          padding: const EdgeInsets.fromLTRB(Space.gutter, Space.sm, Space.gutter, Space.sm),
          child: Row(children: [
            Expanded(
              child: TextField(
                controller: _query,
                autofocus: true,
                onChanged: _onQuery,
                textInputAction: TextInputAction.search,
                onSubmitted: _search,
                decoration: InputDecoration(
                  hintText: 'Search foods and brands',
                  prefixIcon: const Icon(Icons.search_rounded),
                  suffixIcon: _query.text.isEmpty ? null : IconButton(icon: const Icon(Icons.close_rounded), onPressed: () => setState(() => _onQuery(_query.text = ''))),
                ),
              ),
            ),
            const SizedBox(width: Space.sm),
            IconButton.filledTonal(tooltip: 'Scan barcode', onPressed: _scan, icon: const Icon(Icons.qr_code_scanner_rounded)),
          ]),
        ),
        // A wrap rather than a scrolling row, so every way to add food is visible.
        Padding(
          padding: const EdgeInsets.symmetric(horizontal: Space.gutter),
          child: Wrap(spacing: Space.sm, runSpacing: Space.xs, children: [
            ActionChip(
              avatar: const Icon(Icons.photo_camera_outlined, size: 18),
              label: const Text('Photo'),
              onPressed: () => context.push('/nutrition/photo?meal=${_meal.name}&day=${dayKey(_day)}'),
            ),
            ActionChip(avatar: const Icon(Icons.barcode_reader, size: 18), label: const Text('Barcode photo'), onPressed: _scanPhoto),
            ActionChip(avatar: const Icon(Icons.document_scanner_outlined, size: 18), label: const Text('Nutrition label'), onPressed: _labelPhoto),
            ActionChip(avatar: const Icon(Icons.bolt_rounded, size: 18), label: const Text('Quick add'), onPressed: () async {
              await showQuickAdd(context, ref, meal: _meal, day: _day);
            }),
            ActionChip(avatar: const Icon(Icons.edit_note_rounded, size: 18), label: const Text('New food'), onPressed: _createCustom),
            ActionChip(avatar: const Icon(Icons.menu_book_outlined, size: 18), label: const Text('New recipe'), onPressed: () => context.push('/nutrition/recipes/new')),
          ]),
        ),
        if (_searching) const LinearProgressIndicator(minHeight: 2) else const SizedBox(height: 2),
        Expanded(child: searching ? _results() : _browse()),
      ]),
    );
  }

  Widget _results() {
    final c = context.colors;
    final localIds = {for (final f in _local) '${f.source}:${f.sourceRef}'};
    final remote = [for (final r in _remote) if (!localIds.contains('${r.source}:${r.sourceRef}')) r];
    if (_local.isEmpty && remote.isEmpty && !_searching) {
      return EmptyState(
        icon: _error != null ? Icons.cloud_off_rounded : Icons.search_off_rounded,
        title: _error != null ? 'Search unavailable' : 'No foods found',
        message: _error ?? 'Try a different spelling, scan the barcode, or add it as a custom food.',
        actionLabel: 'Create custom food',
        onAction: _createCustom,
      );
    }
    return ListView(padding: const EdgeInsets.only(bottom: 120), children: [
      if (_error != null)
        Padding(
          padding: const EdgeInsets.fromLTRB(Space.gutter, Space.sm, Space.gutter, 0),
          child: Text(_error!, style: context.text.bodySmall?.copyWith(color: c.caution)),
        ),
      if (_local.isNotEmpty) ...[
        const SectionHeader('Saved on this device'),
        for (final f in _local) _FoodTile(item: f.toItem(), onTap: () async => _pick(await ref.read(nutritionRepositoryProvider).foodItem(f.id) ?? f.toItem())),
      ],
      if (remote.isNotEmpty) ...[
        SectionHeader(remote.any((r) => r.source == 'usda') ? 'Food databases' : 'Open Food Facts'),
        for (final r in remote) _FoodTile(item: r, onTap: () => _pick(r)),
      ],
    ]);
  }

  Widget _browse() {
    return Column(children: [
      Padding(
        padding: const EdgeInsets.fromLTRB(Space.gutter, Space.md, Space.gutter, Space.sm),
        child: SegmentedPills<_Tab>(
          values: _Tab.values,
          selected: _tab,
          expand: true,
          labelOf: (t) => switch (t) {
            _Tab.recent => 'Recent',
            _Tab.mine => 'My foods',
            _Tab.recipes => 'Recipes',
            _Tab.meals => 'Meals',
          },
          onChanged: (t) => setState(() => _tab = t),
        ),
      ),
      Expanded(
        child: switch (_tab) {
          _Tab.recent => _foodList(ref.watch(recentFoodsProvider), 'No recent foods', 'Foods you log appear here for quick access.'),
          _Tab.mine => _foodList(ref.watch(customFoodsProvider), 'No custom foods', 'Create foods from nutrition labels or your own data.'),
          _Tab.recipes => _recipes(),
          _Tab.meals => _meals(),
        },
      ),
    ]);
  }

  Widget _foodList(AsyncValue<List<Food>> value, String emptyTitle, String emptyMessage) => AsyncView(
        value: value,
        data: (foods) => foods.isEmpty
            ? EmptyState(icon: Icons.restaurant_menu_rounded, title: emptyTitle, message: emptyMessage)
            : ListView(padding: const EdgeInsets.only(bottom: 120), children: [
                for (final f in foods)
                  _FoodTile(
                    item: f.toItem(),
                    onTap: () async => _pick(await ref.read(nutritionRepositoryProvider).foodItem(f.id) ?? f.toItem()),
                  ),
              ]),
      );

  Widget _recipes() => AsyncView(
        value: ref.watch(recipesProvider),
        data: (recipes) => recipes.isEmpty
            ? EmptyState(
                icon: Icons.menu_book_outlined,
                title: 'No recipes',
                message: 'Combine foods into a recipe and log it by the serving.',
                actionLabel: 'Create recipe',
                onAction: () => context.push('/nutrition/recipes/new'),
              )
            : ListView(padding: const EdgeInsets.only(bottom: 120), children: [
                for (final r in recipes)
                  ListTile(
                    title: Text(r.recipe.name),
                    subtitle: Text(
                      '${number(r.recipe.servings)} servings · ${kcal(r.perServing.kcal)} kcal per serving${r.total.isIncomplete ? ' · incomplete' : ''}',
                    ),
                    trailing: IconButton(
                      tooltip: 'Edit recipe',
                      icon: const Icon(Icons.edit_outlined),
                      onPressed: () => context.push('/nutrition/recipes/${r.recipe.id}'),
                    ),
                    onTap: () => _logRecipe(r),
                  ),
              ]),
      );

  Future<void> _logRecipe(RecipeWithIngredients r) async {
    final servings = await promptNumber(context, title: r.recipe.name, label: 'Servings', initial: 1, confirmLabel: 'Add', min: 0.05, max: 50);
    if (servings == null || servings <= 0) return;
    await ref.read(nutritionRepositoryProvider).logRecipe(recipe: r, servings: servings, meal: _meal, day: _day);
    if (mounted) ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text('Added ${r.recipe.name}')));
  }

  Widget _meals() => AsyncView(
        value: ref.watch(savedMealsProvider),
        data: (meals) => meals.isEmpty
            ? const EmptyState(icon: Icons.bookmark_border_rounded, title: 'No saved meals', message: 'Use “Save as meal” on any meal in your diary to reuse it with one tap.')
            : ListView(padding: const EdgeInsets.only(bottom: 120), children: [
                for (final m in meals)
                  ListTile(
                    title: Text(m.meal.name),
                    subtitle: Text('${m.items.length} items · ${kcal(m.totals.kcal)} kcal${m.totals.isIncomplete ? '*' : ''}'),
                    trailing: IconButton(
                      tooltip: 'Delete saved meal',
                      icon: const Icon(Icons.delete_outline_rounded),
                      onPressed: () => ref.read(nutritionRepositoryProvider).deleteSavedMeal(m.meal.id),
                    ),
                    onTap: () async {
                      await ref.read(nutritionRepositoryProvider).logSavedMeal(m, slot: _meal, day: _day);
                      if (mounted) ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text('Added ${m.meal.name}')));
                    },
                  ),
              ]),
      );
}

class _FoodTile extends StatelessWidget {
  const _FoodTile({required this.item, required this.onTap});
  final FoodItem item;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final n = item.per100g;
    final serving = item.servings.where((s) => s.grams != 100).firstOrNull;
    return ListTile(
      onTap: onTap,
      title: Text(item.name, maxLines: 1, overflow: TextOverflow.ellipsis),
      subtitle: Row(children: [
        ProvenanceBadge(item.provenance, compact: true, incomplete: n.isIncomplete),
        const SizedBox(width: Space.sm),
        Expanded(
          child: Text(
            [
              ?item.brand,
              if (serving != null) '${kcal(n.kcal == null ? null : n.kcal! * serving.grams / 100)} kcal / ${serving.label}' else '${kcal(n.kcal)} kcal / 100 g',
            ].join(' · '),
            maxLines: 1,
            overflow: TextOverflow.ellipsis,
          ),
        ),
      ]),
      trailing: const Icon(Icons.add_circle_outline_rounded),
    );
  }
}

/// Camera barcode scanner. Returns the scanned code.
class BarcodeScanScreen extends ConsumerStatefulWidget {
  const BarcodeScanScreen({super.key});

  @override
  ConsumerState<BarcodeScanScreen> createState() => _BarcodeScanScreenState();
}

class _BarcodeScanScreenState extends ConsumerState<BarcodeScanScreen> {
  final _controller = MobileScannerController(formats: MobileScannerBarcodeImageReader.formats);
  final _manual = TextEditingController();
  bool _done = false;

  @override
  void dispose() {
    _controller.dispose();
    _manual.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Scan barcode'), actions: [
        TextButton.icon(
          onPressed: () async {
            final code = await readBarcodeFromPhoto(context, ref);
            if (code != null && context.mounted && !_done) {
              _done = true;
              Navigator.pop(context, code);
            }
          },
          icon: const Icon(Icons.photo_camera_outlined),
          label: const Text('Use a photo'),
        ),
      ]),
      body: Column(children: [
        Expanded(
          child: ClipRRect(
            child: MobileScanner(
              controller: _controller,
              errorBuilder: (context, error) => EmptyState(
                icon: Icons.no_photography_outlined,
                title: 'Camera unavailable',
                message: error.errorCode == MobileScannerErrorCode.permissionDenied
                    ? 'Allow camera access in Settings to scan barcodes, or type the number below.'
                    : 'Scanning isn\'t available on this device. Type the barcode number below.',
              ),
              onDetect: (capture) {
                if (_done) return;
                final code = capture.barcodes.map((b) => b.rawValue).whereType<String>().firstOrNull;
                if (code == null) return;
                _done = true;
                Navigator.pop(context, code);
              },
            ),
          ),
        ),
        SafeArea(
          top: false,
          child: Padding(
            padding: const EdgeInsets.all(Space.gutter),
            child: Row(children: [
              Expanded(child: NumberField(controller: _manual, label: 'Or enter barcode', decimals: false)),
              const SizedBox(width: Space.sm),
              FilledButton(
                onPressed: () {
                  final code = _manual.text.trim();
                  if (code.length >= 6) Navigator.pop(context, code);
                },
                child: const Text('Look up'),
              ),
            ]),
          ),
        ),
      ]),
    );
  }
}

/// Takes a photo and returns the barcode in it, or tells the user why not.
Future<String?> readBarcodeFromPhoto(BuildContext context, WidgetRef ref) async {
  final photo = await ref.read(photoPickerProvider).pick(ImageSource.camera);
  if (photo == null) return null;
  String? code;
  try {
    code = await ref.read(barcodeImageReaderProvider).read(photo);
  } on Exception {
    code = null;
  }
  if (code == null && context.mounted) {
    ScaffoldMessenger.of(context).showSnackBar(
      const SnackBar(content: Text('No barcode found in the photo. Hold the phone closer so the lines fill the frame, or type the number.')),
    );
  }
  return code;
}
