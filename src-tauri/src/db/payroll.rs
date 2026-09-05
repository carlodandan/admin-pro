//! Payroll queries, transcribed from `DatabaseService`.

use rusqlite::types::Value as SqlValue;
use rusqlite::Connection;
use serde_json::{json, Value};

use crate::error::Result;
use crate::json::{f64_or, i64_or, json_to_sql, opt_str, query_all, query_opt};
use crate::manila;

const SELECT_WITH_EMPLOYEE: &str = r#"
    SELECT
        p.*,
        e.first_name || ' ' || e.last_name as employee_name,
        e.position,
        e.salary as monthly_salary,
        d.name as department_name
    FROM payroll p
    INNER JOIN employees e ON p.employee_id = e.id
    LEFT JOIN departments d ON e.department_id = d.id
"#;

const INSERT: &str = r#"
    INSERT INTO payroll (
        employee_id, cutoff_start, cutoff_end, basic_salary,
        allowances, deductions, net_salary, status, payment_date,
        cutoff_type, working_days, days_present, daily_rate, breakdown
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
"#;

/// Last calendar day of `month`, so a month-bounded query covers February and
/// the 30-day months. The original hard-coded `-31`, which `date()` rejects for
/// short months and which silently returned nothing.
fn month_end(year: i64, month: i64) -> String {
    let (next_year, next_month) = if month >= 12 {
        (year + 1, 1)
    } else {
        (year, month + 1)
    };
    let last = chrono::NaiveDate::from_ymd_opt(next_year as i32, next_month as u32, 1)
        .and_then(|first_of_next| first_of_next.pred_opt())
        .map(|date| date.format("%Y-%m-%d").to_string());
    last.unwrap_or_else(|| format!("{year}-{month:02}-28"))
}

/// Shared body of `processPayroll` and `processBiMonthlyPayroll`; the two differ
/// only in their defaults.
fn insert(
    conn: &Connection,
    data: &Value,
    default_cutoff_type: &str,
    default_days: i64,
    default_daily_rate: f64,
) -> Result<Value> {
    let status = match opt_str(data, "status") {
        Some(status) if !status.is_empty() => status,
        _ => "Pending".to_string(),
    };
    let payment_date = match opt_str(data, "payment_date") {
        Some(date) if !date.is_empty() => SqlValue::Text(date),
        _ => SqlValue::Null,
    };
    let cutoff_type = match opt_str(data, "cutoff_type") {
        Some(value) if !value.is_empty() => value,
        _ => default_cutoff_type.to_string(),
    };
    // The column holds JSON *text*. `Value::to_string()` on a `Value::String`
    // re-encodes it — quotes and all — so a caller passing the
    // `JSON.stringify(...)` the Electron build passed would have stored
    // `"{\"a\":1}"`, which needs parsing twice to read back. A string arrives
    // already encoded and is stored as it is; anything else is serialised.
    let breakdown = match data.get("breakdown") {
        Some(Value::String(text)) if !text.is_empty() => text.clone(),
        Some(value) if !value.is_null() => value.to_string(),
        _ => "{}".to_string(),
    };

    conn.execute(
        INSERT,
        rusqlite::params![
            json_to_sql(data.get("employee_id").unwrap_or(&Value::Null)),
            json_to_sql(data.get("cutoff_start").unwrap_or(&Value::Null)),
            json_to_sql(data.get("cutoff_end").unwrap_or(&Value::Null)),
            json_to_sql(data.get("basic_salary").unwrap_or(&Value::Null)),
            f64_or(data, "allowances", 0.0),
            f64_or(data, "deductions", 0.0),
            json_to_sql(data.get("net_salary").unwrap_or(&Value::Null)),
            status,
            payment_date,
            cutoff_type,
            i64_or(data, "working_days", default_days),
            i64_or(data, "days_present", default_days),
            f64_or(data, "daily_rate", default_daily_rate),
            breakdown,
        ],
    )?;

    Ok(json!({ "id": conn.last_insert_rowid(), "changes": 1 }))
}

/// `processPayroll()` — full-month run.
pub fn process(conn: &Connection, data: &Value) -> Result<Value> {
    let default_daily_rate = f64_or(data, "basic_salary", 0.0) / 24.0;
    insert(conn, data, "Full Month", 24, default_daily_rate)
}

/// `processBiMonthlyPayroll()` — one half of the month.
pub fn process_bi_monthly(conn: &Connection, data: &Value) -> Result<Value> {
    insert(conn, data, "First Half", 12, 0.0)
}

pub fn get_all(conn: &Connection) -> Result<Vec<Value>> {
    query_all(
        conn,
        &format!("{SELECT_WITH_EMPLOYEE} ORDER BY p.cutoff_end DESC"),
        &[],
    )
}

/// `getPayrollSummary(year, month)` — every run whose cutoff falls inside the
/// month. Note `e.salary` is aliased `basic_salary` here, shadowing the
/// payroll row's own column; the frontend reads the employee figure.
pub fn summary(conn: &Connection, year: i64, month: i64) -> Result<Vec<Value>> {
    let start = format!("{year}-{month:02}-01");
    let end = month_end(year, month);

    query_all(
        conn,
        r#"
        SELECT
            p.*,
            e.first_name || ' ' || e.last_name as employee_name,
            e.position,
            e.salary as basic_salary,
            d.name as department_name
        FROM payroll p
        INNER JOIN employees e ON p.employee_id = e.id
        LEFT JOIN departments d ON e.department_id = d.id
        WHERE p.cutoff_start >= date(?) AND p.cutoff_end <= date(?)
        ORDER BY p.cutoff_end DESC, e.last_name
        "#,
        &[&SqlValue::Text(start), &SqlValue::Text(end)],
    )
}

/// `markPayrollAsPaid(payrollId, paymentDate = null)`.
pub fn mark_as_paid(conn: &Connection, payroll_id: &Value, payment_date: Option<&str>) -> Result<Value> {
    let date = match payment_date {
        Some(date) if !date.is_empty() => date.to_string(),
        _ => manila::date(),
    };

    let changes = conn.execute(
        "UPDATE payroll SET status = 'Paid', payment_date = ? WHERE id = ?",
        rusqlite::params![date, json_to_sql(payroll_id)],
    )?;

    Ok(json!({ "changes": changes }))
}

/// `getPayrollByEmployeeAndPeriod(employeeId, year, month)` — the existing run
/// for one employee in one month, used to block double processing.
pub fn by_employee_and_period(
    conn: &Connection,
    employee_id: &Value,
    year: i64,
    month: i64,
) -> Result<Option<Value>> {
    let start = format!("{year}-{month:02}-01");
    let end = month_end(year, month);

    query_opt(
        conn,
        r#"
        SELECT * FROM payroll
        WHERE employee_id = ?
            AND cutoff_start >= date(?)
            AND cutoff_end <= date(?)
        "#,
        &[
            &json_to_sql(employee_id),
            &SqlValue::Text(start),
            &SqlValue::Text(end),
        ],
    )
}

/// `getPayrollByCutoff(year, month, cutoffType)` — 1st–10th for `First Half`,
/// 11th–25th otherwise, matched on the exact cutoff dates.
pub fn by_cutoff(
    conn: &Connection,
    year: i64,
    month: i64,
    cutoff_type: &str,
) -> Result<Vec<Value>> {
    let is_first_half = cutoff_type == "First Half";
    let start = format!("{year}-{month:02}-{}", if is_first_half { "01" } else { "11" });
    let end = format!("{year}-{month:02}-{}", if is_first_half { "10" } else { "25" });

    let mut rows = query_all(
        conn,
        &format!(
            "{SELECT_WITH_EMPLOYEE} \
             WHERE p.cutoff_start = date(?) AND p.cutoff_end = date(?) \
             ORDER BY e.last_name"
        ),
        &[&SqlValue::Text(start), &SqlValue::Text(end)],
    )?;

    // `cutoff_type: row.cutoff_type || cutoffType` — fill in the requested half
    // when the stored row predates that column.
    for row in &mut rows {
        let missing = row
            .get("cutoff_type")
            .map(|value| match value {
                Value::String(text) => text.is_empty(),
                Value::Null => true,
                _ => false,
            })
            .unwrap_or(true);
        if missing {
            if let Some(object) = row.as_object_mut() {
                object.insert("cutoff_type".to_string(), json!(cutoff_type));
            }
        }
    }

    Ok(rows)
}

