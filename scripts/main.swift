// Claude UI - native wrapper for claude-code-agents-ui.
// Starts the dev server via `claude-ui`, shows it in a WKWebView, stops it on quit
// (only if this app started it).
// Build: swiftc -O -swift-version 5 main.swift -o launch

import Cocoa
import WebKit

let home = NSHomeDirectory()
let cliPath = "\(home)/.local/bin/claude-ui"
let appURL = URL(string: "http://localhost:3030")!
let launcherLog = "/tmp/claude-ui-launcher.log"

@discardableResult
func runCLI(_ args: [String]) -> Int32 {
    let p = Process()
    p.executableURL = URL(fileURLWithPath: cliPath)
    p.arguments = args
    var env = ProcessInfo.processInfo.environment
    env["PATH"] = "\(home)/.local/bin:\(home)/.bun/bin:/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin"
    p.environment = env
    if !FileManager.default.fileExists(atPath: launcherLog) {
        FileManager.default.createFile(atPath: launcherLog, contents: nil)
    }
    if let log = FileHandle(forWritingAtPath: launcherLog) {
        log.seekToEndOfFile()
        p.standardOutput = log
        p.standardError = log
    }
    p.standardInput = FileHandle.nullDevice
    do { try p.run() } catch { return 127 }
    p.waitUntilExit()
    return p.terminationStatus
}

func page(_ title: String, _ detail: String) -> String {
    """
    <html><body style="margin:0;height:100vh;display:flex;align-items:center;justify-content:center;
    background:#1e1e1e;color:#ddd;font:15px -apple-system,sans-serif;text-align:center">
    <div><div style="font-size:20px;margin-bottom:8px">\(title)</div><div style="opacity:.6">\(detail)</div></div>
    </body></html>
    """
}

final class AppDelegate: NSObject, NSApplicationDelegate, WKNavigationDelegate, WKUIDelegate {
    var window: NSWindow!
    var web: WKWebView!
    var startedByApp = false

    func applicationDidFinishLaunching(_ n: Notification) {
        buildMenu()

        web = WKWebView(frame: .zero, configuration: WKWebViewConfiguration())
        web.navigationDelegate = self
        web.uiDelegate = self
        if #available(macOS 13.3, *) { web.isInspectable = true }

        window = NSWindow(
            contentRect: NSRect(x: 0, y: 0, width: 1440, height: 900),
            styleMask: [.titled, .closable, .miniaturizable, .resizable],
            backing: .buffered, defer: false)
        window.title = "Claude UI"
        window.contentView = web
        window.center()
        window.setFrameAutosaveName("ClaudeUIMain")
        window.makeKeyAndOrderFront(nil)
        NSApp.activate(ignoringOtherApps: true)

        web.loadHTMLString(page("Starting dev server...", "first start can take a few seconds"), baseURL: nil)

        DispatchQueue.global().async {
            let wasUp = runCLI(["status"]) == 0
            DispatchQueue.main.sync { self.startedByApp = !wasUp }
            let rc = wasUp ? 0 : runCLI(["start", "--no-open"])
            DispatchQueue.main.async {
                if rc == 0 {
                    self.web.load(URLRequest(url: appURL))
                } else {
                    self.web.loadHTMLString(
                        page("Dev server failed to start", "see /tmp/claude-code-agents-ui.log and \(launcherLog)"),
                        baseURL: nil)
                }
            }
        }
    }

    func applicationShouldTerminateAfterLastWindowClosed(_ s: NSApplication) -> Bool { true }

    func applicationShouldHandleReopen(_ s: NSApplication, hasVisibleWindows: Bool) -> Bool {
        window.makeKeyAndOrderFront(nil)
        return true
    }

    func applicationShouldTerminate(_ s: NSApplication) -> NSApplication.TerminateReply {
        guard startedByApp else { return .terminateNow }
        DispatchQueue.global().async {
            runCLI(["stop"])
            DispatchQueue.main.async { NSApp.reply(toApplicationShouldTerminate: true) }
        }
        return .terminateLater
    }

    // MARK: navigation

    func isLocal(_ url: URL?) -> Bool {
        guard let url = url else { return true }
        if ["about", "blob", "data"].contains(url.scheme ?? "") { return true }
        return url.host == "localhost" || url.host == "127.0.0.1"
    }

    func webView(_ w: WKWebView, decidePolicyFor action: WKNavigationAction,
                 decisionHandler: @escaping (WKNavigationActionPolicy) -> Void) {
        if action.targetFrame?.isMainFrame == true, !isLocal(action.request.url), let u = action.request.url {
            NSWorkspace.shared.open(u)
            decisionHandler(.cancel)
        } else {
            decisionHandler(.allow)
        }
    }

    func webView(_ w: WKWebView, didFailProvisionalNavigation nav: WKNavigation!, withError error: Error) {
        // server still warming up or restarting: retry
        DispatchQueue.main.asyncAfter(deadline: .now() + 1.5) { w.load(URLRequest(url: appURL)) }
    }

