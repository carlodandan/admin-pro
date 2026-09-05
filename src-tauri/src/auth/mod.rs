//! `AuthService` — registration, login and the super-admin recovery path.
//!
//! Transcribed method for method. The Supabase-first / local-fallback ordering
//! in `verify_admin_login` and `is_system_registered` is load-bearing: it is
//! what lets the app work offline once a machine has logged in at least once.

pub mod crypto;

use std::sync::Arc;

use rusqlite::types::Value as SqlValue;
use serde_json::{json, Value};

use crate::error::{fail, Result};
use crate::json::{opt_str, query_opt, str_or_empty};
use crate::manila;
use crate::state::AppState;
use crate::supabase::Supabase;

/// Reads one column from the single registration row.
fn registration_column(state: &AppState, sql: &str, email: &str) -> Result<Option<Value>> {
    state.with_db(|conn| query_opt(conn, sql, &[&SqlValue::Text(email.to_string())]))
}

/// `isSystemRegistered()` — Supabase RPC first, local table second.
pub async fn is_system_registered(state: &AppState, supabase: Option<&Arc<Supabase>>) -> bool {
    if let Some(supabase) = supabase {
        match supabase.rpc("check_admin_exists_v2", json!({})).await {
            Ok(Value::Bool(true)) => return true,
            Ok(_) => {}
            Err(error) => {
                // The RPC may not be installed yet; fall through to local.
                eprintln!("Supabase registration check failed (RPC error): {error}");
            }
        }
    }

    let count: Result<i64> = state.with_db(|conn| {
        conn.query_row(
            "SELECT COUNT(*) as count FROM registration_credentials WHERE is_registered = 1",
            [],
            |row| row.get(0),
        )
        .map_err(Into::into)
    });

    match count {
        Ok(count) => count > 0,
        Err(error) => {
            eprintln!("Error checking registration status: {error}");
            false
        }
    }
}

/// `storeRegistration()` — creates the Supabase user, then writes the local row.
pub async fn store_registration(
    state: &AppState,
    supabase: Option<&Arc<Supabase>>,
    data: &Value,
) -> Result<Value> {
    if is_system_registered(state, supabase).await {
        return fail("System is already registered");
    }

    let admin_email = str_or_empty(data, "admin_email");
    let existing: i64 = state.with_db(|conn| {
        conn.query_row(
            "SELECT COUNT(*) as count FROM registration_credentials WHERE admin_email = ?",
            [SqlValue::Text(admin_email.clone())],
            |row| row.get(0),
        )
    })?;
    if existing > 0 {
        return fail("Admin email already exists");
    }

    let admin_password = str_or_empty(data, "admin_password");
    let super_admin_password = str_or_empty(data, "super_admin_password");

    // Create the cloud account first: a failure here must abort registration,
    // as it did in the original.
    create_supabase_admin(
        supabase,
        &admin_email,
        &admin_password,
        json!({
            "name": opt_str(data, "admin_name"),
            "company_name": opt_str(data, "company_name"),
        }),
    )
    .await?;

    let admin_password_hash = crypto::hash_password(&admin_password)?;
    let super_admin_password_hash = crypto::hash_password(&super_admin_password)?;
    let license_key = crypto::generate_license_key();
    let now = manila::iso_utc();

    let nullable = |key: &str| match opt_str(data, key) {
        Some(value) if !value.is_empty() => SqlValue::Text(value),
        _ => SqlValue::Null,
    };

    let registration_id = state.with_db(|conn| -> Result<i64> {
        conn.execute(
            r#"INSERT INTO registration_credentials (
                   company_name, company_email, company_address, company_contact,
                   admin_name, admin_email, admin_password_hash,
                   super_admin_password_hash,
                   is_registered, license_key, registration_date
               ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)"#,
            rusqlite::params![
                str_or_empty(data, "company_name"),
                str_or_empty(data, "company_email"),
                nullable("company_address"),
                nullable("company_contact"),
                str_or_empty(data, "admin_name"),
                admin_email.clone(),
                admin_password_hash,
                super_admin_password_hash,
                1,
                license_key.clone(),
                now,
            ],
        )?;
        Ok(conn.last_insert_rowid())
    })?;

    Ok(json!({
        "success": true,
        "registrationId": registration_id,
        "licenseKey": license_key,
        "adminEmail": admin_email,
        "superAdminPassword": super_admin_password,
    }))
}

