//! The application menu, item for item from the Electron template: File, Edit,
//! View, Help. `autoHideMenuBar` had it hidden until Alt, which is also how a
//! Tauri menu behaves on Windows.
//!
//! Electron supplied `reload`, `zoomIn` and friends as built-in roles. Tauri's
//! predefined set covers the clipboard and fullscreen items; the rest are
//! ordinary items wired to the same effects here.

use tauri::menu::{Menu, MenuBuilder, MenuEvent, MenuItemBuilder, SubmenuBuilder};
use tauri::{AppHandle, Emitter, Manager, Wry};
use tauri_plugin_clipboard_manager::ClipboardExt;
use tauri_plugin_dialog::{DialogExt, MessageDialogButtons, MessageDialogKind};
use tauri_plugin_opener::OpenerExt;

use crate::state::AppState;

const WIKI_URL: &str = "https://github.com/carlodandan/admin-pro/wiki";
const ISSUES_URL: &str = "https://github.com/carlodandan/admin-pro/issues";

/// One Electron zoom step. `zoomIn`/`zoomOut` moved `zoomLevel` by 0.5, and
/// Electron's factor is `1.2 ^ level`, so a step is this much.
const ZOOM_STEP: f64 = 1.0954451150103321;
/// Electron's own `zoomFactor` bounds.
const ZOOM_MIN: f64 = 0.25;
const ZOOM_MAX: f64 = 5.0;

pub fn build(app: &AppHandle) -> tauri::Result<Menu<Wry>> {
    let item = |id: &str, label: &str, accelerator: Option<&str>| {
        let mut builder = MenuItemBuilder::with_id(id, label);
        if let Some(accelerator) = accelerator {
            builder = builder.accelerator(accelerator);
        }
        builder.build(app)
    };

    let file = SubmenuBuilder::new(app, "File")
        .item(&item("export-data", "Export Data", Some("CmdOrCtrl+E"))?)
        .separator()
        .item(&item("quit", "Quit", Some("CmdOrCtrl+Q"))?)
        .build()?;

    let edit = SubmenuBuilder::new(app, "Edit")
        .undo()
        .redo()
        .separator()
        .cut()
        .copy()
        .paste()
        .build()?;

    let view = SubmenuBuilder::new(app, "View")
        .item(&item("reload", "Reload", Some("CmdOrCtrl+R"))?)
        .item(&item("force-reload", "Force Reload", Some("CmdOrCtrl+Shift+R"))?)
        .item(&item("devtools", "Toggle Developer Tools", Some("F12"))?)
        .separator()
        .item(&item("zoom-reset", "Actual Size", Some("CmdOrCtrl+0"))?)
        .item(&item("zoom-in", "Zoom In", Some("CmdOrCtrl+Plus"))?)
        .item(&item("zoom-out", "Zoom Out", Some("CmdOrCtrl+-"))?)
        .separator()
        .fullscreen()
        .build()?;

    let help = SubmenuBuilder::new(app, "Help")
        .item(&item("app-version", "App Version", None)?)
        .separator()
        .item(&item("documentation", "Documentation", None)?)
        .item(&item("report-issue", "Report Issue", None)?)
        .build()?;

    MenuBuilder::new(app)
        .items(&[&file, &edit, &view, &help])
        .build()
}

/// The click handlers, keyed by the ids above.
pub fn handle(app: &AppHandle, event: MenuEvent) {
    let window = app.get_webview_window("main");

    match event.id().as_ref() {
        "export-data" => {
            // `mainWindow.webContents.send('export-data')`.
            if let Err(error) = app.emit("export-data", ()) {
                eprintln!("Failed to emit export-data: {error}");
            }
        }
        "quit" => app.exit(0),
        "reload" | "force-reload" => {
            // Electron's `forceReload` also dropped the HTTP cache. The bundle
            // is served from the app itself, so there is nothing to bypass.
            if let Some(window) = window {
                let _ = window.eval("window.location.reload()");
            }
        }
        "devtools" => toggle_devtools(app),
        "zoom-reset" => set_zoom(app, |_| 1.0),
        "zoom-in" => set_zoom(app, |current| current * ZOOM_STEP),
        "zoom-out" => set_zoom(app, |current| current / ZOOM_STEP),
        "app-version" => show_version_dialog(app),
        "documentation" => open_url(app, WIKI_URL),
        "report-issue" => open_url(app, ISSUES_URL),
        _ => {}
    }
}

fn toggle_devtools(app: &AppHandle) {
    // `open_devtools` only exists in debug builds and with the `devtools`
    // feature, which is exactly where Electron's role was useful.
    #[cfg(any(debug_assertions, feature = "devtools"))]
    if let Some(window) = app.get_webview_window("main") {
        if window.is_devtools_open() {
            window.close_devtools();
        } else {
            window.open_devtools();
        }
    }
    #[cfg(not(any(debug_assertions, feature = "devtools")))]
    let _ = app;
}

/// Applies a new zoom factor and remembers it.
///
/// Tauri exposes `set_zoom` but no getter, so `zoom-in` and `zoom-out` have to
/// compound against a remembered value or every step would be measured from
/// 1.0. The webview keeps the factor itself across the Reload item, which
/// navigates the same document, so nothing has to reapply it afterwards.
fn set_zoom(app: &AppHandle, step: impl FnOnce(f64) -> f64) {
    let state = app.state::<std::sync::Arc<AppState>>();
    let mut zoom = state
        .zoom
        .lock()
        .unwrap_or_else(|poisoned| poisoned.into_inner());

    let next = step(*zoom).clamp(ZOOM_MIN, ZOOM_MAX);
    if let Some(window) = app.get_webview_window("main") {
        if let Err(error) = window.set_zoom(next) {
            eprintln!("Failed to set zoom: {error}");
            return;
        }
    }
    *zoom = next;
}

fn open_url(app: &AppHandle, url: &str) {
    if let Err(error) = app.opener().open_url(url, None::<&str>) {
        eprintln!("Failed to open {url}: {error}");
    }
}

/// `showVersionDialog()`. The second button copies `Admin Pro v<version>`,
/// which is what Electron's `response === 1` branch did.
fn show_version_dialog(app: &AppHandle) {
    let version = app.state::<std::sync::Arc<AppState>>().app_version.clone();
    let webview = tauri::webview_version().unwrap_or_else(|_| "unknown".to_string());
    let detail = format!(
        "Version: {version}\nTauri: {}\nWebView: {webview}\nPlatform: {} {}",
        tauri::VERSION,
        std::env::consts::OS,
        std::env::consts::ARCH,
    );

    let handle = app.clone();
    app.dialog()
        .message(format!(
            "Admin Pro - Admin Management System\n\n{detail}"
        ))
        .title("Admin Pro - Version Information")
        .kind(MessageDialogKind::Info)
        .buttons(MessageDialogButtons::OkCancelCustom(
            "OK".to_string(),
            "Copy Version".to_string(),
        ))
        .show(move |pressed_ok| {
            if !pressed_ok {
                let text = format!("Admin Pro v{version}");
                if let Err(error) = handle.clipboard().write_text(text) {
                    eprintln!("Failed to copy version: {error}");
                }
            }
        });
}


