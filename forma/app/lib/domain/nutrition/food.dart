import '../provenance.dart';
import 'nutrients.dart';

class ServingOption {
  const ServingOption(this.label, this.grams);
  final String label;
  final double grams;
}

/// A food from any source, before or after it is saved locally.
class FoodItem {
  const FoodItem({
    required this.name,
    required this.source,
    required this.provenance,
    required this.per100g,
    this.localId,
    this.brand,
    this.sourceRef,
    this.servings = const [],
    this.imageUrl,
  });

  final String? localId;
  final String name;
  final String? brand;

  /// off | usda | custom | ai | forma
  final String source;

  /// Barcode, FoodData Central id, …
  final String? sourceRef;
  final Provenance provenance;
  final Nutrients per100g;
  final List<ServingOption> servings;
  final String? imageUrl;

  String get sourceLabel => switch (source) {
        'off' => 'Open Food Facts',
        'usda' => 'USDA FoodData Central',
        'custom' => 'Your food',
        'ai' => 'AI photo estimate',
        'forma' => 'Forma reference data',
        _ => source,
      };

  Nutrients forGrams(double grams) => per100g.scale(grams / 100);

  List<String> get warnings => plausibilityWarnings(per100g);
}
