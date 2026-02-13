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

-- Policies (For now, allow Service Role full access, and Authenticated users read access)
-- Note: You might want to refine these later
create policy "Enable read access for authenticated users" on public.employees for select using (auth.role() = 'authenticated');
create policy "Enable read access for authenticated users" on public.departments for select using (auth.role() = 'authenticated');
create policy "Enable read access for authenticated users" on public.attendance for select using (auth.role() = 'authenticated');

-- Service Role (Server-side) bypasses RLS by default, but explicit policies can be safer
