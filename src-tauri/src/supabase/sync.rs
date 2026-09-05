//! One-way sync: local SQLite is the record, Supabase is the copy of it.
//!
//! The Electron original was bidirectional and last-write-wins — every table
//! pulled the whole cloud copy, compared `updated_at` per row, and wrote
//! whichever side looked newer. Nothing pulls any more. Each step below reads
//! the cloud table only to decide insert versus update and to check the foreign
//! keys it is about to reference, and then writes in one direction.
//!
//! There is exactly one exception, `seed_from_cloud`, and it exists because a
//! device with no SQLite file has nothing to be authoritative about. It runs at
//! most once per installation.
//!
//! The consequence is worth stating plainly: two devices editing the same
//! employee both push, and the later push wins that row outright. There is no
//! merge and no warning.
//!
//! Every step still swallows its own errors and logs them, so one failing table
//! never aborts the rest of the run. The order is fixed by foreign keys:
//! departments → employees → attendance → payroll → registration.
//!
//! Database work is batched between network calls rather than interleaved
//! statement by statement, because the SQLite connection is behind a mutex that
//! must not be held across an `await`.

use std::collections::{HashMap, HashSet};
use std::sync::Arc;

use chrono::{DateTime, TimeZone, Utc};
use rusqlite::types::Value as SqlValue;
use rusqlite::{Connection, OptionalExtension};
use serde_json::{json, Map, Value};

use crate::json::query_all;
use crate::state::AppState;
use crate::supabase::Supabase;

fn text(row: &Value, key: &str) -> Option<String> {
    match row.get(key) {
        Some(Value::String(value)) => Some(value.clone()),
        Some(Value::Number(value)) => Some(value.to_string()),
        _ => None,
    }
}

/// `row[key]` as a bindable value, `NULL` when absent.
fn cell(row: &Value, key: &str) -> SqlValue {
    match row.get(key) {
        Some(value) => crate::json::json_to_sql(value),
        None => SqlValue::Null,
    }
}

/// A cloud numeric column as an `f64`.
///
/// PostgREST renders `numeric` as a JSON number, but accepting a string too
/// means a change at that end costs a formatting difference rather than a
/// silent zero in someone's payslip.
fn number(row: &Value, key: &str) -> Option<f64> {
    match row.get(key) {
        Some(Value::Number(value)) => value.as_f64(),
        Some(Value::String(value)) => value.trim().parse().ok(),
        _ => None,
    }
}

/// One number out of a stored payroll breakdown, by path.
fn dig(breakdown: &Value, path: &[&str]) -> Option<f64> {
    let mut cursor = breakdown;
    for key in path {
        cursor = cursor.get(key)?;
    }
    cursor.as_f64()
}

/// JS truthiness for the string fields the sync tests.
fn truthy(row: &Value, key: &str) -> bool {
    match row.get(key) {
        None | Some(Value::Null) => false,
        Some(Value::Bool(value)) => *value,
        Some(Value::String(value)) => !value.is_empty(),
        Some(Value::Number(value)) => value.as_f64() != Some(0.0),
        _ => true,
    }
}

/// The two timestamp shapes in play, as one instant: PostgREST returns
/// `2026-09-05T04:00:00.000Z`, SQLite's `CURRENT_TIMESTAMP` returns
/// `2026-09-05 04:00:00`. Both are UTC.
///
/// Node parsed the second form as *local* time, which on a UTC+8 machine
/// shifted every local row eight hours. Treating an absent offset as UTC —
/// which is what the value actually is — is what makes the comparison below
/// mean anything.
fn instant(value: Option<&str>) -> Option<DateTime<Utc>> {
    let raw = value?.trim();
    if raw.is_empty() {
        return None;
    }

    if let Ok(parsed) = DateTime::parse_from_rfc3339(raw) {
        return Some(parsed.with_timezone(&Utc));
    }

    let normalized = raw.replace('T', " ");
    let normalized = normalized.trim_end_matches('Z').trim();
    for format in ["%Y-%m-%d %H:%M:%S%.f", "%Y-%m-%d %H:%M:%S", "%Y-%m-%d"] {
        if let Ok(naive) = chrono::NaiveDateTime::parse_from_str(normalized, format) {
            return Some(Utc.from_utc_datetime(&naive));
        }
        if let Ok(date) = chrono::NaiveDate::parse_from_str(normalized, format) {
            return Some(Utc.from_utc_datetime(&date.and_hms_opt(0, 0, 0)?));
        }
    }
    None
}

