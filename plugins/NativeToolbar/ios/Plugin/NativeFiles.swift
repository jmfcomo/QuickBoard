import Capacitor
import UniformTypeIdentifiers
import UIKit

@objc(NativeFiles)
public class NativeFiles: CAPPlugin, CAPBridgedPlugin, UIDocumentPickerDelegate {
    public let identifier = "NativeFiles"
    public let jsName = "NativeFiles"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "pickBoardFile", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "saveBoardFile", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "selectFolder", returnType: CAPPluginReturnPromise),
    ]

    private enum PendingAction {
        case openFile
        case saveFile
        case selectFolder
    }

    private let folderName = "QuickBoard"
    private var pendingAction: PendingAction?
    private var pendingCall: CAPPluginCall?
    private var pendingTemporaryFileURL: URL?
    private var activeDocumentURL: URL?

    @objc func pickBoardFile(_ call: CAPPluginCall) {
        presentPicker(call, action: .openFile) {
            let contentType = UTType(filenameExtension: "sbd") ?? .data
            let picker = UIDocumentPickerViewController(forOpeningContentTypes: [contentType], asCopy: false)
            picker.allowsMultipleSelection = false
            picker.directoryURL = self.defaultPickerDirectoryURL()
            picker.shouldShowFileExtensions = true
            return picker
        }
    }

    @objc func saveBoardFile(_ call: CAPPluginCall) {
        guard let fileName = call.getString("fileName"), !fileName.isEmpty else {
            call.resolve(["success": false, "message": "Missing file name"])
            return
        }

        guard let base64 = call.getString("data"), let data = Data(base64Encoded: base64) else {
            call.resolve(["success": false, "message": "Missing file data"])
            return
        }

        let forcePrompt = call.getBool("forcePrompt") ?? false

        if !forcePrompt, let activeURL = resolveActiveDocumentURL() {
            do {
                try writeData(data, to: activeURL)
                call.resolve([
                    "success": true,
                    "path": activeURL.path,
                    "name": activeURL.lastPathComponent,
                ])
                return
            } catch {
                clearActiveDocumentURL()
            }
        }

        let temporaryURL = FileManager.default.temporaryDirectory.appendingPathComponent(fileName)
        do {
            try data.write(to: temporaryURL, options: .atomic)
        } catch {
            call.resolve(["success": false, "message": error.localizedDescription])
            return
        }

        pendingTemporaryFileURL = temporaryURL
        presentPicker(call, action: .saveFile) {
            let picker = UIDocumentPickerViewController(forExporting: [temporaryURL], asCopy: true)
            picker.directoryURL = self.defaultPickerDirectoryURL()
            picker.shouldShowFileExtensions = true
            return picker
        }
    }

    @objc func selectFolder(_ call: CAPPluginCall) {
        presentPicker(call, action: .selectFolder) {
            let picker = UIDocumentPickerViewController(forOpeningContentTypes: [.folder], asCopy: false)
            picker.directoryURL = self.defaultPickerDirectoryURL()
            picker.shouldShowFileExtensions = true
            return picker
        }
    }

    private func presentPicker(
        _ call: CAPPluginCall,
        action: PendingAction,
        pickerFactory: @escaping () -> UIDocumentPickerViewController
    ) {
        DispatchQueue.main.async {
            guard let viewController = self.bridge?.viewController else {
                call.resolve(["success": false, "message": "View controller not available"])
                return
            }

            self.pendingAction = action
            self.pendingCall = call

            let picker = pickerFactory()
            picker.delegate = self
            picker.modalPresentationStyle = .formSheet

            viewController.present(picker, animated: true)
        }
    }

    private func defaultPickerDirectoryURL() -> URL? {
        let fileManager = FileManager.default

        if let ubiquitousContainer = fileManager.url(forUbiquityContainerIdentifier: nil) {
            let documentsURL = ubiquitousContainer.appendingPathComponent("Documents", isDirectory: true)
            let quickBoardURL = documentsURL.appendingPathComponent(folderName, isDirectory: true)
            try? fileManager.createDirectory(at: quickBoardURL, withIntermediateDirectories: true)
            return quickBoardURL
        }

        if let localDocumentsURL = fileManager.urls(for: .documentDirectory, in: .userDomainMask).first {
            let quickBoardURL = localDocumentsURL.appendingPathComponent(folderName, isDirectory: true)
            try? fileManager.createDirectory(at: quickBoardURL, withIntermediateDirectories: true)
            return quickBoardURL
        }

        return nil
    }

    private func writeData(_ data: Data, to url: URL) throws {
        let scoped = url.startAccessingSecurityScopedResource()
        defer {
            if scoped {
                url.stopAccessingSecurityScopedResource()
            }
        }

        let coordinator = NSFileCoordinator()
        var coordinationError: NSError?
        var writeError: Error?

        coordinator.coordinate(writingItemAt: url, options: .forReplacing, error: &coordinationError) { coordinatedURL in
            do {
                try data.write(to: coordinatedURL, options: .atomic)
            } catch {
                writeError = error
            }
        }

        if let writeError {
            throw writeError
        }
        if let coordinationError {
            throw coordinationError
        }

        setActiveDocumentURL(url)
    }

    private func setActiveDocumentURL(_ url: URL) {
        activeDocumentURL = url
    }

    private func clearActiveDocumentURL() {
        activeDocumentURL = nil
    }

    private func resolveActiveDocumentURL() -> URL? {
        activeDocumentURL
    }

    public func documentPicker(_ controller: UIDocumentPickerViewController, didPickDocumentsAt urls: [URL]) {
        guard let call = pendingCall else {
            return
        }

        let action = pendingAction
        pendingAction = nil
        pendingCall = nil

        guard let url = urls.first else {
            call.resolve(["success": false, "message": "No file selected"])
            cleanupTemporaryFile()
            return
        }

        switch action {
        case .openFile:
            let scoped = url.startAccessingSecurityScopedResource()
            defer {
                if scoped {
                    url.stopAccessingSecurityScopedResource()
                }
            }

            let coordinator = NSFileCoordinator()
            var coordinationError: NSError?
            var fileData: Data?

            coordinator.coordinate(readingItemAt: url, options: [], error: &coordinationError) { coordinatedURL in
                fileData = try? Data(contentsOf: coordinatedURL)
            }

            guard let fileData else {
                let message = coordinationError?.localizedDescription ?? "Failed to read file"
                call.resolve(["success": false, "message": message])
                cleanupTemporaryFile()
                return
            }

            call.resolve([
                "success": true,
                "name": url.lastPathComponent,
                "path": url.path,
                "data": fileData.base64EncodedString(),
            ])
            setActiveDocumentURL(url)
        case .saveFile:
            call.resolve([
                "success": true,
                "path": url.path,
                "name": url.lastPathComponent,
            ])
            setActiveDocumentURL(url)
            cleanupTemporaryFile()
        case .selectFolder:
            call.resolve([
                "success": true,
                "path": url.path,
            ])
        case .none:
            call.resolve(["success": false, "message": "Unknown operation"])
            cleanupTemporaryFile()
        }
    }

    public func documentPickerWasCancelled(_ controller: UIDocumentPickerViewController) {
        guard let call = pendingCall else {
            return
        }

        pendingAction = nil
        pendingCall = nil
        cleanupTemporaryFile()
        call.resolve(["success": false, "cancelled": true])
    }

    private func cleanupTemporaryFile() {
        guard let url = pendingTemporaryFileURL else {
            return
        }

        pendingTemporaryFileURL = nil
        try? FileManager.default.removeItem(at: url)
    }
}