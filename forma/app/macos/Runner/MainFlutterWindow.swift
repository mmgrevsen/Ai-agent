import Cocoa
import FlutterMacOS

class MainFlutterWindow: NSWindow {
  override func awakeFromNib() {
    let flutterViewController = FlutterViewController()
    self.contentViewController = flutterViewController
    // Forma is laid out for a phone; open in a phone-sized, resizable window.
    let size = NSSize(width: 430, height: 900)
    self.setContentSize(size)
    self.contentMinSize = NSSize(width: 360, height: 600)
    self.title = "Forma"
    self.center()

    RegisterGeneratedPlugins(registry: flutterViewController)
    // On-device photo recognition (native/FormaVision.swift).
    FormaVisionPlugin.register(with: flutterViewController.registrar(forPlugin: "FormaVisionPlugin"))

    super.awakeFromNib()
  }
}