/// Is the cloud row already the local row?
///
/// This is not conflict resolution, and there is no cloud clock in it. Every
/// push below sends local's own `updated_at` and no cloud trigger rewrites it,
/// so that column is a receipt: it names the local version the cloud is
/// holding. A row whose receipt matches has nothing left to say, which is what
/// stops a thirty-minute sync from re-sending every row it has ever seen — with
/// a year of attendance behind it, unconditional pushes would be tens of
/// thousands of requests an hour.
///
/// The test is equality rather than "local is newer", deliberately. Were it `>`,
/// a cloud row carrying a timestamp local never wrote would be skipped forever
/// and the cloud would keep a value local does not have — the cloud winning by
/// omission, which is the one thing this module may not allow. Anything that is
/// not an exact match, in either direction or unparseable on either side, is a
/// push.
fn mirrored(cloud: &Value, mine: &Value) -> bool {
    match (
        instant(cloud.get("updated_at").and_then(Value::as_str)),
        instant(mine.get("updated_at").and_then(Value::as_str)),
    ) {
        (Some(cloud), Some(mine)) => cloud == mine,
        _ => false,
    }
}

/// A cloud timestamp in the local file's own format.
///
/// `instant` reads either shape, but the rest of the local database is written
/// in SQLite's, and `ORDER BY created_at DESC` is a string sort — mixing the two
/// forms would quietly misorder a seeded device's employee list.
fn stamp(row: &Value, key: &str) -> SqlValue {
    match instant(row.get(key).and_then(Value::as_str)) {
        Some(moment) => SqlValue::Text(moment.format("%Y-%m-%d %H:%M:%S%.f").to_string()),
        None => cell(row, key),
    }
}

/// Only the keys PostgREST should receive; `serde_json` would otherwise send
/// `null` for absent locals.
fn payload(pairs: Vec<(&str, Value)>) -> Value {
    let mut object = Map::new();
    for (key, value) in pairs {
        object.insert(key.to_string(), value);
    }
    Value::Object(object)
}

fn field(row: &Value, key: &str) -> Value {
    row.get(key).cloned().unwrap_or(Value::Null)
}

/// `syncAll()`.
pub async fn sync_all(state: Arc<AppState>, supabase: Arc<Supabase>) {
    println!("[Sync] Starting syncAll...");

    let Some(session) = supabase.session() else {
        eprintln!("[Sync] No active session — skipping sync.");
        return;
    };
    println!(
        "[Sync] Session found for: {}",
        session.email().unwrap_or("unknown")
    );

    // Before anything is pushed, because on a device this is the first run for
    // there is nothing to push and everything to adopt.
    seed_from_cloud(&state, &supabase).await;

    println!("[Sync] Syncing departments...");
    departments(&state, &supabase).await;
    println!("[Sync] Syncing employees...");
    employees(&state, &supabase).await;
    println!("[Sync] Syncing attendance...");
    attendance(&state, &supabase).await;
    println!("[Sync] Syncing payroll...");
    payroll(&state, &supabase).await;
    println!("[Sync] Syncing registration...");
    registration(&state, &supabase).await;
    println!("[Sync] All sync complete!");
}

/// Every cloud row one seed needs, read before any lock is taken.
struct Snapshot {
    departments: Vec<Value>,
    employees: Vec<Value>,
    attendance: Vec<Value>,
    payroll: Vec<Value>,
    registration: Option<Value>,
}

/// The one direction this module otherwise refuses: cloud to local, once.
///
/// An admin signing in on a second machine has no local database, so there is
/// nothing there to be authoritative *about* and the cloud copy is adopted
/// wholesale. `state.fresh_database` is the gate: it is true only when the
/// SQLite file did not exist as this process opened it.
///
/// The `seeded` marker is not redundant with that flag. `fresh_database` stays
/// true for the life of the process, so without a durable marker the
/// thirty-minute ticker would seed again and collide with its own rows. Writing
/// the marker inside the same transaction as the data is what makes a crash
/// midway retry from an empty database instead of resuming onto a
/// half-populated one.
///
/// Employee rows arrive sealed and are stored exactly as they arrive, blind
/// indexes included. Both databases share the one key, so nothing is decrypted
/// here and this function never touches the DEK.
async fn seed_from_cloud(state: &AppState, supabase: &Supabase) {
    if !state.fresh_database || already_seeded(state) {
        return;
    }

    println!("[Seed] No local database — seeding once from cloud.");
    let Some(snapshot) = snapshot(supabase).await else {
        eprintln!("[Seed] Incomplete read; nothing written, the next pass retries.");
        return;
    };

    match state.with_db_mut(|conn| write_snapshot(conn, &snapshot)) {
        Ok(rows) => println!("[Seed] Adopted {rows} cloud rows."),
        Err(error) => eprintln!("[Seed] Rolled back: {error}"),
    }
}

/// The durable half of the gate above.
fn already_seeded(state: &AppState) -> bool {
    state
        .with_db(|conn| {
            conn.query_row(SEED_MARKER_READ, [SEED_KEY], |row| row.get::<_, i64>(0))
                .optional()
        })
        .unwrap_or_default()
        .is_some()
}

