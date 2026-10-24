import 'dart:async';

import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';

/// Loads the app's real fonts so widget tests measure text like the device
/// does (the default test font draws every glyph as a wide box).
Future<void> testExecutable(FutureOr<void> Function() testMain) async {
  TestWidgetsFlutterBinding.ensureInitialized();
  final geist = FontLoader('Geist');
  for (final w in ['Regular', 'Medium', 'SemiBold', 'Bold']) {
    geist.addFont(rootBundle.load('assets/fonts/Geist-$w.ttf'));
  }
  await geist.load();
  final icons = FontLoader('MaterialIcons')..addFont(rootBundle.load('fonts/MaterialIcons-Regular.otf'));
  await icons.load();
  await testMain();
}
