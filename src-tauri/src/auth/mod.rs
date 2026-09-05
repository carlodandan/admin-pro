//! `AuthService` — registration, login and the recovery path, with credentials
//! living entirely in Supabase.
//!
//! Nothing here hashes or stores a password. GoTrue owns credentials, the
//! AES-256-GCM data key exists only wrapped — twice over, in `app_keyring` —
//! and the local registration row keeps profile columns alone so the sidebar and
//! Settings still render without a network.
//!
//! Offline login is therefore not a fall back to a weaker check: the wrapped key
//! *is* the verifier. A wrong password simply fails to unwrap, and Argon2id at
//! 19 MiB stands between an attacker and the cached blob whether the machine is
//! online or not.

pub mod crypto;

use std::sync::Arc;

use base64::engine::general_purpose::STANDARD as BASE64;
use base64::Engine as _;
use rusqlite::types::Value as SqlValue;
use serde_json::{json, Value};

use crate::crypto as keys;
use crate::crypto::keychain::{self, CachedSession};
use crate::crypto::Dek;
use crate::error::{fail, AppError, Result};
use crate::json::{opt_str, query_opt, str_or_empty};
use crate::manila;
use crate::state::AppState;
use crate::supabase::Supabase;

/// Reads one column from the single registration row.
fn registration_column(state: &AppState, sql: &str, email: &str) -> Result<Option<Value>> {
    state.with_db(|conn| query_opt(conn, sql, &[&SqlValue::Text(email.to_string())]))
}

/// The keyring row as the client sees it: the same data key sealed under two
/// different secrets. Neither blob is usable without one of them, which is why
/// carrying both around — including into the Credential Manager — is safe.
struct Keyring {
    wrapped_by_password: Vec<u8>,
    wrapped_by_recovery: Vec<u8>,
}

impl Keyring {
    fn password_b64(&self) -> String {
        BASE64.encode(&self.wrapped_by_password)
    }

    fn recovery_b64(&self) -> String {
        BASE64.encode(&self.wrapped_by_recovery)
    }
}

/// PostgREST renders `bytea` as Postgres' own `\x…` hex literal.
fn decode_bytea(row: &Value, key: &str) -> Result<Vec<u8>> {
    let text = row.get(key).and_then(Value::as_str).unwrap_or_default();
    hex::decode(text.strip_prefix(r"\x").unwrap_or(text))
        .map_err(|error| AppError::Message(format!("{key} is not readable: {error}")))
}

/// Read the one keyring row. RLS answers this only for a signed-in admin; the
/// anon key gets a permission error rather than an empty set.
async fn fetch_keyring(supabase: &Arc<Supabase>) -> Result<Keyring> {
    let rows = supabase
        .select("app_keyring", "wrapped_by_password,wrapped_by_recovery", &[])
        .await?;

    let Some(row) = rows.into_iter().next() else {
        return fail("This project has no encryption key yet. Register the administrator first.");
    };

    Ok(Keyring {
        wrapped_by_password: decode_bytea(&row, "wrapped_by_password")?,
        wrapped_by_recovery: decode_bytea(&row, "wrapped_by_recovery")?,
    })
}

/// The keyring as the offline cache holds it, so recovery works without a
/// network too.
fn cached_keyring(cached: &CachedSession) -> Result<Keyring> {
    let decode = |value: &str, label: &str| {
        BASE64
            .decode(value)
            .map_err(|error| AppError::Message(format!("{label} is not readable: {error}")))
    };
    Ok(Keyring {
        wrapped_by_password: decode(&cached.wrapped_by_password, "the cached password key")?,
        wrapped_by_recovery: decode(&cached.wrapped_by_recovery, "the cached recovery key")?,
    })
}

/// Hold the key for this session and refresh the offline grace cache. A cache
/// failure only costs the grace period, so it warns rather than aborting a login
/// the cloud has already accepted.
fn hold(state: &AppState, email: &str, keyring: &Keyring, dek: Dek) {
    state.unlock(dek);
    if let Err(error) = keychain::store(email, &keyring.password_b64(), &keyring.recovery_b64()) {
        eprintln!("Could not cache the session for offline use: {error}");
    }
}