/// All five tables, or nothing. A partial read would seed a database that looks
/// complete and is not, and the marker would then stop anyone noticing.
async fn snapshot(supabase: &Supabase) -> Option<Snapshot> {
    Some(Snapshot {
        departments: cloud_table(supabase, "departments").await?,
        employees: cloud_table(supabase, "employees").await?,
        attendance: cloud_table(supabase, "attendance").await?,
        payroll: cloud_table(supabase, "payroll").await?,
        registration: cloud_table(supabase, "registration_credentials")
            .await?
            .into_iter()
            .next(),
    })
}

async fn cloud_table(supabase: &Supabase, table: &str) -> Option<Vec<Value>> {
    match supabase.select(table, "*", &[]).await {
        Ok(rows) => {
            println!("[Seed] {table}: {} rows", rows.len());
            Some(rows)
        }
        Err(error) => {
            eprintln!("[Seed] Could not read cloud {table}: {error}");
            None
        }
    }
}

/// The marker that says a seed already completed. Read and written as bound
/// parameters rather than an inline literal so both statements name the same key.
const SEED_KEY: &str = "seeded";
const SEED_MARKER_READ: &str = "SELECT 1 FROM app_meta WHERE key = ?";
const SEED_MARKER_WRITE: &str = r#"
    INSERT INTO app_meta (key, value, updated_at) VALUES (?, ?, CURRENT_TIMESTAMP)
    ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = CURRENT_TIMESTAMP
"#;

/// The whole seed as one transaction, returning the row count it wrote.
///
/// Insert order is not cosmetic: `foreign_keys` is `ON`, so a department has to
/// exist before an employee can point at it, and an employee before its
/// attendance. Cloud keys are translated to local rowids through `supabase_id`
/// as each level lands.
fn write_snapshot(conn: &mut Connection, snapshot: &Snapshot) -> rusqlite::Result<usize> {
    let tx = conn.transaction()?;
    let mut written = 0;

    for remote in &snapshot.departments {
        let Some(name) = text(remote, "name") else {
            continue;
        };
        written += tx.execute(
            r#"INSERT OR IGNORE INTO departments (name, budget, supabase_id, created_at, updated_at)
               VALUES (?, ?, ?, ?, ?)"#,
            rusqlite::params![
                name,
                cell(remote, "budget"),
                cell(remote, "id"),
                stamp(remote, "created_at"),
                stamp(remote, "updated_at"),
            ],
        )?;
    }

    let departments = local_ids(&tx, "departments")?;

    for remote in &snapshot.employees {
        let Some(uuid) = text(remote, "id") else {
            continue;
        };
        let department = text(remote, "department_id")
            .and_then(|id| departments.get(&id).copied())
            .map_or(SqlValue::Null, SqlValue::Integer);

        written += tx.execute(
            r#"INSERT OR IGNORE INTO employees (
                   company_id, company_id_bidx, first_name, last_name,
                   email, email_bidx, phone, department_id,
                   position, salary, hire_date, status, pin_code,
                   supabase_id, created_at, updated_at
               )
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)"#,
            rusqlite::params![
                cell(remote, "company_id"),
                cell(remote, "company_id_bidx"),
                cell(remote, "first_name"),
                cell(remote, "last_name"),
                cell(remote, "email"),
                cell(remote, "email_bidx"),
                cell(remote, "phone"),
                department,
                cell(remote, "position"),
                cell(remote, "salary"),
                cell(remote, "hire_date"),
                cell(remote, "status"),
                cell(remote, "pin_code"),
                uuid,
                stamp(remote, "created_at"),
                stamp(remote, "updated_at"),
            ],
        )?;
    }

    let employees = local_ids(&tx, "employees")?;

    for remote in &snapshot.attendance {
        let Some(employee) = text(remote, "employee_id").and_then(|id| employees.get(&id).copied())
        else {
            continue;
        };
        written += tx.execute(
            r#"INSERT OR IGNORE INTO attendance (
                   employee_id, date, check_in, check_out, status, notes,
                   created_at, updated_at
               )
               VALUES (?, ?, ?, ?, ?, ?, ?, ?)"#,
            rusqlite::params![
                employee,
                cell(remote, "date"),
                cell(remote, "check_in"),
                cell(remote, "check_out"),
                cell(remote, "status"),
                cell(remote, "notes"),
                stamp(remote, "created_at"),
                stamp(remote, "updated_at"),
            ],
        )?;
    }

    for remote in &snapshot.payroll {
        let Some(employee) = text(remote, "employee_id").and_then(|id| employees.get(&id).copied())
        else {
            continue;
        };
        written += insert_payroll(&tx, remote, employee)?;
    }

    // Normally a no-op: `refresh_local_profile` has already upserted this row
    // during the login that led here. It is kept so the seed does not depend on
    // that ordering, and OR IGNORE is what makes running both harmless.
    if let Some(profile) = &snapshot.registration {
        written += tx.execute(
            r#"INSERT OR IGNORE INTO registration_credentials (
                   company_name, company_email, company_address, company_contact,
                   admin_name, admin_email, avatar, bio, theme_preference, language,
                   is_registered, license_key, registration_date, last_updated, updated_at
               )
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?, ?, ?)"#,
            rusqlite::params![
                cell(profile, "company_name"),
                cell(profile, "company_email"),
                cell(profile, "company_address"),
                cell(profile, "company_contact"),
                cell(profile, "admin_name"),
                cell(profile, "admin_email"),
                cell(profile, "avatar"),
                cell(profile, "bio"),
                cell(profile, "theme_preference"),
                cell(profile, "language"),
                cell(profile, "license_key"),
                stamp(profile, "registration_date"),
                stamp(profile, "last_updated"),
                stamp(profile, "updated_at"),
            ],
        )?;
    }

    tx.execute(
        SEED_MARKER_WRITE,
        rusqlite::params![SEED_KEY, crate::manila::iso_utc()],
    )?;

    tx.commit()?;
    Ok(written)
}

