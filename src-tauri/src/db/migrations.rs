//! Additive schema migrations, transcribed from `DatabaseService`.
//!
//! Each step is guarded by `PRAGMA table_info` and swallows its own errors, so
//! a database created by any earlier build still opens.

use std::path::Path;

use rusqlite::Connection;

/// Column names currently present on `table`.
fn columns(conn: &Connection, table: &str) -> Vec<String> {
    let sql = format!("PRAGMA table_info({table})");
    let Ok(mut statement) = conn.prepare(&sql) else {
        return Vec::new();
    };
    let rows = statement.query_map([], |row| row.get::<_, String>("name"));
    match rows {
        Ok(rows) => rows.filter_map(std::result::Result::ok).collect(),
        Err(_) => Vec::new(),
    }
}

fn add_column_if_missing(conn: &Connection, table: &str, column: &str, ty: &str) {
    if columns(conn, table).iter().any(|name| name == column) {
        return;
    }
    if let Err(error) = conn.execute_batch(&format!(
        "ALTER TABLE {table} ADD COLUMN {column} {ty}"
    )) {
        eprintln!("[DB] Error migrating {table}.{column}: {error}");
    }
}

/// `migratePayrollColumns()` — rename the pre-cutoff period columns.
pub fn migrate_payroll_columns(conn: &Connection) {
    let names = columns(conn, "payroll");
    if !names.iter().any(|name| name == "period_start") {
        return;
    }
    println!("[DB] Migrating payroll columns: period_start/period_end -> cutoff_start/cutoff_end");
    for statement in [
        "ALTER TABLE payroll RENAME COLUMN period_start TO cutoff_start",
        "ALTER TABLE payroll RENAME COLUMN period_end TO cutoff_end",
    ] {
        if let Err(error) = conn.execute_batch(statement) {
            eprintln!("[DB] Payroll column migration skipped: {error}");
            return;
        }
    }
    println!("[DB] Payroll column migration complete");
}

/// `migrateDatabase()` — the bi-monthly payroll columns.
pub fn migrate_database(conn: &Connection) {
    for (column, ty) in [
        ("cutoff_type", "TEXT DEFAULT 'Full Month'"),
        ("working_days", "INTEGER DEFAULT 24"),
        ("days_present", "INTEGER DEFAULT 24"),
        ("daily_rate", "REAL DEFAULT 0"),
        ("breakdown", "TEXT"),
    ] {
        add_column_if_missing(conn, "payroll", column, ty);
    }
}

/// `migrateEmployeesTable()` — kiosk PIN plus the Supabase row id.
pub fn migrate_employees_table(conn: &Connection) {
    let names = columns(conn, "employees");

    if !names.iter().any(|name| name == "pin_code") {
        if let Err(error) =
            conn.execute_batch("ALTER TABLE employees ADD COLUMN pin_code TEXT DEFAULT '1234'")
        {
            eprintln!("[DB] Error migrating employees.pin_code: {error}");
        }
    }

    if !names.iter().any(|name| name == "supabase_id") {
        // SQLite cannot add a UNIQUE constraint through ALTER TABLE, so the
        // uniqueness comes from a separate index.
        for statement in [
            "ALTER TABLE employees ADD COLUMN supabase_id TEXT",
            "CREATE UNIQUE INDEX IF NOT EXISTS idx_employees_supabase_id ON employees(supabase_id)",
        ] {
            if let Err(error) = conn.execute_batch(statement) {
                eprintln!("[DB] Error migrating employees.supabase_id: {error}");
            }
        }
    }
}

/// `migrateSyncSchema()` — the columns the cloud sync relies on.
pub fn migrate_sync_schema(conn: &Connection) {
    const TIMESTAMP: &str = "DATETIME DEFAULT CURRENT_TIMESTAMP";
    for (table, column, ty) in [
        ("departments", "supabase_id", "TEXT UNIQUE"),
        ("departments", "updated_at", TIMESTAMP),
        ("employees", "supabase_id", "TEXT UNIQUE"),
        ("attendance", "updated_at", TIMESTAMP),
        ("payroll", "updated_at", TIMESTAMP),
        ("registration_credentials", "updated_at", TIMESTAMP),
    ] {
        add_column_if_missing(conn, table, column, ty);
    }
}

/// `migrateRegistrationTable()` — one-time import from the pre-consolidation
/// `auth-registration.sqlite` that older builds kept beside the main database.
pub fn migrate_registration_table(conn: &Connection, data_dir: &Path) {
    let count: std::result::Result<i64, _> = conn.query_row(
        "SELECT COUNT(*) as count FROM registration_credentials",
        [],
        |row| row.get(0),
    );

    match count {
        Ok(0) => {}
        Ok(_) => return,
        Err(error) => {
            eprintln!("[DB] Error migrating registration table: {error}");
            return;
        }
    }

    let legacy = data_dir.join("auth-registration.sqlite");
    if !legacy.exists() {
        return;
    }

    let import = |conn: &Connection| -> rusqlite::Result<()> {
        conn.execute("ATTACH DATABASE ? AS old_auth", [legacy.to_string_lossy()])?;
        let copied = conn.execute(
            r#"INSERT INTO main.registration_credentials (
                   company_name, company_email, company_address, company_contact,
                   admin_name, admin_email, admin_password_hash, super_admin_password_hash,
                   is_registered, license_key, registration_date, last_reset_date,
                   last_updated, reset_count
               )
               SELECT
                   company_name, company_email, company_address, company_contact,
                   admin_name, admin_email, admin_password_hash, super_admin_password_hash,
                   is_registered, license_key, registration_date, last_reset_date,
                   last_updated, reset_count
               FROM old_auth.registration_credentials"#,
            [],
        );
        // Detach regardless of whether the copy succeeded.
        let detached = conn.execute("DETACH DATABASE old_auth", []);
        copied?;
        detached?;
        Ok(())
    };

    if let Err(error) = import(conn) {
        eprintln!("[DB] Error migrating registration table: {error}");
    }
}
