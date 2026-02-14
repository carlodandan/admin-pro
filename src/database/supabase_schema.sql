-- Enable UUID extension
create extension if not exists "uuid-ossp";

-- Departments Table
create table if not exists public.departments (
  id bigint primary key generated always as identity,
  name text not null,
  budget numeric(15, 2) default 0,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null,
  updated_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- Employees Table
-- id matches Supabase Auth User ID (uuid)
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
  status text default 'Pending', -- Pending, Paid
  payment_date date,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- Enable Row Level Security (RLS)
alter table public.departments enable row level security;
alter table public.employees enable row level security;
alter table public.attendance enable row level security;
alter table public.payroll enable row level security;

-- Policies: Allow authenticated users full CRUD access
drop policy if exists "Enable read access for authenticated users" on public.employees;
drop policy if exists "Enable read access for authenticated users" on public.departments;
drop policy if exists "Enable read access for authenticated users" on public.attendance;

create policy "Allow all for authenticated" on public.departments for all using (auth.role() = 'authenticated');
create policy "Allow all for authenticated" on public.employees for all using (auth.role() = 'authenticated');
create policy "Allow all for authenticated" on public.attendance for all using (auth.role() = 'authenticated');
create policy "Allow all for authenticated" on public.payroll for all using (auth.role() = 'authenticated');

-- 4. Registration/Profile Table (Maps to Local `registration_credentials`)
create table if not exists public.registration_credentials (
  id bigint primary key generated always as identity,
  company_name text not null,
  company_email text not null,
  company_address text,
  company_contact text,
  admin_name text not null,
  admin_email text not null unique,
  -- Passwords not synced for security, handled by Auth
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

-- Add missing columns to existing schema if needed
alter table public.payroll add column if not exists updated_at timestamp with time zone default timezone('utc'::text, now()) not null;

-- Enable RLS
alter table public.registration_credentials enable row level security;

-- Policies
drop policy if exists "Enable read access for authenticated users" on public.registration_credentials;
drop policy if exists "Enable insert for authenticated users" on public.registration_credentials;
drop policy if exists "Enable update for authenticated users" on public.registration_credentials;

create policy "Allow all for authenticated" on public.registration_credentials for all using (auth.role() = 'authenticated');

-- Function to handle automated `updated_at`
create or replace function public.handle_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

-- Triggers for updated_at
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