/// `supabase_id` to local rowid for one table, as it stands mid-transaction.
fn local_ids(
    tx: &rusqlite::Transaction<'_>,
    table: &str,
) -> rusqlite::Result<HashMap<String, i64>> {
    let mut statement = tx.prepare(&format!(
        "SELECT id, supabase_id FROM {table} WHERE supabase_id IS NOT NULL"
    ))?;
    let rows = statement.query_map([], |row| {
        Ok((row.get::<_, String>(1)?, row.get::<_, i64>(0)?))
    })?;

    let mut map = HashMap::new();
    for row in rows {
        let (uuid, id) = row?;
        map.insert(uuid, id);
    }
    Ok(map)
}

/// One cloud payroll row as a local one.
///
/// The cloud table is narrower on purpose — it keeps `gross_pay`, `net_pay` and
/// a `deductions` jsonb, where local has thirteen columns. Everything local
/// needs is recoverable because `breakdown`, the JSON the calculator produced,
/// *is* that jsonb: the per-column values are read back out of it. Only the
/// cutoff label has to be inferred, from the end day of the period, because
/// `breakdown.cutoffType` holds a display label rather than the short form the
/// column expects.
fn insert_payroll(
    tx: &rusqlite::Transaction<'_>,
    remote: &Value,
    employee: i64,
) -> rusqlite::Result<usize> {
    let breakdown = remote.get("deductions").cloned().unwrap_or(Value::Null);
    let breakdown_text = match &breakdown {
        Value::Object(_) => breakdown.to_string(),
        _ => "{}".to_string(),
    };

    let cutoff_end = text(remote, "cutoff_end").unwrap_or_default();
    let (cutoff_type, period_days) = if cutoff_end.ends_with("-10") {
        ("First Half", 12)
    } else if cutoff_end.ends_with("-25") {
        ("Second Half", 12)
    } else {
        ("Full Month", 24)
    };

    let working_days = dig(&breakdown, &["workingDays"]).map_or(period_days, |days| days as i64);

    tx.execute(
        r#"INSERT OR IGNORE INTO payroll (
               employee_id, cutoff_start, cutoff_end, basic_salary, allowances,
               deductions, net_salary, status, payment_date, cutoff_type,
               working_days, days_present, daily_rate, breakdown,
               created_at, updated_at
           )
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)"#,
        rusqlite::params![
            employee,
            cell(remote, "cutoff_start"),
            cell(remote, "cutoff_end"),
            number(remote, "gross_pay").unwrap_or(0.0),
            dig(&breakdown, &["allowances"]).unwrap_or(0.0),
            dig(&breakdown, &["deductions", "total"]).unwrap_or(0.0),
            number(remote, "net_pay").unwrap_or(0.0),
            cell(remote, "status"),
            cell(remote, "payment_date"),
            cutoff_type,
            working_days,
            dig(&breakdown, &["daysPresent"]).map_or(working_days, |days| days as i64),
            dig(&breakdown, &["dailyRate"]).unwrap_or(0.0),
            breakdown_text,
            stamp(remote, "created_at"),
            stamp(remote, "updated_at"),
        ],
    )
}

