//! Employee queries, transcribed from `DatabaseService`.

use rusqlite::types::Value as SqlValue;
use rusqlite::Connection;
use serde_json::{json, Value};

use crate::error::Result;
use crate::json::{json_to_sql, query_all, query_opt};
use crate::manila;

const SELECT_WITH_DEPARTMENT: &str = r#"
    SELECT
        e.*,
        d.name as department_name
    FROM employees e
    LEFT JOIN departments d ON e.department_id = d.id
"#;

pub fn get_all(conn: &Connection) -> Result<Vec<Value>> {
    query_all(
        conn,
        &format!("{SELECT_WITH_DEPARTMENT} ORDER BY e.created_at DESC"),
        &[],
    )
}

pub fn get_by_id(conn: &Connection, id: &Value) -> Result<Option<Value>> {
    query_opt(
        conn,
        &format!("{SELECT_WITH_DEPARTMENT} WHERE e.id = ?"),
        &[&json_to_sql(id)],
    )
}

/// Local half of `createEmployee()`. The Supabase insert happens first, in the
/// command layer, so that its generated UUID lands in `supabase_id` here.
pub fn insert_local(
    conn: &Connection,
    employee: &Value,
    pin_code: &str,
    supabase_id: &str,
) -> Result<Value> {
    let department_id = match employee.get("department_id") {
        Some(Value::Null) | None => SqlValue::Null,
        Some(value) => {
            let bound = json_to_sql(value);
            // `employee.department_id || null` — 0 and "" are falsy in JS.
            match &bound {
                SqlValue::Integer(0) => SqlValue::Null,
                SqlValue::Real(f) if *f == 0.0 => SqlValue::Null,
                SqlValue::Text(text) if text.is_empty() => SqlValue::Null,
                _ => bound,
            }
        }
    };

    let status = match crate::json::opt_str(employee, "status") {
        Some(status) if !status.is_empty() => status,
        _ => "Active".to_string(),
    };

    conn.execute(
        r#"INSERT INTO employees (
               company_id, first_name, last_name, email, phone,
               department_id, position, salary, hire_date, status, pin_code, supabase_id
           )
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)"#,
        rusqlite::params![
            json_to_sql(employee.get("company_id").unwrap_or(&Value::Null)),
            json_to_sql(employee.get("first_name").unwrap_or(&Value::Null)),
            json_to_sql(employee.get("last_name").unwrap_or(&Value::Null)),
            json_to_sql(employee.get("email").unwrap_or(&Value::Null)),
            json_to_sql(employee.get("phone").unwrap_or(&Value::Null)),
            department_id,
            json_to_sql(employee.get("position").unwrap_or(&Value::Null)),
            json_to_sql(employee.get("salary").unwrap_or(&Value::Null)),
            json_to_sql(employee.get("hire_date").unwrap_or(&Value::Null)),
            status,
            pin_code,
            supabase_id,
        ],
    )?;

    Ok(json!({
        "id": conn.last_insert_rowid(),
        "changes": 1,
        "supabaseId": supabase_id,
    }))
}

/// `updateEmployee()` — a dynamic `SET` list over the supplied keys.
pub fn update(conn: &Connection, id: &Value, data: &Value) -> Result<Value> {
    let Some(object) = data.as_object() else {
        return Ok(json!({ "changes": 0 }));
    };

    let mut assignments = Vec::new();
    let mut values: Vec<SqlValue> = Vec::new();
    for (key, value) in object {
        if key == "id" || !is_employee_column(key) {
            continue;
        }
        assignments.push(format!("{key} = ?"));
        values.push(json_to_sql(value));
    }
    assignments.push("updated_at = CURRENT_TIMESTAMP".to_string());

    let sql = format!(
        "UPDATE employees SET {} WHERE id = ?",
        assignments.join(", ")
    );
    values.push(json_to_sql(id));

    let params: Vec<&dyn rusqlite::ToSql> =
        values.iter().map(|v| v as &dyn rusqlite::ToSql).collect();
    let changes = conn.execute(&sql, params.as_slice())?;
    Ok(json!({ "changes": changes }))
}

/// Columns `updateEmployee` is allowed to write. The JavaScript version
/// interpolated any key it was handed straight into the SQL; restricting it to
/// real columns keeps the same behaviour for every caller in the app while
/// removing the injection surface.
fn is_employee_column(key: &str) -> bool {
    matches!(
        key,
        "company_id"
            | "first_name"
            | "last_name"
            | "email"
            | "phone"
            | "position"
            | "department_id"
            | "salary"
            | "hire_date"
            | "status"
            | "pin_code"
            | "supabase_id"
            | "created_at"
            | "updated_at"
    )
}

pub fn delete(conn: &Connection, id: &Value) -> Result<Value> {
    let changes = conn.execute("DELETE FROM employees WHERE id = ?", [json_to_sql(id)])?;
    Ok(json!({ "changes": changes }))
}

/// `verifyEmployeePin()` — the kiosk sign-in check.
pub fn verify_pin(conn: &Connection, employee_id: &Value, pin: &Value) -> Value {
    let lookup = query_opt(
        conn,
        "SELECT * FROM employees WHERE (id = ? OR company_id = ?) AND pin_code = ?",
        &[
            &json_to_sql(employee_id),
            &json_to_sql(employee_id),
            &json_to_sql(pin),
        ],
    );

    match lookup {
        Ok(Some(employee)) => {
            if employee.get("status").and_then(Value::as_str) != Some("Active") {
                return json!({ "success": false, "message": "Employee is not active" });
            }
            json!({ "success": true, "employee": employee })
        }
        Ok(None) => json!({ "success": false, "message": "Invalid Employee ID or PIN" }),
        Err(error) => {
            eprintln!("Error verifying PIN: {error}");
            json!({ "success": false, "message": "System error during verification" })
        }
    }
}

/// `updateEmployeePin()`.
pub fn update_pin(conn: &Connection, employee_id: &Value, new_pin: &Value) -> Value {
    let result = conn.execute(
        "UPDATE employees SET pin_code = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?",
        [json_to_sql(new_pin), json_to_sql(employee_id)],
    );

    match result {
        Ok(0) => json!({ "success": false, "message": "Employee not found" }),
        Ok(_) => json!({ "success": true, "message": "PIN updated successfully" }),
        Err(error) => {
            eprintln!("Error updating PIN: {error}");
            json!({ "success": false, "message": "Failed to update PIN" })
        }
    }
}

/// `getLatestAttendance()` — today's row for one employee, in Manila time.
pub fn latest_attendance(conn: &Connection, employee_id: &Value) -> Option<Value> {
    let today = manila::date();
    match query_opt(
        conn,
        "SELECT * FROM attendance WHERE employee_id = ? AND date = ?",
        &[&json_to_sql(employee_id), &SqlValue::Text(today)],
    ) {
        Ok(row) => row,
        Err(error) => {
            eprintln!("Error getting latest attendance: {error}");
            None
        }
    }
}
