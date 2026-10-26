import 'package:flutter/foundation.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../content/content_providers.dart';
import 'vision_foods.dart';
import 'vision_result.dart';

/// Photo analysis on the device (Apple Vision on iPhone and Mac). It needs no
/// account, key or network, and the photo never leaves the device.
abstract interface class OnDeviceVision {
  bool get available;

  /// [classify] finds what food the photo shows; [text] reads printed text.
  Future<VisionResult> analyze(Uint8List image, {bool classify = true, bool text = true});
}

class VisionException implements Exception {
  const VisionException(this.message);
  final String message;

  @override
  String toString() => message;
}

class MethodChannelVision implements OnDeviceVision {
  const MethodChannelVision();

  static const _channel = MethodChannel('forma/vision');

  @override
  bool get available => !kIsWeb && (defaultTargetPlatform == TargetPlatform.iOS || defaultTargetPlatform == TargetPlatform.macOS);

  @override
  Future<VisionResult> analyze(Uint8List image, {bool classify = true, bool text = true}) async {
    if (!available) throw const VisionException('Photo recognition needs an iPhone or a Mac.');
    try {
      final reply = await _channel.invokeMapMethod<Object?, Object?>('analyze', {'image': image, 'classify': classify, 'text': text});
      return VisionResult.fromJson(reply ?? const {});
    } on PlatformException catch (e) {
      throw VisionException(e.message ?? 'The photo could not be analysed.');
    } on MissingPluginException {
      throw const VisionException('Photo recognition isn\'t available in this version of the app. Install the latest build.');
    }
  }
}

final onDeviceVisionProvider = Provider<OnDeviceVision>((ref) => const MethodChannelVision());

final visionFoodMatcherProvider = Provider<VisionFoodMatcher>((ref) => VisionFoodMatcher(ref.watch(contentFoodsProvider)));
