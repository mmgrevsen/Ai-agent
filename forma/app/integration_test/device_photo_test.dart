import 'dart:convert';
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
import 'package:forma/data/remote/food_api.dart';
import 'package:forma/data/repositories/settings_repository.dart';
import 'package:forma/domain/nutrition/food.dart';
import 'package:forma/features/nutrition/device_photo_log.dart';
import 'package:forma/features/nutrition/nutrition_providers.dart';
import 'package:forma/features/nutrition/photo_input.dart';
import 'package:forma/features/nutrition/vision/on_device_vision.dart';
import 'package:forma/features/nutrition/vision/vision_result.dart';
import 'package:image_picker/image_picker.dart';
import 'package:integration_test/integration_test.dart';

import '../test/helpers.dart';
import '../test/vision/vision_test_helpers.dart';

// A real 1×1 PNG, so the photo preview decodes like a camera photo would.
final _png = base64Decode('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==');

class _FakePicker implements PhotoPicker {
  final sources = <ImageSource>[];
  @override
  Future<PickedPhoto?> pick(ImageSource source) async {
    sources.add(source);
    return PickedPhoto(bytes: Uint8List.fromList(_png), mimeType: 'image/png', path: '/tmp/photo.png');
  }
}

class _FakeReader implements BarcodeImageReader {
  String? code = '5701234567899';
  @override
  Future<String?> read(PickedPhoto photo) async => code;
}

/// Stands in for Apple Vision with results shaped like the real ones.
class _FakeVision implements OnDeviceVision {
  VisionResult next = const VisionResult();
  final classifyFlags = <bool>[];

  @override
  bool get available => true;

  @override
  Future<VisionResult> analyze(Uint8List image, {bool classify = true, bool text = true}) async {
    classifyFlags.add(classify);
    return next;
  }
}

class _OfflineFoods implements FoodDataSource {
  @override
  Future<FoodItem?> barcode(String code) async => null;

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

