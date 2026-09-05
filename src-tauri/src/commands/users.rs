//! `user:*` channels — the single admin's profile and preferences.

use serde_json::Value;

use crate::commands::{Reply, Shared};
use crate::db;

/// `user:get-profile`.
#[tauri::command]
pub fn get_user_profile(state: Shared<'_>, email: Option<String>) -> Reply {
    let email = email.unwrap_or_default();
    Ok(state
        .with_db(|conn| db::users::get_profile(conn, Some(email.as_str())))
        .unwrap_or(Value::Null))
}

/// `user:get-settings`.
#[tauri::command]
pub fn get_user_settings(state: Shared<'_>, email: Option<Value>) -> Reply {
    let email = email.unwrap_or(Value::Null);
    Ok(state
        .with_db(|conn| db::users::get_settings(conn, &email))
        .unwrap_or(Value::Null))
}

/// `user:save-profile`.
#[tauri::command]
pub fn save_user_profile(state: Shared<'_>, user_data: Value) -> Reply {
    state
        .with_db(|conn| db::users::save_profile(conn, &user_data))
        .map_err(|error| {
            eprintln!("Error saving user profile: {error}");
            error.to_string()
        })
}

/// `user:update-avatar`. The Electron handler forwarded this to
/// `dbService.updateUserAvatar`, a method that was never written, so every
/// upload rejected with a TypeError. The write it described is implemented in
/// `db::users::update_avatar`.
#[tauri::command]
pub fn update_user_avatar(state: Shared<'_>, email: Value, avatar_data: Value) -> Reply {
    state
        .with_db(|conn| db::users::update_avatar(conn, &email, &avatar_data))
        .map_err(|error| {
            eprintln!("Error updating avatar: {error}");
            error.to_string()
        })
}
