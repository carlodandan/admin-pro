//! `getRecentActivities()` — the dashboard feed, transcribed from
//! `DatabaseService`. One `UNION ALL` over eight event sources, newest first.
//!
//! The `timestamp` column mixes two clocks in the original: attendance rows
//! concatenate `date || ' ' || check_in`, which the kiosk writes in Manila
//! local time, while `created_at`/`updated_at` default to SQLite's
//! `CURRENT_TIMESTAMP`, which is UTC. The feed then sorted them against each
//! other and the renderer subtracted them from `Date.now()`, so every row from
//! a metadata column read eight hours in the future and collapsed to "Just
//! now". The UTC columns are converted to Manila here so the column carries one
//! clock, and `parseStoredTimestamp` on the renderer side reads it as Manila
//! regardless of how the machine is configured.

use rusqlite::types::Value as SqlValue;
use rusqlite::Connection;
use serde_json::Value;

use crate::json::query_all;

const RECENT_ACTIVITIES: &str = r#"
    SELECT * FROM (
        -- Attendance: Check-ins
        SELECT
            'attendance' as type,
            'checked in' as action,
            (a.date || ' ' || a.check_in) as timestamp,
            e.first_name,
            e.last_name
        FROM attendance a
        JOIN employees e ON a.employee_id = e.id
        WHERE a.check_in IS NOT NULL AND a.check_in != ''

        UNION ALL

        -- Attendance: Check-outs
        SELECT
            'attendance' as type,
            'checked out' as action,
            (a.date || ' ' || a.check_out) as timestamp,
            e.first_name,
            e.last_name
        FROM attendance a
        JOIN employees e ON a.employee_id = e.id
        WHERE a.check_out IS NOT NULL AND a.check_out != ''

        UNION ALL

        -- Employees: Joined
        SELECT
            'employee' as type,
            'joined the team' as action,
            datetime(created_at, '+8 hours') as timestamp,
            first_name,
            last_name
        FROM employees

        UNION ALL

        -- Employees: Updated
        SELECT
            'employee' as type,
            'profile was updated' as action,
            datetime(updated_at, '+8 hours') as timestamp,
            first_name,
            last_name
        FROM employees
        WHERE updated_at != created_at

        UNION ALL

        -- Departments: Created
        SELECT
            'department' as type,
            'department "' || name || '" was created' as action,
            datetime(created_at, '+8 hours') as timestamp,
            'System' as first_name,
            '' as last_name
        FROM departments

        UNION ALL

        -- Departments: Updated
        SELECT
            'department' as type,
            'department "' || name || '" was updated' as action,
            datetime(updated_at, '+8 hours') as timestamp,
            'System' as first_name,
            '' as last_name
        FROM departments
        WHERE updated_at != created_at

        UNION ALL

        -- Payroll: Processed
        SELECT
            'payroll' as type,
            'payroll was processed (' || cutoff_start || ' to ' || cutoff_end || ')' as action,
            datetime(p.created_at, '+8 hours') as timestamp,
            e.first_name,
            e.last_name
        FROM payroll p
        JOIN employees e ON p.employee_id = e.id

        UNION ALL

        -- Payroll: Paid
        SELECT
            'payroll' as type,
            'payroll was marked as paid' as action,
            p.payment_date as timestamp,
            e.first_name,
            e.last_name
        FROM payroll p
        JOIN employees e ON p.employee_id = e.id
        WHERE p.status = 'Paid' AND p.payment_date IS NOT NULL
    )
    ORDER BY timestamp DESC
    LIMIT ?
"#;

/// Returns `[]` on error, as the original did.
pub fn get_recent(conn: &Connection, limit: i64) -> Vec<Value> {
    match query_all(conn, RECENT_ACTIVITIES, &[&SqlValue::Integer(limit)]) {
        Ok(rows) => rows,
        Err(error) => {
            eprintln!("Error getting recent activities: {error}");
            Vec::new()
        }
    }
}
