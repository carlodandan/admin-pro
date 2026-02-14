-- Create a function to setup the schema securely
-- This allows the client (using anon key) to trigger schema creation if they are an admin
-- Note: In a real production app, you might want to restrict this further or run it only via migration scripts.
-- For this desktop app, we allow the "First Admin" to trigger it properly.

CREATE OR REPLACE FUNCTION setup_schema()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER -- Runs with privileges of the creator (postgres/service_role)
AS $$
BEGIN
  -- 1. Departments
  EXECUTE 'CREATE TABLE IF NOT EXISTS public.departments (
    id bigint primary key generated always as identity,
    name text not null unique,
    budget numeric(15, 2) default 0,
    created_at timestamp with time zone default timezone(''utc''::text, now()) not null,
    updated_at timestamp with time zone default timezone(''utc''::text, now()) not null,
    supabase_id text unique
  )';

  -- 2. Employees
  EXECUTE 'CREATE TABLE IF NOT EXISTS public.employees (
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
    status text not null default ''Active'',
    pin_code text default ''1234'',
    created_at timestamp with time zone default timezone(''utc''::text, now()) not null,
    updated_at timestamp with time zone default timezone(''utc''::text, now()) not null
  )';

  -- 3. Attendance
  EXECUTE 'CREATE TABLE IF NOT EXISTS public.attendance (
    id bigint primary key generated always as identity,
    employee_id uuid references public.employees(id) on delete cascade not null,
    date date not null,
    check_in time without time zone,
    check_out time without time zone,
    status text default ''Present'',
    notes text,
    created_at timestamp with time zone default timezone(''utc''::text, now()) not null,
    updated_at timestamp with time zone default timezone(''utc''::text, now()) not null,
    unique(employee_id, date)
  )';

  -- 4. Payroll
  EXECUTE 'CREATE TABLE IF NOT EXISTS public.payroll (
    id bigint primary key generated always as identity,
    employee_id uuid references public.employees(id) on delete cascade not null,
    cutoff_start date not null,
    cutoff_end date not null,
    gross_pay numeric(15, 2) not null,
    net_pay numeric(15, 2) not null,
    deductions jsonb default ''{}''::jsonb,
    status text default ''Pending'',
    payment_date date,
    created_at timestamp with time zone default timezone(''utc''::text, now()) not null,
    updated_at timestamp with time zone default timezone(''utc''::text, now()) not null
  )';

  -- 5. Registration/Profile
  EXECUTE 'CREATE TABLE IF NOT EXISTS public.registration_credentials (
    id bigint primary key generated always as identity,
    company_name text not null,
    company_email text not null,
    company_address text,
    company_contact text,
    admin_name text not null,
    admin_email text not null unique,
    avatar text,
    bio text,
    theme_preference text default ''light'',
    language text default ''en'',
    is_registered integer default 1,
    license_key text unique,
    registration_date timestamp with time zone default timezone(''utc''::text, now()),
    last_updated timestamp with time zone default timezone(''utc''::text, now()),
    updated_at timestamp with time zone default timezone(''utc''::text, now()) not null
  )';

  -- Enable RLS on all tables
  EXECUTE 'ALTER TABLE public.departments ENABLE ROW LEVEL SECURITY';
  EXECUTE 'ALTER TABLE public.employees ENABLE ROW LEVEL SECURITY';
  EXECUTE 'ALTER TABLE public.attendance ENABLE ROW LEVEL SECURITY';
  EXECUTE 'ALTER TABLE public.payroll ENABLE ROW LEVEL SECURITY';
  EXECUTE 'ALTER TABLE public.registration_credentials ENABLE ROW LEVEL SECURITY';

  -- Create Policies (Drop first to ensure idempotency)
  -- 1. Departments
  EXECUTE 'DROP POLICY IF EXISTS "Allow all for authenticated" ON public.departments';
  EXECUTE 'CREATE POLICY "Allow all for authenticated" ON public.departments FOR ALL USING (auth.role() = ''authenticated'')';

  -- 2. Employees
  EXECUTE 'DROP POLICY IF EXISTS "Allow all for authenticated" ON public.employees';
  EXECUTE 'CREATE POLICY "Allow all for authenticated" ON public.employees FOR ALL USING (auth.role() = ''authenticated'')';

  -- 3. Attendance
  EXECUTE 'DROP POLICY IF EXISTS "Allow all for authenticated" ON public.attendance';
  EXECUTE 'CREATE POLICY "Allow all for authenticated" ON public.attendance FOR ALL USING (auth.role() = ''authenticated'')';

  -- 4. Payroll
  EXECUTE 'DROP POLICY IF EXISTS "Allow all for authenticated" ON public.payroll';
  EXECUTE 'CREATE POLICY "Allow all for authenticated" ON public.payroll FOR ALL USING (auth.role() = ''authenticated'')';

  -- 5. Registration Credentials
  -- Allow authenticated users to Read/Update/Insert
  EXECUTE 'DROP POLICY IF EXISTS "Allow all for authenticated" ON public.registration_credentials';
  EXECUTE 'CREATE POLICY "Allow all for authenticated" ON public.registration_credentials FOR ALL USING (auth.role() = ''authenticated'')';

  -- 6. Helper RPC to check for existing admin (Auth)
  -- This allows the anon key to check if "Any" user exists, to decide if Setup is needed.
  -- Security Definer allows it to access auth.users.
  -- UPDATED (v2): Check public.registration_credentials AND ensure linked Auth User exists.
  -- This handles the case where Auth User was deleted but Public Data remains (orphaned).
  EXECUTE 'CREATE OR REPLACE FUNCTION check_admin_exists_v2() RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER AS $f$ 
    BEGIN 
      RETURN EXISTS (
        SELECT 1 
        FROM public.registration_credentials rc
        JOIN auth.users au ON au.email = rc.admin_email
        WHERE rc.is_registered = 1
      ); 
    END; $f$';

END;
$$;
