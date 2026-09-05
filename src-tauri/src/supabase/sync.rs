//! `SyncService` — bidirectional sync between the local SQLite file and
//! Supabase, transcribed method for method.
//!
//! Every step swallows its own errors and logs them, exactly as the original
//! did, so one failing table never aborts the rest of the run. The order is
//! fixed by foreign keys: departments → employees → attendance → payroll →
//! registration.
//!
//! Structurally the one difference from the JavaScript is that database work is
//! batched between network calls instead of interleaved statement by statement:
//! the SQLite connection is behind a mutex that must not be held across an
//! `await`. The read/compare/write order per record is unchanged.

use std::collections::{HashMap, HashSet};
use std::sync::Arc;

use chrono::{DateTime, TimeZone, Utc};
use rusqlite::types::Value as SqlValue;
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

/// JS truthiness for the string fields the sync tests (`!cAtt.check_out`).
fn truthy(row: &Value, key: &str) -> bool {
    match row.get(key) {
        None | Some(Value::Null) => false,
        Some(Value::Bool(value)) => *value,
        Some(Value::String(value)) => !value.is_empty(),
        Some(Value::Number(value)) => value.as_f64() != Some(0.0),
        _ => true,
    }
}

/// `new Date(value)` for the two timestamp shapes in play: PostgREST returns
/// `2026-09-05T04:00:00.000Z`, SQLite's `CURRENT_TIMESTAMP` returns
/// `2026-09-05 04:00:00`. Both are UTC.
///
/// Node parsed the second form as *local* time, which on a UTC+8 machine
/// shifted every local row eight hours and let stale cloud values overwrite
/// fresh local edits inside that window. Treating an absent offset as UTC —
/// which is what the value actually is — keeps the same "newest wins" rule
/// while making it evaluate correctly.
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

/// `new Date(a) > new Date(b)` — false whenever either side is unparseable,
/// matching JavaScript's `NaN` comparisons.
fn newer(a: Option<&str>, b: Option<&str>) -> bool {
    match (instant(a), instant(b)) {
        (Some(a), Some(b)) => a > b,
        _ => false,
    }
}

/// Same comparison, but with the epoch fallback the attendance step used.
fn newer_or_epoch(a: Option<&str>, b: Option<&str>) -> bool {
    let epoch = Utc.timestamp_opt(0, 0).single().unwrap_or_default();
    instant(a).unwrap_or(epoch) > instant(b).unwrap_or(epoch)
}