/// `syncDepartments()` — keyed on `name`, the natural key both sides share.
async fn departments(state: &AppState, supabase: &Supabase) {
    let cloud = match supabase.select("departments", "*", &[]).await {
        Ok(rows) => rows,
        Err(error) => {
            eprintln!("[Sync][Depts] Error: {error}");
            return;
        }
    };

    let local = match state.with_db(|conn| query_all(conn, "SELECT * FROM departments", &[])) {
        Ok(rows) => rows,
        Err(error) => {
            eprintln!("[Sync][Depts] Error: {error}");
            return;
        }
    };

    // The cloud read stays even though nothing is pulled from it: it is what
    // decides insert against update, and for employees it is what resolves the
    // foreign key.
    let cloud_map: HashMap<String, &Value> = cloud
        .iter()
        .filter_map(|row| text(row, "name").map(|name| (name, row)))
        .collect();
    println!(
        "[Sync][Depts] Local: {}, Cloud: {}",
        local.len(),
        cloud.len()
    );

    for mine in &local {
        let Some(name) = text(mine, "name") else {
            continue;
        };

        match cloud_map.get(&name) {
            None => {
                println!("[Sync][Depts] Inserting: {name}");
                let body = payload(vec![
                    ("name", field(mine, "name")),
                    ("budget", field(mine, "budget")),
                    ("created_at", field(mine, "created_at")),
                    ("updated_at", field(mine, "updated_at")),
                ]);
                match supabase.insert("departments", &body, true).await {
                    Err(error) => eprintln!("[Sync][Depts] Insert failed {name}: {error}"),
                    Ok(rows) => {
                        println!("[Sync][Depts] Inserted {name}");
                        // Keep the cloud id so employees can resolve the FK.
                        if let Some(inserted) = rows.first() {
                            let id = cell(inserted, "id");
                            let _ = state.with_db(|conn| {
                                conn.execute(
                                    "UPDATE departments SET supabase_id = ? WHERE name = ?",
                                    rusqlite::params![id, name],
                                )
                            });
                        }
                    }
                }
            }
            Some(remote) if mirrored(remote, mine) => {}
            Some(_) => {
                println!("[Sync][Depts] Updating: {name}");
                let body = payload(vec![
                    ("budget", field(mine, "budget")),
                    ("updated_at", field(mine, "updated_at")),
                ]);
                match supabase
                    .update("departments", &body, &[("name", name.clone())])
                    .await
                {
                    Err(error) => eprintln!("[Sync][Depts] Update failed {name}: {error}"),
                    Ok(()) => println!("[Sync][Depts] Updated {name}"),
                }
            }
        }
    }
}

