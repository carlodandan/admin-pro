//! `window:*` channels plus the one addition this port needs.
//!
//! These were `ipcRenderer.send` in Electron — fire and forget with no reply.
//! As commands they resolve with nothing, so the frontend can keep ignoring
//! the result.

/// `window:close`.
#[tauri::command]
pub fn close_window(window: tauri::WebviewWindow) -> Result<(), String> {
    window.close().map_err(|error| error.to_string())
}

/// `window:maximize` — a toggle, as the handler was.
#[tauri::command]
pub fn maximize_window(window: tauri::WebviewWindow) -> Result<(), String> {
    let maximized = window.is_maximized().map_err(|error| error.to_string())?;
    let result = if maximized {
        window.unmaximize()
    } else {
        window.maximize()
    };
    result.map_err(|error| error.to_string())
}

/// `window:minimize`.
#[tauri::command]
pub fn minimize_window(window: tauri::WebviewWindow) -> Result<(), String> {
    window.minimize().map_err(|error| error.to_string())
}

/// New: the renderer says when it has painted.
///
/// Electron waited for `ready-to-show` before `show()`, `maximize()` and
/// `focus()`. Tauri has no equivalent event, so `tauri.conf.json` starts the
/// window hidden and this reveals it — the first thing on screen is the app
/// rather than a white box. `lib.rs` also shows the window on a timer in case
/// the frontend never gets this far.
#[tauri::command]
pub fn frontend_ready(window: tauri::WebviewWindow) -> Result<(), String> {
    if !window.is_visible().unwrap_or(false) {
        window.show().map_err(|error| error.to_string())?;
        let _ = window.maximize();
        let _ = window.set_focus();
    }
    Ok(())
}
