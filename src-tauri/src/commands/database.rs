//! `database:*` channels — the file backup.
//!
//! The Electron build also exposed a generic `database:query` /
//! `database:execute` pair that ran whatever SQL the renderer handed it. Only
//! two statements ever used it, both in `Attendance.jsx`, and both now have
//! their own command (`get_attendance_by_date`, `delete_attendance`), so the
//! passthrough is gone rather than ported: nothing in the webview can reach
//! arbitrary SQL against the local database any more.

use serde_json::json;

use crate::commands::{err_message, Reply, Shared};

/// `database:backup`. The handler wrote `company-admin-backup-<millis>.db`
/// next to the live database, a different extension from the one
/// `AuthService.backupDatabase()` uses; both names are kept as they were.
///
/// The WAL is checkpointed first so the copy includes the newest writes — in
/// WAL mode a bare file copy can otherwise miss everything still in the log.
#[tauri::command]
pub fn backup_database(state: Shared<'_>) -> Reply {
    let stamp = chrono::Utc::now().timestamp_millis();
    let backup_path = state
        .db_path
        .with_file_name(format!("company-admin-backup-{stamp}.db"));

    let checkpoint = state.with_db(|conn| conn.pragma_update(None, "wal_checkpoint", "TRUNCATE"));
    if let Err(error) = checkpoint {
        eprintln!("Database backup checkpoint error: {error}");
    }

    Ok(match std::fs::copy(&state.db_path, &backup_path) {
        Ok(_) => json!({ "success": true, "path": backup_path.to_string_lossy() }),
        Err(error) => {
            eprintln!("Database backup error: {error}");
            err_message(error)
        }
    })
}