/// `syncEmployees()` — keyed on the employee UUID, which the local rows are
/// backfilled with on first run.
///
/// Four columns arrive here already sealed, and the blind indexes that carry
/// their uniqueness travel with them, so the cloud copy is byte-for-byte the
/// local one and no key is needed on either side of the wire. That also means
/// the row has no human-readable identifier left to log: the progress lines name
/// the UUID, because printing the email would put ciphertext on stdout and
/// printing the name would put personal data there.
async fn employees(state: &AppState, supabase: &Supabase) {
    let cloud = match supabase.select("employees", "*", &[]).await {
        Ok(rows) => rows,
        Err(error) => {
            eprintln!("[Sync][Emps] Error: {error}");
            return;
        }
    };

    let mut local = match state.with_db(|conn| query_all(conn, "SELECT * FROM employees", &[])) {
        Ok(rows) => rows,
        Err(error) => {
            eprintln!("[Sync][Emps] Error: {error}");
            return;
        }
    };

    // Ensure local employees have UUIDs.
    for employee in &mut local {
        if text(employee, "supabase_id").is_some_and(|id| !id.is_empty()) {
            continue;
        }
        let uuid = uuid::Uuid::new_v4().to_string();
        let id = cell(employee, "id");
        let stored = state.with_db(|conn| {
            conn.execute(
                "UPDATE employees SET supabase_id = ? WHERE id = ?",
                rusqlite::params![uuid.clone(), id],
            )
        });
        match stored {
            Ok(_) => {
                if let Some(object) = employee.as_object_mut() {
                    object.insert("supabase_id".to_string(), json!(uuid));
                }
            }
            Err(error) => eprintln!("[Sync][Emps] Error: {error}"),
        }
    }

    // Cloud department ids are re-read so a stale `supabase_id` can be dropped
    // instead of failing the FK.
    let valid_departments: HashSet<i64> = supabase
        .select("departments", "id", &[])
        .await
        .unwrap_or_default()
        .iter()
        .filter_map(|row| row.get("id").and_then(Value::as_i64))
        .collect();

    let cloud_map: HashMap<String, &Value> = cloud
        .iter()
        .filter_map(|row| text(row, "id").map(|id| (id, row)))
        .collect();
    println!(
        "[Sync][Emps] Local: {}, Cloud: {}, Valid cloud depts: {}",
        local.len(),
        cloud.len(),
        valid_departments.len()
    );

    for mine in &local {
        let Some(uuid) = text(mine, "supabase_id") else {
            continue;
        };

        let mut cloud_department = Value::Null;
        if truthy(mine, "department_id") {
            let resolved = state.with_db(|conn| -> rusqlite::Result<Option<String>> {
                conn.query_row(
                    "SELECT supabase_id FROM departments WHERE id = ?",
                    [cell(mine, "department_id")],
                    |row| row.get::<_, Option<String>>(0),
                )
                .or_else(|error| match error {
                    rusqlite::Error::QueryReturnedNoRows => Ok(None),
                    other => Err(other),
                })
            });

            match resolved {
                Ok(Some(supabase_id)) if !supabase_id.is_empty() => {
                    // `parseInt` in the original; the cloud key is a bigint.
                    match supabase_id.trim().parse::<i64>() {
                        Ok(candidate) if valid_departments.contains(&candidate) => {
                            cloud_department = json!(candidate);
                        }
                        Ok(candidate) => eprintln!(
                            "[Sync][Emps] Cloud dept {candidate} not found in Supabase, setting to null"
                        ),
                        Err(_) => eprintln!(
                            "[Sync][Emps] Cloud dept id {supabase_id} is not numeric, setting to null"
                        ),
                    }
                }
                _ => eprintln!(
                    "[Sync][Emps] No cloud dept for local dept {}",
                    text(mine, "department_id").unwrap_or_default()
                ),
            }
        }

        // `*_bidx` travel with the columns they index. Without them the cloud
        // would hold ciphertext nothing can look up, and its unique constraints
        // would sit on columns that a fresh nonce makes unique every time.
        let mut body = vec![
            ("company_id", field(mine, "company_id")),
            ("company_id_bidx", field(mine, "company_id_bidx")),
            ("first_name", field(mine, "first_name")),
            ("last_name", field(mine, "last_name")),
            ("email", field(mine, "email")),
            ("email_bidx", field(mine, "email_bidx")),
            ("phone", field(mine, "phone")),
            ("department_id", cloud_department),
            ("position", field(mine, "position")),
            ("salary", field(mine, "salary")),
            ("hire_date", field(mine, "hire_date")),
            ("status", field(mine, "status")),
            ("pin_code", field(mine, "pin_code")),
            ("updated_at", field(mine, "updated_at")),
        ];

        match cloud_map.get(&uuid) {
            None => {
                println!("[Sync][Emps] Inserting: {uuid}");
                // Insert carries `id` and `created_at`; the update omits both.
                body.push(("id", json!(uuid)));
                body.push(("created_at", field(mine, "created_at")));
                match supabase.insert("employees", &payload(body), false).await {
                    Err(error) => eprintln!("[Sync][Emps] Insert failed {uuid}: {error}"),
                    Ok(_) => println!("[Sync][Emps] Inserted {uuid}"),
                }
            }
            Some(remote) if mirrored(remote, mine) => {}
            Some(_) => {
                println!("[Sync][Emps] Updating: {uuid}");
                match supabase
                    .update("employees", &payload(body), &[("id", uuid.clone())])
                    .await
                {
                    Err(error) => eprintln!("[Sync][Emps] Update failed {uuid}: {error}"),
                    Ok(()) => println!("[Sync][Emps] Updated {uuid}"),
                }
            }
        }
    }
}

