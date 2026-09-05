pub mod activities;
pub mod analytics;
pub mod attendance;
pub mod departments;
pub mod employees;
pub mod migrations;
pub mod payroll;
pub mod schema;
pub mod users;

use std::path::Path;

use rusqlite::Connection;

use crate::error::Result;

/// Open `company-admin.sqlite` with the same pragmas the Electron build used.
pub fn open(db_path: &Path) -> Result<Connection> {
    let conn = Connection::open(db_path)?;
    conn.pragma_update(None, "journal_mode", "WAL")?;
    conn.pragma_update(None, "foreign_keys", "ON")?;
    Ok(conn)
}

/// `DatabaseService.initializeDatabase()`, plus the two steps that move an
/// existing install onto cloud-only credentials and encrypted employee columns.
pub fn initialize(conn: &Connection, data_dir: &Path) -> Result<()> {
    schema::create_tables(conn)?;
    migrations::migrate_payroll_columns(conn);
    schema::create_registration_table(conn)?;
    // Before the legacy import, so it never has to fill a hash column that is
    // on its way out.
    migrations::migrate_credentials_to_cloud(conn, data_dir);
    migrations::migrate_database(conn);
    migrations::migrate_employees_table(conn);
    migrations::migrate_registration_table(conn, data_dir);
    migrations::migrate_sync_schema(conn);
    migrations::migrate_field_encryption(conn);
    schema::create_triggers(conn)?;
    Ok(())
}
