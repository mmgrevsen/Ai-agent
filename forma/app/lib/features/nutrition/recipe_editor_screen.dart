import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../app/providers.dart';
import '../../core/theme/tokens.dart';
import '../../core/util/format.dart';
import '../../core/widgets/inputs.dart';
import '../../core/widgets/primitives.dart';
import '../../core/widgets/prompts.dart';
import '../../core/widgets/states.dart';
import '../../data/db/app_database.dart';
import '../../data/remote/food_api.dart';
import '../../data/repositories/nutrition_repository.dart';
import '../../domain/nutrition/food.dart';
import '../../domain/nutrition/nutrients.dart';
import 'nutrition_providers.dart';

class RecipeEditorScreen extends ConsumerStatefulWidget {
  const RecipeEditorScreen({super.key, this.recipeId});
  final String? recipeId;

  @override
  ConsumerState<RecipeEditorScreen> createState() => _RecipeEditorScreenState();
}

class _RecipeEditorScreenState extends ConsumerState<RecipeEditorScreen> {
  final _name = TextEditingController();
  final _servings = TextEditingController(text: '4');
  final List<(Food, double)> _ingredients = [];
  bool _loading = true;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    if (widget.recipeId != null) {
      final all = await ref.read(nutritionRepositoryProvider).recipes();
      final r = all.where((x) => x.recipe.id == widget.recipeId).firstOrNull;
      if (r != null) {
        _name.text = r.recipe.name;
        _servings.text = number(r.recipe.servings);
        _ingredients.addAll([for (final (i, f) in r.ingredients) (f, i.grams)]);
      }
    }
    if (mounted) setState(() => _loading = false);
  }

  @override
  void dispose() {
    _name.dispose();
    _servings.dispose();
    super.dispose();
  }

  NutrientTotals get _total => NutrientTotals.of([for (final (f, g) in _ingredients) f.per100g.scale(g / 100)]);

  Future<void> _save() async {
    final servings = parseNumber(_servings.text);
    if (_name.text.trim().isEmpty || servings == null || servings <= 0 || _ingredients.isEmpty) {
      ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('Add a name, servings and at least one ingredient.')));
      return;
    }
    await ref.read(nutritionRepositoryProvider).saveRecipe(
          id: widget.recipeId,
          name: _name.text,
          servings: servings,
          ingredients: [for (final (f, g) in _ingredients) (f.id, g)],
        );
    if (mounted) context.pop();
  }

  Future<void> _addIngredient() async {
    final item = await showModalBottomSheet<FoodItem>(
      context: context,
      isScrollControlled: true,
      useSafeArea: true,
      builder: (_) => const _IngredientSearch(),
    );
    if (item == null || !mounted) return;
    final grams = await promptNumber(context, title: item.name, label: 'Amount', unit: 'g', initial: item.servings.firstOrNull?.grams ?? 100, confirmLabel: 'Add', min: 0.1, max: 10000);
    if (grams == null || grams <= 0) return;
    final food = await ref.read(nutritionRepositoryProvider).saveFood(item);
    setState(() => _ingredients.add((food, grams)));
  }

  @override
  Widget build(BuildContext context) {
    if (_loading) return const Scaffold(body: LoadingState());
    final t = _total;
    final servings = parseNumber(_servings.text) ?? 1;
    return Scaffold(
      appBar: AppBar(
        title: Text(widget.recipeId == null ? 'New recipe' : 'Edit recipe'),
        actions: [
          if (widget.recipeId != null)
            IconButton(
              tooltip: 'Delete recipe',
              icon: const Icon(Icons.delete_outline_rounded),
              onPressed: () async {
                await ref.read(nutritionRepositoryProvider).deleteRecipe(widget.recipeId!);
                if (context.mounted) context.pop();
              },
            ),
          Padding(padding: const EdgeInsets.only(right: Space.md), child: FilledButton(onPressed: _save, child: const Text('Save'))),
        ],
      ),
      body: ListView(padding: const EdgeInsets.fromLTRB(Space.gutter, Space.sm, Space.gutter, 120), children: [
        TextField(controller: _name, decoration: const InputDecoration(labelText: 'Recipe name'), textCapitalization: TextCapitalization.sentences),
        const SizedBox(height: Space.md),
        NumberField(controller: _servings, label: 'Number of servings', onChanged: (_) => setState(() {})),
        const SizedBox(height: Space.lg),
        FCard(
          child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
            Row(children: [
              const Eyebrow('Per serving'),
              const Spacer(),
              ProvenanceBadge(Provenance.calculated, compact: true, incomplete: t.isIncomplete),
            ]),
            const SizedBox(height: Space.sm),
            Text(
              '${kcal(t.kcal / servings)} kcal · P ${grams(t.proteinG / servings)} · C ${grams(t.carbsG / servings)} · F ${grams(t.fatG / servings)}',
              style: context.text.titleSmall,
            ),
            if (t.isIncomplete)
              Text('Some ingredients are missing ${t.incompleteFields.join(', ')} data.', style: context.text.bodySmall?.copyWith(color: context.colors.caution)),
          ]),
        ),
        const SectionHeader('Ingredients', padding: EdgeInsets.fromLTRB(0, Space.xl, 0, Space.sm)),
        for (final (i, (f, g)) in _ingredients.indexed)
          ListTile(
            contentPadding: EdgeInsets.zero,
            title: Text(f.name),
            subtitle: Text('${number(g)} g · ${kcal(f.kcal100 == null ? null : f.kcal100! * g / 100)} kcal'),
            trailing: IconButton(tooltip: 'Remove', icon: const Icon(Icons.close_rounded), onPressed: () => setState(() => _ingredients.removeAt(i))),
          ),
        const SizedBox(height: Space.sm),
        OutlinedButton.icon(onPressed: _addIngredient, icon: const Icon(Icons.add_rounded), label: const Text('Add ingredient')),
      ]),
    );
  }
}