/// `syncAttendance()` — keyed on `<employee uuid>_<date>`.
async fn attendance(state: &AppState, supabase: &Supabase) {
    let key = |employee: &str, date: &str| format!("{employee}_{date}");

    let cloud = match supabase.select("attendance", "*", &[]).await {
        Ok(rows) => rows,
        Err(error) => {
            eprintln!("[Sync][Att] Error: {error}");
            return;
        }
    };

    let local = match state.with_db(|conn| {
        query_all(
            conn,
            r#"SELECT a.*, e.supabase_id as emp_uuid
               FROM attendance a
               JOIN employees e ON a.employee_id = e.id
               WHERE e.supabase_id IS NOT NULL"#,
            &[],
        )
    }) {
        Ok(rows) => rows,
        Err(error) => {
            eprintln!("[Sync][Att] Error: {error}");
            return;
        }
    };

    let valid_employees: HashSet<String> = supabase
        .select("employees", "id", &[])
        .await
        .unwrap_or_default()
        .iter()
        .filter_map(|row| text(row, "id"))
        .collect();

    let cloud_map: HashMap<String, &Value> = cloud
        .iter()
        .filter_map(|row| Some((key(&text(row, "employee_id")?, &text(row, "date")?), row)))
        .collect();
    println!(
        "[Sync][Att] Local: {}, Cloud: {}, Valid cloud emps: {}",
        local.len(),
        cloud.len(),
        valid_employees.len()
    );

    for mine in &local {
        let (Some(employee), Some(date)) = (text(mine, "emp_uuid"), text(mine, "date")) else {
            continue;
        };
        let entry = key(&employee, &date);

        if !valid_employees.contains(&employee) {
            eprintln!("[Sync][Att] Skipping {entry} — employee not in cloud");
            continue;
        }

        match cloud_map.get(&entry) {
            None => {
                println!("[Sync][Att] Inserting: {entry}");
                let body = payload(vec![
                    ("employee_id", json!(employee)),
                    ("date", json!(date)),
                    ("check_in", field(mine, "check_in")),
                    ("check_out", field(mine, "check_out")),
                    ("status", field(mine, "status")),
                    ("notes", field(mine, "notes")),
                    ("created_at", field(mine, "created_at")),
                    ("updated_at", field(mine, "updated_at")),
                ]);
                match supabase.insert("attendance", &body, false).await {
                    Err(error) => eprintln!("[Sync][Att] Insert failed {entry}: {error}"),
                    Ok(_) => println!("[Sync][Att] Inserted {entry}"),
                }
            }
            Some(remote) if mirrored(remote, mine) => {}
            // The original only ever pushed a check-out onto a shift the cloud
            // still had open, so an edited note or a corrected status stayed
            // local forever. With local authoritative there is no reason to
            // single out one column: the whole mutable set goes.
            Some(remote) => {
                println!("[Sync][Att] Updating: {entry}");
                let body = payload(vec![
                    ("check_in", field(mine, "check_in")),
                    ("check_out", field(mine, "check_out")),
                    ("status", field(mine, "status")),
                    ("notes", field(mine, "notes")),
                    ("updated_at", field(mine, "updated_at")),
                ]);
                let id = text(remote, "id").unwrap_or_default();
                match supabase.update("attendance", &body, &[("id", id)]).await {
                    Err(error) => eprintln!("[Sync][Att] Update failed {entry}: {error}"),
                    Ok(()) => println!("[Sync][Att] Updated {entry}"),
                }
            }
        }
    }
}

/// `syncPayroll()` — keyed on `<employee uuid>_<cutoff start>_<cutoff end>`.
///
/// The two schemas name things differently: local `basic_salary` is the cloud's
/// `gross_pay`, local `net_salary` is `net_pay`, and the local `breakdown` JSON
/// column is the cloud's `deductions` jsonb.
async fn payroll(state: &AppState, supabase: &Supabase) {
    let key = |employee: &str, start: &str, end: &str| format!("{employee}_{start}_{end}");

    let cloud = match supabase.select("payroll", "*", &[]).await {
        Ok(rows) => rows,
        Err(error) => {
            eprintln!("[Sync][Pay] Error: {error}");
            return;
        }
    };

    let local = match state.with_db(|conn| {
        query_all(
            conn,
            r#"SELECT p.*, e.supabase_id as emp_uuid
               FROM payroll p
               JOIN employees e ON p.employee_id = e.id
               WHERE e.supabase_id IS NOT NULL"#,
            &[],
        )
    }) {
        Ok(rows) => rows,
        Err(error) => {
            eprintln!("[Sync][Pay] Error: {error}");
            return;
        }
    };

    let row_key = |row: &Value, employee: &str| -> Option<String> {
        Some(key(
            employee,
            &text(row, "cutoff_start")?,
            &text(row, "cutoff_end")?,
        ))
    };

    let valid_employees: HashSet<String> = supabase
        .select("employees", "id", &[])
        .await
        .unwrap_or_default()
        .iter()
        .filter_map(|row| text(row, "id"))
        .collect();

    let cloud_map: HashMap<String, &Value> = cloud
        .iter()
        .filter_map(|row| Some((row_key(row, &text(row, "employee_id")?)?, row)))
        .collect();
    println!(
        "[Sync][Pay] Local: {}, Cloud: {}, Valid cloud emps: {}",
        local.len(),
        cloud.len(),
        valid_employees.len()
    );

    for mine in &local {
        let Some(employee) = text(mine, "emp_uuid") else {
            continue;
        };
        if !valid_employees.contains(&employee) {
            eprintln!("[Sync][Pay] Skipping {employee} — employee not in cloud");
            continue;
        }
        let Some(entry) = row_key(mine, &employee) else {
            continue;
        };

        // The local column holds the JSON the calculator produced, already
        // encoded as text; the cloud column is jsonb, so it is parsed rather
        // than sent as a string. Everything the narrower cloud table does not
        // have a column for lives in here, which is what lets a seed rebuild
        // the local row from it.
        let deductions = text(mine, "breakdown")
            .filter(|value| !value.is_empty())
            .and_then(|value| serde_json::from_str::<Value>(&value).ok())
            .unwrap_or_else(|| json!({}));

        match cloud_map.get(&entry) {
            None => {
                println!("[Sync][Pay] Inserting: {entry}");
                let body = payload(vec![
                    ("employee_id", json!(employee)),
                    ("cutoff_start", field(mine, "cutoff_start")),
                    ("cutoff_end", field(mine, "cutoff_end")),
                    ("gross_pay", field(mine, "basic_salary")),
                    ("net_pay", field(mine, "net_salary")),
                    ("deductions", deductions),
                    ("status", field(mine, "status")),
                    ("payment_date", field(mine, "payment_date")),
                    ("created_at", field(mine, "created_at")),
                    ("updated_at", field(mine, "updated_at")),
                ]);
                match supabase.insert("payroll", &body, false).await {
                    Err(error) => eprintln!("[Sync][Pay] Insert failed {entry}: {error}"),
                    Ok(_) => println!("[Sync][Pay] Inserted {entry}"),
                }
            }
            Some(remote) if mirrored(remote, mine) => {}
            // The original pushed only on a status difference, which left a
            // recomputed payslip stranded locally. The receipt gate covers both.
            Some(remote) => {
                println!("[Sync][Pay] Updating: {entry}");
                let body = payload(vec![
                    ("gross_pay", field(mine, "basic_salary")),
                    ("net_pay", field(mine, "net_salary")),
                    ("deductions", deductions),
                    ("status", field(mine, "status")),
                    ("payment_date", field(mine, "payment_date")),
                    ("updated_at", field(mine, "updated_at")),
                ]);
                let id = text(remote, "id").unwrap_or_default();
                match supabase.update("payroll", &body, &[("id", id)]).await {
                    Err(error) => eprintln!("[Sync][Pay] Update failed {entry}: {error}"),
                    Ok(()) => println!("[Sync][Pay] Updated {entry}"),
                }
            }
        }
    }
}