/// `createSupabaseAdmin()` — a no-op when Supabase is not configured.
async fn create_supabase_admin(
    supabase: Option<&Arc<Supabase>>,
    email: &str,
    password: &str,
    metadata: Value,
) -> Result<Option<String>> {
    let Some(supabase) = supabase else {
        return Ok(None);
    };

    // Metadata is merged under `role: 'admin'`, as the spread did.
    let mut data = json!({ "role": "admin" });
    if let (Some(target), Some(extra)) = (data.as_object_mut(), metadata.as_object()) {
        for (key, value) in extra {
            if !value.is_null() {
                target.insert(key.clone(), value.clone());
            }
        }
    }

    match supabase.sign_up(email, password, data).await {
        Ok(id) => Ok(id),
        Err(error) => {
            eprintln!("Supabase Admin Creation Failed: {error}");
            Err(error.into())
        }
    }
}

/// `verifySuperAdminPassword()`.
pub fn verify_super_admin_password(state: &AppState, email: &str, password: &str) -> Value {
    let row = registration_column(
        state,
        r#"SELECT super_admin_password_hash
           FROM registration_credentials
           WHERE admin_email = ?"#,
        email,
    );

    match row {
        Ok(None) => json!({ "success": false, "error": "No registration found for this email" }),
        Ok(Some(row)) => {
            let hash = str_or_empty(&row, "super_admin_password_hash");
            if crypto::verify_password(password, &hash) {
                json!({ "success": true, "message": "Super Admin Password verified successfully" })
            } else {
                json!({ "success": false, "error": "Super Admin Password is incorrect" })
            }
        }
        Err(error) => {
            eprintln!("Error verifying Super Admin Password: {error}");
            json!({ "success": false, "error": "Verification failed" })
        }
    }
}

/// `resetAdminPassword()` — gated on the super-admin password.
pub fn reset_admin_password(
    state: &AppState,
    email: &str,
    super_admin_password: &str,
    new_password: &str,
) -> Value {
    let verification = verify_super_admin_password(state, email, super_admin_password);
    if verification.get("success").and_then(Value::as_bool) != Some(true) {
        return verification;
    }

    let applied = crypto::hash_password(new_password).and_then(|hash| {
        let now = manila::iso_utc();
        state.with_db(|conn| {
            conn.execute(
                r#"UPDATE registration_credentials
                   SET admin_password_hash = ?,
                       last_reset_date = ?,
                       last_updated = ?,
                       reset_count = reset_count + 1
                   WHERE admin_email = ?"#,
                rusqlite::params![hash, now.clone(), now, email],
            )
            .map_err(Into::into)
        })
    });

    match applied {
        Ok(_) => json!({ "success": true, "message": "Password reset successfully" }),
        Err(error) => {
            eprintln!("Error resetting password: {error}");
            json!({ "success": false, "error": "Password reset failed" })
        }
    }
}

/// `getRegistrationInfo()`.
pub fn get_registration_info(state: &AppState) -> Option<Value> {
    let row = state.with_db(|conn| {
        query_opt(
            conn,
            r#"SELECT
                   id,
                   company_name,
                   company_email,
                   company_address,
                   company_contact,
                   admin_name,
                   admin_email,
                   license_key,
                   is_registered,
                   registration_date,
                   last_updated
               FROM registration_credentials
               WHERE is_registered = 1
               ORDER BY registration_date DESC
               LIMIT 1"#,
            &[],
        )
    });

    match row {
        Ok(row) => row,
        Err(error) => {
            eprintln!("Error getting registration info: {error}");
            None
        }
    }
}

/// `changeAdminPassword()`.
pub fn change_admin_password(
    state: &AppState,
    email: &str,
    current_password: &str,
    new_password: &str,
) -> Value {
    let row = registration_column(
        state,
        r#"SELECT admin_password_hash
           FROM registration_credentials
           WHERE admin_email = ? AND is_registered = 1"#,
        email,
    );

    let admin = match row {
        Ok(Some(admin)) => admin,
        Ok(None) => return json!({ "success": false, "error": "Admin not found" }),
        Err(error) => {
            eprintln!("Error changing admin password: {error}");
            return json!({ "success": false, "error": "Failed to change password" });
        }
    };

    let hash = str_or_empty(&admin, "admin_password_hash");
    if !crypto::verify_password(current_password, &hash) {
        return json!({ "success": false, "error": "Current password is incorrect" });
    }

    let applied = crypto::hash_password(new_password).and_then(|new_hash| {
        state.with_db(|conn| {
            conn.execute(
                r#"UPDATE registration_credentials
                   SET admin_password_hash = ?, last_updated = ?
                   WHERE admin_email = ?"#,
                rusqlite::params![new_hash, manila::iso_utc(), email],
            )
            .map_err(Into::into)
        })
    });

    match applied {
        Ok(_) => json!({ "success": true, "message": "Password changed successfully" }),
        Err(error) => {
            eprintln!("Error changing admin password: {error}");
            json!({ "success": false, "error": "Failed to change password" })
        }
    }
}