/// Only the keys PostgREST should receive; `serde_json` would otherwise send
/// `null` for absent locals, which is what the original did too.
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

    match supabase.rpc("setup_schema", json!({})).await {
        Ok(_) => println!("[Sync] Schema RPC succeeded"),
        Err(error) => eprintln!("[Sync] Schema RPC failed: {error}"),
    }

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

    let local_map: HashMap<String, &Value> = local
        .iter()
        .filter_map(|row| text(row, "name").map(|name| (name, row)))
        .collect();

    // PULL (Cloud -> Local)
    let pull = state.with_db(|conn| -> rusqlite::Result<()> {
        for remote in &cloud {
            let Some(name) = text(remote, "name") else {
                continue;
            };
            match local_map.get(&name) {
                None => {
                    conn.execute(
                        r#"INSERT INTO departments (name, budget, created_at, updated_at, supabase_id)
                           VALUES (?, ?, ?, ?, ?)"#,
                        rusqlite::params![
                            name,
                            cell(remote, "budget"),
                            cell(remote, "created_at"),
                            cell(remote, "updated_at"),
                            cell(remote, "id"),
                        ],
                    )?;
                }
                Some(mine) => {
                    if newer(
                        remote.get("updated_at").and_then(Value::as_str),
                        mine.get("updated_at").and_then(Value::as_str),
                    ) {
                        conn.execute(
                            r#"UPDATE departments
                               SET budget = ?, updated_at = ?, supabase_id = ?
                               WHERE name = ?"#,
                            rusqlite::params![
                                cell(remote, "budget"),
                                cell(remote, "updated_at"),
                                cell(remote, "id"),
                                name,
                            ],
                        )?;
                    }
                }
            }
        }
        Ok(())
    });
    if let Err(error) = pull {
        eprintln!("[Sync][Depts] Error: {error}");
        return;
    }

    // PUSH (Local -> Cloud)
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
            Some(remote) => {
                if newer(
                    mine.get("updated_at").and_then(Value::as_str),
                    remote.get("updated_at").and_then(Value::as_str),
                ) {
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
}

/// `syncEmployees()` — keyed on the employee UUID, which the local rows are
/// backfilled with on first run.
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

    let local_map: HashMap<String, &Value> = local
        .iter()
        .filter_map(|row| text(row, "supabase_id").map(|id| (id, row)))
        .collect();

    // PULL (Cloud -> Local)
    let pull = state.with_db(|conn| -> rusqlite::Result<()> {
        for remote in &cloud {
            let Some(uuid) = text(remote, "id") else {
                continue;
            };

            // Translate the cloud department id into the local row id.
            let mut department_id = SqlValue::Null;
            if truthy(remote, "department_id") {
                let found: rusqlite::Result<i64> = conn.query_row(
                    "SELECT id FROM departments WHERE supabase_id = ?",
                    [cell(remote, "department_id")],
                    |row| row.get(0),
                );
                if let Ok(id) = found {
                    department_id = SqlValue::Integer(id);
                }
            }

            match local_map.get(&uuid) {
                None => {
                    conn.execute(
                        r#"INSERT INTO employees (
                               company_id, first_name, last_name, email, phone, position,
                               department_id, salary, hire_date, status, pin_code, supabase_id,
                               created_at, updated_at
                           ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)"#,
                        rusqlite::params![
                            cell(remote, "company_id"),
                            cell(remote, "first_name"),
                            cell(remote, "last_name"),
                            cell(remote, "email"),
                            cell(remote, "phone"),
                            cell(remote, "position"),
                            department_id,
                            cell(remote, "salary"),
                            cell(remote, "hire_date"),
                            cell(remote, "status"),
                            cell(remote, "pin_code"),
                            uuid,
                            cell(remote, "created_at"),
                            cell(remote, "updated_at"),
                        ],
                    )?;
                }
                Some(mine) => {
                    if newer(
                        remote.get("updated_at").and_then(Value::as_str),
                        mine.get("updated_at").and_then(Value::as_str),
                    ) {
                        conn.execute(
                            r#"UPDATE employees SET
                                   company_id = ?, first_name = ?, last_name = ?, email = ?,
                                   phone = ?, position = ?, department_id = ?, salary = ?,
                                   hire_date = ?, status = ?, pin_code = ?, updated_at = ?
                               WHERE supabase_id = ?"#,
                            rusqlite::params![
                                cell(remote, "company_id"),
                                cell(remote, "first_name"),
                                cell(remote, "last_name"),
                                cell(remote, "email"),
                                cell(remote, "phone"),
                                cell(remote, "position"),
                                department_id,
                                cell(remote, "salary"),
                                cell(remote, "hire_date"),
                                cell(remote, "status"),
                                cell(remote, "pin_code"),
                                cell(remote, "updated_at"),
                                uuid,
                            ],
                        )?;
                    }
                }
            }
        }
        Ok(())
    });
    if let Err(error) = pull {
        eprintln!("[Sync][Emps] Error: {error}");
        return;
    }

    // PUSH (Local -> Cloud). Cloud department ids are re-read so a stale
    // `supabase_id` can be dropped instead of failing the FK.
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
        let label = text(mine, "email").unwrap_or_else(|| uuid.clone());

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

        let mut body = vec![
            ("company_id", field(mine, "company_id")),
            ("first_name", field(mine, "first_name")),
            ("last_name", field(mine, "last_name")),
            ("email", field(mine, "email")),
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
                println!("[Sync][Emps] Inserting: {label} (uuid: {uuid})");
                // Insert carries `id` and `created_at`; the update omits both.
                body.push(("id", json!(uuid)));
                body.push(("created_at", field(mine, "created_at")));
                match supabase.insert("employees", &payload(body), false).await {
                    Err(error) => eprintln!("[Sync][Emps] Insert failed {label}: {error}"),
                    Ok(_) => println!("[Sync][Emps] Inserted {label}"),
                }
            }
            Some(remote) => {
                if newer(
                    mine.get("updated_at").and_then(Value::as_str),
                    remote.get("updated_at").and_then(Value::as_str),
                ) {
                    println!("[Sync][Emps] Updating: {label}");
                    match supabase
                        .update("employees", &payload(body), &[("id", uuid.clone())])
                        .await
                    {
                        Err(error) => eprintln!("[Sync][Emps] Update failed {label}: {error}"),
                        Ok(()) => println!("[Sync][Emps] Updated {label}"),
                    }
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

    let local_map: HashMap<String, &Value> = local
        .iter()
        .filter_map(|row| {
            Some((
                key(&text(row, "emp_uuid")?, &text(row, "date")?),
                row,
            ))
        })
        .collect();

    // PULL (Cloud -> Local)
    let pull = state.with_db(|conn| -> rusqlite::Result<()> {
        for remote in &cloud {
            let (Some(employee), Some(date)) = (text(remote, "employee_id"), text(remote, "date"))
            else {
                continue;
            };

            let local_employee: rusqlite::Result<i64> = conn.query_row(
                "SELECT id FROM employees WHERE supabase_id = ?",
                [SqlValue::Text(employee.clone())],
                |row| row.get(0),
            );
            let Ok(local_employee) = local_employee else {
                continue;
            };

            match local_map.get(&key(&employee, &date)) {
                None => {
                    conn.execute(
                        r#"INSERT INTO attendance
                               (employee_id, date, check_in, check_out, status, notes, created_at)
                           VALUES (?, ?, ?, ?, ?, ?, ?)"#,
                        rusqlite::params![
                            local_employee,
                            date,
                            cell(remote, "check_in"),
                            cell(remote, "check_out"),
                            cell(remote, "status"),
                            cell(remote, "notes"),
                            cell(remote, "created_at"),
                        ],
                    )?;
                }
                Some(mine) => {
                    if newer_or_epoch(
                        remote.get("updated_at").and_then(Value::as_str),
                        mine.get("updated_at").and_then(Value::as_str),
                    ) {
                        conn.execute(
                            r#"UPDATE attendance
                               SET check_in = ?, check_out = ?, status = ?, notes = ?
                               WHERE id = ?"#,
                            rusqlite::params![
                                cell(remote, "check_in"),
                                cell(remote, "check_out"),
                                cell(remote, "status"),
                                cell(remote, "notes"),
                                cell(mine, "id"),
                            ],
                        )?;
                    }
                }
            }
        }
        Ok(())
    });
    if let Err(error) = pull {
        eprintln!("[Sync][Att] Error: {error}");
        return;
    }

    // PUSH (Local -> Cloud)
    let valid_employees: HashSet<String> = supabase
        .select("employees", "id", &[])
        .await
        .unwrap_or_default()
        .iter()
        .filter_map(|row| text(row, "id"))
        .collect();

    let cloud_map: HashMap<String, &Value> = cloud
        .iter()
        .filter_map(|row| {
            Some((
                key(&text(row, "employee_id")?, &text(row, "date")?),
                row,
            ))
        })
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
                ]);
                match supabase.insert("attendance", &body, false).await {
                    Err(error) => eprintln!("[Sync][Att] Insert failed {entry}: {error}"),
                    Ok(_) => println!("[Sync][Att] Inserted {entry}"),
                }
            }
            // Only one push-update case: the local row closed out a shift the
            // cloud still has open.
            Some(remote) if !truthy(remote, "check_out") && truthy(mine, "check_out") => {
                println!("[Sync][Att] Updating checkout: {entry}");
                let body = payload(vec![
                    ("check_out", field(mine, "check_out")),
                    ("status", field(mine, "status")),
                ]);
                let id = text(remote, "id").unwrap_or_default();
                match supabase.update("attendance", &body, &[("id", id)]).await {
                    Err(error) => eprintln!("[Sync][Att] Update failed {entry}: {error}"),
                    Ok(()) => println!("[Sync][Att] Updated {entry}"),
                }
            }
            Some(_) => {}
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

    let local_map: HashMap<String, &Value> = local
        .iter()
        .filter_map(|row| Some((row_key(row, &text(row, "emp_uuid")?)?, row)))
        .collect();

    // PULL (Cloud -> Local)
    let pull = state.with_db(|conn| -> rusqlite::Result<()> {
        for remote in &cloud {
            let Some(employee) = text(remote, "employee_id") else {
                continue;
            };
            let Some(entry) = row_key(remote, &employee) else {
                continue;
            };

            let local_employee: rusqlite::Result<i64> = conn.query_row(
                "SELECT id FROM employees WHERE supabase_id = ?",
                [SqlValue::Text(employee)],
                |row| row.get(0),
            );
            let Ok(local_employee) = local_employee else {
                continue;
            };

            match local_map.get(&entry) {
                None => {
                    // `deductions` is a REAL column locally but the original
                    // wrote the cloud's jsonb into it as a string; kept as-is so
                    // existing rows and new ones agree.
                    let deductions = match remote.get("deductions") {
                        Some(value) if !value.is_null() => value.to_string(),
                        _ => "{}".to_string(),
                    };

                    conn.execute(
                        r#"INSERT INTO payroll (
                               employee_id, cutoff_start, cutoff_end, basic_salary, allowances,
                               deductions, net_salary, status, payment_date, cutoff_type,
                               working_days, days_present, daily_rate, breakdown, created_at
                           ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)"#,
                        rusqlite::params![
                            local_employee,
                            cell(remote, "cutoff_start"),
                            cell(remote, "cutoff_end"),
                            cell(remote, "gross_pay"),
                            0,
                            deductions,
                            cell(remote, "net_pay"),
                            cell(remote, "status"),
                            cell(remote, "payment_date"),
                            "Full Month",
                            24,
                            24,
                            0,
                            SqlValue::Null,
                            cell(remote, "created_at"),
                        ],
                    )?;
                }
                Some(mine) => {
                    // Reproduced verbatim: the original compared these two
                    // timestamps as strings, not dates.
                    let mine_stamp = text(mine, "updated_at")
                        .filter(|value| !value.is_empty())
                        .or_else(|| text(mine, "created_at"))
                        .unwrap_or_default();
                    let remote_stamp = text(remote, "updated_at").unwrap_or_default();
                    let status_differs = text(remote, "status") != text(mine, "status");

                    if status_differs && remote_stamp > mine_stamp {
                        conn.execute(
                            "UPDATE payroll SET status = ?, payment_date = ? WHERE id = ?",
                            rusqlite::params![
                                cell(remote, "status"),
                                cell(remote, "payment_date"),
                                cell(mine, "id"),
                            ],
                        )?;
                    }
                }
            }
        }
        Ok(())
    });
    if let Err(error) = pull {
        eprintln!("[Sync][Pay] Error: {error}");
        return;
    }

    // PUSH (Local -> Cloud)
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
                ]);
                match supabase.insert("payroll", &body, false).await {
                    Err(error) => eprintln!("[Sync][Pay] Insert failed {entry}: {error}"),
                    Ok(_) => println!("[Sync][Pay] Inserted {entry}"),
                }
            }
            Some(remote) => {
                let mine_status = text(mine, "status");
                let remote_status = text(remote, "status");
                if mine_status != remote_status {
                    println!(
                        "[Sync][Pay] Updating status: {entry} ({} -> {})",
                        remote_status.unwrap_or_default(),
                        mine_status.unwrap_or_default()
                    );
                    let body = payload(vec![
                        ("status", field(mine, "status")),
                        ("payment_date", field(mine, "payment_date")),
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
}

/// `syncRegistration()` — the single admin profile row, keyed on `admin_email`.
/// Password hashes and the license key are deliberately not pushed.
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

    let remote_stamp = remote.get("last_updated").and_then(Value::as_str);
    let mine_stamp = mine.get("last_updated").and_then(Value::as_str);

    if newer(remote_stamp, mine_stamp) {
        let applied = state.with_db(|conn| {
            conn.execute(
                r#"UPDATE registration_credentials SET
                       company_name = ?, company_email = ?, admin_name = ?, avatar = ?,
                       bio = ?, theme_preference = ?, language = ?, last_updated = ?
                   WHERE admin_email = ?"#,
                rusqlite::params![
                    cell(&remote, "company_name"),
                    cell(&remote, "company_email"),
                    cell(&remote, "admin_name"),
                    cell(&remote, "avatar"),
                    cell(&remote, "bio"),
                    cell(&remote, "theme_preference"),
                    cell(&remote, "language"),
                    cell(&remote, "last_updated"),
                    email,
                ],
            )
        });
        if let Err(error) = applied {
            eprintln!("[Sync][Reg] Error: {error}");
        }
    } else if newer(mine_stamp, remote_stamp) {
        push_registration(supabase, &mine, false).await;
    }
}

async fn push_registration(supabase: &Supabase, mine: &Value, is_new: bool) {
    let email = text(mine, "admin_email").unwrap_or_default();
    let body = payload(vec![
        ("company_name", field(mine, "company_name")),
        ("company_email", field(mine, "company_email")),
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





