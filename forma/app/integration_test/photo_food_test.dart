import 'dart:io';
import 'dart:typed_data';

import 'package:drift/drift.dart' show Value;
import 'package:drift/native.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:forma/app/app.dart';
import 'package:forma/app/bootstrap.dart';
import 'package:forma/app/providers.dart';
import 'package:forma/content/content_providers.dart';
import 'package:forma/data/db/app_database.dart';
import 'package:forma/data/remote/ai_api.dart';
import 'package:forma/data/remote/backend.dart';
import 'package:forma/data/remote/food_api.dart';
import 'package:forma/data/repositories/settings_repository.dart';
import 'package:forma/domain/nutrition/food.dart';
import 'package:forma/features/nutrition/nutrition_providers.dart';
import 'package:forma/features/nutrition/photo_input.dart';
import 'package:image_picker/image_picker.dart';
import 'package:integration_test/integration_test.dart';

import '../test/helpers.dart';

class _FakePicker implements PhotoPicker {
  int picks = 0;
  @override
  Future<PickedPhoto?> pick(ImageSource source) async {
    picks++;
    return PickedPhoto(bytes: Uint8List.fromList([1, 2, 3]), mimeType: 'image/jpeg', path: '/tmp/photo.jpg');
  }
}

class _FakeReader implements BarcodeImageReader {
  _FakeReader(this.code);
  String? code;
  @override
  Future<String?> read(PickedPhoto photo) async => code;
}

/// Stands in for the food-photo function with replies shaped exactly like
/// its normalised output.
class _FakeAi extends AiApi {
  _FakeAi() : super(Backend(null));
  int photoCalls = 0;
  int labelCalls = 0;

  @override
  Future<PhotoEstimateResult> estimatePhoto(Uint8List bytes, {required String mimeType, String? hint}) async {
    photoCalls++;
    return parsePhotoEstimate({
      'items': [
        {'name': 'Rice', 'grams': 245, 'gramsLow': 240.1, 'gramsHigh': 249.9, 'kcal': 318.5, 'protein': 6.1, 'carbs': 68.6, 'fat': 1.2, 'fiber': null, 'confidence': 'medium', 'notes': null, 'weighed': true},
        {'name': 'Apple', 'grams': 180, 'gramsLow': 150, 'gramsHigh': 210, 'kcal': 94, 'protein': 0.4, 'carbs': 25, 'fat': 0.4, 'fiber': 4.3, 'confidence': 'high', 'notes': 'Beside the scale', 'weighed': false},
      ],
      'scale': {'grams': 245, 'applied': true},
      'caveats': [],
    });
  }

  @override
  Future<LabelReading> readLabel(Uint8List bytes, {required String mimeType}) async {
    labelCalls++;
    return parseLabelReading({
      'name': 'Skyr naturel',
      'brand': 'Arla',
      'per100g': {'kcal': 63, 'protein': 11, 'carbs': 4, 'fat': 0.2, 'fiber': null},
      'serving': {'label': '1 cup', 'grams': 150},
      'barcode': null,
      'warnings': [],
      'caveats': [],
    });
  }
}

class _OfflineFoods implements FoodDataSource {
  int barcodeLookups = 0;
  @override
  Future<FoodItem?> barcode(String code) async {
    barcodeLookups++;
    return null;
  }

  @override
  Future<List<FoodItem>> search(String query, {int page = 1}) async => const [];
}

