import Capacitor
import UIKit

@objc(NativeToolbar)
public class NativeToolbar: CAPPlugin, CAPBridgedPlugin {
    public static weak var sharedInstance: NativeToolbar?
    public static let menuConfigDidChangeNotification = Notification.Name("QuickBoardNativeMenuConfigDidChange")

    private let stateQueue = DispatchQueue(label: "NativeToolbar.menuState", attributes: .concurrent)
    private var _menuThemeItems: [[String: String]] = []
    private var _currentTheme: String = "system"

    public var menuThemeItems: [[String: String]] {
        stateQueue.sync { _menuThemeItems }
    }

    public var currentTheme: String {
        stateQueue.sync { _currentTheme }
    }

    public let identifier = "NativeToolbar"
    public let jsName = "NativeToolbar"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "setTitle", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "configureMenu", returnType: CAPPluginReturnPromise)
    ]

    public override func load() {
        NativeToolbar.sharedInstance = self
    }

    private func applyTitle(_ title: String, to viewController: UIViewController) {
        viewController.navigationItem.title = title
        if #available(iOS 16.0, *) {
            if UIDevice.current.userInterfaceIdiom == .pad {
                viewController.navigationItem.style = .browser
            }
        }
    }

    private func resolveNavigationController(for root: UIViewController) -> UINavigationController? {
        if let nav = root as? UINavigationController {
            return nav
        }

        if let nav = root.navigationController {
            return nav
        }

        if let nav = root.parent as? UINavigationController {
            return nav
        }

        if let nav = root.view.window?.rootViewController as? UINavigationController {
            return nav
        }

        return nil
    }

    @objc func setTitle(_ call: CAPPluginCall) {
        let title = call.getString("title") ?? ""

        DispatchQueue.main.async {
            guard let root = self.bridge?.viewController else {
                call.reject("View controller not found")
                return
            }

            if let nav = self.resolveNavigationController(for: root) {
                let target = nav.topViewController ?? root
                self.applyTitle(title, to: target)
                nav.setNavigationBarHidden(false, animated: false)
                call.resolve()
                return
            }

            // Do not ever re-parent the bridge view controller; just apply title safely.
            self.applyTitle(title, to: root)
            call.resolve()
        }
    }

    @objc func configureMenu(_ call: CAPPluginCall) {
        let currentTheme = call.getString("currentTheme") ?? "system"
        let parsedThemeItems = (call.getArray("themeItems", JSObject.self) ?? []).compactMap { item -> [String: String]? in
            guard let id = item["id"] as? String, let label = item["label"] as? String else {
                return nil
            }
            return ["id": id, "label": label]
        }

        stateQueue.async(flags: .barrier) {
            self._menuThemeItems = parsedThemeItems
            self._currentTheme = currentTheme
        }

        DispatchQueue.main.async {
            NotificationCenter.default.post(name: NativeToolbar.menuConfigDidChangeNotification, object: nil)
            if #available(iOS 13.0, *) {
                UIMenuSystem.main.setNeedsRebuild()
            }
            call.resolve()
        }
    }

    public func emitMenuAction(actionId: String) {
        notifyListeners("menuAction", data: ["actionId": actionId])
    }
}
