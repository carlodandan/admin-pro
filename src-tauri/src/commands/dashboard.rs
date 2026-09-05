//! `dashboard:*` and `analytics:*` channels.

use serde_json::Value;

use crate::commands::{Reply, Shared};
use crate::db;

/// `dashboard:get-recent-activities`. `getRecentActivities` already answers
/// with an empty list on failure, which is what the handler fell back to.
#[tauri::command]
pub fn get_recent_activities(state: Shared<'_>, limit: Option<i64>) -> Reply {
    // `LIMIT ?` with `undefined` bound to nothing in better-sqlite3 would have
    // thrown; every call site passes a number, and 10 is the one it passes.
    let limit = limit.unwrap_or(10);
    Ok(Value::Array(
        state.with_db(|conn| db::activities::get_recent(conn, limit)),
    ))
}

/// `analytics:get-data` — the one dashboard handler that rethrew. The
/// underlying query set degrades to empty arrays per section instead of
/// failing, so a rejection here means the connection itself is gone.
#[tauri::command]
pub fn get_analytics_data(state: Shared<'_>, filters: Option<Value>) -> Reply {
    let filters = filters.unwrap_or(Value::Null);
    Ok(state.with_db(|conn| db::analytics::get_data(conn, &filters)))
}