/// `backupDatabase()` — `company-admin-backup-<millis>.sqlite` beside the live
/// file. A WAL checkpoint is taken first so the copy is not missing the most
/// recent writes; `better-sqlite3` left that to chance.
pub fn backup_database(state: &AppState) -> Result<Value> {
    let stamp = chrono::Utc::now().timestamp_millis();
    let backup_path = state
        .db_path
        .with_file_name(format!("company-admin-backup-{stamp}.sqlite"));

    state.with_db(|conn| -> Result<()> {
        conn.pragma_update(None, "wal_checkpoint", "TRUNCATE")?;
        Ok(())
    })?;

    std::fs::copy(&state.db_path, &backup_path).map_err(|error| {
        eprintln!("Error backing up database: {error}");
        error
    })?;

    Ok(json!({
        "success": true,
        "backupPath": backup_path.to_string_lossy(),
    }))
}

/// `resetRegistration()` — clears the registration row and compacts the file.
pub fn reset_registration(state: &AppState) -> Result<Value> {
    state.with_db(|conn| -> Result<()> {
        conn.execute_batch("DELETE FROM registration_credentials")?;
        conn.execute_batch("VACUUM")?;
        Ok(())
    })
    .map_err(|error| {
        eprintln!("Error resetting registration: {error}");
        error
    })?;

    Ok(json!({ "success": true, "message": "Registration reset complete" }))
}

/// The company-details update the Electron main process ran inline against
/// `authService.db`.
pub fn update_company_info(state: &AppState, data: &Value) -> Result<Value> {
    let field = |key: &str| match opt_str(data, key) {
        Some(value) if !value.is_empty() => SqlValue::Text(value),
        _ => SqlValue::Null,
    };

    state.with_db(|conn| {
        conn.execute(
            r#"UPDATE registration_credentials
               SET company_name = ?,
                   company_email = ?,
                   company_address = ?,
                   company_contact = ?,
                   last_updated = ?
               WHERE is_registered = 1"#,
            rusqlite::params![
                field("company_name"),
                field("company_email"),
                field("company_address"),
                field("company_contact"),
                manila::iso_utc(),
            ],
        )
    })?;

    Ok(json!({ "success": true, "message": "Company information updated" }))
}

