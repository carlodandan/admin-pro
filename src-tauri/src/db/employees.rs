//! Employee queries, transcribed from `DatabaseService`.
//!
//! This is the only file that encrypts or decrypts a field. `company_id`,
//! `email`, `phone` and `pin_code` are held as `enc:v1:…` in both databases, so
//! every read here decrypts on the way out and every write seals on the way in.
//! Nothing above this layer sees ciphertext, and nothing below it sees plaintext.
//!
//! `email_bidx` and `company_id_bidx` carry the uniqueness the ciphertext cannot.
//! A fresh nonce per write means one address encrypts differently every time, so
//! `UNIQUE` on the ciphertext enforces nothing; the constraint moves to a keyed
//! digest of the plaintext, rewritten here in the same statement as the column it
//! belongs to. No caller writes them directly — `is_employee_column` omits both.

use rusqlite::types::Value as SqlValue;
use rusqlite::Connection;
use serde_json::{json, Value};

use crate::crypto::{self, Dek};
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

/// The columns held as ciphertext.
const ENCRYPTED_COLUMNS: [&str; 4] = ["company_id", "email", "phone", "pin_code"];

/// The blind-index column that carries a column's uniqueness, where it has one.
fn blind_index_column(column: &str) -> Option<&'static str> {
    match column {
        "email" => Some("email_bidx"),
        "company_id" => Some("company_id_bidx"),
        _ => None,
    }
}

/// The plaintext of one incoming field, or `None` for SQL NULL.
///
/// A numeric `company_id` arrives from the renderer as a JSON number often
/// enough, and it has to be sealed as the text it will be read back as.
fn plain(value: Option<&Value>) -> Option<String> {
    match value {
        None | Some(Value::Null) => None,
        Some(Value::String(text)) => Some(text.clone()),
        Some(other) => Some(other.to_string()),
    }
}

/// `Option<String>` as a bound value, because the dynamic `SET` list carries
/// every value in one `Vec`.
fn bound(value: Option<String>) -> SqlValue {
    value.map_or(SqlValue::Null, SqlValue::Text)
}

/// Decrypt every encrypted column of one row, in place.
///
/// `crypto::decrypt_field` passes a value without the prefix straight through, so
/// a row the backfill has not reached yet still reads correctly.
fn decrypt_row(dek: &Dek, row: &mut Value) -> Result<()> {
    let Some(object) = row.as_object_mut() else {
        return Ok(());
    };

    for column in ENCRYPTED_COLUMNS {
        let Some(stored) = object.get(column).and_then(Value::as_str) else {
            continue;
        };
        let plaintext = crypto::decrypt_field(dek, stored)?;
        object.insert(column.to_string(), Value::String(plaintext));
    }

    // The blind indexes are storage detail. Passing them on would put a stable
    // fingerprint of the plaintext next to the plaintext, for no gain.
    object.remove("email_bidx");
    object.remove("company_id_bidx");
    Ok(())
}

fn decrypt_rows(dek: &Dek, rows: &mut [Value]) -> Result<()> {
    for row in rows.iter_mut() {
        decrypt_row(dek, row)?;
    }
    Ok(())
}

pub fn get_all(conn: &Connection, dek: &Dek) -> Result<Vec<Value>> {
    let mut rows = query_all(
        conn,
        &format!("{SELECT_WITH_DEPARTMENT} ORDER BY e.created_at DESC"),
        &[],
    )?;
    decrypt_rows(dek, &mut rows)?;
    Ok(rows)
}

pub fn get_by_id(conn: &Connection, dek: &Dek, id: &Value) -> Result<Option<Value>> {
    let mut row = query_opt(
        conn,
        &format!("{SELECT_WITH_DEPARTMENT} WHERE e.id = ?"),
        &[&json_to_sql(id)],
    )?;
    if let Some(row) = row.as_mut() {
        decrypt_row(dek, row)?;
    }
    Ok(row)
}

/// One employee row exactly as it sits on disk, ciphertext included.
///
/// The push path wants this rather than `get_by_id`: the cloud copy *is* the
/// local copy, so the sealed columns cross the wire sealed and Supabase never
/// needs a key. It is the only read in this file that does not decrypt.
pub fn stored_row(conn: &Connection, id: i64) -> Result<Option<Value>> {
    query_opt(conn, "SELECT * FROM employees WHERE id = ?", &[&id])
}

