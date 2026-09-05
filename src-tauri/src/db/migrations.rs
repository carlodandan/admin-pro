//! Schema migrations, transcribed from `DatabaseService`.
//!
//! Most steps are additive, guarded by `PRAGMA table_info` and swallow their own
//! errors so a database created by any earlier build still opens. Two are not
//! additive, deliberately: `migrate_credentials_to_cloud` drops the local
//! password hashes and deletes the stray key file, and
//! `backfill_employee_encryption` rewrites plaintext columns as ciphertext.

use std::path::Path;

use rusqlite::Connection;

use crate::crypto::{self, Dek};
use crate::error::Result;

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

/// SQLite gained `ALTER TABLE … DROP COLUMN` in 3.35; the bundled
/// `libsqlite3-sys` ships 3.46, so this needs no table rebuild. It still fails
/// on an indexed or otherwise referenced column, hence the logged error rather
/// than an unwrap.
fn drop_column_if_present(conn: &Connection, table: &str, column: &str) {
    if !columns(conn, table).iter().any(|name| name == column) {
        return;
    }
    if let Err(error) = conn.execute_batch(&format!("ALTER TABLE {table} DROP COLUMN {column}")) {
        eprintln!("[DB] Error dropping {table}.{column}: {error}");
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
                   admin_name, admin_email,
                   is_registered, license_key, registration_date, last_reset_date,
                   last_updated, reset_count
               )
               SELECT
                   company_name, company_email, company_address, company_contact,
                   admin_name, admin_email,
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

/// Credentials are cloud-only now, so the two bcrypt columns and the stray key
/// file are liabilities rather than assets — removing them *is* the change, not
/// a side effect of it. Runs before `migrate_registration_table` so the legacy
/// import never has to satisfy a `NOT NULL` hash column on its way out.
pub fn migrate_credentials_to_cloud(conn: &Connection, data_dir: &Path) {
    for column in ["admin_password_hash", "super_admin_password_hash"] {
        drop_column_if_present(conn, "registration_credentials", column);
    }

    // Earlier builds wrote a random key here and then never read it. A local key
    // file is exactly what this design removes, so it goes with them.
    let legacy_key = data_dir.join("encryption.key");
    if legacy_key.exists() {
        match std::fs::remove_file(&legacy_key) {
            Ok(()) => println!("[DB] Removed the legacy local encryption key"),
            Err(error) => {
                eprintln!("[DB] Could not remove {}: {error}", legacy_key.display());
            }
        }
    }
}

/// The blind-index columns, plus the unique indexes carrying the constraints the
/// ciphertext columns can no longer enforce. `add_column_if_missing` appends, so
/// a migrated database orders these differently from a freshly created one —
/// every query names its columns, so the position never shows.
pub fn migrate_field_encryption(conn: &Connection) {
    for column in ["email_bidx", "company_id_bidx"] {
        add_column_if_missing(conn, "employees", column, "TEXT");
    }
    for statement in [
        "CREATE UNIQUE INDEX IF NOT EXISTS idx_employees_email_bidx ON employees(email_bidx)",
        "CREATE UNIQUE INDEX IF NOT EXISTS idx_employees_company_id_bidx ON employees(company_id_bidx)",
    ] {
        if let Err(error) = conn.execute_batch(statement) {
            eprintln!("[DB] Error creating a blind index: {error}");
        }
    }
}

/// One employee row as the backfill sees it, before anything is decided about it.
struct StoredRow {
    id: i64,
    company_id: Option<String>,
    email: String,
    phone: Option<String>,
    pin_code: Option<String>,
    email_bidx: Option<String>,
    company_id_bidx: Option<String>,
}

/// Encrypt any employee row still holding plaintext and fill both blind-index
/// columns. This needs the data key, so it runs after login rather than at open.
///
/// Idempotent by construction rather than by a flag: `decrypt_field` passes
/// plaintext through untouched and `encrypt_field` refuses to touch a value that
/// already carries the `enc:v1:` prefix, so a finished row recomputes to
/// byte-identical values and is skipped. A second pass therefore changes zero
/// rows, and a pass over a half-migrated table finishes the job.
pub fn backfill_employee_encryption(conn: &Connection, dek: &Dek) -> Result<usize> {
    let index_key = crypto::derive_index_key(dek);

    let rows = {
        let mut statement = conn.prepare(
            "SELECT id, company_id, email, phone, pin_code, email_bidx, company_id_bidx
               FROM employees",
        )?;
        let mapped = statement.query_map([], |row| {
            Ok(StoredRow {
                id: row.get("id")?,
                company_id: row.get("company_id")?,
                email: row.get("email")?,
                phone: row.get("phone")?,
                pin_code: row.get("pin_code")?,
                email_bidx: row.get("email_bidx")?,
                company_id_bidx: row.get("company_id_bidx")?,
            })
        })?;
        mapped.collect::<rusqlite::Result<Vec<_>>>()?
    };

    let mut changed = 0usize;
    for row in rows {
        // Decrypt first so the blind index is always computed over plaintext,
        // whichever state the row happens to be in.
        let plain_company_id = crypto::decrypt_opt(dek, row.company_id.as_deref())?;
        let plain_email = crypto::decrypt_field(dek, &row.email)?;
        let plain_phone = crypto::decrypt_opt(dek, row.phone.as_deref())?;
        let plain_pin = crypto::decrypt_opt(dek, row.pin_code.as_deref())?;

        let next_company_id = crypto::encrypt_opt(dek, plain_company_id.as_deref())?;
        let next_email = crypto::encrypt_field(dek, &plain_email)?;
        let next_phone = crypto::encrypt_opt(dek, plain_phone.as_deref())?;
        let next_pin = crypto::encrypt_opt(dek, plain_pin.as_deref())?;
        let next_email_bidx = crypto::blind_index_opt(&index_key, Some(plain_email.as_str()));
        let next_company_id_bidx = crypto::blind_index_opt(&index_key, plain_company_id.as_deref());

        if next_company_id == row.company_id
            && next_email == row.email
            && next_phone == row.phone
            && next_pin == row.pin_code
            && next_email_bidx == row.email_bidx
            && next_company_id_bidx == row.company_id_bidx
        {
            continue;
        }

        conn.execute(
            "UPDATE employees
                SET company_id = ?1, email = ?2, phone = ?3, pin_code = ?4,
                    email_bidx = ?5, company_id_bidx = ?6
              WHERE id = ?7",
            rusqlite::params![
                next_company_id,
                next_email,
                next_phone,
                next_pin,
                next_email_bidx,
                next_company_id_bidx,
                row.id,
            ],
        )?;
        changed += 1;
    }

    if changed > 0 {
        println!("[DB] Encrypted {changed} employee row(s) at rest");
    }
    Ok(changed)
}
