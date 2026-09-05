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
///
/// Async now: the password lives in GoTrue and the key has to be re-sealed in the
/// same breath, so this cannot be done without the network.
#[tauri::command]
pub async fn change_password(
    state: Shared<'_>,
    user_id: String,
    current_password: String,
    new_password: String,
) -> Reply {
    let supabase = state.supabase.clone();
    Ok(auth::change_admin_password(
        &state,
        supabase.as_ref(),
        &user_id,
        &current_password,
        &new_password,
    )
    .await)
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
///
/// Between the two there is now one added step: login is the first moment the
/// data key exists in this process, so it is the only place the encryption
/// backfill can run — and it has to run before the sync, or plaintext would be
/// pushed to the cloud.
#[tauri::command]
pub async fn login_user(state: Shared<'_>, email: String, password: String) -> Reply {
    let supabase = state.supabase.clone();
    let result = auth::verify_admin_login(&state, supabase.as_ref(), &email, &password).await;

    if result.get("success").and_then(Value::as_bool) == Some(true) {
        backfill_encryption(&state);

        if let Some(supabase) = supabase {
            let shared = state.inner().clone();
            tauri::async_runtime::spawn(sync::sync_all(shared, supabase));
        }
    }

    Ok(result)
}

/// `auth:logout`.
///
/// The frontend used to sign out by itself, by emptying `localStorage`, which
/// left the backend holding the data key. This exists to make the two agree.
///
/// It answers immediately: the key and the session are gone before this returns,
/// and the revoke runs detached so a dead link cannot make signing out slow or
/// fail. There is nothing to report back from it — the client has already
/// forgotten the token either way.
#[tauri::command]
pub fn logout_user(state: Shared<'_>) -> Reply {
    let supabase = state.supabase.clone();
    let token = auth::sign_out(&state, supabase.as_ref());

    if let (Some(supabase), Some(token)) = (supabase, token) {
        tauri::async_runtime::spawn(async move {
            if let Err(error) = supabase.revoke(&token).await {
                eprintln!("Could not revoke the cloud session: {error}");
            }
        });
    }

    Ok(json!({ "success": true, "message": "Signed out" }))
}

/// Encrypt any employee row still holding plaintext, now that there is a key to
/// do it with. A no-op on every login after the first, so it is not gated on a
/// flag — see `db::migrations::backfill_employee_encryption`.
fn backfill_encryption(state: &Shared<'_>) {
    let Ok(dek) = state.dek() else {
        return;
    };
    if let Err(error) = state.with_db(|conn| db::migrations::backfill_employee_encryption(conn, &dek))
    {
        eprintln!("Could not encrypt employee data at rest: {error}");
    }
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
    // `themePreference`, not `theme_preference`, so the theme comes from that
    // function's own default — passed here as the same value for clarity.
    let profile = json!({
        "email": registration_data.get("admin_email").cloned().unwrap_or(Value::Null),
        "displayName": registration_data.get("admin_name").cloned().unwrap_or(Value::Null),
        "position": "System Administrator",
        "bio": "System administrator with full access to all features.",
        "role": "Admin",
        "theme_preference": "dark",
        "language": "en",
    });
    if let Err(error) = state.with_db(|conn| db::users::save_profile(conn, &profile)) {
        // Logged and ignored in the original too: "Non-critical, but good to log".
        eprintln!("Failed to sync registration to user profile: {error}");
    }

    Ok(ok_data(result))
}

/// `auth:reset-admin-password`. The second argument still arrives under the name
/// `superAdminPassword`, which is now the generated recovery key.
#[tauri::command]
pub async fn reset_admin_password(
    state: Shared<'_>,
    email: String,
    super_admin_password: String,
    new_password: String,
) -> Reply {
    let supabase = state.supabase.clone();
    Ok(auth::reset_admin_password(
        &state,
        supabase.as_ref(),
        &email,
        &super_admin_password,
        &new_password,
    )
    .await)
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

/// `auth:verify-super-admin` — the recovery key, checked by using it.
#[tauri::command]
pub async fn verify_super_admin_password(
    state: Shared<'_>,
    email: String,
    super_admin_password: String,
) -> Reply {
    let supabase = state.supabase.clone();
    Ok(
        auth::verify_super_admin_password(supabase.as_ref(), &email, &super_admin_password)
            .await,
    )
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



