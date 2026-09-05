//! Attendance queries, transcribed from `DatabaseService`.

use rusqlite::types::Value as SqlValue;
use rusqlite::Connection;
use serde_json::{json, Value};

use crate::error::Result;
use crate::json::{json_to_sql, query_all, query_opt};
use crate::manila;

pub fn get_today(conn: &Connection) -> Result<Vec<Value>> {
    query_all(
        conn,
        r#"
        SELECT
            a.*,
            e.first_name || ' ' || e.last_name as employee_name,
            e.position,
            d.name as department_name
        FROM attendance a
        INNER JOIN employees e ON a.employee_id = e.id
        LEFT JOIN departments d ON e.department_id = d.id
        WHERE date(a.date) = date(?)
        ORDER BY a.check_in DESC
        "#,
        &[&SqlValue::Text(manila::date())],
    )
}

/// The same joined shape as `get_today`, for an arbitrary date. `Attendance.jsx`
/// used to ask for this through the raw `query` passthrough with its own
/// `SELECT * FROM attendance WHERE date = ?`, which is why that passthrough
/// existed; ordering stays on `employee_id`, as the screen had it.
pub fn get_by_date(conn: &Connection, date: &str) -> Result<Vec<Value>> {
    query_all(
        conn,
        r#"
        SELECT
            a.*,
            e.first_name || ' ' || e.last_name as employee_name,
            e.position,
            d.name as department_name
        FROM attendance a
        INNER JOIN employees e ON a.employee_id = e.id
        LEFT JOIN departments d ON e.department_id = d.id
        WHERE date(a.date) = date(?)
        ORDER BY a.employee_id
        "#,
        &[&SqlValue::Text(date.to_string())],
    )
}

/// The other half of what the passthrough was used for: clearing one employee's
/// punch on one date.
pub fn delete_for(conn: &Connection, employee_id: &Value, date: &str) -> Result<Value> {
    let changes = conn.execute(
        "DELETE FROM attendance WHERE employee_id = ? AND date = ?",
        rusqlite::params![json_to_sql(employee_id), date],
    )?;
    Ok(json!({ "success": changes > 0, "changes": changes }))
}

/// `recordAttendance()` — upsert keyed on `(employee_id, date)`.
pub fn record(conn: &Connection, attendance: &Value) -> Result<Value> {
    // `value || null` in the original: empty strings fall back too.
    let nullable = |key: &str| match crate::json::opt_str(attendance, key) {
        Some(text) if !text.is_empty() => SqlValue::Text(text),
        _ => SqlValue::Null,
    };
    let status = match crate::json::opt_str(attendance, "status") {
        Some(status) if !status.is_empty() => status,
        _ => "Present".to_string(),
    };

    conn.execute(
        r#"INSERT INTO attendance
               (employee_id, date, check_in, check_out, status, notes)
           VALUES (?, ?, ?, ?, ?, ?)
           ON CONFLICT(employee_id, date) DO UPDATE SET
               check_in = COALESCE(excluded.check_in, attendance.check_in),
               check_out = COALESCE(excluded.check_out, attendance.check_out),
               status = COALESCE(excluded.status, attendance.status),
               notes = COALESCE(excluded.notes, attendance.notes)"#,
        rusqlite::params![
            json_to_sql(attendance.get("employee_id").unwrap_or(&Value::Null)),
            json_to_sql(attendance.get("date").unwrap_or(&Value::Null)),
            nullable("check_in"),
            nullable("check_out"),
            status,
            nullable("notes"),
        ],
    )?;

    Ok(json!({
        "id": conn.last_insert_rowid(),
        "changes": 1,
    }))
}

/// `getWeeklyAttendance()` — the seven days ending today, in Asia/Manila.
pub fn get_weekly(conn: &Connection) -> Result<Vec<Value>> {
    let start = manila::date_days_ago(6);
    let end = manila::date();

    let rows = query_all(
        conn,
        r#"
        SELECT
            date(a.date) as date,
            strftime('%w', a.date) as day_of_week,
            COUNT(CASE WHEN a.status = 'Present' THEN 1 END) as present,
            COUNT(CASE WHEN a.status = 'Absent' THEN 1 END) as absent,
            COUNT(CASE WHEN a.status = 'Late' THEN 1 END) as late,
            COUNT(CASE WHEN a.status = 'On Leave' THEN 1 END) as leave,
            COUNT(*) as total
        FROM attendance a
        WHERE date(a.date) BETWEEN date(?) AND date(?)
        GROUP BY date(a.date)
        ORDER BY date(a.date) ASC
        "#,
        &[&SqlValue::Text(start), &SqlValue::Text(end)],
    )?;

    let count = |row: Option<&Value>, key: &str| -> i64 {
        row.and_then(|row| row.get(key))
            .and_then(Value::as_i64)
            .unwrap_or(0)
    };

    let mut weekly = Vec::with_capacity(7);
    for offset in (0..7).rev() {
        let date = manila::date_days_ago(offset);
        let day_data = rows
            .iter()
            .find(|row| row.get("date").and_then(Value::as_str) == Some(date.as_str()));

        weekly.push(json!({
            "day": manila::weekday_short(&date),
            "date": date,
            "present": count(day_data, "present"),
            "absent": count(day_data, "absent"),
            "late": count(day_data, "late"),
            "leave": count(day_data, "leave"),
            "total": count(day_data, "total"),
        }));
    }

    Ok(weekly)
}

