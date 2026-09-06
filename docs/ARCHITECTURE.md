# Architecture

> How Admin Pro is put together: the two processes, the IPC seam between them, the local
> schema, and how one-way sync and the first-run seed behave.

Security-specific design — key custody, field encryption, RLS — is in
[`SECURITY.md`](SECURITY.md). This document covers everything else.

---

## Contents

- [Process model](#process-model)
- [Startup sequence](#startup-sequence)
- [Rust module map](#rust-module-map)
- [Frontend structure](#frontend-structure)
- [The IPC seam](#the-ipc-seam)
- [Local database](#local-database)
- [Local migrations](#local-migrations)
- [One-way sync](#one-way-sync)
- [Dates and the Manila timezone](#dates-and-the-manila-timezone)
- [Payroll](#payroll)
- [Build pipeline](#build-pipeline)
- [Where to change what](#where-to-change-what)

---

## Process model

Two processes, one IPC boundary:

```
┌─────────────────────────────────────────────┐
│ WebView2  (React 19, Tailwind 4, HashRouter)│
│   src/renderer/**                           │
│   services/api.js  ── the only caller of ───┼──┐
└─────────────────────────────────────────────┘  │  Tauri invoke
                                                 │  (JSON in, JSON out)
┌─────────────────────────────────────────────┐  │
│ Rust core  (src-tauri/src)                  │◄─┘
│   commands/   #[tauri::command] entry points│
│   db/         rusqlite — authoritative store│
│   crypto/     keys, field encryption        │
│   supabase/   REST client + one-way sync    │
└──────────────┬──────────────────────────────┘
               │ HTTPS (rustls)
               ▼
        Supabase — GoTrue + PostgREST
```

Consequences of this split that matter when reading the code:

- **The frontend never talks to Supabase.** There is no `@supabase/supabase-js` dependency.
  Every cloud call originates in Rust, which is what allows the data key to stay out of the
  WebView entirely.
- **The frontend never sees ciphertext.** Decryption happens in `db/employees.rs` before rows
  cross the IPC boundary.
- **The frontend never sees SQL.** Commands return shaped JSON.
- **CSP is restrictive** — `default-src 'self'`, `script-src 'self'`, and `connect-src` limited
  to `ipc:`. No remote origin is reachable from the WebView, and `assetProtocol` is disabled.

## Startup sequence

`src-tauri/src/lib.rs` — `run()` builds the app, then `setup` performs what the old
`createWindow()` did:

1. `dotenvy::dotenv()` loads `.env` so `tauri dev` sees the same `VITE_*` values Vite does.
   In a release build the values are compile-time constants and this is a no-op.
2. `resolve_data_dir(app)` locates the per-user data directory.
3. `AppState::new(…)` opens `company-admin.sqlite`, **recording whether the file existed**
   (`fresh_database: bool`) before creating it, applies the schema, and runs the local
   migrations. Both the connection and the DEK slot live behind locks on `AppState`.
4. The window is created **hidden** (`visible: false` in `tauri.conf.json`) with the
   background already set to `#0F172A`, so there is no white flash. It is shown when the
   frontend calls `frontend_ready`, or after a 10-second fallback if that never arrives.
5. `start_sync` fires one sync pass immediately, then every 30 minutes.

A sync pass is also triggered once per successful sign-in.

---

## Rust module map

| Path | Responsibility |
|---|---|
| `lib.rs` | Module tree, window setup, the sync scheduler, and the command registry. |
| `main.rs` | Thin binary entry point; calls `admin_pro_lib::run()`. |
| `state.rs` | `AppState` — data dir, the SQLite connection behind a mutex, `fresh_database`, the optional Supabase client, and the DEK slot (`unlock` / `lock` / `dek`). |
| `error.rs` | `AppError` and the `Result` alias every command returns. |
| `json.rs` | Helpers for shaping `serde_json::Value` rows out of SQLite. |
| `manila.rs` | Asia/Manila date arithmetic — cut-off boundaries, "today", month ranges. |
| `auth/mod.rs` | Registration, sign-in, sign-out, password change, recovery, and the local profile mirror. The largest single module. |
| `auth/crypto.rs` | `generate_license_key` only. Everything else moved to `crypto/`. |
| `crypto/mod.rs` | DEK generation, `wrap`/`unwrap`, `encrypt_field`/`decrypt_field`, blind indexes, `secret_eq`. Unit-tested. |
| `crypto/keychain.rs` | The Windows Credential Manager cache and its expiry/rollback rules. |
| `commands/*.rs` | One module per domain; every `#[tauri::command]` lives here and nowhere else. |
| `db/schema.rs` | `CREATE TABLE` / index statements applied at open. |
| `db/migrations.rs` | Additive, idempotent migrations for existing installs. |
| `db/employees.rs` | The **only** place employee field encryption is applied or undone. |
| `db/{departments,attendance,payroll,users,activities,analytics}.rs` | Per-entity queries. |
| `supabase/mod.rs` | GoTrue + PostgREST client: `sign_up`, `sign_in_with_password`, `select`, `insert`, `update`, `rpc`, session handling. |
| `supabase/sync.rs` | The push engine, the first-run seed, and the `mirrored()` receipt gate. |

Commands are deliberately thin: they validate input, call into `db/` or `auth/`, and shape the
result. Business logic lives in `db/` and `auth/`; there is no logic in `commands/` worth
testing on its own.

## Frontend structure

| Path | Contents |
|---|---|
| `main.jsx` / `App.jsx` | React root and the `HashRouter` route table. `HashRouter` because the app is served from a custom protocol where path-based routing would need a server. |
| `contexts/UserContext.jsx` | Session, profile and theme. The single source of truth for "who is signed in". |
| `services/api.js` | **The only module that calls `invoke`.** Every command is wrapped in a named function here. |
| `services/database.js`, `services/dashboardService.js` | Higher-level composition over `api.js`. |
| `pages/*.jsx` | One screen per route: Dashboard, Employees, Departments, Attendance, AttendanceKiosk, Payroll, Analytics, Settings, LoginPage, RegistrationPage, ForgotPasswordPage. |
| `components/**` | Feature-grouped UI — `Employees/`, `Department/`, `Attendance/`, `Payroll/`, `Kiosk/`, `Dashboard/`, `Layout/`, `ui/`. |
| `utils/PhilippinePayrollCalculator.js` | Statutory contribution and tax tables. |
| `utils/manila.js` | Formatting for UTC-stored timestamps — `formatUtcStoredDate(value, options)`. |
| `utils/csv.js` | CSV export used by five screens. |
| `hooks/useDialog.js` | Confirm/alert dialog state, over `components/ui/ConfirmDialog.jsx`. |

Keeping `invoke` inside `api.js` means the IPC surface can be reviewed in one file, and a
command rename touches one place.

---

## The IPC seam

Every command is registered in `lib.rs` via `tauri::generate_handler!`. The full surface, by
defining module:

| Module (`commands/`) | Commands |
|---|---|
| `auth.rs` (14) | `is_system_registered`, `register_system`, `get_registration_info`, `reset_registration`, `login_user`, `logout_user`, `change_password`, `reset_admin_password`, `verify_super_admin_password`, `update_company_info`, `create_user`, `get_all_users`, `update_user`, `backup_auth_database` |
| `employees.rs` (7) | `get_all_employees`, `get_employee_by_id`, `create_employee`, `update_employee`, `delete_employee`, `verify_employee_pin`, `update_employee_pin` |
| `departments.rs` (3) | `get_all_departments`, `create_department`, `delete_department` |
| `attendance.rs` (9) | `record_attendance`, `get_today_attendance`, `get_today_attendance_summary`, `get_attendance_by_date`, `get_weekly_attendance`, `get_cutoff_attendance`, `get_monthly_attendance_report`, `get_latest_attendance`, `delete_attendance` |
| `payroll.rs` (7) | `process_payroll`, `process_bi_monthly_payroll`, `get_all_payroll`, `get_payroll_by_cutoff`, `get_payroll_by_employee_period`, `get_payroll_summary`, `mark_payroll_as_paid` |
| `dashboard.rs` (2) | `get_recent_activities`, `get_analytics_data` |
| `users.rs` (4) | `get_user_profile`, `get_user_settings`, `save_user_profile`, `update_user_avatar` |
| `database.rs` (1) | `backup_database` |
| `window.rs` (4) | `minimize_window`, `maximize_window`, `close_window`, `frontend_ready` |

Fifty-one commands in total. The groups are the source modules, so the table can be checked
against the tree rather than taken on trust.

Conventions:

- Commands return `Result<T, AppError>`; `AppError` serialises to a string the UI can display.
- Commands that touch employee data call `state.dek()`, which fails when the app is locked —
  so an unauthenticated caller cannot read PII even if it reaches the command.
- `verify_super_admin_password` is a recovery-key unwrap, not a password check. The name is
  retained for compatibility with the existing frontend call sites.
- `frontend_ready` is what reveals the window; nothing else does.

## Local database

SQLite at `<app data>/company-admin.sqlite`, opened once and shared behind a mutex on
`AppState`. `rusqlite` is built with the `bundled` feature, so SQLite 3.46 is compiled in and
there is no system dependency and no native module to rebuild.

| Table | Notes |
|---|---|
| `departments` | `id`, `name`, `budget`, timestamps. |
| `employees` | See below. |
| `attendance` | `employee_id`, `date`, `check_in`, `check_out`, `status`; unique per employee per date. |
| `payroll` | `employee_id`, `cutoff_start`, `cutoff_end`, gross/net, `deductions` as JSON. |
| `registration_credentials` | Company profile, admin email, license key, `is_registered`. **No password hash columns** — they are dropped by migration if present. |
| `app_meta` | `key` / `value` scratchpad. Currently holds the `seeded` marker. |

`employees`, abbreviated to what matters:

```sql
CREATE TABLE IF NOT EXISTS employees (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    company_id      TEXT UNIQUE,      -- enc:v1:…
    company_id_bidx TEXT,             -- HMAC, uniquely indexed
    first_name      TEXT NOT NULL,    -- plaintext
    last_name       TEXT NOT NULL,    -- plaintext
    email           TEXT NOT NULL UNIQUE,  -- enc:v1:…
    email_bidx      TEXT,             -- HMAC, uniquely indexed
    phone           TEXT,             -- enc:v1:…
    position        TEXT NOT NULL,
    department_id   INTEGER,
    salary          REAL NOT NULL,
    hire_date       DATE NOT NULL,
    status          TEXT NOT NULL DEFAULT 'Active',
    pin_code        TEXT DEFAULT '1234',   -- enc:v1:…
    supabase_id     TEXT UNIQUE,
    created_at      DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at      DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (department_id) REFERENCES departments(id) ON DELETE SET NULL
);
```

The `*_bidx` columns are **nullable**-unique, so a row that has not yet been backfilled can
still be written and pushed. `supabase_id` is how a local row maps to its cloud counterpart.

## Local migrations

`db::initialize` (`db/mod.rs`) runs on every open: it creates the tables, then calls the
migration steps in a fixed order, then installs the triggers. Every step is additive and
idempotent — the three helpers in `db/migrations.rs` (`columns`, `add_column_if_missing`,
`drop_column_if_present`) read `PRAGMA table_info` before touching anything — so a fresh
database and a database from any earlier build converge on the same shape.

In call order:

| # | Step | Effect |
|---|---|---|
| 1 | `schema::create_tables` | `create table if not exists` for `departments`, `employees`, `attendance`, `payroll` and `app_meta`, plus their indexes. |
| 2 | `migrate_payroll_columns` | Renames the pre-cutoff period columns. |
| 3 | `schema::create_registration_table` | The sixth table, `registration_credentials` — with no hash columns. |
| 4 | `migrate_credentials_to_cloud` | Drops `admin_password_hash` and `super_admin_password_hash` from existing installs, and deletes the obsolete `encryption.key` file from the data directory. Runs *before* the legacy import so that import never has to fill a column on its way out. |
| 5 | `migrate_database` | Adds the payroll cut-off columns (`cutoff_type`, `working_days`, `days_present`, `daily_rate`, `breakdown`). |
| 6 | `migrate_employees_table` | Adds `pin_code` and the Supabase row id. |
| 7 | `migrate_registration_table` | Imports a legacy `auth-registration.sqlite` if one exists. Its password-hash columns are deliberately *not* copied. |
| 8 | `migrate_sync_schema` | Adds the `supabase_id` / sync bookkeeping columns. |
| 9 | `migrate_field_encryption` | Adds `email_bidx` and `company_id_bidx` plus their unique indexes. |
| 10 | `schema::create_triggers` | The local `updated_at` triggers. |

One step is deliberately outside that sequence:

| Step | Effect |
|---|---|
| `backfill_employee_encryption(conn, dek)` | Encrypts any employee row still holding plaintext and fills both blind indexes. **It needs the data key, so it runs after sign-in** — from `commands/auth.rs` — not at open. Returns the number of rows changed. |

`ALTER TABLE … DROP COLUMN` requires SQLite 3.35+; the bundled 3.46 satisfies it. It still
fails on an indexed column, which is why `drop_column_if_present` logs rather than unwraps.

`add_column_if_missing` appends, so a migrated database orders the employee columns differently
from a freshly created one. Every query names its columns, so the position never shows.

The backfill's safety comes from `encrypt_field` being a total function — see
[SECURITY.md § Idempotence](SECURITY.md#idempotence). Running it a second time changes zero
rows, so it needs no completion flag, and a crash halfway leaves a valid mixed table that the
next pass finishes.

## One-way sync

`supabase/sync.rs`. A pass runs at startup, after each sign-in, and every 30 minutes. It
returns immediately if there is no active session.

```
sync_all
 ├── seed_from_cloud     ← the only cloud → local path, at most once per installation
 ├── departments         ┐
 ├── employees           │
 ├── attendance          ├── local → cloud only
 ├── payroll             │
 └── registration        ┘
```

### Push

Each entity reads the whole cloud table once — needed to choose insert vs update, to map
`supabase_id`, and to validate foreign keys before pushing children — then pushes local rows.
There is **no pull**. The `newer()` / `newer_or_epoch()` conflict resolution the old
bidirectional sync used is gone, along with the last-write-wins comparison it fed.

**The `mirrored()` receipt gate.** Pushes are not literally unconditional. With 100 employees,
a month of attendance is on the order of 25,000 rows, and re-pushing all of them every 30
minutes is untenable. So each row is skipped when the cloud copy already carries the exact
`updated_at` local last wrote:

```rust
fn mirrored(cloud: &Value, mine: &Value) -> bool {
    match (instant(cloud["updated_at"]), instant(mine["updated_at"])) {
        (Some(cloud), Some(mine)) => cloud == mine,   // equality, deliberately not `>`
        _ => false,
    }
}
```

Equality, **not `>`**, is the important part. With `>`, a cloud row bearing a timestamp local
never wrote would be skipped forever — letting the cloud win by omission, which is exactly what
one-way sync is meant to prevent. Equality means "this is the receipt for my own write"; any
other value, newer or older, triggers a push that overwrites it. This is why the cloud schema
carries no `BEFORE UPDATE` trigger on `updated_at`: a trigger would rewrite the receipt and
every row would look unmirrored forever.

For this to work, `updated_at` is part of the push body for attendance and payroll, and both
narrow update branches were widened to the full mutable column set. `registration` compares
`last_updated` instead, matching its own column name.

### The first-run seed

`seed_from_cloud` is the single exception to one-way flow, and it exists for one scenario: an
administrator signing in on a second machine, where there is no local database and therefore
nothing for local to be authoritative *about*.

Two gates, both required:

1. **`state.fresh_database`** — true only if the SQLite file did not exist when this process
   opened it.
2. **The `seeded` marker in `app_meta`** — durable. `fresh_database` stays true for the life of
   the process, so without a persisted marker the 30-minute ticker would seed again and collide
   with its own rows.

The whole snapshot (departments → employees → attendance → payroll → registration) is read
first, then written inside **one SQLite transaction that also writes the marker**. A crash
midway therefore rolls back to an empty database and the next pass retries from scratch,
rather than resuming onto a half-populated one. An incomplete cloud read writes nothing at all.

Employee rows are stored **exactly as they arrive** — ciphertext and blind indexes included.
Both databases share the one key, so the seed never decrypts anything and never touches the
DEK.

After that point, cloud edits never return. The trade-off is worth stating plainly: **two
devices editing the same employee both push, and the later push wins per row, with no merge and
no warning.**

## Dates and the Manila timezone

The Philippines observes a fixed UTC+8 with no daylight saving, which removes most of the
usual ambiguity but not all of it.

- `src-tauri/src/manila.rs` owns date arithmetic — "today", cut-off boundaries (1–15 and
  16–end of month), and month ranges — using `chrono-tz`'s `Asia/Manila`.
- Timestamps are **stored in UTC** and rendered through
  `formatUtcStoredDate(value, options)` in `src/renderer/utils/manila.js`.
- `DATE` columns (`attendance.date`, `payroll.cutoff_start/end`, `hire_date`) hold local Manila
  calendar dates, because a cut-off is a business boundary rather than an instant.

When adding a date-dependent feature, decide first whether it is an *instant* (UTC + format on
display) or a *business date* (Manila calendar date), and use the matching helper.

## Payroll

Bi-monthly cut-offs: the 1st–15th and the 16th–end of month.

`process_bi_monthly_payroll` derives hours from recorded attendance rather than accepting typed
figures, then `utils/PhilippinePayrollCalculator.js` computes SSS, PhilHealth, Pag-IBIG and
withholding tax, plus allowances and ad-hoc deductions. Results are written to `payroll` with
the deduction breakdown as JSON, so a payslip can be re-rendered later without recomputing
against tables that may have changed.

`mark_payroll_as_paid` is a separate step, so processing a cut-off and disbursing it are
distinct events.

## Build pipeline

```
pnpm start   → tauri dev   → beforeDevCommand: pnpm run dev  (Vite :5173) + cargo run
pnpm make    → tauri build → beforeBuildCommand: pnpm run build (Vite → dist/) + cargo build --release
                           → NSIS bundle
pnpm package → tauri build --no-bundle → src-tauri/target/release/admin-pro.exe
```

- `frontendDist: ../dist` — Tauri embeds the built assets; the release binary serves them from
  a custom protocol, which is why the router is hash-based.
- Release profile: `lto = true`, `codegen-units = 1`, `opt-level = "s"`, `panic = "abort"`,
  `strip = true` — optimised for installer size.
- The `devtools` feature is **on by default**, so View → Developer Tools works in release
  builds. Remove it from `default` in `Cargo.toml` if you would rather it did not.
- Bundle target is NSIS with `installMode: currentUser`, so installation needs no elevation.
- **No updater is configured.** `tauri.conf.json` has no updater block and no `pubkey`, so the
  signing keys in `signkey/` are unused at build time and CI needs no signing secrets.

## Where to change what

| Task | Files |
|---|---|
| Add a screen | `src/renderer/pages/`, route in `App.jsx`, nav entry in `components/Layout/Sidebar.jsx` |
| Add a backend capability | `src-tauri/src/commands/<domain>.rs`, register in `lib.rs`, wrap in `services/api.js` |
| Change the local schema | `db/schema.rs` **and** an additive step in `db/migrations.rs` |
| Change the cloud schema | A **new** file in `supabase/migrations/` — never edit an applied one |
| Encrypt another employee column | `db/employees.rs` only; add a blind index if it is unique |
| Change sync behaviour | `supabase/sync.rs` |
| Change payroll rules | `src/renderer/utils/PhilippinePayrollCalculator.js` |
| Change the offline grace period | `GRACE_DAYS` in `crypto/keychain.rs` |
| Change the sync interval | `SYNC_INTERVAL` in `lib.rs` |
