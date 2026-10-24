import 'dart:async';
import 'dart:convert';
import 'dart:io';

import 'package:http/http.dart' as http;

import '../../domain/nutrition/food.dart';
import '../../domain/nutrition/nutrients.dart';
import '../../domain/provenance.dart';
import 'backend.dart';

class FoodApiException implements Exception {
  const FoodApiException(this.message, {this.offline = false});
  final String message;
  final bool offline;

  @override
  String toString() => message;
}

/// A searchable food database.
abstract interface class FoodDataSource {
  Future<List<FoodItem>> search(String query, {int page = 1});

  /// Looks up a packaged product. Returns `null` when it is not in the database.
  Future<FoodItem?> barcode(String code);
}

const _offFields = 'code,product_name,product_name_en,generic_name,brands,nutriments,serving_size,serving_quantity,nutrition_data_per,image_front_small_url';

/// Open Food Facts (community-maintained, ODbL). No key required, but a
/// descriptive User-Agent is mandatory per their terms.
class OpenFoodFactsClient implements FoodDataSource {
  OpenFoodFactsClient({required this.userAgent, http.Client? client, this.host = 'world.openfoodfacts.org'})
      : _http = client ?? http.Client();

  final String userAgent;
  final String host;
  final http.Client _http;

  Future<Map<String, dynamic>> _get(Uri uri) async {
    try {
      final res = await _http.get(uri, headers: {'User-Agent': userAgent, 'Accept': 'application/json'}).timeout(const Duration(seconds: 12));
      if (res.statusCode == 404) return const {};
      if (res.statusCode == 429) throw const FoodApiException('Open Food Facts is rate-limiting requests. Try again in a minute.');
      if (res.statusCode >= 500) throw const FoodApiException('Open Food Facts is temporarily unavailable.');
      if (res.statusCode != 200) throw FoodApiException('Food search failed (${res.statusCode}).');
      return jsonDecode(utf8.decode(res.bodyBytes)) as Map<String, dynamic>;
    } on SocketException {
      throw const FoodApiException('You appear to be offline. Showing foods saved on this device.', offline: true);
    } on TimeoutException {
      throw const FoodApiException('Food search timed out. Check your connection.', offline: true);
    } on http.ClientException {
      throw const FoodApiException('Could not reach Open Food Facts.', offline: true);
    } on FormatException {
      throw const FoodApiException('Open Food Facts returned an unexpected response.');
    }
  }

  @override
  Future<List<FoodItem>> search(String query, {int page = 1}) async {
    if (query.trim().length < 2) return const [];
    final json = await _get(Uri.https(host, '/cgi/search.pl', {
      'search_terms': query.trim(),
      'search_simple': '1',
      'action': 'process',
      'json': '1',
      'page': '$page',
      'page_size': '25',
      'fields': _offFields,
    }));
    final products = (json['products'] as List<dynamic>? ?? const []).cast<Map<String, dynamic>>();
    return [for (final p in products) ?parseOffProduct(p)];
  }

  @override
  Future<FoodItem?> barcode(String code) async {
    final clean = code.replaceAll(RegExp(r'\D'), '');
    if (clean.length < 6) return null;
    final json = await _get(Uri.https(host, '/api/v2/product/$clean', {'fields': _offFields}));
    if (json['status'] != 1 || json['product'] is! Map) return null;
    final product = Map<String, dynamic>.from(json['product'] as Map)..putIfAbsent('code', () => clean);
    return parseOffProduct(product);
  }
}

double? _num(Object? v) {
  if (v is num) return v.toDouble();
  if (v is String) return double.tryParse(v.replaceAll(',', '.'));
  return null;
}