/// The 17-column upsert `verifyAdminLogin` uses to mirror the cloud profile
/// locally. `super_admin_password_hash` is only supplied on insert, so an
/// existing local recovery password survives.
const UPSERT_PROFILE: &str = r#"
    INSERT INTO registration_credentials (
        company_name, company_email, company_address, company_contact,
        admin_name, admin_email, admin_password_hash, super_admin_password_hash,
        avatar, bio, theme_preference, language,
        is_registered, license_key, registration_date, last_updated, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(admin_email) DO UPDATE SET
        company_name = excluded.company_name,
        admin_name = excluded.admin_name,
        admin_password_hash = excluded.admin_password_hash,
        avatar = excluded.avatar,
        last_updated = CURRENT_TIMESTAMP,
        updated_at = CURRENT_TIMESTAMP
"#;

/// Same insert, but the conflict path only refreshes the password hash — used
/// when the cloud profile row could not be read.
const UPSERT_FALLBACK: &str = r#"
    INSERT INTO registration_credentials (
        company_name, company_email, company_address, company_contact,
        admin_name, admin_email, admin_password_hash, super_admin_password_hash,
        avatar, bio, theme_preference, language,
        is_registered, license_key, registration_date, last_updated, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(admin_email) DO UPDATE SET
        admin_password_hash = excluded.admin_password_hash,
        last_updated = CURRENT_TIMESTAMP
"#;

fn invalid_credentials() -> Value {
    json!({ "success": false, "error": "Invalid email or password" })
}

/// `verifyAdminLogin()` — Supabase first, then the local bcrypt hash.
pub async fn verify_admin_login(
    state: &AppState,
    supabase: Option<&Arc<Supabase>>,
    email: &str,
    password: &str,
) -> Value {
    if let Some(supabase) = supabase {
        match supabase.sign_in_with_password(email, password).await {
            Ok(session) => return mirror_cloud_profile(state, supabase, &session, email, password).await,
            Err(error) => {
                eprintln!("Supabase Login Failed: {error}");
                // The original also tested `error.stats === 400`, a typo for
                // `status` that never matched — so only the message decides,
                // and every other failure (offline, unconfirmed email, rate
                // limit) falls through to the local check. Kept, because
                // falling through is what makes offline login work.
                if error.message.contains("Invalid login credentials") {
                    return invalid_credentials();
                }
            }
        }
    }

    // 2. Fallback to local SQLite.
    let row = registration_column(
        state,
        r#"SELECT admin_password_hash, admin_name, company_name
           FROM registration_credentials
           WHERE admin_email = ? AND is_registered = 1"#,
        email,
    );

    let registration = match row {
        Ok(Some(registration)) => registration,
        Ok(None) => return invalid_credentials(),
        Err(error) => {
            eprintln!("Error verifying login: {error}");
            return json!({ "success": false, "error": "Login verification failed" });
        }
    };

    let hash = str_or_empty(&registration, "admin_password_hash");
    if !crypto::verify_password(password, &hash) {
        return invalid_credentials();
    }

    json!({
        "success": true,
        "user": {
            "email": email,
            "name": registration.get("admin_name").cloned().unwrap_or(Value::Null),
            "role": "admin",
            "company": registration.get("company_name").cloned().unwrap_or(Value::Null),
        }
    })
}

/// The post-sign-in half: refresh the local hash and profile so the next
/// offline login works, then answer from the local row.
async fn mirror_cloud_profile(
    state: &AppState,
    supabase: &Arc<Supabase>,
    session: &crate::supabase::Session,
    email: &str,
    password: &str,
) -> Value {
    // Wrapped so a sync failure only warns, exactly as the inner try/catch did.
    if let Err(error) = refresh_local_profile(state, supabase, session, email, password).await {
        eprintln!("Failed to sync local password hash: {error}");
    }

    let registration = registration_column(
        state,
        r#"SELECT admin_name, company_name
           FROM registration_credentials
           WHERE admin_email = ? AND is_registered = 1"#,
        email,
    )
    .ok()
    .flatten();

    let metadata_name = session
        .user
        .get("user_metadata")
        .and_then(|meta| meta.get("name"))
        .and_then(Value::as_str)
        .unwrap_or("Admin")
        .to_string();

    let (name, company) = match &registration {
        Some(row) => (
            row.get("admin_name").cloned().unwrap_or(Value::Null),
            row.get("company_name").cloned().unwrap_or(Value::Null),
        ),
        None => (json!(metadata_name), json!("Company")),
    };

    json!({
        "success": true,
        "user": {
            "email": email,
            "name": name,
            "role": "admin",
            "company": company,
            "supabase_id": session.id(),
        }
    })
}

async fn refresh_local_profile(
    state: &AppState,
    supabase: &Arc<Supabase>,
    session: &crate::supabase::Session,
    email: &str,
    password: &str,
) -> Result<()> {
    let new_hash = crypto::hash_password(password)?;
    let now = manila::iso_utc();

    let profile = supabase
        .select(
            "registration_credentials",
            "*",
            &[("admin_email", email.to_string())],
        )
        .await
        .ok()
        .and_then(|rows| rows.into_iter().next());

    let cell = |row: &Value, key: &str| crate::json::json_to_sql(&row.get(key).cloned().unwrap_or(Value::Null));

    match profile {
        Some(profile) => state.with_db(|conn| {
            conn.execute(
                UPSERT_PROFILE,
                rusqlite::params![
                    cell(&profile, "company_name"),
                    cell(&profile, "company_email"),
                    cell(&profile, "company_address"),
                    cell(&profile, "company_contact"),
                    cell(&profile, "admin_name"),
                    cell(&profile, "admin_email"),
                    new_hash,
                    "OFFLINE_PLACEHOLDER",
                    cell(&profile, "avatar"),
                    cell(&profile, "bio"),
                    cell(&profile, "theme_preference"),
                    cell(&profile, "language"),
                    1,
                    cell(&profile, "license_key"),
                    cell(&profile, "registration_date"),
                    now.clone(),
                    now,
                ],
            )
        })?,
        None => {
            let metadata = session.user.get("user_metadata").cloned().unwrap_or(Value::Null);
            let meta_text = |key: &str, fallback: &str| {
                metadata
                    .get(key)
                    .and_then(Value::as_str)
                    .filter(|value| !value.is_empty())
                    .unwrap_or(fallback)
                    .to_string()
            };

            let inserted = state.with_db(|conn| {
                conn.execute(
                    UPSERT_FALLBACK,
                    rusqlite::params![
                        meta_text("company_name", "Company"),
                        email,
                        SqlValue::Null,
                        SqlValue::Null,
                        meta_text("name", "Admin"),
                        email,
                        new_hash,
                        "OFFLINE_PLACEHOLDER",
                        SqlValue::Null,
                        SqlValue::Null,
                        "light",
                        "en",
                        1,
                        format!("OFFLINE-{}", chrono::Utc::now().timestamp_millis()),
                        now.clone(),
                        now.clone(),
                        now,
                    ],
                )
            })?;
            eprintln!(
                "Could not fetch Supabase profile, inserted local fallback record from Auth Metadata."
            );
            inserted
        }
    };

    Ok(())
}


