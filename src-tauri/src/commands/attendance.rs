//! `attendance:*` channels.

use serde_json::Value;

use crate::commands::{Reply, Shared};
use crate::db;

/// `attendance:get-cutoff`.
#[tauri::command]
pub fn get_cutoff_attendance(
    state: Shared<'_>,
    year: i64,
    month: i64,
    is_first_half: bool,
) -> Reply {
    Ok(
        match state.with_db(|conn| db::attendance::for_cutoff(conn, year, month, is_first_half)) {
            Ok(rows) => Value::Array(rows),
            Err(error) => {
                eprintln!("Error getting cutoff attendance: {error}");
                Value::Array(Vec::new())
            }
        },
    )
}

/// `attendance:get-monthly-report`.
#[tauri::command]
pub fn get_monthly_attendance_report(state: Shared<'_>, year: i64, month: i64) -> Reply {
    Ok(
        match state.with_db(|conn| db::attendance::monthly_report(conn, year, month)) {
            Ok(rows) => Value::Array(rows),
            Err(error) => {
                eprintln!("Error getting monthly attendance report: {error}");
                Value::Array(Vec::new())
            }
        },
    )
}

/// `attendance:get-today`.
#[tauri::command]
pub fn get_today_attendance(state: Shared<'_>) -> Reply {
    Ok(match state.with_db(db::attendance::get_today) {
        Ok(rows) => Value::Array(rows),
        Err(error) => {
            eprintln!("Error getting today's attendance: {error}");
            Value::Array(Vec::new())
        }
    })
}

/// `attendance:get-by-date`. New in the port, replacing the ad-hoc
/// `SELECT * FROM attendance WHERE date = ?` the attendance screen sent through
/// the raw SQL passthrough.
#[tauri::command]
pub fn get_attendance_by_date(state: Shared<'_>, date: String) -> Reply {
    state
        .with_db(|conn| db::attendance::get_by_date(conn, &date))
        .map(Value::Array)
        .map_err(|error| {
            eprintln!("Error getting attendance for {date}: {error}");
            error.to_string()
        })
}

/// `attendance:delete`. Also new, for the same reason.
#[tauri::command]
pub fn delete_attendance(state: Shared<'_>, employee_id: Value, date: String) -> Reply {
    state
        .with_db(|conn| db::attendance::delete_for(conn, &employee_id, &date))
        .map_err(|error| error.to_string())
}

/// `attendance:get-today-summary`. The zeroed summary is the handler's own
/// fallback, and `get_today_summary` already returns it on failure.
#[tauri::command]
pub fn get_today_attendance_summary(state: Shared<'_>) -> Reply {
    Ok(state.with_db(db::attendance::get_today_summary))
}

/// `attendance:get-weekly`.
#[tauri::command]
pub fn get_weekly_attendance(state: Shared<'_>) -> Reply {
    Ok(match state.with_db(db::attendance::get_weekly) {
        Ok(rows) => Value::Array(rows),
        Err(error) => {
            eprintln!("Error getting weekly attendance: {error}");
            Value::Array(Vec::new())
        }
    })
}

/// `attendance:record` — the one attendance handler that rethrew.
#[tauri::command]
pub fn record_attendance(state: Shared<'_>, attendance: Value) -> Reply {
    state
        .with_db(|conn| db::attendance::record(conn, &attendance))
        .map_err(|error| {
            eprintln!("Error recording attendance: {error}");
            error.to_string()
        })
}

/// `attendance:get-latest` — grouped with the employee handlers in `main.js`,
/// where it resolved `null` on failure.
#[tauri::command]
pub fn get_latest_attendance(state: Shared<'_>, employee_id: Value) -> Reply {
    Ok(state
        .with_db(|conn| db::employees::latest_attendance(conn, &employee_id))
        .unwrap_or(Value::Null))
}

