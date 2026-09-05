//! `getAnalyticsData()` and its six sub-queries, transcribed from
//! `DatabaseService`. Each sub-query swallows its own errors and returns `[]`,
//! so a single bad section cannot empty the whole Analytics page.

use rusqlite::types::Value as SqlValue;
use rusqlite::Connection;
use serde_json::{json, Value};

use crate::json::{opt_str, query_all};

/// Appends `AND <clause>` for each filter that was supplied, mirroring the
/// original's `if (startDate) { sql += ... }` pattern.
fn filtered(
    conn: &Connection,
    base: &str,
    tail: &str,
    clauses: &[(&str, Option<String>)],
    label: &str,
) -> Vec<Value> {
    let mut sql = base.to_string();
    let mut values: Vec<SqlValue> = Vec::new();

    for (clause, value) in clauses {
        if let Some(value) = value {
            if value.is_empty() {
                continue;
            }
            sql.push_str(&format!(" AND {clause}"));
            values.push(SqlValue::Text(value.clone()));
        }
    }
    sql.push_str(tail);

    let params: Vec<&dyn rusqlite::ToSql> =
        values.iter().map(|v| v as &dyn rusqlite::ToSql).collect();

    match query_all(conn, &sql, params.as_slice()) {
        Ok(rows) => rows,
        Err(error) => {
            eprintln!("Error getting {label}: {error}");
            Vec::new()
        }
    }
}

pub fn employee_growth_trend(
    conn: &Connection,
    start_date: Option<String>,
    end_date: Option<String>,
) -> Vec<Value> {
    filtered(
        conn,
        r#"
        SELECT
            strftime('%Y-%m', created_at) as month,
            COUNT(*) as count,
            SUM(CASE WHEN status = 'Active' THEN 1 ELSE 0 END) as active_count
        FROM employees
        WHERE 1=1
        "#,
        " GROUP BY strftime('%Y-%m', created_at) ORDER BY month ASC",
        &[
            ("created_at >= ?", start_date),
            ("created_at <= ?", end_date),
        ],
        "employee growth trend",
    )
}

pub fn attendance_trends(
    conn: &Connection,
    start_date: Option<String>,
    end_date: Option<String>,
) -> Vec<Value> {
    filtered(
        conn,
        r#"
        SELECT
            strftime('%Y-%m', date) as month,
            COUNT(*) as total_records,
            SUM(CASE WHEN status = 'Present' THEN 1 ELSE 0 END) as present,
            SUM(CASE WHEN status = 'Absent' THEN 1 ELSE 0 END) as absent,
            SUM(CASE WHEN status = 'Late' THEN 1 ELSE 0 END) as late,
            SUM(CASE WHEN status = 'On Leave' THEN 1 ELSE 0 END) as on_leave,
            ROUND(
                CAST(SUM(CASE WHEN status = 'Present' THEN 1 ELSE 0 END) AS FLOAT) /
                NULLIF(COUNT(*), 0) * 100, 1
            ) as attendance_rate
        FROM attendance
        WHERE 1=1
        "#,
        " GROUP BY strftime('%Y-%m', date) ORDER BY month ASC",
        &[("date >= ?", start_date), ("date <= ?", end_date)],
        "attendance trends",
    )
}

pub fn payroll_cost_trends(
    conn: &Connection,
    start_date: Option<String>,
    end_date: Option<String>,
) -> Vec<Value> {
    filtered(
        conn,
        r#"
        SELECT
            strftime('%Y-%m', cutoff_start) as month,
            SUM(basic_salary) as total_basic,
            SUM(allowances) as total_allowances,
            SUM(deductions) as total_deductions,
            SUM(net_salary) as total_net,
            COUNT(DISTINCT employee_id) as employee_count,
            SUM(CASE WHEN status = 'Paid' THEN 1 ELSE 0 END) as paid_count,
            SUM(CASE WHEN status = 'Pending' THEN 1 ELSE 0 END) as pending_count
        FROM payroll
        WHERE 1=1
        "#,
        " GROUP BY strftime('%Y-%m', cutoff_start) ORDER BY month ASC",
        &[
            ("cutoff_start >= ?", start_date),
            ("cutoff_end <= ?", end_date),
        ],
        "payroll cost trends",
    )
}

pub fn department_comparison(conn: &Connection) -> Vec<Value> {
    filtered(
        conn,
        r#"
        SELECT
            d.id,
            d.name,
            d.budget,
            COUNT(e.id) as headcount,
            COALESCE(ROUND(AVG(e.salary), 2), 0) as avg_salary,
            COALESCE(SUM(e.salary), 0) as total_salary_cost
        FROM departments d
        LEFT JOIN employees e ON e.department_id = d.id AND e.status = 'Active'
        "#,
        " GROUP BY d.id ORDER BY headcount DESC",
        &[],
        "department comparison",
    )
}

pub fn employee_status_breakdown(conn: &Connection, department_id: Option<String>) -> Vec<Value> {
    filtered(
        conn,
        r#"
        SELECT status, COUNT(*) as count
        FROM employees
        WHERE 1=1
        "#,
        " GROUP BY status ORDER BY count DESC",
        &[("department_id = ?", department_id)],
        "employee status breakdown",
    )
}

pub fn salary_distribution(conn: &Connection, department_id: Option<String>) -> Vec<Value> {
    filtered(
        conn,
        r#"
        SELECT
            CASE
                WHEN salary < 10000 THEN 'Below 10K'
                WHEN salary >= 10000 AND salary < 20000 THEN '10K-20K'
                WHEN salary >= 20000 AND salary < 30000 THEN '20K-30K'
                WHEN salary >= 30000 AND salary < 50000 THEN '30K-50K'
                WHEN salary >= 50000 AND salary < 75000 THEN '50K-75K'
                WHEN salary >= 75000 AND salary < 100000 THEN '75K-100K'
                ELSE '100K+'
            END as salary_range,
            COUNT(*) as count,
            ROUND(AVG(salary), 2) as avg_in_range
        FROM employees
        WHERE status = 'Active'
        "#,
        " GROUP BY salary_range ORDER BY MIN(salary) ASC",
        &[("department_id = ?", department_id)],
        "salary distribution",
    )
}

/// `getAnalyticsData(filters)` — the six sections in one object.
pub fn get_data(conn: &Connection, filters: &Value) -> Value {
    let start_date = opt_str(filters, "startDate");
    let end_date = opt_str(filters, "endDate");
    let department_id = match filters.get("departmentId") {
        // `if (departmentId)` — 0 and "" are falsy in the original.
        Some(Value::Number(number)) if number.as_f64() != Some(0.0) => Some(number.to_string()),
        Some(Value::String(text)) if !text.is_empty() => Some(text.clone()),
        _ => None,
    };

    json!({
        "employeeGrowth": employee_growth_trend(conn, start_date.clone(), end_date.clone()),
        "attendanceTrends": attendance_trends(conn, start_date.clone(), end_date.clone()),
        "payrollCostTrends": payroll_cost_trends(conn, start_date, end_date),
        "departmentComparison": department_comparison(conn),
        "employeeStatusBreakdown": employee_status_breakdown(conn, department_id.clone()),
        "salaryDistribution": salary_distribution(conn, department_id),
    })
}