/// `syncRegistration()` — the single admin profile row, keyed on `admin_email`.
///
/// There is no password hash left to leave out: credentials live in GoTrue and
/// the keyring, and this table is the display profile only. The license key is
/// still not pushed from here — registration writes it once, directly.
///
/// The receipt for this row is `last_updated` rather than `updated_at`, because
/// `last_updated` is the column the push actually sends.
async fn registration(state: &AppState, supabase: &Supabase) {
    let local = state.with_db(|conn| {
        crate::json::query_opt(
            conn,
            "SELECT * FROM registration_credentials WHERE is_registered = 1",
            &[],
        )
    });

    let mine = match local {
        Ok(Some(row)) => row,
        Ok(None) => return,
        Err(error) => {
            eprintln!("[Sync][Reg] Error: {error}");
            return;
        }
    };

    let Some(email) = text(&mine, "admin_email") else {
        return;
    };

    let fetched = supabase
        .select(
            "registration_credentials",
            "*",
            &[("admin_email", email.clone())],
        )
        .await;

    let remote = match fetched {
        Ok(rows) => rows.into_iter().next(),
        // `42P01` is "relation does not exist" — the table has not been created
        // in this project yet, which the original tolerated.
        Err(error) if error.code.as_deref() == Some("42P01") => None,
        Err(error) => {
            eprintln!("[Sync][Reg] Error: {error}");
            return;
        }
    };

    let Some(remote) = remote else {
        push_registration(supabase, &mine, true).await;
        return;
    };

    let receipt = instant(remote.get("last_updated").and_then(Value::as_str));
    if receipt.is_some() && receipt == instant(mine.get("last_updated").and_then(Value::as_str)) {
        return;
    }
    push_registration(supabase, &mine, false).await;
}

async fn push_registration(supabase: &Supabase, mine: &Value, is_new: bool) {
    let email = text(mine, "admin_email").unwrap_or_default();
    let body = payload(vec![
        ("company_name", field(mine, "company_name")),
        ("company_email", field(mine, "company_email")),
        ("company_address", field(mine, "company_address")),
        ("company_contact", field(mine, "company_contact")),
        ("admin_name", field(mine, "admin_name")),
        ("admin_email", field(mine, "admin_email")),
        ("avatar", field(mine, "avatar")),
        ("bio", field(mine, "bio")),
        ("theme_preference", field(mine, "theme_preference")),
        ("language", field(mine, "language")),
        ("is_registered", json!(1)),
        ("last_updated", field(mine, "last_updated")),
    ]);

    let outcome = if is_new {
        println!("[Sync][Reg] Inserting profile for: {email}");
        supabase
            .insert("registration_credentials", &body, false)
            .await
            .map(|_| ())
    } else {
        println!("[Sync][Reg] Updating profile for: {email}");
        supabase
            .update(
                "registration_credentials",
                &body,
                &[("admin_email", email.clone())],
            )
            .await
    };

    match outcome {
        Err(error) => eprintln!("[Sync][Reg] Push failed: {error}"),
        Ok(()) => println!("[Sync][Reg] Push succeeded for {email}"),
    }
}
