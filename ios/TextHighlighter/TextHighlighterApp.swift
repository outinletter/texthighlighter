import SwiftUI
import WebKit

@main
struct TextHighlighterApp: App {
    var body: some Scene { WindowGroup { WebView() } }
}

struct WebView: UIViewRepresentable {
    func makeCoordinator() -> Coordinator { Coordinator() }

    func makeUIView(context: Context) -> WKWebView {
        let configuration = WKWebViewConfiguration()
        configuration.userContentController.add(context.coordinator, name: "savePDF")
        let view = WKWebView(frame: .zero, configuration: configuration)
        context.coordinator.webView = view
        view.allowsBackForwardNavigationGestures = true
        if let url = Bundle.main.url(forResource: "index", withExtension: "html", subdirectory: "Web") {
            view.loadFileURL(url, allowingReadAccessTo: url.deletingLastPathComponent())
        }
        return view
    }

    func updateUIView(_ view: WKWebView, context: Context) {}

    static func dismantleUIView(_ view: WKWebView, coordinator: Coordinator) {
        view.configuration.userContentController.removeScriptMessageHandler(forName: "savePDF")
    }

    final class Coordinator: NSObject, WKScriptMessageHandler {
        weak var webView: WKWebView?

        func userContentController(_ controller: WKUserContentController, didReceive message: WKScriptMessage) {
            guard message.frameInfo.isMainFrame, message.frameInfo.request.url?.isFileURL == true,
                  let body = message.body as? [String: String],
                  let encoded = body["data"], let data = Data(base64Encoded: encoded),
                  let name = body["name"], !data.isEmpty,
                  var presenter = webView?.window?.rootViewController else { return }
            let directory = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
            let file = directory.appendingPathComponent(URL(fileURLWithPath: name).lastPathComponent)
            do {
                try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
                try data.write(to: file, options: .atomic)
                while let presented = presenter.presentedViewController { presenter = presented }
                let sheet = UIActivityViewController(activityItems: [file], applicationActivities: nil)
                sheet.popoverPresentationController?.sourceView = presenter.view
                sheet.popoverPresentationController?.sourceRect = CGRect(x: presenter.view.bounds.midX, y: presenter.view.bounds.midY, width: 1, height: 1)
                sheet.completionWithItemsHandler = { _, _, _, _ in
                    try? FileManager.default.removeItem(at: directory)
                }
                presenter.present(sheet, animated: true)
            } catch {
                try? FileManager.default.removeItem(at: directory)
                let alert = UIAlertController(title: "PDF 저장 실패", message: error.localizedDescription, preferredStyle: .alert)
                alert.addAction(UIAlertAction(title: "확인", style: .default))
                presenter.present(alert, animated: true)
            }
        }
    }
}
