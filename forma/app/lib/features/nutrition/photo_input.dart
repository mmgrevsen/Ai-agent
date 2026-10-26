import 'package:flutter/foundation.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:image_picker/image_picker.dart';
import 'package:mobile_scanner/mobile_scanner.dart';

import '../../app/providers.dart';

/// A photo from the camera or library.
class PickedPhoto {
  const PickedPhoto({required this.bytes, required this.mimeType, this.path});
  final Uint8List bytes;
  final String mimeType;

  /// File path when the platform has one (needed for barcode decoding).
  final String? path;
}

/// Camera / library access, behind an interface so flows can be tested.
abstract interface class PhotoPicker {
  Future<PickedPhoto?> pick(ImageSource source);
}

class ImagePickerPhotoPicker implements PhotoPicker {
  const ImagePickerPhotoPicker();

  @override
  Future<PickedPhoto?> pick(ImageSource source) async {
    // 1600 px keeps small print (scale displays, labels) legible.
    final file = await ImagePicker().pickImage(source: source, maxWidth: 1600, maxHeight: 1600, imageQuality: 85);
    if (file == null) return null;
    return PickedPhoto(bytes: await file.readAsBytes(), mimeType: file.mimeType ?? 'image/jpeg', path: file.path);
  }
}

/// Finds a product barcode in a still photo.
abstract interface class BarcodeImageReader {
  Future<String?> read(PickedPhoto photo);
}

class MobileScannerBarcodeImageReader implements BarcodeImageReader {
  const MobileScannerBarcodeImageReader();

  static const formats = [BarcodeFormat.ean13, BarcodeFormat.ean8, BarcodeFormat.upcA, BarcodeFormat.upcE];

  @override
  Future<String?> read(PickedPhoto photo) async {
    final path = photo.path;
    if (path == null) return null;
    final controller = MobileScannerController(formats: formats);
    try {
      final capture = await controller.analyzeImage(path, formats: formats);
      return capture?.barcodes.map((b) => b.rawValue).whereType<String>().firstOrNull;
    } finally {
      await controller.dispose();
    }
  }
}

final photoPickerProvider = Provider<PhotoPicker>((ref) => const ImagePickerPhotoPicker());

/// The phone has a camera the app can open. On a Mac photos are chosen from
/// files (or Photos) instead.
final photoCameraAvailableProvider = Provider<bool>((ref) => !kIsWeb && defaultTargetPlatform != TargetPlatform.macOS);

/// Camera where there is one, otherwise the photo library.
ImageSource defaultPhotoSource(WidgetRef ref) => ref.read(photoCameraAvailableProvider) ? ImageSource.camera : ImageSource.gallery;

final barcodeImageReaderProvider = Provider<BarcodeImageReader>((ref) => const MobileScannerBarcodeImageReader());

/// Photo estimates and label reading run on the server and need an account.
final photoAiAvailableProvider = Provider<bool>((ref) {
  ref.watch(authUserProvider);
  return ref.watch(backendProvider).signedIn;
});
