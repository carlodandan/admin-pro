//! Profile and settings, all stored on the single `registration_credentials`
//! row. Transcribed from `DatabaseService`.

use rusqlite::types::Value as SqlValue;
use rusqlite::Connection;
use serde_json::{json, Value};

use crate::error::Result;
use crate::json::{json_to_sql, opt_str, query_opt};

/// The projection `getUserProfile` returns. `position` is a literal in the
/// original because the app is single-user.
const PROFILE_COLUMNS: &str = r#"
    SELECT
        admin_email as email,
        admin_name as display_name,
        avatar,
        'System Administrator' as position,
        bio,
        theme_preference,
        language
    FROM registration_credentials
"#;

/// `saveUserProfile()` — `COALESCE` keeps name and email when the caller omits
/// them, while avatar/bio/theme/language are written unconditionally.
pub fn save_profile(conn: &Connection, data: &Value) -> Result<Value> {
    let registered: i64 = conn.query_row(
        "SELECT COUNT(*) as count FROM registration_credentials WHERE is_registered = 1",
        [],
        |row| row.get(0),
    )?;

    if registered == 0 {
        eprintln!("Cannot save profile: No registered admin found.");
        return Ok(json!({ "success": false, "error": "System not registered" }));
    }

    let nullable = |key: &str| match opt_str(data, key) {
        Some(text) if !text.is_empty() => SqlValue::Text(text),
        _ => SqlValue::Null,
    };
    let with_default = |key: &str, fallback: &str| match opt_str(data, key) {
        Some(text) if !text.is_empty() => text,
        _ => fallback.to_string(),
    };

    let changes = conn.execute(
        r#"
        UPDATE registration_credentials
        SET
            admin_name = COALESCE(?, admin_name),
            admin_email = COALESCE(?, admin_email),
            avatar = ?,
            bio = ?,
            theme_preference = ?,
            language = ?,
            last_updated = CURRENT_TIMESTAMP
        WHERE is_registered = 1
        "#,
        rusqlite::params![
            nullable("displayName"),
            nullable("email"),
            nullable("avatar"),
            nullable("bio"),
            with_default("themePreference", "light"),
            with_default("language", "en"),
        ],
    )?;

    Ok(json!({ "success": true, "changes": changes }))
}

/// `getUserProfile(email)` — an empty address falls back to the single admin,
/// matching the original's `if (email)` check.
pub fn get_profile(conn: &Connection, email: Option<&str>) -> Option<Value> {
    let lookup = match email.filter(|value| !value.is_empty()) {
        Some(email) => query_opt(
            conn,
            &format!("{PROFILE_COLUMNS} WHERE admin_email = ? AND is_registered = 1"),
            &[&SqlValue::Text(email.to_string())],
        ),
        None => query_opt(
            conn,
            &format!("{PROFILE_COLUMNS} WHERE is_registered = 1 ORDER BY id DESC LIMIT 1"),
            &[],
        ),
    };

    match lookup {
        Ok(row) => row,
        Err(error) => {
            eprintln!("Error getting user profile: {error}");
            None
        }
    }
}

/// `getUserSettings(email)`.
pub fn get_settings(conn: &Connection, email: &Value) -> Option<Value> {
    let lookup = query_opt(
        conn,
        r#"
        SELECT theme_preference, language
        FROM registration_credentials
        WHERE admin_email = ? AND is_registered = 1
        "#,
        &[&json_to_sql(email)],
    );

    match lookup {
        Ok(row) => row,
        Err(error) => {
            eprintln!("Error getting user settings: {error}");
            None
        }
    }
}

/// `updateUserAvatar(email, avatarData)`.
///
/// The Electron main process forwarded this channel to a `DatabaseService`
/// method that was never written, so avatar upload always rejected with
/// "dbService.updateUserAvatar is not a function". Implemented here against the
/// `avatar` column the profile query already reads.
pub fn update_avatar(conn: &Connection, email: &Value, avatar: &Value) -> Result<Value> {
    let changes = conn.execute(
        r#"
        UPDATE registration_credentials
        SET avatar = ?, last_updated = CURRENT_TIMESTAMP
        WHERE admin_email = ? AND is_registered = 1
        "#,
        rusqlite::params![json_to_sql(avatar), json_to_sql(email)],
    )?;

    Ok(json!({ "success": changes > 0, "changes": changes }))
}
