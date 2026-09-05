-- Cloud-authoritative credentials, a single escrowed data key, and admin-only RLS.
--
-- Admin Pro is a Tauri desktop app whose authoritative store is local SQLite; it
-- pushes one way into this project (the sole exception is a first-run seed onto a
-- device that has no local database yet). This schema is shaped by that:
--
--   * No password hash and no plaintext key exists anywhere here. Credentials
--     live in GoTrue (auth.users). The AES-256-GCM data key lives in
--     public.app_keyring sealed twice over -- once under Argon2id(admin password),
--     once under a generated super-admin recovery key -- so possession of either
--     secret is proven client-side by the unwrap succeeding, and no verifier
--     exists to leak.
--   * public.app_admins, not JWT user_metadata, is the authorization registry:
--     user_metadata is user-editable, so anything trusting it is bypassable. A
--     table rather than a trigger on auth.users, because Supabase restricted SQL
--     on the auth schema (2025-04-21).
--   * Exactly one admin and exactly one keyring row can ever exist, enforced by
--     constraints -- not by a client-side check that races.
--   * employees.email / phone / pin_code / company_id arrive already encrypted as
--     'enc:v1:<base64url(nonce||ct+tag)>'. Random nonces make UNIQUE on the
--     ciphertext vestigial, so uniqueness lives on the *_bidx blind indexes,
--     hex(HMAC-SHA256(index_key, lower(trim(value)))). Those are nullable-unique
--     so a not-yet-backfilled local row can still push.
--   * No updated_at triggers: local is authoritative and pushes its own
--     updated_at, which a BEFORE UPDATE trigger would clobber.
--   * anon holds no privilege on any table and none of the write RPCs. Its only
--     reachable entry point is check_admin_exists_v2(), which returns a bare
--     boolean so a fresh install can tell "register" from "sign in".
--
-- Every statement is idempotent; this file is safe to replay.


-- ---------------------------------------------------------------------------
-- 1. The authorization helper lives outside the exposed API schema
-- ---------------------------------------------------------------------------
-- A SECURITY DEFINER function in `public` is callable by anon by default, so the
-- RLS helper is kept in `private`, which PostgREST does not expose.

create schema if not exists private;
grant usage on schema private to authenticated;


-- ---------------------------------------------------------------------------
-- 2. Data tables
-- ---------------------------------------------------------------------------
-- Columns mirror exactly what src-tauri/src/supabase/sync.rs pushes. Local-only
-- concepts (departments.supabase_id) and never-pushed payroll columns
-- (cutoff_type, working_days, days_present, daily_rate) are deliberately absent;
-- the first-run seed coalesces the latter to their local defaults.

