// On-device photo analysis with Apple's Vision framework, shared by the iOS
// and macOS apps. It finds what food a photo shows and reads the text in it
// (nutrition labels, kitchen-scale displays). Nothing leaves the device, and
// no account or key is needed.
//
// The core (FormaVision) has no Flutter dependency so tool/vision/main.swift
// can run it on sample photos in CI. The plugin below exposes it to Dart on
// the "forma/vision" channel.
import CoreGraphics
import Foundation
import ImageIO
import Vision

enum FormaVision {
  struct Failure: Error {
    let message: String
  }

  /// Classifications below this confidence are noise.
  static let minLabelConfidence: Float = 0.03
  static let maxLabels = 30

  /// Text languages in priority order; the unsupported ones are skipped.
  static let preferredLanguages = ["da-DK", "nb-NO", "sv-SE", "de-DE", "en-US"]

  /// Returns `labels` ([{id, confidence}], best first) and `lines`
  /// ([{text, confidence, x, y, w, h}], boxes normalised with the origin top left).
  static func analyze(_ data: Data, classify: Bool = true, readText: Bool = true) throws -> [String: Any] {
    guard let source = CGImageSourceCreateWithData(data as CFData, nil),
          let image = CGImageSourceCreateImageAtIndex(source, 0, nil)
    else {
      throw Failure(message: "The photo could not be opened.")
    }
    let properties = CGImageSourceCopyPropertiesAtIndex(source, 0, nil) as? [CFString: Any]
    let rawOrientation = (properties?[kCGImagePropertyOrientation] as? UInt32) ?? 1
    let orientation = CGImagePropertyOrientation(rawValue: rawOrientation) ?? .up
    let handler = VNImageRequestHandler(cgImage: image, orientation: orientation, options: [:])

    let classifyRequest = VNClassifyImageRequest()
    let textRequest = VNRecognizeTextRequest()
    textRequest.recognitionLevel = .accurate
    textRequest.usesLanguageCorrection = true
    textRequest.recognitionLanguages = supportedLanguages(textRequest)

    var requests: [VNRequest] = []
    if classify { requests.append(classifyRequest) }
    if readText { requests.append(textRequest) }
    try handler.perform(requests)

    var labels: [[String: Any]] = []
    if classify {
      let observations = (classifyRequest.results ?? [])
        .filter { $0.confidence >= minLabelConfidence }
        .sorted { $0.confidence > $1.confidence }
        .prefix(maxLabels)
      labels = observations.map { ["id": $0.identifier, "confidence": Double($0.confidence)] }
    }

    var lines: [[String: Any]] = []
    if readText {
      for observation in textRequest.results ?? [] {
        guard let best = observation.topCandidates(1).first else { continue }
        let box = observation.boundingBox  // normalised, origin bottom left
        lines.append([
          "text": best.string,
          "confidence": Double(best.confidence),
          "x": Double(box.minX),
          "y": Double(1 - box.maxY),
          "w": Double(box.width),
          "h": Double(box.height),
        ])
      }
    }
    return ["labels": labels, "lines": lines]
  }

  static func supportedLanguages(_ request: VNRecognizeTextRequest) -> [String] {
    if #available(iOS 15.0, macOS 12.0, *) {
      let supported = Set((try? request.supportedRecognitionLanguages()) ?? [])
      let chosen = preferredLanguages.filter { supported.contains($0) }
      if !chosen.isEmpty { return chosen }
    }
    return ["en-US"]
  }
}

#if canImport(Flutter)
import Flutter
#elseif canImport(FlutterMacOS)
import FlutterMacOS
#endif

#if canImport(Flutter) || canImport(FlutterMacOS)
final class FormaVisionPlugin: NSObject, FlutterPlugin {
  static let channelName = "forma/vision"

  static func register(with registrar: FlutterPluginRegistrar) {
    #if canImport(Flutter)
    let messenger = registrar.messenger()
    #else
    let messenger = registrar.messenger
    #endif
    let channel = FlutterMethodChannel(name: channelName, binaryMessenger: messenger)
    registrar.addMethodCallDelegate(FormaVisionPlugin(), channel: channel)
  }

  func handle(_ call: FlutterMethodCall, result: @escaping FlutterResult) {
    guard call.method == "analyze" else {
      result(FlutterMethodNotImplemented)
      return
    }
    guard let args = call.arguments as? [String: Any],
          let image = args["image"] as? FlutterStandardTypedData
    else {
      result(FlutterError(code: "bad_args", message: "No photo was given.", details: nil))
      return
    }
    let classify = args["classify"] as? Bool ?? true
    let readText = args["text"] as? Bool ?? true
    DispatchQueue.global(qos: .userInitiated).async {
      do {
        let output = try FormaVision.analyze(image.data, classify: classify, readText: readText)
        DispatchQueue.main.async { result(output) }
      } catch let failure as FormaVision.Failure {
        DispatchQueue.main.async { result(FlutterError(code: "decode", message: failure.message, details: nil)) }
      } catch {
        DispatchQueue.main.async { result(FlutterError(code: "vision", message: error.localizedDescription, details: nil)) }
      }
    }
  }
}
#endif
