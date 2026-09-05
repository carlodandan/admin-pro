//! The command layer: one `#[tauri::command]` per channel exposed by
//! `preload.js`, returning the exact envelope the Electron main process
//! returned. Nothing in the frontend has to change how it reads a result.
//!
//! `Err` is this layer's equivalent of the old handlers' `throw error` — Tauri
//! rejects the promise, `invoke()` throws, and the caller's `catch` runs as
//! before. Handlers that swallowed their errors into a value (`return []`,
//! `return null`, `{ success: false }`) return `Ok` with that value instead.

pub mod attendance;
pub mod auth;
pub mod dashboard;
pub mod database;
pub mod departments;
pub mod employees;
pub mod payroll;
pub mod users;
pub mod window;

use serde_json::{json, Value};

/// Every command resolves with JSON or rejects with a message, which is the
/// whole of what `ipcRenderer.invoke` could do.
pub type Reply = std::result::Result<Value, String>;

/// The managed state. It is an `Arc` so background work — the post-login sync,
/// the 30-minute timer — can own a handle without borrowing from a command.
pub type Shared<'a> = tauri::State<'a, std::sync::Arc<crate::state::AppState>>;


/// `{ success: true, data }`.
pub fn ok_data(data: Value) -> Value {
    json!({ "success": true, "data": data })
}

/// `{ success: false, error: error.message }`.
pub fn err_message(error: impl std::fmt::Display) -> Value {
    json!({ "success": false, "error": error.to_string() })
}