/// The keyring, from wherever it can be reached without already knowing the
/// password: the cloud while a session is live, otherwise the offline cache.
/// Recovery has to work while locked out, and being locked out is precisely when
/// there is no session to read the cloud with.
async fn reachable_keyring(supabase: Option<&Arc<Supabase>>, email: &str) -> Result<Keyring> {
    if let Some(supabase) = supabase {
        if supabase.session().is_some() {
            return fetch_keyring(supabase).await;
        }
    }

    match keychain::load()? {
        Some(cached) if cached.email.eq_ignore_ascii_case(email) => cached_keyring(&cached),
        _ => fail(
            "The recovery key can only be checked while signed in, or on a device that has \
             signed in before. Use the password reset email instead.",
        ),
    }
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

/// `storeRegistration()` — the one moment in this app's life when a data key and
/// a recovery key come into existence.
///
/// Both "only once" guarantees are the database's, not this function's:
/// `claim_first_admin()` inserts only into an empty table and `install_keyring()`
/// only when no key row exists. So two devices racing here cannot both win, and
/// the loser's fallbacks below adopt what the winner installed rather than
/// inventing a second key.
pub async fn store_registration(
    state: &AppState,
    supabase: Option<&Arc<Supabase>>,
    data: &Value,
) -> Result<Value> {
    // Credentials live in the cloud now, so registration without one is not a
    // degraded mode — it is impossible.
    let Some(supabase) = supabase else {
        return fail(
            "Registration needs an internet connection: the administrator account and the \
             encryption key are both created in the cloud.",
        );
    };

    if is_system_registered(state, Some(supabase)).await {
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
    if admin_password.is_empty() {
        return fail("An administrator password is required");
    }

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

    // A JWT is needed for both RPCs below. With email confirmations on, GoTrue
    // hands back no session from the signup, so this call is what surfaces that
    // configuration as an error the user can act on.
    if let Err(error) = supabase
        .sign_in_with_password(&admin_email, &admin_password)
        .await
    {
        return fail(format!(
            "The administrator account was created but could not be signed in ({error}). If this \
             project has email confirmations enabled, confirm the address or disable \
             confirmations, then sign in.",
        ));
    }

    ensure_admin_claim(supabase).await?;

    let recovery_key = keys::generate_recovery_key();
    let (keyring, dek, issued) = install_keyring(supabase, &admin_password, &recovery_key).await?;
    hold(state, &admin_email, &keyring, dek);

    let license_key = crypto::generate_license_key();
    let now = manila::iso_utc();

    let nullable = |key: &str| match opt_str(data, key) {
        Some(value) if !value.is_empty() => SqlValue::Text(value),
        _ => SqlValue::Null,
    };

    // Profile columns only. Nothing that proves who the admin is lives here any
    // more, which is why this row is safe to seed from cloud on a new device.
    let registration_id = state.with_db(|conn| -> Result<i64> {
        conn.execute(
            r#"INSERT INTO registration_credentials (
                   company_name, company_email, company_address, company_contact,
                   admin_name, admin_email,
                   is_registered, license_key, registration_date
               ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)"#,
            rusqlite::params![
                str_or_empty(data, "company_name"),
                str_or_empty(data, "company_email"),
                nullable("company_address"),
                nullable("company_contact"),
                str_or_empty(data, "admin_name"),
                admin_email.clone(),
                1,
                license_key.clone(),
                now,
            ],
        )?;
        Ok(conn.last_insert_rowid())
    })?;

    let recovery_key_issued = issued.is_some();
    Ok(json!({
        "success": true,
        "registrationId": registration_id,
        "licenseKey": license_key,
        "adminEmail": admin_email,
        // Null when an earlier registration had already installed the key: the
        // real escrow key is that earlier one, and showing a freshly generated
        // key that unwraps nothing would be a lie.
        "recoveryKey": issued,
        "recoveryKeyIssued": recovery_key_issued,
    }))
}

/// `createSupabaseAdmin()`. There is no `role` in the metadata any more:
/// `user_metadata` is editable by the user it describes, so anything that
/// authorized on it could be granted by its own subject. The admin registry is
/// `public.app_admins`, and RLS reads it through `private.is_admin()`.
async fn create_supabase_admin(
    supabase: &Arc<Supabase>,
    email: &str,
    password: &str,
    metadata: Value,
) -> Result<Option<String>> {
    let mut data = json!({});
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
            // An account that already exists is the signature of a registration
            // that got part-way through before. Sign-in decides whether this is
            // the same person, so let it.
            let message = error.message.to_lowercase();
            if message.contains("already registered") || message.contains("already been registered")
            {
                println!("[AUTH] This account already exists; continuing with sign-in");
                return Ok(None);
            }
            eprintln!("Supabase Admin Creation Failed: {error}");
            Err(error.into())
        }
    }
}

