use std::path::PathBuf;
use std::sync::{Arc, Mutex, MutexGuard, RwLock, RwLockReadGuard, RwLockWriteGuard};

use rusqlite::Connection;
use tauri::Manager;

use crate::crypto::Dek;
use crate::error::{fail, Result};
use crate::supabase::Supabase;

/// Shared application state. The SQLite connection is guarded by a plain mutex
/// because `better-sqlite3` was synchronous too — every command took the
/// database exclusively for the duration of its work.
pub struct AppState {
    connection: Mutex<Connection>,
    #[allow(dead_code)]
    pub data_dir: PathBuf,
    pub db_path: PathBuf,
    /// The data key, held only while the app is unlocked. It is never written to
    /// SQLite and never written to a file; the only copy that outlives the
    /// process is the wrapped one in the cloud, plus the offline grace cache in
    /// the Windows Credential Manager. `RwLock` because every read of an
    /// encrypted column needs it concurrently and only login replaces it.
    dek: RwLock<Option<Dek>>,
    /// `true` when the SQLite file did not exist as this process opened it — the
    /// one condition under which the cloud is allowed to seed local.
    pub fresh_database: bool,
    pub supabase: Option<Arc<Supabase>>,
    pub app_version: String,
}

impl AppState {
    pub fn new(
        connection: Connection,
        data_dir: PathBuf,
        db_path: PathBuf,
        fresh_database: bool,
        supabase: Option<Arc<Supabase>>,
        app_version: String,
    ) -> Self {
        Self {
            connection: Mutex::new(connection),
            data_dir,
            db_path,
            dek: RwLock::new(None),
            fresh_database,
            supabase,
            app_version,
        }
    }

    fn guard(&self) -> MutexGuard<'_, Connection> {
        // A panic inside one command must not brick the database for the rest
        // of the session, so recover the connection from a poisoned lock.
        self.connection
            .lock()
            .unwrap_or_else(|poisoned| poisoned.into_inner())
    }

    /// Run a read or single-statement write against the database.
    ///
    /// The guard is confined to this call, so command futures never hold a
    /// non-`Send` lock across an `await`. There is no `&mut Connection`
    /// variant here because most callers only need shared access; see
    /// `with_db_mut` for the transactional one.
    pub fn with_db<T>(&self, work: impl FnOnce(&Connection) -> T) -> T {
        let connection = self.guard();
        work(&connection)
    }

    /// Same, with exclusive access, for the one place that needs a transaction:
    /// the first-run seed from cloud has to be all-or-nothing so a crash midway
    /// cannot leave a half-populated database that looks seeded.
    pub fn with_db_mut<T>(&self, work: impl FnOnce(&mut Connection) -> T) -> T {
        let mut connection = self.guard();
        work(&mut connection)
    }

    /// Hold the data key for the rest of the session. Called by login and by the
    /// offline unlock, both of which have already proven possession of a secret.
    pub fn unlock(&self, dek: Dek) {
        *self.dek_guard_mut() = Some(dek);
    }

    /// Drop the key on sign-out. Encrypted columns become unreadable again.
    pub fn lock(&self) {
        *self.dek_guard_mut() = None;
    }

    /// The data key, or an error naming what the caller has to do about it.
    ///
    /// Every read and write of an encrypted column goes through here, so a
    /// locked session fails loudly rather than silently storing plaintext.
    pub fn dek(&self) -> Result<Dek> {
        match self.dek_guard().as_ref() {
            Some(dek) => Ok(dek.clone()),
            None => fail("This session is locked. Sign in to unlock the encrypted data."),
        }
    }

    fn dek_guard(&self) -> RwLockReadGuard<'_, Option<Dek>> {
        self.dek
            .read()
            .unwrap_or_else(|poisoned| poisoned.into_inner())
    }

    fn dek_guard_mut(&self) -> RwLockWriteGuard<'_, Option<Dek>> {
        self.dek
            .write()
            .unwrap_or_else(|poisoned| poisoned.into_inner())
    }
}

/// Electron stored its data in `app.getPath('userData')`, which resolves to
/// `<config dir>/<productName>`. Reusing that exact location means an existing
/// install keeps its database and backups after the port. It no longer keeps a
/// key file there: `db::migrations` deletes the legacy `encryption.key`.
pub fn resolve_data_dir(app: &tauri::AppHandle) -> PathBuf {
    let base = app
        .path()
        .config_dir()
        .unwrap_or_else(|_| std::env::temp_dir());
    base.join("Admin Pro")
}