void main() {
  IntegrationTestWidgetsFlutterBinding.ensureInitialized();

  Future<void> until(WidgetTester tester, Finder f, {Duration timeout = const Duration(seconds: 20)}) async {
    final end = DateTime.now().add(timeout);
    while (f.evaluate().isEmpty) {
      if (DateTime.now().isAfter(end)) fail('Timed out waiting for $f');
      await tester.pump(const Duration(milliseconds: 100));
    }
  }

  Future<void> tap(WidgetTester tester, Finder f) async {
    await until(tester, f);
    await tester.ensureVisible(f.first);
    await tester.pump(const Duration(milliseconds: 300));
    await tester.tap(f.first);
    await tester.pump(const Duration(milliseconds: 600));
  }

  String fieldText(WidgetTester tester, String label) =>
      tester.widget<TextField>(find.descendant(of: find.widgetWithText(TextFormField, label), matching: find.byType(TextField)).first).controller!.text;

  testWidgets('photo with a kitchen scale, reuse without a new photo, barcode and label photos', (tester) async {
    final db = AppDatabase(NativeDatabase.memory());
    await bootstrapData(db, exercisesJson: await File('assets/exercises.json').readAsString());
    await SettingsRepository(db).updateProfile(const ProfilesCompanion(displayName: Value('Sam'), onboardingCompleted: Value(true)));
    final picker = _FakePicker();
    final ai = _FakeAi();
    final reader = _FakeReader('5701234567899');
    final foods = _OfflineFoods();

    tester.view.physicalSize = const Size(1179, 2556);
    tester.view.devicePixelRatio = 3;
    addTearDown(tester.view.reset);
    await tester.pumpWidget(ProviderScope(
      overrides: [
        databaseProvider.overrideWithValue(db),
        contentServiceProvider.overrideWithValue(await testContentService(db)),
        photoPickerProvider.overrideWithValue(picker),
        barcodeImageReaderProvider.overrideWithValue(reader),
        aiApiProvider.overrideWithValue(ai),
        photoAiAvailableProvider.overrideWithValue(true),
        foodDataSourceProvider.overrideWithValue(foods),
      ],
      child: const FormaApp(),
    ));
    await until(tester, find.text('Overview'));

    // --- 1. Photo of a plate on a kitchen scale.
    await tap(tester, find.text('Nutrition').last);
    await tap(tester, find.text('Add food').first);
    await tap(tester, find.text('Photo'));
    await tap(tester, find.text('Take photo'));
    await until(tester, find.text('Scale reading used: 245 g'));
    expect(find.textContaining('Weighed on the scale'), findsOneWidget);
    expect(find.textContaining('high confidence · likely 150–210 g'), findsOneWidget);

    // Correcting the apple's weight rescales its nutrients.
    final appleGrams = find.widgetWithText(TextFormField, 'Grams').at(1);
    await tester.enterText(appleGrams, '90');
    await tester.pump(const Duration(milliseconds: 300));
    final kcalFields = find.widgetWithText(TextFormField, 'kcal');
    expect(tester.widget<TextField>(find.descendant(of: kcalFields.at(1), matching: find.byType(TextField))).controller!.text, '47');

    // Two foods → offered as a reusable meal.
    final list = find.byType(Scrollable).first;
    final mealName = find.widgetWithText(TextField, 'Meal name');
    await tester.scrollUntilVisible(mealName, 200, scrollable: list);
    await tester.enterText(mealName, 'Rice and apple');
    await tester.scrollUntilVisible(find.text('Log selected'), 200, scrollable: list);
    await tap(tester, find.text('Log selected'));
    await until(tester, find.textContaining('no new photo needed'));

    var entries = await (db.select(db.nutritionEntries)..where((e) => e.deletedAt.isNull())).get();
    expect(entries.length, 2);
    final rice = entries.singleWhere((e) => e.name == 'Rice');
    expect(rice.grams, 245);
    expect(rice.kcal, closeTo(319, 0.01)); // shown and stored rounded to whole kcal
    expect(rice.provenance, 'aiEstimate');
    final apple = entries.singleWhere((e) => e.name == 'Apple');
    expect(apple.grams, 90);
    expect(apple.kcal, closeTo(47, 0.01));
    expect(apple.fiberG, closeTo(2.15, 0.01));
    expect(ai.photoCalls, 1);

    // --- 2. Log the rice again from Recent: no camera, no AI call.
    await tap(tester, find.text('Add food').first);
    await tap(tester, find.text('Recent'));
    await tap(tester, find.text('Rice'));
    await until(tester, find.text('weighed portion (245 g)'));
    await tap(tester, find.textContaining('Add ·'));
    final saved = await db.select(db.savedMeals).get();
    expect(saved.map((m) => m.name), ['Rice and apple']);
    await tap(tester, find.text('Meals'));
    await tap(tester, find.text('Rice and apple'));
    await until(tester, find.text('Added Rice and apple'));
    entries = await (db.select(db.nutritionEntries)..where((e) => e.deletedAt.isNull())).get();
    expect(entries.where((e) => e.name == 'Rice').map((e) => e.kcal!.round()), [319, 319, 319]);
    expect(entries.where((e) => e.name == 'Apple').map((e) => e.kcal!.round()), [47, 47]);
    expect(picker.picks, 1, reason: 'reuse needs no new photo');
    expect(ai.photoCalls, 1);

    // --- 3. Barcode photographed on the back of a package that isn't in the database.
    await tap(tester, find.text('Barcode photo'));
    await until(tester, find.text('Product not found'));
    expect(find.textContaining('5701234567899'), findsOneWidget);
    await tap(tester, find.text('Photo of label'));
    await until(tester, find.textContaining('Read from your photo'));
    expect(fieldText(tester, 'Name'), 'Skyr naturel');
    expect(fieldText(tester, 'Brand (optional)'), 'Arla');
    expect(fieldText(tester, 'Barcode (optional)'), '5701234567899');
    expect(fieldText(tester, 'Calories'), '63');
    expect(fieldText(tester, 'Fiber'), '', reason: 'not printed → left empty, not 0');
    await tap(tester, find.widgetWithText(FilledButton, 'Save'));
    await until(tester, find.text('1 cup (150 g)'));
    await tap(tester, find.textContaining('Add ·'));
    await until(tester, find.textContaining('Added Skyr naturel'));
    final skyr = (await db.select(db.nutritionEntries).get()).singleWhere((e) => e.name == 'Skyr naturel');
    expect(skyr.grams, 150);
    expect(skyr.kcal, closeTo(94.5, 0.01));
    expect(skyr.fiberG, isNull);

    // --- 4. The next photo of the same barcode finds the saved product directly.
    final lookupsBefore = foods.barcodeLookups;
    await tap(tester, find.text('Barcode photo'));
    await until(tester, find.text('1 cup (150 g)'));
    expect(find.text('Product not found'), findsNothing);
    expect(foods.barcodeLookups, lookupsBefore, reason: 'found on the device, no network lookup');
    expect(ai.labelCalls, 1);
    await tester.tapAt(const Offset(20, 40)); // dismiss the sheet

    // --- 5. A photo without a readable barcode explains what to do.
    reader.code = null;
    await tester.pump(const Duration(milliseconds: 600));
    await tap(tester, find.text('Barcode photo'));
    await until(tester, find.textContaining('No barcode found in the photo'));

    await tester.pumpWidget(const SizedBox());
    await tester.pump(const Duration(milliseconds: 500));
    await db.close();
  });
}