/// Register this account in `app_admins`, or confirm it is already the one there.
///
/// The RPC refuses once the table is non-empty, so its failure is ambiguous
/// between "someone else got there" and "this account got there earlier and the
/// rest of registration did not finish". The select policy on `app_admins`
/// answers only for the caller's own row, so a hit distinguishes the two.
async fn ensure_admin_claim(supabase: &Arc<Supabase>) -> Result<()> {
    match supabase.rpc("claim_first_admin", json!({})).await {
        Ok(_) => Ok(()),
        Err(error) => {
            let mine = supabase
                .select("app_admins", "user_id", &[])
                .await
                .unwrap_or_default();

            if mine.is_empty() {
                return fail(format!(
                    "An administrator is already registered for this project, and it is not this \
                     account ({error}).",
                ));
            }

            println!("[AUTH] This account already holds the administrator claim");
            Ok(())
        }
    }
}

/// Generate the data key and seal it twice — under the password and under the
/// recovery key — then hand both blobs to the database, which accepts them only
/// if no key exists yet.
///
/// Returns the recovery key to display only when this call is what installed it.
async fn install_keyring(
    supabase: &Arc<Supabase>,
    password: &str,
    recovery_key: &str,
) -> Result<(Keyring, Dek, Option<String>)> {
    let dek = keys::random_dek();
    let keyring = Keyring {
        wrapped_by_password: keys::wrap(dek.as_slice(), password)?,
        wrapped_by_recovery: keys::wrap(dek.as_slice(), recovery_key)?,
    };

    match supabase
        .rpc(
            "install_keyring",
            json!({
                "wrapped_password": keyring.password_b64(),
                "wrapped_recovery": keyring.recovery_b64(),
            }),
        )
        .await
    {
        Ok(_) => Ok((keyring, dek, Some(recovery_key.to_string()))),
        Err(error) => {
            // The database refused a second key, which is the guarantee doing its
            // job. Adopt the existing one rather than stranding this install —
            // the key that can actually read the data is the one already there.
            eprintln!("[AUTH] The project already has an encryption key: {error}");
            let existing = fetch_keyring(supabase).await?;
            let dek = keys::unwrap(&existing.wrapped_by_password, password)?;
            Ok((existing, dek, None))
        }
    }
}

/// Prove possession of the recovery key by using it: the blob only opens for the
/// real one. Nothing is compared against a stored hash, because no hash exists.
async fn unwrap_with_recovery(
    supabase: Option<&Arc<Supabase>>,
    email: &str,
    recovery_key: &str,
) -> Result<(Keyring, Dek)> {
    let keyring = reachable_keyring(supabase, email).await?;
    let canonical = keys::canonical_recovery_key(recovery_key);
    let dek = keys::unwrap(&keyring.wrapped_by_recovery, &canonical)?;
    Ok((keyring, dek))
}

/// `verifySuperAdminPassword()` — now a recovery-key check. The IPC name is
/// unchanged so the frontend contract holds.
pub async fn verify_super_admin_password(
    supabase: Option<&Arc<Supabase>>,
    email: &str,
    recovery_key: &str,
) -> Value {
    match unwrap_with_recovery(supabase, email, recovery_key).await {
        Ok(_) => json!({ "success": true, "message": "Recovery key verified successfully" }),
        Err(error) => {
            eprintln!("Error verifying the recovery key: {error}");
            json!({ "success": false, "error": error.to_string() })
        }
    }
}

