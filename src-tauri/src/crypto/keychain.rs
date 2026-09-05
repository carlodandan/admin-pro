//! The offline grace cache, held in the Windows Credential Manager.
//!
//! Credentials are cloud-only, which on its own would mean the app cannot open
//! without a connection. To keep it usable on a flaky link, a successful cloud
//! login writes the two wrapped copies of the data key and an absolute expiry
//! into the platform credential store; a later start with no connection unwraps
//! the cached blob with the password it is given, instead of asking the cloud.
//!
//! Three properties matter here:
//!
//! * The cache holds no unwrapped key. It is the same `salt || nonce || ct+tag`
//!   blob `app_keyring` holds, so the password is still required — reading the
//!   entry off the machine buys an attacker an Argon2id attack, not the key.
//! * The expiry is absolute and set at login, so the grace cannot be extended by
//!   simply staying offline.
//! * `last_seen` only ever moves forward. Winding the system clock back to make
//!   an expired cache look fresh trips that check and the cache is discarded, so
//!   the grace cannot be extended by lying about the time either.
//!
//! Both blobs are cached, not just the password one, so recovery by super-admin
//! key also works offline. The entry is scoped to the Windows user account, and
//! deleting it only forces the next start to go online.

use chrono::{DateTime, Duration, Utc};
use serde::{Deserialize, Serialize};

use crate::error::Result;

/// Shown in the Credential Manager UI as `AdminPro/session`.
const SERVICE: &str = "AdminPro";
const ACCOUNT: &str = "session";

/// How long a cached unlock stays usable without reaching the cloud.
pub const GRACE_DAYS: i64 = 7;

/// Tolerance for ordinary clock drift and timezone changes before a backwards
/// jump is treated as tampering.
const ROLLBACK_TOLERANCE_MINUTES: i64 = 60;

/// What a successful cloud login leaves behind for the next offline start.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CachedSession {
    pub email: String,
    /// Base64, exactly as `app_keyring` holds them, so an offline sign-in runs
    /// the same unwrap as an online one and recovery works offline too.
    pub wrapped_by_password: String,
    pub wrapped_by_recovery: String,
    /// Unix seconds. Set at login, never extended by a read.
    pub expires_at: i64,
    /// Unix seconds, monotonic across reads. Anti-rollback.
    last_seen: i64,
}

impl CachedSession {
    /// Whole days of grace left, floored at zero — what the login screen shows.
    pub fn days_remaining(&self) -> i64 {
        let seconds = self.expires_at - Utc::now().timestamp();
        if seconds <= 0 {
            0
        } else {
            (seconds + 86_399) / 86_400
        }
    }

    pub fn expires_at_iso(&self) -> String {
        DateTime::from_timestamp(self.expires_at, 0)
            .map(|stamp| stamp.to_rfc3339())
            .unwrap_or_default()
    }
}

fn entry() -> Result<keyring::Entry> {
    keyring::Entry::new(SERVICE, ACCOUNT).map_err(Into::into)
}

/// Cache a session. Called only after the cloud has authenticated the admin, so
/// this never creates access that the cloud has not already granted.
pub fn store(email: &str, wrapped_by_password: &str, wrapped_by_recovery: &str) -> Result<()> {
    let now = Utc::now();
    let session = CachedSession {
        email: email.to_string(),
        wrapped_by_password: wrapped_by_password.to_string(),
        wrapped_by_recovery: wrapped_by_recovery.to_string(),
        expires_at: (now + Duration::days(GRACE_DAYS)).timestamp(),
        last_seen: now.timestamp(),
    };

    entry()?
        .set_secret(&serde_json::to_vec(&session)?)
        .map_err(Into::into)
}

/// Read the cache, if there is a live one.
///
/// Returns `Ok(None)` — never an error — when there is no entry, when the entry
/// has lapsed, or when its contents cannot be understood. All three mean the
/// same thing to the caller: this device has to reach the cloud. A lapsed or
/// unreadable entry is cleared on the way out so it is not re-examined.
pub fn load() -> Result<Option<CachedSession>> {
    let entry = entry()?;
    let raw = match entry.get_secret() {
        Ok(raw) => raw,
        Err(keyring::Error::NoEntry) => return Ok(None),
        Err(error) => return Err(error.into()),
    };

    let Ok(mut session) = serde_json::from_slice::<CachedSession>(&raw) else {
        let _ = entry.delete_credential();
        return Ok(None);
    };

    let now = Utc::now().timestamp();

    // A clock rolled back past ordinary drift is an attempt to revive a lapsed
    // grace period, so the cache goes rather than the check being softened.
    if now < session.last_seen - ROLLBACK_TOLERANCE_MINUTES * 60 {
        let _ = entry.delete_credential();
        return Ok(None);
    }

    if now >= session.expires_at {
        let _ = entry.delete_credential();
        return Ok(None);
    }

    if now > session.last_seen {
        session.last_seen = now;
        // A failed write here is not fatal: the session is still valid, it just
        // loses one tick of rollback protection.
        let _ = entry.set_secret(&serde_json::to_vec(&session)?);
    }

    Ok(Some(session))
}

/// Forget the cached session — on sign-out, and whenever the cloud rejects the
/// credentials the cache was built from.
pub fn clear() -> Result<()> {
    match entry()?.delete_credential() {
        Ok(()) | Err(keyring::Error::NoEntry) => Ok(()),
        Err(error) => Err(error.into()),
    }
}