/// Local half of `createEmployee()`. The row is sealed here, so the command layer
/// can read it straight back out and push the ciphertext to Supabase.
pub fn insert_local(
    conn: &Connection,
    dek: &Dek,
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

    let index_key = crypto::derive_index_key(dek);
    let company_id = plain(employee.get("company_id"));
    let email = plain(employee.get("email"));

    conn.execute(
        r#"INSERT INTO employees (
               company_id, company_id_bidx, first_name, last_name,
               email, email_bidx, phone, department_id,
               position, salary, hire_date, status, pin_code, supabase_id
           )
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)"#,
        rusqlite::params![
            crypto::encrypt_opt(dek, company_id.as_deref())?,
            crypto::blind_index_opt(&index_key, company_id.as_deref()),
            json_to_sql(employee.get("first_name").unwrap_or(&Value::Null)),
            json_to_sql(employee.get("last_name").unwrap_or(&Value::Null)),
            crypto::encrypt_opt(dek, email.as_deref())?,
            crypto::blind_index_opt(&index_key, email.as_deref()),
            crypto::encrypt_opt(dek, plain(employee.get("phone")).as_deref())?,
            department_id,
            json_to_sql(employee.get("position").unwrap_or(&Value::Null)),
            json_to_sql(employee.get("salary").unwrap_or(&Value::Null)),
            json_to_sql(employee.get("hire_date").unwrap_or(&Value::Null)),
            status,
            crypto::encrypt_field(dek, pin_code)?,
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
///
/// An encrypted column is sealed here, and its blind index is rewritten in the
/// same statement so the two can never drift apart.
pub fn update(conn: &Connection, dek: &Dek, id: &Value, data: &Value) -> Result<Value> {
    let Some(object) = data.as_object() else {
        return Ok(json!({ "changes": 0 }));
    };

    let index_key = crypto::derive_index_key(dek);
    let mut assignments = Vec::new();
    let mut values: Vec<SqlValue> = Vec::new();
    for (key, value) in object {
        if key == "id" || !is_employee_column(key) {
            continue;
        }

        if ENCRYPTED_COLUMNS.contains(&key.as_str()) {
            let plaintext = plain(Some(value));
            assignments.push(format!("{key} = ?"));
            values.push(bound(crypto::encrypt_opt(dek, plaintext.as_deref())?));

            if let Some(index) = blind_index_column(key) {
                assignments.push(format!("{index} = ?"));
                values.push(bound(crypto::blind_index_opt(
                    &index_key,
                    plaintext.as_deref(),
                )));
            }
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
///
/// The two `*_bidx` columns are deliberately absent: they are derived from the
/// columns above and are only ever written beside them.
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
pub fn verify_pin(conn: &Connection, dek: &Dek, employee_id: &Value, pin: &Value) -> Value {
    match check_pin(conn, dek, employee_id, pin) {
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

/// The original matched `(id = ? OR company_id = ?) AND pin_code = ?` in SQL,
/// which a sealed column cannot answer. The company id is found through its blind
/// index instead — the reason for having one — and the PIN is compared after
/// decryption, in constant time so a wrong one cannot be walked a character at a
/// time. A row with no PIN never matches, as it never did when the comparison was
/// `pin_code = ?`.
fn check_pin(
    conn: &Connection,
    dek: &Dek,
    employee_id: &Value,
    pin: &Value,
) -> Result<Option<Value>> {
    let index_key = crypto::derive_index_key(dek);
    let identifier = plain(Some(employee_id));
    let company_id_bidx = crypto::blind_index_opt(&index_key, identifier.as_deref());

    let Some(mut employee) = query_opt(
        conn,
        "SELECT * FROM employees WHERE id = ? OR company_id_bidx = ?",
        &[&json_to_sql(employee_id), &bound(company_id_bidx)],
    )?
    else {
        return Ok(None);
    };

    let stored = employee
        .get("pin_code")
        .and_then(Value::as_str)
        .unwrap_or_default();
    let expected = crypto::decrypt_field(dek, stored)?;
    let supplied = plain(Some(pin)).unwrap_or_default();
    if expected.is_empty() || !crypto::secret_eq(&expected, &supplied) {
        return Ok(None);
    }

    decrypt_row(dek, &mut employee)?;
    Ok(Some(employee))
}

/// `updateEmployeePin()`.
pub fn update_pin(conn: &Connection, dek: &Dek, employee_id: &Value, new_pin: &Value) -> Value {
    let sealed = match crypto::encrypt_opt(dek, plain(Some(new_pin)).as_deref()) {
        Ok(sealed) => sealed,
        Err(error) => {
            eprintln!("Error sealing PIN: {error}");
            return json!({ "success": false, "message": "Failed to update PIN" });
        }
    };

    let result = conn.execute(
        "UPDATE employees SET pin_code = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?",
        rusqlite::params![sealed, json_to_sql(employee_id)],
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