/// The all-zero summary the original returned on no data and on error.
pub fn empty_summary() -> Value {
    json!({
        "presentToday": 0,
        "absentToday": 0,
        "lateToday": 0,
        "leaveToday": 0,
        "attendanceRate": "0%",
    })
}

/// `getTodayAttendanceSummary()`.
pub fn get_today_summary(conn: &Connection) -> Value {
    let row = query_opt(
        conn,
        r#"
        SELECT
            COUNT(CASE WHEN a.status = 'Present' THEN 1 END) as present,
            COUNT(CASE WHEN a.status = 'Absent' THEN 1 END) as absent,
            COUNT(CASE WHEN a.status = 'Late' THEN 1 END) as late,
            COUNT(CASE WHEN a.status = 'On Leave' THEN 1 END) as leave,
            COUNT(*) as total
        FROM attendance a
        WHERE date(a.date) = date(?)
        "#,
        &[&SqlValue::Text(manila::date())],
    );

    let Ok(Some(row)) = row else {
        if let Err(error) = row {
            eprintln!("Error getting today's attendance summary: {error}");
        }
        return empty_summary();
    };

    let field = |key: &str| row.get(key).and_then(Value::as_i64).unwrap_or(0);
    let total = field("total");
    if total == 0 {
        return empty_summary();
    }

    let present = field("present");
    // `((present / total) * 100).toFixed(1)`
    let rate = format!("{:.1}", (present as f64 / total as f64) * 100.0);

    json!({
        "presentToday": present,
        "absentToday": field("absent"),
        "lateToday": field("late"),
        "leaveToday": field("leave"),
        "attendanceRate": format!("{rate}%"),
    })
}

/// `getMonthlyAttendanceReport(year, month)`.
pub fn monthly_report(conn: &Connection, year: i64, month: i64) -> Result<Vec<Value>> {
    let period = format!("{year}-{month:02}");

    query_all(
        conn,
        r#"
        SELECT
            e.id as employee_id,
            e.first_name || ' ' || e.last_name as employee_name,
            d.name as department_name,
            COUNT(CASE WHEN a.status = 'Present' THEN 1 END) as present_days,
            COUNT(CASE WHEN a.status = 'Absent' THEN 1 END) as absent_days,
            COUNT(CASE WHEN a.status = 'Late' THEN 1 END) as late_days,
            COUNT(CASE WHEN a.status = 'On Leave' THEN 1 END) as leave_days,
            COUNT(a.id) as total_recorded_days
        FROM employees e
        LEFT JOIN departments d ON e.department_id = d.id
        LEFT JOIN attendance a ON e.id = a.employee_id
            AND strftime('%Y-%m', a.date) = ?
        WHERE e.status = 'Active'
        GROUP BY e.id
        ORDER BY e.first_name, e.last_name
        "#,
        &[&SqlValue::Text(period)],
    )
}

/// `getAttendanceForCutoff(year, month, isFirstHalf)` — 1st–10th or 11th–25th.
pub fn for_cutoff(
    conn: &Connection,
    year: i64,
    month: i64,
    is_first_half: bool,
) -> Result<Vec<Value>> {
    let start = format!("{year}-{month:02}-{}", if is_first_half { "01" } else { "11" });
    let end = format!("{year}-{month:02}-{}", if is_first_half { "10" } else { "25" });

    query_all(
        conn,
        r#"
        SELECT
            e.id as employee_id,
            e.first_name || ' ' || e.last_name as employee_name,
            e.salary as monthly_salary,
            COUNT(CASE WHEN a.status = 'Present' THEN 1 END) as days_present,
            COUNT(CASE WHEN a.status = 'Absent' THEN 1 END) as days_absent,
            COUNT(CASE WHEN a.status = 'Late' THEN 1 END) as days_late,
            COUNT(CASE WHEN a.status = 'On Leave' THEN 1 END) as days_leave,
            COUNT(*) as total_recorded_days
        FROM employees e
        LEFT JOIN attendance a ON e.id = a.employee_id
            AND date(a.date) BETWEEN date(?) AND date(?)
        WHERE e.status = 'Active'
        GROUP BY e.id
        ORDER BY e.first_name, e.last_name
        "#,
        &[&SqlValue::Text(start), &SqlValue::Text(end)],
    )
}