create table if not exists public.departments (
  id bigint primary key generated always as identity,
  name text not null unique,
  budget numeric(15, 2) not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.employees (
  id uuid primary key default gen_random_uuid(),
  company_id text,
  company_id_bidx text unique,
  first_name text not null,
  last_name text not null,
  email text not null,
  email_bidx text unique,
  phone text,
  department_id bigint references public.departments (id) on delete set null,
  position text not null,
  salary numeric(15, 2) not null,
  hire_date date not null,
  status text not null default 'Active',
  pin_code text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.attendance (
  id bigint primary key generated always as identity,
  employee_id uuid not null references public.employees (id) on delete cascade,
  date date not null,
  check_in time,
  check_out time,
  status text not null default 'Present',
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (employee_id, date)
);

create table if not exists public.payroll (
  id bigint primary key generated always as identity,
  employee_id uuid not null references public.employees (id) on delete cascade,
  cutoff_start date not null,
  cutoff_end date not null,
  gross_pay numeric(15, 2) not null,
  net_pay numeric(15, 2) not null,
  deductions jsonb not null default '{}'::jsonb,
  status text not null default 'Pending',
  payment_date date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (employee_id, cutoff_start, cutoff_end)
);

-- Profile columns only. The two bcrypt hash columns the local table used to carry
-- (admin_password_hash, super_admin_password_hash) have no counterpart here by
-- design; GoTrue owns credentials now.
create table if not exists public.registration_credentials (
  id bigint primary key generated always as identity,
  company_name text not null,
  company_email text not null,
  company_address text,
  company_contact text,
  admin_name text not null,
  admin_email text not null unique,
  avatar text,
  bio text,
  theme_preference text not null default 'dark',
  language text not null default 'en',
  is_registered integer not null default 1,
  license_key text unique,
  registration_date timestamptz not null default now(),
  last_updated timestamptz not null default now(),
  updated_at timestamptz not null default now()
);


-- ---------------------------------------------------------------------------
-- 3. Indexes
-- ---------------------------------------------------------------------------
-- The employee_id indexes also back the ON DELETE CASCADE foreign keys.

create index if not exists idx_employees_department_id on public.employees (department_id);
create index if not exists idx_employees_status on public.employees (status);
create index if not exists idx_attendance_employee_id on public.attendance (employee_id);
create index if not exists idx_attendance_date on public.attendance (date);
create index if not exists idx_payroll_employee_id on public.payroll (employee_id);
create index if not exists idx_payroll_cutoff on public.payroll (cutoff_start, cutoff_end);


-- ---------------------------------------------------------------------------
-- 4. Credential tables -- one admin, one key, forever
-- ---------------------------------------------------------------------------
-- `singleton` plus its unique index and check constraint make "only one
-- administrator can ever be registered" a database invariant, so two devices
-- racing to register cannot both win. Neither table has an insert, update or
-- delete policy: the RPCs in section 6 are the only write path.

create table if not exists public.app_admins (
  user_id uuid primary key references auth.users (id) on delete cascade,
  email text,
  created_at timestamptz not null default now(),
  singleton boolean not null default true check (singleton)
);

create unique index if not exists app_admins_singleton_key on public.app_admins (singleton);

-- Named explicitly so the inline check above and an upgraded table converge on
-- one constraint rather than colliding.
alter table public.app_admins drop constraint if exists app_admins_singleton_check;
alter table public.app_admins add constraint app_admins_singleton_check check (singleton);

-- Each blob is self-describing: salt(16) || nonce(12) || ciphertext+tag.
-- `id boolean primary key default true check (id)` allows exactly one row.
create table if not exists public.app_keyring (
  id boolean primary key default true check (id),
  wrapped_by_password bytea not null,
  wrapped_by_recovery bytea not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);


-- ---------------------------------------------------------------------------
-- 5. Authorization helper
-- ---------------------------------------------------------------------------
-- search_path is pinned to '' so nothing resolves through a caller-controlled
-- path; every reference below is therefore schema-qualified. auth.uid() is
-- wrapped in a scalar subquery so the planner evaluates it once per statement
-- instead of once per row.

create or replace function private.is_admin()
returns boolean
language sql
security definer
set search_path = ''
stable
as $$
  select exists (
    select 1 from public.app_admins where user_id = (select auth.uid())
  );
$$;


-- ---------------------------------------------------------------------------
-- 6. Write RPCs -- the only path into the credential tables
-- ---------------------------------------------------------------------------

-- Registers the caller as the one administrator. The unique_violation handler
-- covers both a repeat of the same user and a different user arriving second.
create or replace function public.claim_first_admin()
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  claimant uuid := (select auth.uid());
begin
  if claimant is null then
    raise exception 'claim_first_admin requires an authenticated session'
      using errcode = '42501';
  end if;
  insert into public.app_admins (user_id, email)
  values (claimant, (select auth.jwt() ->> 'email'));
  return claimant;
exception
  when unique_violation then
    raise exception 'an administrator is already registered for this project'
      using errcode = '23505';
end;
$$;

-- Installs the wrapped data key exactly once. Takes base64 text rather than
-- bytea so the write never depends on PostgREST's bytea input parsing.
create or replace function public.install_keyring(wrapped_password text, wrapped_recovery text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not (select private.is_admin()) then
    raise exception 'only the registered administrator may install the keyring'
      using errcode = '42501';
  end if;
  insert into public.app_keyring (id, wrapped_by_password, wrapped_by_recovery)
  values (true, decode(wrapped_password, 'base64'), decode(wrapped_recovery, 'base64'));
exception
  when unique_violation then
    raise exception 'the encryption key has already been generated for this project'
      using errcode = '23505';
end;
$$;

-- Re-seals the existing key under a new password. wrapped_by_recovery is never
-- touched, so the super-admin key keeps working across password changes.
create or replace function public.rewrap_password(wrapped_password text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not (select private.is_admin()) then
    raise exception 'only the registered administrator may rewrap the key'
      using errcode = '42501';
  end if;
  update public.app_keyring
     set wrapped_by_password = decode(wrapped_password, 'base64'),
         updated_at = now()
   where id;
  if not found then
    raise exception 'no keyring has been installed for this project'
      using errcode = 'P0002';
  end if;
end;
$$;

-- The one anon-callable function: a pre-login install asks whether to show the
-- registration screen or the sign-in screen. Returns a bare boolean, takes no
-- arguments, and reads nothing an attacker could pivot on.
create or replace function public.check_admin_exists_v2()
returns boolean
language sql
security definer
set search_path = ''
stable
as $$
  select exists (select 1 from public.app_admins);
$$;


-- ---------------------------------------------------------------------------
-- 7. Remove the legacy functions
-- ---------------------------------------------------------------------------
-- setup_schema() was a live privilege-escalation path: SECURITY DEFINER, in
-- `public`, EXECUTE granted to anon, and it ran DDL as postgres -- so anyone
-- holding the anon key extracted from an installer could reshape the database.
-- check_admin_exists() joined registration_credentials to auth.users, which
-- app_admins now answers directly. handle_updated_at() was never attached to a
-- table and must not be: local owns updated_at.

drop function if exists public.setup_schema();
drop function if exists public.check_admin_exists();
drop function if exists public.handle_updated_at();


-- ---------------------------------------------------------------------------
-- 8. Row Level Security
-- ---------------------------------------------------------------------------

alter table public.departments enable row level security;
alter table public.employees enable row level security;
alter table public.attendance enable row level security;
alter table public.payroll enable row level security;
alter table public.registration_credentials enable row level security;
alter table public.app_admins enable row level security;
alter table public.app_keyring enable row level security;


-- ---------------------------------------------------------------------------
-- 9. Policies
-- ---------------------------------------------------------------------------
-- One policy per action rather than a single FOR ALL, and every UPDATE carries
-- both USING and WITH CHECK -- without WITH CHECK a permitted row can be
-- rewritten past the predicate. `TO authenticated` alone would be authentication
-- without authorization, so each predicate also asserts admin.

drop policy if exists departments_admin_select on public.departments;
drop policy if exists departments_admin_insert on public.departments;
drop policy if exists departments_admin_update on public.departments;
drop policy if exists departments_admin_delete on public.departments;

create policy departments_admin_select on public.departments
  for select to authenticated using ((select private.is_admin()));
create policy departments_admin_insert on public.departments
  for insert to authenticated with check ((select private.is_admin()));
create policy departments_admin_update on public.departments
  for update to authenticated
  using ((select private.is_admin())) with check ((select private.is_admin()));
create policy departments_admin_delete on public.departments
  for delete to authenticated using ((select private.is_admin()));

drop policy if exists employees_admin_select on public.employees;
drop policy if exists employees_admin_insert on public.employees;
drop policy if exists employees_admin_update on public.employees;
drop policy if exists employees_admin_delete on public.employees;

create policy employees_admin_select on public.employees
  for select to authenticated using ((select private.is_admin()));
create policy employees_admin_insert on public.employees
  for insert to authenticated with check ((select private.is_admin()));
create policy employees_admin_update on public.employees
  for update to authenticated
  using ((select private.is_admin())) with check ((select private.is_admin()));
create policy employees_admin_delete on public.employees
  for delete to authenticated using ((select private.is_admin()));

drop policy if exists attendance_admin_select on public.attendance;
drop policy if exists attendance_admin_insert on public.attendance;
drop policy if exists attendance_admin_update on public.attendance;
drop policy if exists attendance_admin_delete on public.attendance;

create policy attendance_admin_select on public.attendance
  for select to authenticated using ((select private.is_admin()));
create policy attendance_admin_insert on public.attendance
  for insert to authenticated with check ((select private.is_admin()));
create policy attendance_admin_update on public.attendance
  for update to authenticated
  using ((select private.is_admin())) with check ((select private.is_admin()));
create policy attendance_admin_delete on public.attendance
  for delete to authenticated using ((select private.is_admin()));

drop policy if exists payroll_admin_select on public.payroll;
drop policy if exists payroll_admin_insert on public.payroll;
drop policy if exists payroll_admin_update on public.payroll;
drop policy if exists payroll_admin_delete on public.payroll;

create policy payroll_admin_select on public.payroll
  for select to authenticated using ((select private.is_admin()));
create policy payroll_admin_insert on public.payroll
  for insert to authenticated with check ((select private.is_admin()));
create policy payroll_admin_update on public.payroll
  for update to authenticated
  using ((select private.is_admin())) with check ((select private.is_admin()));
create policy payroll_admin_delete on public.payroll
  for delete to authenticated using ((select private.is_admin()));

drop policy if exists registration_admin_select on public.registration_credentials;
drop policy if exists registration_admin_insert on public.registration_credentials;
drop policy if exists registration_admin_update on public.registration_credentials;
drop policy if exists registration_admin_delete on public.registration_credentials;

create policy registration_admin_select on public.registration_credentials
  for select to authenticated using ((select private.is_admin()));
create policy registration_admin_insert on public.registration_credentials
  for insert to authenticated with check ((select private.is_admin()));
create policy registration_admin_update on public.registration_credentials
  for update to authenticated
  using ((select private.is_admin())) with check ((select private.is_admin()));
create policy registration_admin_delete on public.registration_credentials
  for delete to authenticated using ((select private.is_admin()));

-- Read-only, and by ownership rather than by is_admin(), so app_admins cannot
-- become a directory of other accounts.
drop policy if exists app_admins_self_select on public.app_admins;
create policy app_admins_self_select on public.app_admins
  for select to authenticated using (user_id = (select auth.uid()));

-- The admin reads the wrapped blobs at login and unwraps them client-side. A
-- plain select under this policy is preferred over a SECURITY DEFINER getter:
-- it does not bypass RLS and adds no anon-reachable endpoint.
drop policy if exists app_keyring_admin_select on public.app_keyring;
create policy app_keyring_admin_select on public.app_keyring
  for select to authenticated using ((select private.is_admin()));


-- ---------------------------------------------------------------------------
-- 10. Table privileges
-- ---------------------------------------------------------------------------
-- Explicit grants are mandatory, not decorative: Supabase stopped auto-exposing
-- new public tables to the Data API for projects created after 2026-05-30 and
-- moves every project over on 2026-10-30. Without these, REST calls fail with a
-- permission error rather than returning an RLS-filtered empty set.

grant select, insert, update, delete on public.departments to authenticated;
grant select, insert, update, delete on public.employees to authenticated;
grant select, insert, update, delete on public.attendance to authenticated;
grant select, insert, update, delete on public.payroll to authenticated;
grant select, insert, update, delete on public.registration_credentials to authenticated;
grant select on public.app_admins to authenticated;
grant select on public.app_keyring to authenticated;

revoke all on public.departments from anon;
revoke all on public.employees from anon;
revoke all on public.attendance from anon;
revoke all on public.payroll from anon;
revoke all on public.registration_credentials from anon;
revoke all on public.app_admins from anon;
revoke all on public.app_keyring from anon;

revoke truncate, references, trigger on public.departments from authenticated;
revoke truncate, references, trigger on public.employees from authenticated;
revoke truncate, references, trigger on public.attendance from authenticated;
revoke truncate, references, trigger on public.payroll from authenticated;
revoke truncate, references, trigger on public.registration_credentials from authenticated;
revoke insert, update, delete, truncate, references, trigger on public.app_admins from authenticated;
revoke insert, update, delete, truncate, references, trigger on public.app_keyring from authenticated;


-- ---------------------------------------------------------------------------
-- 11. Function privileges
-- ---------------------------------------------------------------------------
-- Postgres grants EXECUTE to PUBLIC on every new function, and anon inherits it,
-- so each SECURITY DEFINER function must be revoked before being granted.

revoke execute on function private.is_admin() from public, anon;
grant execute on function private.is_admin() to authenticated;

revoke execute on function public.claim_first_admin() from public, anon;
grant execute on function public.claim_first_admin() to authenticated;

revoke execute on function public.install_keyring(text, text) from public, anon;
grant execute on function public.install_keyring(text, text) to authenticated;

revoke execute on function public.rewrap_password(text) from public, anon;
grant execute on function public.rewrap_password(text) to authenticated;

-- Intentionally public: see section 6.
grant execute on function public.check_admin_exists_v2() to anon, authenticated;


-- ---------------------------------------------------------------------------
-- 12. Fail closed for anything added later
-- ---------------------------------------------------------------------------
-- Without this, the next table created in `public` is auto-granted to anon while
-- its RLS is still off -- the classic footgun, and how setup_schema() came to be
-- anon-callable in the first place. Only defaults set by `postgres` (the role the
-- SQL editor, migrations and MCP run as) can be changed here; the Supabase
-- internal roles keep their own, which is out of scope.

alter default privileges in schema public revoke all on tables from anon;
alter default privileges in schema public revoke all on tables from authenticated;
alter default privileges in schema public revoke execute on functions from anon;
