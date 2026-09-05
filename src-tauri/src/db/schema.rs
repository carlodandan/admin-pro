//! Schema definition for the local SQLite database.
//!
//! Transcribed from `DatabaseService.createTables()`,
//! `createRegistrationTable()` and `createTriggers()` so that an existing
//! `company-admin.sqlite` written by the Electron build opens unchanged.

use crate::error::Result;
use rusqlite::Connection;

/// Tables in dependency order: employees references departments, attendance and
/// payroll reference employees.
const TABLES: &[&str] = &[
    r#"CREATE TABLE IF NOT EXISTS departments (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL UNIQUE,
        budget REAL NOT NULL,
        supabase_id TEXT UNIQUE,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )"#,
    r#"CREATE TABLE IF NOT EXISTS employees (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        company_id TEXT UNIQUE,
        first_name TEXT NOT NULL,
        last_name TEXT NOT NULL,
        email TEXT NOT NULL UNIQUE,
        phone TEXT,
        position TEXT NOT NULL,
        department_id INTEGER,
        salary REAL NOT NULL,
        hire_date DATE NOT NULL,
        status TEXT NOT NULL DEFAULT 'Active',
        pin_code TEXT DEFAULT '1234',
        supabase_id TEXT UNIQUE,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (department_id) REFERENCES departments(id) ON DELETE SET NULL
    )"#,
    r#"CREATE TABLE IF NOT EXISTS attendance (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        employee_id INTEGER NOT NULL,
        date DATE NOT NULL,
        check_in TIME,
        check_out TIME,
        status TEXT NOT NULL DEFAULT 'Present',
        notes TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (employee_id) REFERENCES employees(id) ON DELETE CASCADE,
        UNIQUE(employee_id, date)
    )"#,
    r#"CREATE TABLE IF NOT EXISTS payroll (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        employee_id INTEGER NOT NULL,
        cutoff_start DATE NOT NULL,
        cutoff_end DATE NOT NULL,
        basic_salary REAL NOT NULL,
        allowances REAL DEFAULT 0,
        deductions REAL DEFAULT 0,
        net_salary REAL NOT NULL,
        status TEXT NOT NULL DEFAULT 'Pending',
        payment_date DATE,
        cutoff_type TEXT DEFAULT 'Full Month',
        working_days INTEGER DEFAULT 24,
        days_present INTEGER DEFAULT 24,
        daily_rate REAL DEFAULT 0,
        breakdown TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (employee_id) REFERENCES employees(id) ON DELETE CASCADE,
        UNIQUE(employee_id, cutoff_start, cutoff_end)
    )"#,
];

/// `registration_credentials` is created separately, exactly as
/// `createRegistrationTable()` did.
const REGISTRATION_TABLE: &str = r#"CREATE TABLE IF NOT EXISTS registration_credentials (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    company_name TEXT NOT NULL,
    company_email TEXT NOT NULL,
    company_address TEXT,
    company_contact TEXT,
    admin_name TEXT NOT NULL,
    admin_email TEXT NOT NULL UNIQUE,
    admin_password_hash TEXT NOT NULL,
    super_admin_password_hash TEXT NOT NULL,
    avatar TEXT,
    bio TEXT,
    theme_preference TEXT DEFAULT 'dark',
    language TEXT DEFAULT 'en',
    is_registered INTEGER DEFAULT 0,
    license_key TEXT UNIQUE,
    registration_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    last_reset_date TIMESTAMP,
    last_updated TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    reset_count INTEGER DEFAULT 0
)"#;

const INDEXES: &[&str] = &[
    "CREATE INDEX IF NOT EXISTS idx_employees_department_id ON employees(department_id)",
    "CREATE INDEX IF NOT EXISTS idx_employees_status ON employees(status)",
    "CREATE INDEX IF NOT EXISTS idx_attendance_date ON attendance(date)",
    "CREATE INDEX IF NOT EXISTS idx_attendance_employee_date ON attendance(employee_id, date)",
    "CREATE INDEX IF NOT EXISTS idx_payroll_period ON payroll(cutoff_start, cutoff_end)",
];

const REGISTRATION_INDEXES: &[&str] = &[
    "CREATE INDEX IF NOT EXISTS idx_credentials_admin_email ON registration_credentials(admin_email)",
    "CREATE INDEX IF NOT EXISTS idx_credentials_is_registered ON registration_credentials(is_registered)",
];

/// Every table that carries an `updated_at` touch trigger.
const TRIGGER_TABLES: &[&str] = &[
    "departments",
    "employees",
    "attendance",
    "payroll",
    "registration_credentials",
];

pub fn create_tables(conn: &Connection) -> Result<()> {
    for statement in TABLES {
        conn.execute_batch(statement)?;
    }
    for statement in INDEXES {
        conn.execute_batch(statement)?;
    }
    Ok(())
}

pub fn create_registration_table(conn: &Connection) -> Result<()> {
    conn.execute_batch(REGISTRATION_TABLE)?;
    for statement in REGISTRATION_INDEXES {
        conn.execute_batch(statement)?;
    }
    Ok(())
}

pub fn create_triggers(conn: &Connection) -> Result<()> {
    for table in TRIGGER_TABLES {
        conn.execute_batch(&format!(
            r#"CREATE TRIGGER IF NOT EXISTS update_{table}_updated_at
               AFTER UPDATE ON {table}
               BEGIN
                 UPDATE {table} SET updated_at = CURRENT_TIMESTAMP WHERE id = NEW.id;
               END;"#
        ))?;
    }
    Ok(())
}
