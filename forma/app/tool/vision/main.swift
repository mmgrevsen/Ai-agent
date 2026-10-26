// Runs FormaVision outside the app, for CI on a Mac:
//   swiftc native/FormaVision.swift tool/vision/main.swift -o build/vision-probe
//   build/vision-probe identifiers        all classification labels
//   build/vision-probe languages          text-recognition languages
//   build/vision-probe analyze OUT FILE…  writes OUT/<name>.json per photo
import Foundation
import Vision

func fail(_ message: String) -> Never {
  FileHandle.standardError.write((message + "\n").data(using: .utf8)!)
  exit(1)
}

let args = Array(CommandLine.arguments.dropFirst())
switch args.first {
case "identifiers":
  guard #available(macOS 12.0, *) else { fail("macOS 12 needed") }
  print(try VNClassifyImageRequest().supportedIdentifiers().joined(separator: "\n"))
case "languages":
  guard #available(macOS 12.0, *) else { fail("macOS 12 needed") }
  let request = VNRecognizeTextRequest()
  request.recognitionLevel = .accurate
  print(try request.supportedRecognitionLanguages().joined(separator: "\n"))
  print("chosen: \(FormaVision.supportedLanguages(request).joined(separator: ", "))")
case "analyze":
  guard args.count >= 3 else { fail("usage: analyze OUT FILE…") }
  let out = URL(fileURLWithPath: args[1])
  try FileManager.default.createDirectory(at: out, withIntermediateDirectories: true)
  for path in args.dropFirst(2) {
    let url = URL(fileURLWithPath: path)
    let started = Date()
    do {
      let result = try FormaVision.analyze(try Data(contentsOf: url))
      let json = try JSONSerialization.data(withJSONObject: result, options: [.prettyPrinted, .sortedKeys])
      try json.write(to: out.appendingPathComponent(url.deletingPathExtension().lastPathComponent + ".json"))
      let labels = (result["labels"] as? [[String: Any]] ?? []).prefix(6)
        .map { "\($0["id"]!) \(String(format: "%.2f", $0["confidence"] as! Double))" }
      let lines = (result["lines"] as? [[String: Any]] ?? []).count
      print("\(url.lastPathComponent): \(String(format: "%.1f", Date().timeIntervalSince(started))) s, \(lines) text lines; \(labels.joined(separator: ", "))")
    } catch {
      print("\(url.lastPathComponent): FAILED \(error)")
    }
  }
default:
  fail("usage: identifiers | languages | analyze OUT FILE…")
}
