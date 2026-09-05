//! `employees:*` channels.

use serde_json::{json, Value};

use crate::commands::{Reply, Shared};
use crate::crypto::Dek;
use crate::db;
use crate::error::Result;

/// The data key for this session, or the message that names what to do about its
/// absence. Every channel below reads or writes an encrypted column, so a locked
/// session fails here rather than handing back ciphertext or storing plaintext.
fn session_key(state: &Shared<'_>) -> std::result::Result<Dek, String> {
    state.dek().map_err(|error| error.to_string())
}

/// `employees:create`.
///
/// The local insert runs first. The row is sealed on its way into SQLite and the
/// cloud copy is that same sealed row read straight back out, so Supabase
/// receives ciphertext without a second encryption path anywhere. The UUID is
/// generated here rather than by the cloud, which is what lets the order be this
/// way round. A cloud failure is logged and ignored: the employee exists locally,
/// and the next sync pushes it — including a `department_id` corrected to the
/// cloud's own key, which this immediate insert cannot resolve.
#[tauri::command]
pub async fn create_employee(state: Shared<'_>, employee: Value) -> Reply {
    let dek = session_key(&state)?;
    let supabase_id = uuid::Uuid::new_v4().to_string();
    // The original's hard-coded default; the PIN is changed from the kiosk.
    let pin_code = "1234";

    let (created, stored) = state
        .with_db(|conn| -> Result<(Value, Option<Value>)> {
            let created =
                db::employees::insert_local(conn, &dek, &employee, pin_code, &supabase_id)?;
            let id = created.get("id").and_then(Value::as_i64).unwrap_or_default();
            Ok((created, db::employees::stored_row(conn, id)?))
        })
        .map_err(|error| {
            eprintln!("Error creating employee: {error}");
            error.to_string()
        })?;

    if let (Some(supabase), Some(row)) = (state.supabase.clone(), stored) {
        let field = |key: &str| row.get(key).cloned().unwrap_or(Value::Null);
        let payload = json!({
            "id": supabase_id,
            "company_id": field("company_id"),
            "company_id_bidx": field("company_id_bidx"),
            "first_name": field("first_name"),
            "last_name": field("last_name"),
            "email": field("email"),
            "email_bidx": field("email_bidx"),
            "phone": field("phone"),
            "department_id": field("department_id"),
            "position": field("position"),
            "salary": field("salary"),
            "hire_date": field("hire_date"),
            "status": field("status"),
            "pin_code": field("pin_code"),
        });

        if let Err(error) = supabase.insert("employees", &payload, false).await {
            eprintln!("Supabase DB Insert Error: {error}");
        }
    }

    Ok(created)
}

/// `employees:delete`.
#[tauri::command]
pub fn delete_employee(state: Shared<'_>, id: Value) -> Reply {
    state
        .with_db(|conn| db::employees::delete(conn, &id))
        .map_err(|error| {
            eprintln!("Error deleting employee: {error}");
            error.to_string()
        })
}

/// `employees:get-all`.
#[tauri::command]
pub fn get_all_employees(state: Shared<'_>) -> Reply {
    let dek = session_key(&state)?;
    Ok(match state.with_db(|conn| db::employees::get_all(conn, &dek)) {
        Ok(rows) => Value::Array(rows),
        Err(error) => {
            eprintln!("Error getting all employees: {error}");
            Value::Array(Vec::new())
        }
    })
}

/// `employees:get-by-id`.
#[tauri::command]
pub fn get_employee_by_id(state: Shared<'_>, id: Value) -> Reply {
    let dek = session_key(&state)?;
    Ok(
        match state.with_db(|conn| db::employees::get_by_id(conn, &dek, &id)) {
            Ok(row) => row.unwrap_or(Value::Null),
            Err(error) => {
                eprintln!("Error getting employee by ID: {error}");
                Value::Null
            }
        },
    )
}

/// `employees:update`.
#[tauri::command]
pub fn update_employee(state: Shared<'_>, id: Value, employee: Value) -> Reply {
    let dek = session_key(&state)?;
    state
        .with_db(|conn| db::employees::update(conn, &dek, &id, &employee))
        .map_err(|error| {
            eprintln!("Error updating employee: {error}");
            error.to_string()
        })
}

/// `employees:verify-pin`.
#[tauri::command]
pub fn verify_employee_pin(state: Shared<'_>, employee_id: Value, pin: Value) -> Reply {
    let dek = session_key(&state)?;
    Ok(state.with_db(|conn| db::employees::verify_pin(conn, &dek, &employee_id, &pin)))
}

/// `employees:update-pin`.
#[tauri::command]
pub fn update_employee_pin(state: Shared<'_>, employee_id: Value, new_pin: Value) -> Reply {
    let dek = session_key(&state)?;
    Ok(state.with_db(|conn| db::employees::update_pin(conn, &dek, &employee_id, &new_pin)))
}
