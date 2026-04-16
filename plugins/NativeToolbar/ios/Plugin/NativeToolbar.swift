import Capacitor
import UIKit

@objc(NativeToolbar)
public class NativeToolbar: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "NativeToolbar"
    public let jsName = "NativeToolbar"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "setTitle", returnType: CAPPluginReturnPromise)
    ]

    @objc func setTitle(_ call: CAPPluginCall) {
        let title = call.getString("title") ?? ""

        DispatchQueue.main.async {
            guard let root = self.bridge?.viewController else {
                call.reject("View controller not found")
                return
            }

            // Check if we are already inside a navigation controller
            if let nav = root.navigationController {
                root.navigationItem.title = title
                nav.setNavigationBarHidden(false, animated: false)
                call.resolve()
            } else {
                // We are not in a navigation controller (Capacitor default).
                // Let's create one and make it the window's root!
                let nav = UINavigationController(rootViewController: root)

                root.navigationItem.title = title

                if #available(iOS 16.0, *) {
                    if UIDevice.current.userInterfaceIdiom == .pad {
                        root.navigationItem.style = .browser
                    }
                }

                let window = root.view.window
                    ?? UIApplication.shared.connectedScenes
                        .compactMap { $0 as? UIWindowScene }
                        .filter { $0.activationState == .foregroundActive }
                        .flatMap { $0.windows }
                        .first(where: { $0.isKeyWindow })

                guard let window = window else {
                    call.reject("Window not found")
                    return
                }

                window.rootViewController = nav
                window.makeKeyAndVisible()
                call.resolve()
            }
        }
    }
}