/// Re-seal the key under a new password, then move the account onto it.
///
/// That order, and the undo, exist because GoTrue and Postgres cannot be changed
/// atomically. A keyring sealed under a password the account does not have would
/// lock the admin out of their own data at the next login, so when the password
/// change fails the re-seal is put back — which is possible only while the old
/// password is still known.
async fn rotate_password(
    state: &AppState,
    supabase: &Arc<Supabase>,
    email: &str,
    keyring: &Keyring,
    dek: &Dek,
    new_password: &str,
    previous_password: Option<&str>,
) -> Result<()> {
    let rewrap = |blob: &[u8]| json!({ "wrapped_password": BASE64.encode(blob) });

    let next = keys::wrap(dek.as_slice(), new_password)?;
    supabase.rpc("rewrap_password", rewrap(&next)).await?;

    if let Err(error) = supabase.update_user_password(new_password).await {
        let Some(previous_password) = previous_password else {
            return fail(format!(
                "The password was not changed ({error}). Run this again with the same new password \
                 to finish the change — the encryption key is already sealed under it.",
            ));
        };

        let restored = keys::wrap(dek.as_slice(), previous_password)?;
        return match supabase.rpc("rewrap_password", rewrap(&restored)).await {
            Ok(_) => fail(format!("The password was not changed ({error}).")),
            Err(undo) => fail(format!(
                "The password was not changed ({error}), and the encryption key could not be \
                 restored to the old one ({undo}). Sign in with your recovery key.",
            )),
        };
    }

    let refreshed = Keyring {
        wrapped_by_password: next,
        wrapped_by_recovery: keyring.wrapped_by_recovery.clone(),
    };
    hold(state, email, &refreshed, dek.clone());
    Ok(())
}

/// `resetAdminPassword()` — gated on the recovery key rather than a second
/// password, and applied in the cloud rather than to a local hash.
pub async fn reset_admin_password(
    state: &AppState,
    supabase: Option<&Arc<Supabase>>,
    email: &str,
    recovery_key: &str,
    new_password: &str,
) -> Value {
    let (keyring, dek) = match unwrap_with_recovery(supabase, email, recovery_key).await {
        Ok(unwrapped) => unwrapped,
        Err(error) => return json!({ "success": false, "error": error.to_string() }),
    };

    // GoTrue will only set a password for a live session or through its own
    // emailed link. With the recovery key proven but no session to spend, the
    // honest answer is the link — not a local password this app would then have
    // to trust.
    let Some(supabase) = supabase.filter(|supabase| supabase.session().is_some()) else {
        let sent = match supabase {
            Some(supabase) => supabase.send_recovery_email(email).await.is_ok(),
            None => false,
        };
        return json!({
            "success": false,
            "recoveryKeyVerified": true,
            "emailSent": sent,
            "error": if sent {
                "Your recovery key is correct. Passwords are set in the cloud, so a reset link has \
                 been emailed to you — open it to choose the new password."
            } else {
                "Your recovery key is correct, but the password can only be changed while signed \
                 in or through a reset email, and the email could not be sent."
            },
        });
    };

    if let Err(error) = rotate_password(
        state, supabase, email, &keyring, &dek, new_password, None,
    )
    .await
    {
        eprintln!("Error resetting password: {error}");
        return json!({ "success": false, "error": error.to_string() });
    }

    let now = manila::iso_utc();
    let recorded = state.with_db(|conn| {
        conn.execute(
            r#"UPDATE registration_credentials
               SET last_reset_date = ?,
                   last_updated = ?,
                   reset_count = reset_count + 1
               WHERE admin_email = ?"#,
            rusqlite::params![now.clone(), now, email],
        )
    });
    if let Err(error) = recorded {
        eprintln!("Password was reset but the local record was not touched: {error}");
    }

    json!({ "success": true, "message": "Password reset successfully" })
}

