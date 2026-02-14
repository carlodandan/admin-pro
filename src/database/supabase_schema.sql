-- ============================================================
-- Admin Pro – Supabase Schema (run in Supabase SQL Editor)
-- ============================================================

-- Enable UUID extension
create extension if not exists "uuid-ossp";

-- ========== TABLES ==========

-- Departments Table
create table if not exists public.departments (
  id bigint primary key generated always as identity,
  name text not null,
  budget numeric(15, 2) default 0,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null,
  updated_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- Employees Table
create table if not exists public.employees (
  id uuid primary key default uuid_generate_v4(),
  company_id text unique,
  first_name text not null,
  last_name text not null,
  email text not null unique,
  phone text,
  department_id bigint references public.departments(id) on delete set null,
  position text not null,
  salary numeric(15, 2) not null,
  hire_date date not null,
  status text not null default 'Active',
  pin_code text default '1234',
  created_at timestamp with time zone default timezone('utc'::text, now()) not null,
  updated_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- Attendance Table
create table if not exists public.attendance (
  id bigint primary key generated always as identity,
  employee_id uuid references public.employees(id) on delete cascade not null,
  date date not null,
  check_in time without time zone,
  check_out time without time zone,
  status text default 'Present',
  notes text,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null,
  updated_at timestamp with time zone default timezone('utc'::text, now()) not null,
  unique(employee_id, date)
);

-- Payroll Table
create table if not exists public.payroll (
  id bigint primary key generated always as identity,
  employee_id uuid references public.employees(id) on delete cascade not null,
  cutoff_start date not null,
  cutoff_end date not null,
  gross_pay numeric(15, 2) not null,
  net_pay numeric(15, 2) not null,
  deductions jsonb default '{}'::jsonb,
  status text default 'Pending',
  payment_date date,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null,
  updated_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- Registration/Profile Table
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
  theme_preference text default 'light',
  language text default 'en',
  is_registered integer default 1,
  license_key text unique,
  registration_date timestamp with time zone default timezone('utc'::text, now()),
  last_updated timestamp with time zone default timezone('utc'::text, now()),
  updated_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- ========== ROW LEVEL SECURITY ==========

-- Enable RLS on all tables
alter table public.departments enable row level security;
alter table public.employees enable row level security;
alter table public.attendance enable row level security;
alter table public.payroll enable row level security;
alter table public.registration_credentials enable row level security;

-- Drop ALL existing policies (clean slate to avoid conflicts)
do $$
declare
  r record;
begin
  for r in (
    select policyname, tablename
    from pg_policies
    where schemaname = 'public'
      and tablename in ('departments','employees','attendance','payroll','registration_credentials')
  ) loop
    execute format('drop policy if exists %I on public.%I', r.policyname, r.tablename);
  end loop;
end$$;

-- Recreate policies with explicit USING + WITH CHECK for all operations
create policy "auth_all_departments" on public.departments
  for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');

create policy "auth_all_employees" on public.employees
  for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');

create policy "auth_all_attendance" on public.attendance
  for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');

create policy "auth_all_payroll" on public.payroll
  for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');

create policy "auth_all_registration" on public.registration_credentials
  for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');

-- ========== TRIGGERS ==========

-- Function to auto-update updated_at column
create or replace function public.handle_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

-- Drop triggers if they exist (avoid errors on re-run)
drop trigger if exists handle_updated_at on public.departments;
drop trigger if exists handle_updated_at on public.employees;
drop trigger if exists handle_updated_at on public.attendance;
drop trigger if exists handle_updated_at on public.payroll;
drop trigger if exists handle_updated_at on public.registration_credentials;

-- Recreate triggers
create trigger handle_updated_at before update on public.departments
  for each row execute procedure public.handle_updated_at();

create trigger handle_updated_at before update on public.employees
  for each row execute procedure public.handle_updated_at();

create trigger handle_updated_at before update on public.attendance
  for each row execute procedure public.handle_updated_at();

create trigger handle_updated_at before update on public.payroll
  for each row execute procedure public.handle_updated_at();

create trigger handle_updated_at before update on public.registration_credentials
  for each row execute procedure public.handle_updated_at();
