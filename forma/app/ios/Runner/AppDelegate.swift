import Flutter
import UIKit

@main
@objc class AppDelegate: FlutterAppDelegate, FlutterImplicitEngineDelegate {
  override func application(
    _ application: UIApplication,
    didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]?
  ) -> Bool {
    if #available(iOS 16.0, *) {
      // Lets Siri offer saved meals and recent foods by name.
      FormaShortcuts.updateAppShortcutParameters()
    }
    return super.application(application, didFinishLaunchingWithOptions: launchOptions)
  }

  func didInitializeImplicitFlutterEngine(_ engineBridge: FlutterImplicitEngineBridge) {
    GeneratedPluginRegistrant.register(with: engineBridge.pluginRegistry)
    // On-device photo recognition (native/FormaVision.swift).
    if let registrar = engineBridge.pluginRegistry.registrar(forPlugin: "FormaVisionPlugin") {
      FormaVisionPlugin.register(with: registrar)
    }
  }
}