/// `changeAdminPassword()`. The current password is verified by unwrapping the
/// keyring with it — GoTrue's own password update does not ask for it, so this is
/// what stops a left-open session from being used to lock the owner out.
pub async fn change_admin_password(
    state: &AppState,
    supabase: Option<&Arc<Supabase>>,
    email: &str,
    current_password: &str,
    new_password: &str,
) -> Value {
    let Some(supabase) = supabase.filter(|supabase| supabase.session().is_some()) else {
        return json!({
            "success": false,
            "error": "Changing the password needs an internet connection and a signed-in session.",
        });
    };

    let keyring = match fetch_keyring(supabase).await {
        Ok(keyring) => keyring,
        Err(error) => return json!({ "success": false, "error": error.to_string() }),
    };

    let dek = match keys::unwrap(&keyring.wrapped_by_password, current_password) {
        Ok(dek) => dek,
        Err(_) => return json!({ "success": false, "error": "Current password is incorrect" }),
    };

    if let Err(error) = rotate_password(
        state,
        supabase,
        email,
        &keyring,
        &dek,
        new_password,
        Some(current_password),
    )
    .await
    {
        eprintln!("Error changing admin password: {error}");
        return json!({ "success": false, "error": error.to_string() });
    }

    let touched = state.with_db(|conn| {
        conn.execute(
            r#"UPDATE registration_credentials
               SET last_updated = ?
               WHERE admin_email = ?"#,
            rusqlite::params![manila::iso_utc(), email],
        )
    });
    if let Err(error) = touched {
        eprintln!("Password was changed but the local record was not touched: {error}");
    }

    json!({ "success": true, "message": "Password changed successfully" })
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

/// `backupDatabase()` — `company-admin-backup-<millis>.sqlite` beside the live
/// file. A WAL checkpoint is taken first so the copy is not missing the most
/// recent writes; `better-sqlite3` left that to chance.
///
/// The copy carries the same ciphertext the live file does, and no key, so a
/// backup is only as useful as the cloud keyring it has to be opened with.
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
/// Also drops the key and the offline cache: "reset and then still be unlocked"
/// is not a state worth having.
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

    state.lock();
    if let Err(error) = keychain::clear() {
        eprintln!("Could not clear the cached session: {error}");
    }

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

/// The 15-column upsert `verifyAdminLogin` uses to mirror the cloud profile
/// locally, so the sidebar and Settings still render without a network. Both
/// password-hash columns are gone: there is nothing left here to authenticate
/// with, which is the point.
const UPSERT_PROFILE: &str = r#"
    INSERT INTO registration_credentials (
        company_name, company_email, company_address, company_contact,
        admin_name, admin_email,
        avatar, bio, theme_preference, language,
        is_registered, license_key, registration_date, last_updated, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(admin_email) DO UPDATE SET
        company_name = excluded.company_name,
        admin_name = excluded.admin_name,
        avatar = excluded.avatar,
        last_updated = CURRENT_TIMESTAMP,
        updated_at = CURRENT_TIMESTAMP
"#;

/// Same insert, used when the cloud profile row could not be read. Its conflict
/// path deliberately touches only the timestamp: guessed values from auth
/// metadata must not overwrite a profile the user has already filled in.
const UPSERT_FALLBACK: &str = r#"
    INSERT INTO registration_credentials (
        company_name, company_email, company_address, company_contact,
        admin_name, admin_email,
        avatar, bio, theme_preference, language,
        is_registered, license_key, registration_date, last_updated, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(admin_email) DO UPDATE SET
        last_updated = CURRENT_TIMESTAMP
"#;

fn invalid_credentials() -> Value {
    json!({ "success": false, "error": "Invalid email or password" })
}

/// `verifyAdminLogin()` — the cloud decides, then the keyring unlocks.
///
/// The old local-bcrypt fallback is gone. What replaced it is not weaker: the
/// cached blob from the last cloud login is opened with the password itself, so a
/// wrong password still fails, and it fails against Argon2id at 19 MiB rather
/// than against a hash comparison.
pub async fn verify_admin_login(
    state: &AppState,
    supabase: Option<&Arc<Supabase>>,
    email: &str,
    password: &str,
) -> Value {
    if let Some(supabase) = supabase {
        match supabase.sign_in_with_password(email, password).await {
            Ok(session) => {
                let keyring = match fetch_keyring(supabase).await {
                    Ok(keyring) => keyring,
                    Err(error) => {
                        eprintln!("Could not read the cloud keyring: {error}");
                        return json!({ "success": false, "error": error.to_string() });
                    }
                };

                let dek = match keys::unwrap(&keyring.wrapped_by_password, password) {
                    Ok(dek) => dek,
                    Err(error) => {
                        // The cloud accepted the password but the key is sealed
                        // under a different one — a password change that stopped
                        // half way. The recovery key is the way back.
                        eprintln!("The keyring did not open with this password: {error}");
                        return json!({
                            "success": false,
                            "error": "Your password is correct but the encryption key was sealed \
                                      under a different one. Use your recovery key to reset it.",
                        });
                    }
                };

                hold(state, email, &keyring, dek);
                return mirror_cloud_profile(state, supabase, &session, email).await;
            }
            Err(error) => {
                eprintln!("Supabase Login Failed: {error}");
                // The original also tested `error.stats === 400`, a typo for
                // `status` that never matched — so only the message decides, and
                // every other failure (offline, rate limit) falls through to the
                // cached unlock below, which is what makes offline login work.
                if error.message.contains("Invalid login credentials") {
                    return invalid_credentials();
                }
                if error.message.to_lowercase().contains("not confirmed") {
                    return json!({
                        "success": false,
                        "error": "This email address has not been confirmed yet. Open the \
                                  confirmation link Supabase sent you, then sign in.",
                    });
                }
            }
        }
    }

    unlock_from_cache(state, email, password)
}

/// Sign out: drop the data key, then drop the session. Returns the token that
/// still wants revoking at GoTrue, if there was one.
///
/// Until this existed, "Logout" cleared `localStorage` and nothing else — the
/// process kept the key in `AppState` and the JWT in `Supabase`, so every
/// encrypted column stayed readable to whatever ran next. The key goes first,
/// because it is the part that cannot be recovered without a password.
///
/// Nothing here touches the network, so signing out cannot hang on a dead link
/// or fail because of one. Revoking is the caller's to do, detached, and is
/// housekeeping rather than protection: the session was never written to disk, so
/// this process has already forgotten it either way.
///
/// The offline cache is deliberately kept. It is not a credential on its own —
/// opening it still needs the password — and clearing it would turn every
/// sign-out into "this device now needs a connection", which is the opposite of
/// what the grace period is for.
pub fn sign_out(state: &AppState, supabase: Option<&Arc<Supabase>>) -> Option<String> {
    state.lock();
    supabase
        .and_then(|supabase| supabase.take_session())
        .map(|session| session.access_token)
}

/// The offline path: the wrapped key cached at the last cloud login is the
/// verifier, and its expiry decides whether this device is still trusted.
///
/// The cache is deliberately not rewritten here. The grace window is anchored to
/// the last time the *cloud* authenticated this admin, so a run of offline logins
/// cannot extend it.
fn unlock_from_cache(state: &AppState, email: &str, password: &str) -> Value {
    let cached = match keychain::load() {
        Ok(Some(cached)) => cached,
        Ok(None) => {
            return json!({
                "success": false,
                "requiresConnection": true,
                "error": "This device needs an internet connection to sign in.",
            })
        }
        Err(error) => {
            eprintln!("Error reading the cached session: {error}");
            return json!({
                "success": false,
                "requiresConnection": true,
                "error": "This device needs an internet connection to sign in.",
            });
        }
    };

    if !cached.email.eq_ignore_ascii_case(email) {
        return invalid_credentials();
    }

    let keyring = match cached_keyring(&cached) {
        Ok(keyring) => keyring,
        Err(error) => {
            eprintln!("The cached session is unreadable: {error}");
            let _ = keychain::clear();
            return json!({
                "success": false,
                "requiresConnection": true,
                "error": "This device needs an internet connection to sign in.",
            });
        }
    };

    let Ok(dek) = keys::unwrap(&keyring.wrapped_by_password, password) else {
        return invalid_credentials();
    };
    state.unlock(dek);

    let registration = registration_column(
        state,
        r#"SELECT admin_name, company_name
           FROM registration_credentials
           WHERE admin_email = ? AND is_registered = 1"#,
        email,
    )
    .ok()
    .flatten();

    json!({
        "success": true,
        "offline": true,
        "graceDaysRemaining": cached.days_remaining(),
        "graceExpiresAt": cached.expires_at_iso(),
        "user": {
            "email": email,
            "name": registration
                .as_ref()
                .and_then(|row| row.get("admin_name").cloned())
                .unwrap_or(Value::Null),
            "role": "admin",
            "company": registration
                .as_ref()
                .and_then(|row| row.get("company_name").cloned())
                .unwrap_or(Value::Null),
        }
    })
}

/// The post-sign-in half: mirror the cloud profile locally so the next offline
/// start still has a name and a company to show, then answer from the local row.
async fn mirror_cloud_profile(
    state: &AppState,
    supabase: &Arc<Supabase>,
    session: &crate::supabase::Session,
    email: &str,
) -> Value {
    // Wrapped so a sync failure only warns, exactly as the inner try/catch did.
    if let Err(error) = refresh_local_profile(state, supabase, session, email).await {
        eprintln!("Failed to mirror the cloud profile: {error}");
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

    // Read for display only. Nothing is authorized on `user_metadata` — the user
    // it describes can rewrite it.
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
) -> Result<()> {
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

    let cell = |row: &Value, key: &str| {
        crate::json::json_to_sql(&row.get(key).cloned().unwrap_or(Value::Null))
    };

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
            let metadata = session
                .user
                .get("user_metadata")
                .cloned()
                .unwrap_or(Value::Null);
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
                        SqlValue::Null,
                        SqlValue::Null,
                        "dark",
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
