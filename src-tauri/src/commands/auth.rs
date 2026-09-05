//! `auth:*` channels — registration, login, passwords and company info.

use serde_json::{json, Value};

use crate::auth;
use crate::commands::{err_message, ok_data, Reply, Shared};
use crate::db;
use crate::supabase::sync;

/// `auth:backup-database`.
#[tauri::command]
pub fn backup_auth_database(state: Shared<'_>) -> Reply {
    Ok(match auth::backup_database(&state) {
        Ok(result) => ok_data(result),
        Err(error) => {
            eprintln!("Error backing up auth database: {error}");
            err_message(error)
        }
    })
}

/// `auth:change-password`. The preload calls the first argument `userId`, but
/// the handler passed it straight through as the admin's email.
#[tauri::command]
pub fn change_password(
    state: Shared<'_>,
    user_id: String,
    current_password: String,
    new_password: String,
) -> Reply {
    Ok(auth::change_admin_password(
        &state,
        &user_id,
        &current_password,
        &new_password,
    ))
}

/// `auth:get-registration-info`.
#[tauri::command]
pub fn get_registration_info(state: Shared<'_>) -> Reply {
    Ok(ok_data(
        auth::get_registration_info(&state).unwrap_or(Value::Null),
    ))
}

/// `auth:is-registered`.
#[tauri::command]
pub async fn is_system_registered(state: Shared<'_>) -> Reply {
    let supabase = state.supabase.clone();
    let registered = auth::is_system_registered(&state, supabase.as_ref()).await;
    Ok(json!({ "success": true, "isRegistered": registered }))
}

/// `auth:login`. A successful login also kicks off a sync, exactly as the
/// handler did with `dbService.syncToSupabase().catch(...)` — fired and
/// forgotten, its failures logged and never surfaced to the caller.
#[tauri::command]
pub async fn login_user(state: Shared<'_>, email: String, password: String) -> Reply {
    let supabase = state.supabase.clone();
    let result = auth::verify_admin_login(&state, supabase.as_ref(), &email, &password).await;

    if result.get("success").and_then(Value::as_bool) == Some(true) {
        if let Some(supabase) = supabase {
            let shared = state.inner().clone();
            tauri::async_runtime::spawn(sync::sync_all(shared, supabase));
        }
    }

    Ok(result)
}

/// `auth:register`.
#[tauri::command]
pub async fn register_system(state: Shared<'_>, registration_data: Value) -> Reply {
    let supabase = state.supabase.clone();
    let result =
        match auth::store_registration(&state, supabase.as_ref(), &registration_data).await {
            Ok(result) => result,
            Err(error) => {
                eprintln!("Registration error: {error}");
                return Ok(err_message(error));
            }
        };

    // The handler then seeded the profile row. `saveUserProfile` reads
    // `themePreference`, not `theme_preference`, so the theme has always come
    // from that function's own `'light'` default — the same value either way.
    let profile = json!({
        "email": registration_data.get("admin_email").cloned().unwrap_or(Value::Null),
        "displayName": registration_data.get("admin_name").cloned().unwrap_or(Value::Null),
        "position": "System Administrator",
        "bio": "System administrator with full access to all features.",
        "role": "Admin",
        "theme_preference": "light",
        "language": "en",
    });
    if let Err(error) = state.with_db(|conn| db::users::save_profile(conn, &profile)) {
        // Logged and ignored in the original too: "Non-critical, but good to log".
        eprintln!("Failed to sync registration to user profile: {error}");
    }

    Ok(ok_data(result))
}

/// `auth:reset-admin-password`.
#[tauri::command]
pub fn reset_admin_password(
    state: Shared<'_>,
    email: String,
    super_admin_password: String,
    new_password: String,
) -> Reply {
    Ok(auth::reset_admin_password(
        &state,
        &email,
        &super_admin_password,
        &new_password,
    ))
}

/// `auth:reset-registration`.
#[tauri::command]
pub fn reset_registration(state: Shared<'_>) -> Reply {
    Ok(match auth::reset_registration(&state) {
        Ok(result) => ok_data(result),
        Err(error) => {
            eprintln!("Error resetting registration: {error}");
            err_message(error)
        }
    })
}

/// `auth:update-company-info`.
#[tauri::command]
pub fn update_company_info(state: Shared<'_>, company_data: Value) -> Reply {
    Ok(match auth::update_company_info(&state, &company_data) {
        Ok(result) => result,
        Err(error) => {
            eprintln!("Error updating company info: {error}");
            err_message(error)
        }
    })
}

/// `auth:verify-super-admin`.
#[tauri::command]
pub fn verify_super_admin_password(
    state: Shared<'_>,
    email: String,
    super_admin_password: String,
) -> Reply {
    Ok(auth::verify_super_admin_password(
        &state,
        &email,
        &super_admin_password,
    ))
}

// The three multi-user channels below were placeholders. Nothing in the
// frontend calls them, so their shapes are preserved as declared rather than as
// they happened to fail:
//
//   * `auth:create-user` returned this exact object, verbatim.
//   * `auth:get-users` called `authService.getAllUsers()`, which does not
//     exist, so it always rejected with a TypeError before reaching its
//     `{ success: true, data: [] }`. The written intent is used here.
//   * `auth:update-user` had no handler at all — `invoke` rejected with
//     "No handler registered". It answers like `create-user` now.

/// `auth:create-user`.
#[tauri::command]
pub fn create_user(_user_data: Option<Value>) -> Reply {
    Ok(json!({ "success": false, "error": "Not implemented yet" }))
}

/// `auth:get-users`.
#[tauri::command]
pub fn get_all_users() -> Reply {
    Ok(ok_data(json!([])))
}

/// `auth:update-user`.
#[tauri::command]
pub fn update_user(_user_id: Option<Value>, _user_data: Option<Value>) -> Reply {
    Ok(json!({ "success": false, "error": "Not implemented yet" }))
}