    func webView(_ w: WKWebView, createWebViewWith config: WKWebViewConfiguration,
                 for action: WKNavigationAction, windowFeatures: WKWindowFeatures) -> WKWebView? {
        if let u = action.request.url {
            if isLocal(u) { w.load(action.request) } else { NSWorkspace.shared.open(u) }
        }
        return nil
    }

    // MARK: JS dialogs + file picker (WKWebView drops these unless implemented)

    func webView(_ w: WKWebView, runJavaScriptAlertPanelWithMessage message: String,
                 initiatedByFrame frame: WKFrameInfo, completionHandler: @escaping () -> Void) {
        let a = NSAlert()
        a.messageText = message
        a.runModal()
        completionHandler()
    }

    func webView(_ w: WKWebView, runJavaScriptConfirmPanelWithMessage message: String,
                 initiatedByFrame frame: WKFrameInfo, completionHandler: @escaping (Bool) -> Void) {
        let a = NSAlert()
        a.messageText = message
        a.addButton(withTitle: "OK")
        a.addButton(withTitle: "Cancel")
        completionHandler(a.runModal() == .alertFirstButtonReturn)
    }

    func webView(_ w: WKWebView, runJavaScriptTextInputPanelWithPrompt prompt: String, defaultText: String?,
                 initiatedByFrame frame: WKFrameInfo, completionHandler: @escaping (String?) -> Void) {
        let a = NSAlert()
        a.messageText = prompt
        a.addButton(withTitle: "OK")
        a.addButton(withTitle: "Cancel")
        let field = NSTextField(frame: NSRect(x: 0, y: 0, width: 260, height: 24))
        field.stringValue = defaultText ?? ""
        a.accessoryView = field
        completionHandler(a.runModal() == .alertFirstButtonReturn ? field.stringValue : nil)
    }

    func webView(_ w: WKWebView, runOpenPanelWith params: WKOpenPanelParameters,
                 initiatedByFrame frame: WKFrameInfo, completionHandler: @escaping ([URL]?) -> Void) {
        let p = NSOpenPanel()
        p.allowsMultipleSelection = params.allowsMultipleSelection
        p.canChooseDirectories = params.allowsDirectories
        completionHandler(p.runModal() == .OK ? p.urls : nil)
    }

    // MARK: menu

    @objc func reload() { web.reload() }
    @objc func zoomIn() { web.pageZoom += 0.1 }
    @objc func zoomOut() { web.pageZoom = max(0.3, web.pageZoom - 0.1) }
    @objc func zoomReset() { web.pageZoom = 1.0 }

    func buildMenu() {
        let main = NSMenu()

        func submenu(_ title: String) -> NSMenu {
            let item = NSMenuItem()
            main.addItem(item)
            let m = NSMenu(title: title)
            item.submenu = m
            return m
        }
        func item(_ title: String, _ action: Selector?, _ key: String, target: AnyObject? = nil,
                  mods: NSEvent.ModifierFlags = .command) -> NSMenuItem {
            let i = NSMenuItem(title: title, action: action, keyEquivalent: key)
            i.keyEquivalentModifierMask = mods
            i.target = target
            return i
        }

        let app = submenu("Claude UI")
        app.addItem(item("Hide Claude UI", #selector(NSApplication.hide(_:)), "h"))
        app.addItem(.separator())
        app.addItem(item("Quit Claude UI", #selector(NSApplication.terminate(_:)), "q"))

        let edit = submenu("Edit")
        edit.addItem(item("Undo", Selector(("undo:")), "z"))
        edit.addItem(item("Redo", Selector(("redo:")), "z", mods: [.command, .shift]))
        edit.addItem(.separator())
        edit.addItem(item("Cut", #selector(NSText.cut(_:)), "x"))
        edit.addItem(item("Copy", #selector(NSText.copy(_:)), "c"))
        edit.addItem(item("Paste", #selector(NSText.paste(_:)), "v"))
        edit.addItem(item("Select All", #selector(NSText.selectAll(_:)), "a"))

        let view = submenu("View")
        view.addItem(item("Reload", #selector(reload), "r", target: self))
        view.addItem(item("Zoom In", #selector(zoomIn), "=", target: self))
        view.addItem(item("Zoom Out", #selector(zoomOut), "-", target: self))
        view.addItem(item("Actual Size", #selector(zoomReset), "0", target: self))

        let win = submenu("Window")
        win.addItem(item("Minimize", #selector(NSWindow.performMiniaturize(_:)), "m"))
        win.addItem(item("Close", #selector(NSWindow.performClose(_:)), "w"))
        NSApp.windowsMenu = win

        NSApp.mainMenu = main
    }
}

let app = NSApplication.shared
let delegate = AppDelegate()
app.delegate = delegate
app.setActivationPolicy(.regular)
app.run()
