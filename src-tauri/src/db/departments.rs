//! Department queries, transcribed from `DatabaseService`.

use rusqlite::Connection;
use serde_json::{json, Value};

use crate::error::{fail, Result};
use crate::json::{json_to_sql, query_all};

pub fn get_all(conn: &Connection) -> Result<Vec<Value>> {
    query_all(
        conn,
        r#"
        SELECT
            d.*,
            COUNT(e.id) as employee_count,
            COALESCE(AVG(e.salary), 0) as avg_salary
        FROM departments d
        LEFT JOIN employees e ON d.id = e.department_id AND e.status = 'Active'
        GROUP BY d.id
        ORDER BY d.name
        "#,
        &[],
    )
}

pub fn create(conn: &Connection, department: &Value) -> Result<Value> {
    conn.execute(
        "INSERT INTO departments (name, budget) VALUES (?, ?)",
        [
            json_to_sql(department.get("name").unwrap_or(&Value::Null)),
            json_to_sql(department.get("budget").unwrap_or(&Value::Null)),
        ],
    )?;

    Ok(json!({
        "id": conn.last_insert_rowid(),
        "changes": 1,
    }))
}

pub fn delete(conn: &Connection, id: &Value) -> Result<Value> {
    let count: i64 = conn.query_row(
        "SELECT COUNT(*) as count FROM employees WHERE department_id = ?",
        [json_to_sql(id)],
        |row| row.get(0),
    )?;

    if count > 0 {
        return fail(
            "Cannot delete department that has employees. Please reassign or delete employees first.",
        );
    }

    let changes = conn.execute("DELETE FROM departments WHERE id = ?", [json_to_sql(id)])?;
    Ok(json!({ "changes": changes }))
}
