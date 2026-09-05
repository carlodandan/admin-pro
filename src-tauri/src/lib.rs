//! Application wiring: the module tree, the startup sequence that
//! `createWindow()` used to perform, and the command registry.

mod auth;
mod commands;
mod crypto;
mod db;
mod error;
mod json;
mod manila;
mod menu;
mod state;
mod supabase;

use std::sync::Arc;
use std::time::Duration;

use tauri::{Emitter, Manager, WindowEvent};

use crate::state::AppState;
use crate::supabase::{sync, Supabase};

/// How long the periodic sync waits between passes — `30 * 60 * 1000` in
/// `DatabaseService.startSync()`.
const SYNC_INTERVAL: Duration = Duration::from_secs(30 * 60);

/// If the frontend never reports itself ready, show the window anyway rather
/// than leaving the user with nothing on screen.
const SHOW_FALLBACK: Duration = Duration::from_secs(10);

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    // `tauri dev` runs the Rust side directly, so the `.env` that Vite reads
    // for `VITE_*` is loaded here too. In a release build the values are baked
    // in at compile time and this is a no-op.
    let _ = dotenvy::dotenv();

    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_clipboard_manager::init())
        .setup(|app| {
            let handle = app.handle().clone();
            let shared = Arc::new(build_state(&handle)?);
            app.manage(shared.clone());

            app.set_menu(menu::build(&handle)?)?;
            app.on_menu_event(menu::handle);

            watch_window(&handle);
            start_sync(&handle, shared);

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            // Admin
            commands::auth::backup_auth_database,
            commands::auth::get_registration_info,
            commands::auth::is_system_registered,
            commands::auth::register_system,
            commands::auth::reset_registration,
            // Authentication
            commands::auth::change_password,
            commands::auth::login_user,
            commands::auth::reset_admin_password,
            commands::auth::verify_super_admin_password,
            // Attendance
            commands::attendance::delete_attendance,
            commands::attendance::get_attendance_by_date,
            commands::attendance::get_cutoff_attendance,
            commands::attendance::get_monthly_attendance_report,
            commands::attendance::get_today_attendance,
            commands::attendance::get_today_attendance_summary,
            commands::attendance::get_weekly_attendance,
            commands::attendance::record_attendance,
            commands::attendance::get_latest_attendance,
            // Company
            commands::auth::update_company_info,
            // Database
            commands::database::backup_database,
            // Departments
            commands::departments::create_department,
            commands::departments::delete_department,
            commands::departments::get_all_departments,
            // Employees
            commands::employees::create_employee,
            commands::employees::delete_employee,
            commands::employees::get_all_employees,
            commands::employees::get_employee_by_id,
            commands::employees::update_employee,
            commands::employees::verify_employee_pin,
            commands::employees::update_employee_pin,
            // Payroll
            commands::payroll::get_all_payroll,
            commands::payroll::get_payroll_by_cutoff,
            commands::payroll::get_payroll_by_employee_period,
            commands::payroll::get_payroll_summary,
            commands::payroll::mark_payroll_as_paid,
            commands::payroll::process_bi_monthly_payroll,
            commands::payroll::process_payroll,
            // Dashboard and analytics
            commands::dashboard::get_recent_activities,
            commands::dashboard::get_analytics_data,
            // User management
            commands::auth::create_user,
            commands::auth::get_all_users,
            commands::auth::update_user,
            // User profile
            commands::users::get_user_profile,
            commands::users::get_user_settings,
            commands::users::save_user_profile,
            commands::users::update_user_avatar,
            // Window
            commands::window::close_window,
            commands::window::maximize_window,
            commands::window::minimize_window,
            commands::window::frontend_ready,
        ])
        .run(tauri::generate_context!())
        .expect("error while running Admin Pro");
}

/// `new DatabaseService()` plus `new AuthService()`: resolve the data directory,
/// open the database, run the migrations and connect to Supabase if it is
/// configured. There is no key to load any more — the data key arrives from the
/// cloud at login, or from the Credential Manager cache when offline.
fn build_state(app: &tauri::AppHandle) -> Result<AppState, Box<dyn std::error::Error>> {
    let data_dir = state::resolve_data_dir(app);
    std::fs::create_dir_all(&data_dir)?;

    let db_path = data_dir.join("company-admin.sqlite");
    // Asked before opening, because `Connection::open` creates the file. This is
    // the one signal that entitles the cloud to seed local.
    let fresh_database = !db_path.exists();
    if fresh_database {
        println!("[DB] No local database found; the first login will seed from cloud");
    }

    let connection = db::open(&db_path)?;
    db::initialize(&connection, &data_dir)?;

    let supabase = Supabase::from_env();
    if supabase.is_none() {
        // `supabase.js` logged this and exported `null`; every cloud path is
        // skipped and the app runs entirely on the local database.
        eprintln!("Supabase credentials not found. Running in offline mode.");
    }

    Ok(AppState::new(
        connection,
        data_dir,
        db_path,
        fresh_database,
        supabase,
        app.package_info().version.to_string(),
    ))
}

/// Electron emitted `window-maximized` / `window-unmaximized` to the renderer.
/// Tauri has no maximize event, so the flag is derived from resizes — the only
/// way the state can change.
fn watch_window(app: &tauri::AppHandle) {
    let Some(window) = app.get_webview_window("main") else {
        return;
    };

    let handle = window.clone();
    let was_maximized = std::sync::atomic::AtomicBool::new(window.is_maximized().unwrap_or(false));
    window.on_window_event(move |event| {
        if !matches!(event, WindowEvent::Resized(_)) {
            return;
        }
        let maximized = handle.is_maximized().unwrap_or(false);
        if was_maximized.swap(maximized, std::sync::atomic::Ordering::Relaxed) == maximized {
            return;
        }

        let name = if maximized {
            "window-maximized"
        } else {
            "window-unmaximized"
        };
        if let Err(error) = handle.emit(name, ()) {
            eprintln!("Failed to emit {name}: {error}");
        }
    });

    // The safety net for `frontend_ready`.
    let fallback = window.clone();
    tauri::async_runtime::spawn(async move {
        tokio::time::sleep(SHOW_FALLBACK).await;
        if !fallback.is_visible().unwrap_or(true) {
            eprintln!("Frontend never reported ready; showing the window anyway.");
            let _ = fallback.show();
            let _ = fallback.maximize();
            let _ = fallback.set_focus();
        }
    });
}

/// `DatabaseService.startSync()` — one pass now, then every 30 minutes.
fn start_sync(app: &tauri::AppHandle, shared: Arc<AppState>) {
    let Some(supabase) = shared.supabase.clone() else {
        return;
    };
    let _ = app;

    tauri::async_runtime::spawn(async move {
        sync::sync_all(shared.clone(), supabase.clone()).await;

        let mut ticker = tokio::time::interval(SYNC_INTERVAL);
        // The first tick fires immediately, and the pass above was it.
        ticker.tick().await;
        loop {
            ticker.tick().await;
            sync::sync_all(shared.clone(), supabase.clone()).await;
        }
    });
}

