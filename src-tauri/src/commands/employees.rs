//! `employees:*` channels.

use serde_json::{json, Value};

use crate::commands::{Reply, Shared};
use crate::db;

/// `employees:create`.
///
/// The Supabase insert runs before the local one because the row's `id` is the
/// UUID that the local `supabase_id` column has to carry. A cloud failure is
/// logged and ignored, so the employee is still created offline.
#[tauri::command]
pub async fn create_employee(state: Shared<'_>, employee: Value) -> Reply {
    let supabase_id = uuid::Uuid::new_v4().to_string();
    // The original's hard-coded default; the PIN is changed from the kiosk.
    let pin_code = "1234";

    if let Some(supabase) = state.supabase.clone() {
        let field = |key: &str| employee.get(key).cloned().unwrap_or(Value::Null);
        let payload = json!({
            "id": supabase_id,
            "company_id": field("company_id"),
            "first_name": field("first_name"),
            "last_name": field("last_name"),
            "email": field("email"),
            "phone": field("phone"),
            "department_id": field("department_id"),
            "position": field("position"),
            "salary": field("salary"),
            "hire_date": field("hire_date"),
            "status": field("status"),
            "pin_code": pin_code,
        });

        if let Err(error) = supabase.insert("employees", &payload, false).await {
            eprintln!("Supabase DB Insert Error: {error}");
        }
    }

    state
        .with_db(|conn| db::employees::insert_local(conn, &employee, pin_code, &supabase_id))
        .map_err(|error| {
            eprintln!("Error creating employee: {error}");
            error.to_string()
        })
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
    Ok(match state.with_db(db::employees::get_all) {
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
    Ok(match state.with_db(|conn| db::employees::get_by_id(conn, &id)) {
        Ok(row) => row.unwrap_or(Value::Null),
        Err(error) => {
            eprintln!("Error getting employee by ID: {error}");
            Value::Null
        }
    })
}

/// `employees:update`.
#[tauri::command]
pub fn update_employee(state: Shared<'_>, id: Value, employee: Value) -> Reply {
    state
        .with_db(|conn| db::employees::update(conn, &id, &employee))
        .map_err(|error| {
            eprintln!("Error updating employee: {error}");
            error.to_string()
        })
}

/// `employees:verify-pin`.
#[tauri::command]
pub fn verify_employee_pin(state: Shared<'_>, employee_id: Value, pin: Value) -> Reply {
    Ok(state.with_db(|conn| db::employees::verify_pin(conn, &employee_id, &pin)))
}

/// `employees:update-pin`.
#[tauri::command]
pub fn update_employee_pin(state: Shared<'_>, employee_id: Value, new_pin: Value) -> Reply {
    Ok(state.with_db(|conn| db::employees::update_pin(conn, &employee_id, &new_pin)))
}

