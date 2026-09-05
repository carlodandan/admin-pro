//! Bridge between SQLite rows and `serde_json` values.
//!
//! The Electron renderer consumed whatever columns `better-sqlite3` produced
//! (including bare `SELECT *`). Returning `serde_json::Value` rows instead of
//! typed structs keeps that contract exactly: every column the SQL selects
//! reaches the frontend under its original name.

use crate::error::Result;
use rusqlite::types::{Value as SqlValue, ValueRef};
use rusqlite::{Connection, Row, ToSql};
use serde_json::{Map, Number, Value};

/// Convert one SQLite cell to JSON the way `better-sqlite3` did.
pub fn cell_to_json(cell: ValueRef<'_>) -> Value {
    match cell {
        ValueRef::Null => Value::Null,
        ValueRef::Integer(i) => Value::Number(Number::from(i)),
        ValueRef::Real(f) => Number::from_f64(f).map(Value::Number).unwrap_or(Value::Null),
        ValueRef::Text(t) => Value::String(String::from_utf8_lossy(t).into_owned()),
        ValueRef::Blob(b) => Value::Array(
            b.iter()
                .map(|byte| Value::Number(Number::from(*byte)))
                .collect(),
        ),
    }
}

/// Turn a row into a JSON object keyed by column name.
pub fn row_to_json(row: &Row<'_>) -> rusqlite::Result<Value> {
    let statement = row.as_ref();
    let names: Vec<String> = statement
        .column_names()
        .into_iter()
        .map(str::to_string)
        .collect();

    let mut object = Map::with_capacity(names.len());
    for (index, name) in names.into_iter().enumerate() {
        object.insert(name, cell_to_json(row.get_ref(index)?));
    }
    Ok(Value::Object(object))
}

/// `stmt.all(...)` — every matching row as a JSON object.
pub fn query_all(conn: &Connection, sql: &str, params: &[&dyn ToSql]) -> Result<Vec<Value>> {
    let mut statement = conn.prepare(sql)?;
    let rows = statement.query_map(params, row_to_json)?;
    let mut out = Vec::new();
    for row in rows {
        out.push(row?);
    }
    Ok(out)
}

/// `stmt.get(...)` — the first matching row, or `None` (JavaScript `undefined`).
pub fn query_opt(conn: &Connection, sql: &str, params: &[&dyn ToSql]) -> Result<Option<Value>> {
    let mut statement = conn.prepare(sql)?;
    let mut rows = statement.query(params)?;
    match rows.next()? {
        Some(row) => Ok(Some(row_to_json(row)?)),
        None => Ok(None),
    }
}

/// Convert a JSON parameter supplied by the frontend into a bindable value.
/// Objects and arrays are stringified, which is what `better-sqlite3` callers
/// had to do by hand anyway.
pub fn json_to_sql(value: &Value) -> SqlValue {
    match value {
        Value::Null => SqlValue::Null,
        Value::Bool(b) => SqlValue::Integer(i64::from(*b)),
        Value::Number(n) => {
            if let Some(i) = n.as_i64() {
                SqlValue::Integer(i)
            } else {
                SqlValue::Real(n.as_f64().unwrap_or(0.0))
            }
        }
        Value::String(s) => SqlValue::Text(s.clone()),
        other => SqlValue::Text(other.to_string()),
    }
}

/// Read a string field from a JSON object, treating `null` as absent.
pub fn opt_str(object: &Value, key: &str) -> Option<String> {
    match object.get(key) {
        Some(Value::String(s)) => Some(s.clone()),
        Some(Value::Number(n)) => Some(n.to_string()),
        Some(Value::Bool(b)) => Some(b.to_string()),
        _ => None,
    }
}

/// Read a string field, falling back to an empty string.
pub fn str_or_empty(object: &Value, key: &str) -> String {
    opt_str(object, key).unwrap_or_default()
}

/// Read a numeric field, treating anything unparseable as absent.
pub fn opt_f64(object: &Value, key: &str) -> Option<f64> {
    match object.get(key) {
        Some(Value::Number(n)) => n.as_f64(),
        Some(Value::String(s)) => s.parse::<f64>().ok(),
        _ => None,
    }
}

/// Read a numeric field with a default, mirroring `value || fallback`.
pub fn f64_or(object: &Value, key: &str, fallback: f64) -> f64 {
    opt_f64(object, key).unwrap_or(fallback)
}

/// Read an integer field with a default.
pub fn i64_or(object: &Value, key: &str, fallback: i64) -> i64 {
    match object.get(key) {
        Some(Value::Number(n)) => n.as_i64().or_else(|| n.as_f64().map(|f| f as i64)),
        Some(Value::String(s)) => s.parse::<i64>().ok(),
        _ => None,
    }
    .unwrap_or(fallback)
}
