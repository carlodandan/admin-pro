//! `payroll:*` channels.

use serde_json::Value;

use crate::commands::{Reply, Shared};
use crate::db;

/// `payroll:get-all`.
#[tauri::command]
pub fn get_all_payroll(state: Shared<'_>) -> Reply {
    Ok(match state.with_db(db::payroll::get_all) {
        Ok(rows) => Value::Array(rows),
        Err(error) => {
            eprintln!("Error getting all payroll: {error}");
            Value::Array(Vec::new())
        }
    })
}

/// `payroll:get-by-cutoff`.
#[tauri::command]
pub fn get_payroll_by_cutoff(
    state: Shared<'_>,
    year: i64,
    month: i64,
    cutoff_type: String,
) -> Reply {
    Ok(
        match state.with_db(|conn| db::payroll::by_cutoff(conn, year, month, &cutoff_type)) {
            Ok(rows) => Value::Array(rows),
            Err(error) => {
                eprintln!("Error getting payroll by cutoff: {error}");
                Value::Array(Vec::new())
            }
        },
    )
}

/// `payroll:get-by-employee-period`.
#[tauri::command]
pub fn get_payroll_by_employee_period(
    state: Shared<'_>,
    employee_id: Value,
    year: i64,
    month: i64,
) -> Reply {
    let found =
        state.with_db(|conn| db::payroll::by_employee_and_period(conn, &employee_id, year, month));

    Ok(match found {
        Ok(row) => row.unwrap_or(Value::Null),
        Err(error) => {
            eprintln!("Error getting payroll by employee and period: {error}");
            Value::Null
        }
    })
}

/// `payroll:get-summary`.
#[tauri::command]
pub fn get_payroll_summary(state: Shared<'_>, year: i64, month: i64) -> Reply {
    Ok(
        match state.with_db(|conn| db::payroll::summary(conn, year, month)) {
            Ok(rows) => Value::Array(rows),
            Err(error) => {
                eprintln!("Error getting payroll summary: {error}");
                Value::Array(Vec::new())
            }
        },
    )
}

/// `payroll:mark-paid`. `paymentDate` is optional at the call site, and
/// `markPayrollAsPaid` falls back to today when it is missing.
#[tauri::command]
pub fn mark_payroll_as_paid(
    state: Shared<'_>,
    payroll_id: Value,
    payment_date: Option<String>,
) -> Reply {
    let payment_date = payment_date.filter(|date| !date.is_empty());
    state
        .with_db(|conn| db::payroll::mark_as_paid(conn, &payroll_id, payment_date.as_deref()))
        .map_err(|error| {
            eprintln!("Error marking payroll as paid: {error}");
            error.to_string()
        })
}

/// `payroll:process-bi-monthly`.
#[tauri::command]
pub fn process_bi_monthly_payroll(state: Shared<'_>, payroll_data: Value) -> Reply {
    state
        .with_db(|conn| db::payroll::process_bi_monthly(conn, &payroll_data))
        .map_err(|error| {
            eprintln!("Error processing bi-monthly payroll: {error}");
            error.to_string()
        })
}

/// `payroll:process`.
#[tauri::command]
pub fn process_payroll(state: Shared<'_>, payroll_data: Value) -> Reply {
    state
        .with_db(|conn| db::payroll::process(conn, &payroll_data))
        .map_err(|error| {
            eprintln!("Error processing payroll: {error}");
            error.to_string()
        })
}

