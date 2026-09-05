use std::path::PathBuf;
use std::sync::{Arc, Mutex, MutexGuard};

use rusqlite::Connection;
use tauri::Manager;

use crate::supabase::Supabase;

/// Shared application state. The SQLite connection is guarded by a plain mutex
/// because `better-sqlite3` was synchronous too — every command took the
/// database exclusively for the duration of its work.
pub struct AppState {
    connection: Mutex<Connection>,
    /// The three fields below mirror `DatabaseService`/`AuthService` properties.
    /// Nothing reads them yet — `secret_key` exists so the `encryption.key`
    /// lifecycle stays intact for `crypto::encrypt_password`, which the app has
    /// never called — but dropping them would lose that parity.
    #[allow(dead_code)]
    pub data_dir: PathBuf,
    pub db_path: PathBuf,
    #[allow(dead_code)]
    pub key_path: PathBuf,
    #[allow(dead_code)]
    pub secret_key: String,
    pub supabase: Option<Arc<Supabase>>,
    pub app_version: String,
    pub zoom: Mutex<f64>,
}

impl AppState {
    pub fn new(
        connection: Connection,
        data_dir: PathBuf,
        db_path: PathBuf,
        key_path: PathBuf,
        secret_key: String,
        supabase: Option<Arc<Supabase>>,
        app_version: String,
    ) -> Self {
        Self {
            connection: Mutex::new(connection),
            data_dir,
            db_path,
            key_path,
            secret_key,
            supabase,
            app_version,
            zoom: Mutex::new(1.0),
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
    /// variant because the original never opened a transaction — every
    /// `DatabaseService` method ran standalone statements.
    pub fn with_db<T>(&self, work: impl FnOnce(&Connection) -> T) -> T {
        let connection = self.guard();
        work(&connection)
    }
}

/// Electron stored its data in `app.getPath('userData')`, which resolves to
/// `<config dir>/<productName>`. Reusing that exact location means an existing
/// install keeps its database, encryption key and backups after the port.
pub fn resolve_data_dir(app: &tauri::AppHandle) -> PathBuf {
    let base = app
        .path()
        .config_dir()
        .unwrap_or_else(|_| std::env::temp_dir());
    base.join("Admin Pro")
}