  testWidgets('photo recognised on the device: suggestions, kitchen scale, plate, meal, label photo', (tester) async {
    final db = AppDatabase(NativeDatabase.memory());
    await bootstrapData(db, exercisesJson: await File('assets/exercises.json').readAsString());
    await SettingsRepository(db).updateProfile(const ProfilesCompanion(displayName: Value('Sam'), onboardingCompleted: Value(true)));
    final picker = _FakePicker();
    final vision = _FakeVision();
    final reader = _FakeReader();
    final content = testContentBundle().foods;
    final eggsAndBacon = content.singleWhere((f) => f.id == 'meal-aeg-og-bacon');

    tester.view.physicalSize = const Size(1179, 2556);
    tester.view.devicePixelRatio = 3;
    addTearDown(tester.view.reset);
    await tester.pumpWidget(ProviderScope(
      overrides: [
        databaseProvider.overrideWithValue(db),
        contentServiceProvider.overrideWithValue(await testContentService(db)),
        photoPickerProvider.overrideWithValue(picker),
        barcodeImageReaderProvider.overrideWithValue(reader),
        onDeviceVisionProvider.overrideWithValue(vision),
        photoAiAvailableProvider.overrideWithValue(false),
        foodDataSourceProvider.overrideWithValue(_OfflineFoods()),
      ],
      child: const FormaApp(),
    ));
    await until(tester, find.text('Overview'));

    // --- 1. Breakfast on a kitchen scale: Vision sees eggs and bacon and reads "245".
    vision.next = VisionResult(
      labels: const [VisionLabel('food', 0.93), VisionLabel('fried_egg', 0.72), VisionLabel('bacon', 0.55), VisionLabel('table', 0.4)],
      lines: [cell('TARE', 0.15, 0.82, h: 0.03), cell('245', 0.37, 0.73, h: 0.09)],
    );
    await tap(tester, find.text('Nutrition').last);
    await tap(tester, find.text('Add food').first);
    await tap(tester, find.text('Photo'));
    await until(tester, find.text('Snap your plate'));
    expect(find.textContaining('isn’t uploaded'), findsOneWidget);
    await tap(tester, find.text('Take photo'));
    await until(tester, find.text('Spejlæg · 72 %'));
    expect(find.text('Bacon · 55 %'), findsOneWidget);
    expect(find.textContaining('food · '), findsNothing, reason: 'generic labels are not offered as foods');
    // A bare number is offered, not used silently.
    expect(find.text('Scale shows 245 g?'), findsOneWidget);
    await tap(tester, find.byType(Switch).first);
    expect(find.text('Used as the weight of the first food you pick.'), findsOneWidget);

    // Pick the calculated meal; the scale's weight becomes its portion.
    await tap(tester, find.text(eggsAndBacon.name));
    final eggKcal = eggsAndBacon.kcal! * 2.45;
    await until(tester, find.text('Log 1 food · ${eggKcal.round()} kcal'));
    final list = find.descendant(of: find.byType(DevicePhotoLogScreen), matching: find.byType(Scrollable)).first;
    await tester.scrollUntilVisible(find.text('ON YOUR PLATE'), 300, scrollable: list);
    await tester.scrollUntilVisible(find.widgetWithText(TextFormField, 'Grams'), 200, scrollable: list);
    expect(fieldText(tester, 'Grams'), '245');
    expect(find.byTooltip('Weighed on the scale'), findsOneWidget);

    // Something Vision didn't see: search and add toast.
    final search = find.widgetWithText(TextField, 'Something else? Search all foods');
    await tester.scrollUntilVisible(search, 200, scrollable: list);
    await tester.enterText(search, 'franskbrød');
    await tester.pump(const Duration(milliseconds: 500));
    await until(tester, find.text('Franskbrød'));
    await tap(tester, find.text('Franskbrød'));
    await until(tester, find.textContaining('Log 2 foods'));
    await tester.scrollUntilVisible(find.text('Save as a meal'), 300, scrollable: list);
    // Two foods on a 245 g scale reading: the plate total is shown against it.
    expect(find.textContaining('Scale 245 g · plate'), findsOneWidget);
    final gramFields = find.widgetWithText(TextFormField, 'Grams');
    await tester.enterText(gramFields.at(1), '30');
    await tester.pump(const Duration(milliseconds: 300));
    final mealName = find.widgetWithText(TextField, 'Meal name');
    await tester.scrollUntilVisible(mealName, 200, scrollable: list);
    await tester.enterText(mealName, 'Weekend breakfast');
    await tap(tester, find.textContaining('Log 2 foods'));
    await until(tester, find.textContaining('no new photo needed'));

    final entries = await (db.select(db.nutritionEntries)..where((e) => e.deletedAt.isNull())).get();
    expect(entries, hasLength(2));
    final egg = entries.singleWhere((e) => e.name == eggsAndBacon.name);
    expect(egg.grams, 245);
    expect(egg.kcal, closeTo(eggKcal, 0.01));
    expect(egg.provenance, 'calculated', reason: 'values from the food data, not an AI estimate');
    final toast = entries.singleWhere((e) => e.name == 'Franskbrød');
    expect(toast.grams, 30);
    expect(toast.provenance, 'verified');
    final meals = await db.select(db.savedMeals).get();
    expect(meals.map((m) => m.name), ['Weekend breakfast']);
    expect(await db.select(db.savedMealItems).get(), hasLength(2));
    expect(vision.classifyFlags, [true]);

    // --- 2. Next time the same food is first under "Logged before".
    await tap(tester, find.text('Add food').first);
    await tap(tester, find.text('Photo'));
    await tap(tester, find.text('Take photo'));
    await until(tester, find.text('LOGGED BEFORE'));

    // --- 3. A photo Vision can't place offers search instead of a guess.
    vision.next = const VisionResult(labels: [VisionLabel('food', 0.8), VisionLabel('plate', 0.6)]);
    await tap(tester, find.text('New photo'));
    await until(tester, find.textContaining('couldn’t tell which food'));
    expect(find.widgetWithText(TextField, 'Search for the food'), findsOneWidget);
    await tester.pageBack();
    await tester.pump(const Duration(milliseconds: 600));

    // --- 4. Nutrition label photographed: read on the device, barcode from the same photo.
    vision.next = VisionResult(
      labels: const [VisionLabel('document', 0.4)],
      lines: table([
        ['Næringsindhold'],
        [null, 'pr. 100 g', 'pr. portion (40 g)'],
        ['Energi', '1431 kJ / 342 kcal', '572 kJ / 137 kcal'],
        ['Fedt', '2,1 g', '0,8 g'],
        ['heraf mættede fedtsyrer', '0,4 g', '0,2 g'],
        ['Kulhydrat', '64 g', '26 g'],
        ['heraf sukkerarter', '1,2 g', '0,5 g'],
        ['Kostfibre', '9,5 g', '3,8 g'],
        ['Protein', '12 g', '4,8 g'],
        ['Salt', '0,02 g', '0,01 g'],
      ]),
    );
    await tap(tester, find.text('Nutrition label'));
    await until(tester, find.textContaining('Read from your photo'));
    expect(vision.classifyFlags.last, isFalse, reason: 'a label photo only needs the text');
    expect(fieldText(tester, 'Calories'), '342');
    expect(fieldText(tester, 'Protein'), '12');
    expect(fieldText(tester, 'Carbs'), '64');
    expect(fieldText(tester, 'Fat'), '2.1');
    expect(fieldText(tester, 'Fiber'), '9.5');
    expect(fieldText(tester, 'Barcode (optional)'), '5701234567899');
    expect(fieldText(tester, 'Size'), '40');
    await tester.enterText(find.widgetWithText(TextFormField, 'Name'), 'Knækbrød');
    await tap(tester, find.widgetWithText(FilledButton, 'Save'));
    await until(tester, find.text('1 portion (40 g)'));
    await tap(tester, find.textContaining('Add ·'));
    await until(tester, find.textContaining('Added Knækbrød'));
    final crisp = (await db.select(db.nutritionEntries).get()).singleWhere((e) => e.name == 'Knækbrød');
    expect(crisp.grams, 40);
    expect(crisp.kcal, closeTo(136.8, 0.01));

    // --- 5. A photo without a nutrition table says so.
    vision.next = VisionResult(lines: [cell('Tilbud 3 for 50', 0.1, 0.1)]);
    await tap(tester, find.text('Nutrition label'));
    await until(tester, find.textContaining('No nutrition values could be read'));

    await tester.pumpWidget(const SizedBox());
    await tester.pump(const Duration(milliseconds: 500));
    await db.close();
  });
}
