//! `departments:*` channels. The `setImmediate` wrapper in the handlers only
//! deferred the synchronous work by a tick; the resolve/reject outcomes are
//! what mattered and they are reproduced exactly.

use serde_json::Value;

use crate::commands::{Reply, Shared};
use crate::db;

/// `departments:create`.
#[tauri::command]
pub fn create_department(state: Shared<'_>, department: Value) -> Reply {
    state
        .with_db(|conn| db::departments::create(conn, &department))
        .map_err(|error| {
            eprintln!("Error creating department: {error}");
            error.to_string()
        })
}

/// `departments:delete`.
#[tauri::command]
pub fn delete_department(state: Shared<'_>, id: Value) -> Reply {
    state
        .with_db(|conn| db::departments::delete(conn, &id))
        .map_err(|error| {
            eprintln!("Error deleting department: {error}");
            error.to_string()
        })
}

/// `departments:get-all` — the one department handler with a safe fallback.
#[tauri::command]
pub fn get_all_departments(state: Shared<'_>) -> Reply {
    Ok(match state.with_db(db::departments::get_all) {
        Ok(rows) => Value::Array(rows),
        Err(error) => {
            eprintln!("Error getting all departments: {error}");
            Value::Array(Vec::new())
        }
    })
}
