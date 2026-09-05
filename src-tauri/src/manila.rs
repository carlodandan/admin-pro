//! Asia/Manila date and time helpers.
//!
//! Mirrors `DatabaseService.getManilaDate()` / `getManilaTime()`, which used
//! `Intl.DateTimeFormat('en-CA' | 'en-GB', { timeZone: 'Asia/Manila' })`.

use chrono::Utc;
use chrono_tz::Asia::Manila;

/// `YYYY-MM-DD` in Asia/Manila — the `en-CA` numeric format.
pub fn date() -> String {
    Utc::now()
        .with_timezone(&Manila)
        .format("%Y-%m-%d")
        .to_string()
}

/// `HH:MM:SS` in Asia/Manila, 24-hour — the `en-GB` numeric format. The
/// attendance rows carry whatever time the kiosk sends, so this is the
/// reference the frontend's own helper is written against.
#[allow(dead_code)]
pub fn time() -> String {
    Utc::now()
        .with_timezone(&Manila)
        .format("%H:%M:%S")
        .to_string()
}

/// Equivalent of JavaScript's `new Date().toISOString()`.
pub fn iso_utc() -> String {
    Utc::now().format("%Y-%m-%dT%H:%M:%S%.3fZ").to_string()
}

/// Short weekday label (`Mon`, `Tue`, …) for a `YYYY-MM-DD` string, matching
/// `toLocaleDateString('en-US', { weekday: 'short' })`. Falls back to the input
/// when it cannot be parsed, so a malformed row never panics the chart query.
pub fn weekday_short(date_str: &str) -> String {
    match chrono::NaiveDate::parse_from_str(date_str, "%Y-%m-%d") {
        Ok(d) => d.format("%a").to_string(),
        Err(_) => date_str.to_string(),
    }
}

/// The `YYYY-MM-DD` date `days_ago` days before today in Asia/Manila.
pub fn date_days_ago(days_ago: i64) -> String {
    (Utc::now().with_timezone(&Manila).date_naive() - chrono::Duration::days(days_ago))
        .format("%Y-%m-%d")
        .to_string()
}