/// Converts an Open Food Facts product. Returns `null` when there is no name
/// or no usable nutrition data at all. Missing nutrients stay `null`.
FoodItem? parseOffProduct(Map<String, dynamic> p) {
  final name = [p['product_name'], p['product_name_en'], p['generic_name']]
      .whereType<String>()
      .map((s) => s.trim())
      .firstWhere((s) => s.isNotEmpty, orElse: () => '');
  if (name.isEmpty) return null;
  final n = p['nutriments'] is Map ? Map<String, dynamic>.from(p['nutriments'] as Map) : const <String, dynamic>{};

  var kcal = _num(n['energy-kcal_100g']);
  // Some products only report kJ; converting units is not estimation.
  final kj = _num(n['energy-kj_100g']) ?? _num(n['energy_100g']);
  if (kcal == null && kj != null) kcal = kj / 4.184;

  final per100 = Nutrients(
    kcal: kcal,
    proteinG: _num(n['proteins_100g']),
    carbsG: _num(n['carbohydrates_100g']),
    fatG: _num(n['fat_100g']),
    fiberG: _num(n['fiber_100g']),
  );
  if (per100.kcal == null && per100.proteinG == null && per100.carbsG == null && per100.fatG == null) return null;

  final perMl = (p['nutrition_data_per'] as String?)?.contains('ml') ?? false;
  final servingQty = _num(p['serving_quantity']);
  final servingLabel = (p['serving_size'] as String?)?.trim();
  final brand = (p['brands'] as String?)?.split(',').first.trim();

  return FoodItem(
    name: name,
    brand: brand == null || brand.isEmpty ? null : brand,
    source: 'off',
    sourceRef: (p['code'] as String?)?.trim(),
    provenance: Provenance.community,
    per100g: per100,
    imageUrl: p['image_front_small_url'] as String?,
    servings: [
      if (servingQty != null && servingQty > 0 && servingQty < 5000)
        ServingOption(servingLabel?.isNotEmpty == true ? servingLabel! : '1 serving', servingQty),
      ServingOption(perMl ? '100 ml' : '100 g', 100),
    ],
  );
}

/// Server-side aggregation (Open Food Facts + USDA FoodData Central). Keys
/// for USDA stay on the server.
class ServerFoodClient implements FoodDataSource {
  ServerFoodClient(this.backend);
  final Backend backend;

  @override
  Future<List<FoodItem>> search(String query, {int page = 1}) async {
    if (query.trim().length < 2) return const [];
    final res = await _call({'query': query.trim(), 'page': page});
    return [for (final f in (res['foods'] as List<dynamic>? ?? const [])) ?foodFromJson(f as Map<String, dynamic>)];
  }

  @override
  Future<FoodItem?> barcode(String code) async {
    final res = await _call({'barcode': code});
    final f = res['food'];
    return f is Map<String, dynamic> ? foodFromJson(f) : null;
  }

  Future<Map<String, dynamic>> _call(Map<String, dynamic> body) async {
    try {
      return await backend.invoke('food-search', body, timeout: const Duration(seconds: 15));
    } on BackendException catch (e) {
      throw FoodApiException(e.message, offline: e.status == null);
    } on SocketException {
      throw const FoodApiException('You appear to be offline. Showing foods saved on this device.', offline: true);
    }
  }
}

/// Parses the normalised food shape returned by the `food-search` function.
FoodItem? foodFromJson(Map<String, dynamic> j) {
  final name = j['name'] as String?;
  final n = j['per100g'];
  if (name == null || n is! Map) return null;
  return FoodItem(
    name: name,
    brand: j['brand'] as String?,
    source: j['source'] as String? ?? 'off',
    sourceRef: j['sourceRef'] as String?,
    provenance: Provenance.fromName(j['provenance'] as String?, fallback: Provenance.community),
    per100g: Nutrients(
      kcal: _num(n['kcal']),
      proteinG: _num(n['protein']),
      carbsG: _num(n['carbs']),
      fatG: _num(n['fat']),
      fiberG: _num(n['fiber']),
    ),
    servings: [
      for (final s in (j['servings'] as List<dynamic>? ?? const []))
        if (s is Map && s['label'] is String && _num(s['grams']) != null) ServingOption(s['label'] as String, _num(s['grams'])!),
    ],
  );
}