class _IngredientSearch extends ConsumerStatefulWidget {
  const _IngredientSearch();

  @override
  ConsumerState<_IngredientSearch> createState() => _IngredientSearchState();
}

class _IngredientSearchState extends ConsumerState<_IngredientSearch> {
  final _q = TextEditingController();
  Timer? _debounce;
  List<FoodItem> _results = const [];
  String? _error;
  bool _busy = false;

  @override
  void dispose() {
    _debounce?.cancel();
    _q.dispose();
    super.dispose();
  }

  void _changed(String q) {
    _debounce?.cancel();
    _debounce = Timer(const Duration(milliseconds: 350), () async {
      if (q.trim().length < 2) return;
      setState(() {
        _busy = true;
        _error = null;
      });
      final local = await ref.read(nutritionRepositoryProvider).searchLocal(q);
      var remote = <FoodItem>[];
      try {
        remote = await ref.read(foodDataSourceProvider).search(q);
      } on FoodApiException catch (e) {
        _error = e.message;
      }
      if (!mounted) return;
      setState(() {
        _busy = false;
        _results = [...local.map((f) => f.toItem()), ...remote];
      });
    });
  }

  @override
  Widget build(BuildContext context) {
    return SizedBox(
      height: MediaQuery.sizeOf(context).height * 0.8,
      child: Column(children: [
        Padding(
          padding: const EdgeInsets.fromLTRB(Space.gutter, 0, Space.gutter, Space.sm),
          child: TextField(controller: _q, autofocus: true, onChanged: _changed, decoration: const InputDecoration(hintText: 'Search ingredient', prefixIcon: Icon(Icons.search_rounded))),
        ),
        if (_busy) const LinearProgressIndicator(minHeight: 2),
        if (_error != null) Padding(padding: const EdgeInsets.all(Space.sm), child: Text(_error!, style: context.text.bodySmall)),
        Expanded(
          child: ListView(children: [
            for (final r in _results)
              ListTile(
                title: Text(r.name),
                subtitle: Row(children: [
                  ProvenanceBadge(r.provenance, compact: true, incomplete: r.per100g.isIncomplete),
                  const SizedBox(width: Space.sm),
                  Text('${kcal(r.per100g.kcal)} kcal / 100 g'),
                ]),
                onTap: () => Navigator.pop(context, r),
              ),
          ]),
        ),
      ]),
    );
  }
}
