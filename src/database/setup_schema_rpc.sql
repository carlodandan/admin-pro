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

  -- Clean up ALL known policy names (old + new) to avoid conflicts
  -- Old naming convention
  EXECUTE 'DROP POLICY IF EXISTS "Allow all for authenticated" ON public.departments';
  EXECUTE 'DROP POLICY IF EXISTS "Allow all for authenticated" ON public.employees';
  EXECUTE 'DROP POLICY IF EXISTS "Allow all for authenticated" ON public.attendance';
  EXECUTE 'DROP POLICY IF EXISTS "Allow all for authenticated" ON public.payroll';
  EXECUTE 'DROP POLICY IF EXISTS "Allow all for authenticated" ON public.registration_credentials';
  EXECUTE 'DROP POLICY IF EXISTS "Enable read access for authenticated users" ON public.departments';
  EXECUTE 'DROP POLICY IF EXISTS "Enable read access for authenticated users" ON public.employees';
  EXECUTE 'DROP POLICY IF EXISTS "Enable read access for authenticated users" ON public.attendance';
  EXECUTE 'DROP POLICY IF EXISTS "Enable read access for authenticated users" ON public.registration_credentials';
  EXECUTE 'DROP POLICY IF EXISTS "Enable insert for authenticated users" ON public.registration_credentials';
  EXECUTE 'DROP POLICY IF EXISTS "Enable update for authenticated users" ON public.registration_credentials';
  -- New naming convention
  EXECUTE 'DROP POLICY IF EXISTS "auth_all_departments" ON public.departments';
  EXECUTE 'DROP POLICY IF EXISTS "auth_all_employees" ON public.employees';
  EXECUTE 'DROP POLICY IF EXISTS "auth_all_attendance" ON public.attendance';
  EXECUTE 'DROP POLICY IF EXISTS "auth_all_payroll" ON public.payroll';
  EXECUTE 'DROP POLICY IF EXISTS "auth_all_registration" ON public.registration_credentials';

  -- Recreate policies with explicit USING + WITH CHECK (required for INSERT)
  EXECUTE 'CREATE POLICY "auth_all_departments" ON public.departments FOR ALL USING (auth.role() = ''authenticated'') WITH CHECK (auth.role() = ''authenticated'')';
  EXECUTE 'CREATE POLICY "auth_all_employees" ON public.employees FOR ALL USING (auth.role() = ''authenticated'') WITH CHECK (auth.role() = ''authenticated'')';
  EXECUTE 'CREATE POLICY "auth_all_attendance" ON public.attendance FOR ALL USING (auth.role() = ''authenticated'') WITH CHECK (auth.role() = ''authenticated'')';
  EXECUTE 'CREATE POLICY "auth_all_payroll" ON public.payroll FOR ALL USING (auth.role() = ''authenticated'') WITH CHECK (auth.role() = ''authenticated'')';
  EXECUTE 'CREATE POLICY "auth_all_registration" ON public.registration_credentials FOR ALL USING (auth.role() = ''authenticated'') WITH CHECK (auth.role() = ''authenticated'')';

  -- 6. Helper RPC to check for existing admin (Auth)
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
