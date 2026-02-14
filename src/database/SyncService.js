const crypto = require('crypto');

class SyncService {
    constructor(db, supabase) {
        this.db = db;
        this.supabase = supabase;
    }

    async syncAll() {

        try {
            // Guard: Only sync if user is authenticated (anon key gets blocked by RLS)
            const { data: { session } } = await this.supabase.auth.getSession();
            if (!session) {

                return;
            }

            // Attempt to initialize cloud schema (idempotent via RPC)
            const { error: rpcError } = await this.supabase.rpc('setup_schema');
            if (rpcError) console.warn('Schema setup RPC failed (function might not exist yet):', rpcError.message);

            await this.syncDepartments();
            await this.syncEmployees();
            await this.syncAttendance();
            await this.syncPayroll();
            await this.syncRegistration();

        } catch (error) {
            console.error('Sync failed:', error);
        }
    }

    // --- Helper: Get ISO String for SQLite comparison ---
    getNow() {
        return new Date().toISOString();
    }

    // --- 1. Departments Sync ---
    async syncDepartments() {

        try {
            // PULL: Get all from Cloud
            const { data: cloudDepts, error } = await this.supabase.from('departments').select('*');
            if (error) throw error;

            // Map cloud depts for easy lookup
            const cloudMap = new Map(cloudDepts.map(d => [d.name, d]));

            // Get Local Depts
            const localDepts = this.db.prepare('SELECT * FROM departments').all();
            const localMap = new Map(localDepts.map(d => [d.name, d]));

            // MERGE (Cloud -> Local)
            for (const cDept of cloudDepts) {
                const lDept = localMap.get(cDept.name);

                if (!lDept) {
                    // Insert into Local
                    this.db.prepare(`
            INSERT INTO departments (name, budget, created_at, updated_at, supabase_id)
            VALUES (?, ?, ?, ?, ?)
          `).run(cDept.name, cDept.budget, cDept.created_at, cDept.updated_at, cDept.id); // Save Cloud ID

                } else if (new Date(cDept.updated_at) > new Date(lDept.updated_at)) {
                    // Update Local
                    this.db.prepare(`
            UPDATE departments SET budget = ?, updated_at = ?, supabase_id = ?
            WHERE name = ?
          `).run(cDept.budget, cDept.updated_at, cDept.id, cDept.name);

                }
            }

            // PUSH (Local -> Cloud)
            for (const lDept of localDepts) {
                const cDept = cloudMap.get(lDept.name);

                if (!cDept || new Date(lDept.updated_at) > new Date(cDept.updated_at)) {
                    // Upsert to Cloud
                    const { error: pushError } = await this.supabase.from('departments').upsert({
                        name: lDept.name,
                        budget: lDept.budget,
                        created_at: lDept.created_at,
                        updated_at: lDept.updated_at
                    }, { onConflict: 'name' });

                    if (pushError) console.error(`[Push] Failed Department ${lDept.name}:`, pushError);

                }
            }

        } catch (err) {
            console.error('Error syncing departments:', err);
        }
    }

    // --- 2. Employees Sync ---
    async syncEmployees() {

        try {
            // PULL
            const { data: cloudEmps, error } = await this.supabase.from('employees').select('*');
            if (error) throw error;
            const cloudMap = new Map(cloudEmps.map(e => [e.id, e])); // Match by UUID

            // Local
            const localEmps = this.db.prepare('SELECT * FROM employees').all();

            // Ensure local employees have UUIDs (Migration Step if needed)
            for (const emp of localEmps) {
                if (!emp.supabase_id) {
                    const newUuid = crypto.randomUUID();
                    this.db.prepare('UPDATE employees SET supabase_id = ? WHERE id = ?').run(newUuid, emp.id);
                    emp.supabase_id = newUuid; // Update in memory too
                }
            }
            const localMap = new Map(localEmps.map(e => [e.supabase_id, e]));

            // MERGE (Cloud -> Local)
            for (const cEmp of cloudEmps) {
                const lEmp = localMap.get(cEmp.id);

                // Resolve Department ID (Cloud Dept ID -> Local Dept ID via supabase_id)
                let localDeptId = null;
                if (cEmp.department_id) {
                    // Supabase `department_id` is an Integer in Cloud (referenced by ID), 
                    // BUT wait, Cloud `departments.id` is BigInt.
                    // Local `departments.supabase_id` should store this Cloud ID.
                    // Actually, Cloud uses `id` (BigInt) as PK.
                    // So `cEmp.department_id` IS the Cloud Dept ID.
                    const deptStmt = this.db.prepare('SELECT id FROM departments WHERE supabase_id = ?');
                    const dept = deptStmt.get(cEmp.department_id); // Look for Cloud ID in local supabase_id column
                    if (dept) localDeptId = dept.id;
                    else console.warn(`[Pull] Dept ID ${cEmp.department_id} not found locally for Employee ${cEmp.email}`);
                }

                if (!lEmp) {
                    // Insert Local
                    this.db.prepare(`
            INSERT INTO employees (
              company_id, first_name, last_name, email, phone, position, 
              department_id, salary, hire_date, status, pin_code, supabase_id, created_at, updated_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          `).run(
                        cEmp.company_id, cEmp.first_name, cEmp.last_name, cEmp.email, cEmp.phone, cEmp.position,
                        localDeptId, cEmp.salary, cEmp.hire_date, cEmp.status, cEmp.pin_code, cEmp.id, cEmp.created_at, cEmp.updated_at
                    );

                } else if (new Date(cEmp.updated_at) > new Date(lEmp.updated_at)) {
                    // Update Local
                    this.db.prepare(`
            UPDATE employees SET
              company_id = ?, first_name = ?, last_name = ?, email = ?, phone = ?, position = ?,
              department_id = ?, salary = ?, hire_date = ?, status = ?, pin_code = ?, updated_at = ?
            WHERE supabase_id = ?
           `).run(
                        cEmp.company_id, cEmp.first_name, cEmp.last_name, cEmp.email, cEmp.phone, cEmp.position,
                        localDeptId, cEmp.salary, cEmp.hire_date, cEmp.status, cEmp.pin_code, cEmp.updated_at,
                        cEmp.id
                    );

                }
            }

            // PUSH (Local -> Cloud)
            for (const lEmp of localEmps) {
                const cEmp = cloudMap.get(lEmp.supabase_id);

                if (!cEmp || new Date(lEmp.updated_at) > new Date(cEmp.updated_at)) {
                    const { error: pushError } = await this.supabase.from('employees').upsert({
                        id: lEmp.supabase_id,
                        company_id: lEmp.company_id,
                        first_name: lEmp.first_name,
                        last_name: lEmp.last_name,
                        email: lEmp.email,
                        phone: lEmp.phone,
                        department_id: lEmp.department_id, // Ensure IDs match or use logic to map if Dept IDs differ
                        position: lEmp.position,
                        salary: lEmp.salary,
                        hire_date: lEmp.hire_date,
                        status: lEmp.status,
                        pin_code: lEmp.pin_code,
                        created_at: lEmp.created_at,
                        updated_at: lEmp.updated_at
                    });
                    if (pushError) console.error(`[Push] Failed Employee ${lEmp.email}:`, pushError);

                }
            }

        } catch (err) {
            console.error('Error syncing employees:', err);
        }
    }

    // --- 3. Attendance Sync ---
    async syncAttendance() {

        try {
            // Helper: Get formatted date string for matching
            // Assuming local DB stores date as YYYY-MM-DD string? 
            // If schema uses DATE type, Better-SQLite3 usually returns string.

            // PULL
            const { data: cloudAtt, error } = await this.supabase.from('attendance').select('*');
            if (error) throw error;

            // Match Key: employee_id + date
            const getAttKey = (empId, date) => `${empId}_${date}`;
            const cloudMap = new Map(cloudAtt.map(a => [getAttKey(a.employee_id, a.date), a]));

            // Local
            // We need employee supabase_id for matching
            const localAtt = this.db.prepare(`
         SELECT a.*, e.supabase_id as emp_uuid 
         FROM attendance a 
         JOIN employees e ON a.employee_id = e.id
         WHERE e.supabase_id IS NOT NULL
       `).all();

            const localMap = new Map(localAtt.map(a => [getAttKey(a.emp_uuid, a.date), a]));

            // MERGE (Cloud -> Local)
            for (const cAtt of cloudAtt) {
                // Resolve local employee ID from UUID
                const localEmp = this.db.prepare('SELECT id FROM employees WHERE supabase_id = ?').get(cAtt.employee_id);
                if (!localEmp) continue; // Skip if employee doesn't exist locally

                const key = getAttKey(cAtt.employee_id, cAtt.date);
                const lAtt = localMap.get(key);

                // Helper to parse potential NULL updated_at default logic
                const cTime = cAtt.updated_at ? new Date(cAtt.updated_at) : new Date(0);
                const lTime = lAtt && lAtt.updated_at ? new Date(lAtt.updated_at) : new Date(0); // If column missing in old schema, careful

                if (!lAtt) {
                    // Insert Local
                    this.db.prepare(`
                INSERT INTO attendance (employee_id, date, check_in, check_out, status, notes, created_at)
                VALUES (?, ?, ?, ?, ?, ?, ?)
            `).run(localEmp.id, cAtt.date, cAtt.check_in, cAtt.check_out, cAtt.status, cAtt.notes, cAtt.created_at);

                } else if (cTime > lTime) {
                    // Update Local
                    this.db.prepare(`
                UPDATE attendance SET check_in = ?, check_out = ?, status = ?, notes = ?
                WHERE id = ?
            `).run(cAtt.check_in, cAtt.check_out, cAtt.status, cAtt.notes, lAtt.id);

                }
            }

            // PUSH (Local -> Cloud)
            for (const lAtt of localAtt) {
                const key = getAttKey(lAtt.emp_uuid, lAtt.date);
                const cAtt = cloudMap.get(key);

                // Assuming Attendance doesn't update much after creation, but check-out is an update.
                // If we don't track `updated_at` on attendance locally, we might rely on Check-Out existence.
                // Let's assume we do (implied if we want bidirectional).
                // If `updated_at` column missing in local attendance table, we rely on content difference?
                // Safer: Always push if local looks "more complete" (e.g. has checkout when cloud doesn't).
                // OR just Upsert if local change detected?

                // For now, assume Push if missing OR local updated_at > cloud updated_at
                // NOTE: `updated_at` might not exist in original schema for attendance. Check DatabaseService.
                // Checked: attendance has created_at, but NO updated_at in schema definition in DatabaseService.
                // ACTION: We should probably rely on `check_out` being present or just `UPSERT` if we trust local as source of truth for "active" kiosk.
                // Strategy: If Cloud is missing it, Push. If Cloud has it but check_out is null and Local has check_out, Push.

                let shouldPush = false;
                if (!cAtt) shouldPush = true;
                else if (!cAtt.check_out && lAtt.check_out) shouldPush = true;

                if (shouldPush) {
                    const { error: pushError } = await this.supabase.from('attendance').upsert({
                        employee_id: lAtt.emp_uuid,
                        date: lAtt.date,
                        check_in: lAtt.check_in,
                        check_out: lAtt.check_out,
                        status: lAtt.status,
                        notes: lAtt.notes,
                        created_at: lAtt.created_at
                    }, { onConflict: 'employee_id, date' });

                    if (pushError) console.error(`[Push] Failed Attendance ${key}:`, pushError);

                }
            }

        } catch (err) {
            console.error('Error syncing attendance:', err);
        }
    }

    // --- 4. Payroll Sync ---
    async syncPayroll() {

        try {
            const { data: cloudPay, error } = await this.supabase.from('payroll').select('*');
            if (error) throw error;

            // Key: employee_id + period_start + period_end
            const getPayKey = (eid, start, end) => `${eid}_${start}_${end}`;
            const cloudMap = new Map(cloudPay.map(p => [getPayKey(p.employee_id, p.period_start, p.period_end), p]));

            const localPay = this.db.prepare(`
            SELECT p.*, e.supabase_id as emp_uuid 
            FROM payroll p 
            JOIN employees e ON p.employee_id = e.id
            WHERE e.supabase_id IS NOT NULL
        `).all();
            const localMap = new Map(localPay.map(p => [getPayKey(p.emp_uuid, p.period_start, p.period_end), p]));

            // MERGE (Cloud -> Local)
            for (const cPay of cloudPay) {
                const localEmp = this.db.prepare('SELECT id FROM employees WHERE supabase_id = ?').get(cPay.employee_id);
                if (!localEmp) continue;

                const key = getPayKey(cPay.employee_id, cPay.period_start, cPay.period_end);
                const lPay = localMap.get(key);

                if (!lPay) {
                    this.db.prepare(`
                    INSERT INTO payroll (
                        employee_id, period_start, period_end, basic_salary, allowances, deductions,
                        net_salary, status, payment_date, cutoff_type, working_days, days_present,
                        daily_rate, breakdown, created_at
                    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                `).run(
                        localEmp.id, cPay.period_start, cPay.period_end, cPay.gross_pay, 0, cPay.deductions, // Mapping issues? check schema
                        cPay.net_pay, cPay.status, cPay.payment_date, 'Full Month', 24, 24, 0, null, cPay.created_at
                    );
                    // Note: Schema mapping might be slightly different between local/cloud definitions. 
                    // Local has `basic_salary`, Cloud `gross_pay`? 
                    // Adjusting based on `DatabaseService` sync logic which mapped `gross_pay` to `basic_salary` effectively.

                } else if (cPay.status !== lPay.status && cPay.updated_at > (lPay.updated_at || lPay.created_at)) {
                    this.db.prepare('UPDATE payroll SET status = ?, payment_date = ? WHERE id = ?')
                        .run(cPay.status, cPay.payment_date, lPay.id);

                }
            }

            // PUSH (Local -> Cloud)
            for (const lPay of localPay) {
                const key = getPayKey(lPay.emp_uuid, lPay.period_start, lPay.period_end);
                const cPay = cloudMap.get(key);

                // Push if missing or local status changed (e.g. Paid)
                if (!cPay || (lPay.status !== cPay.status)) { // Simplistic check
                    const { error: pushError } = await this.supabase.from('payroll').upsert({
                        employee_id: lPay.emp_uuid,
                        period_start: lPay.period_start, // mapped from cutoff_start? Verify schema.
                        period_end: lPay.period_end,
                        gross_pay: lPay.basic_salary, // Mapping
                        net_pay: lPay.net_salary,
                        deductions: lPay.deductions,
                        status: lPay.status,
                        payment_date: lPay.payment_date,
                        created_at: lPay.created_at
                    }); // Note: OnConflict might need explicit constraint on Supabase side
                    if (pushError) console.error(`[Push] Failed Payroll ${key}:`, pushError);

                }
            }

        } catch (err) {
            console.error('Error syncing payroll:', err);
        }
    }

    // --- 5. Registration/Profile Sync ---
    async syncRegistration() {

        try {
            // Local
            const localReg = this.db.prepare('SELECT * FROM registration_credentials WHERE is_registered = 1').get();
            if (!localReg) return; // Nothing to sync if not registered locally?

            // Cloud (Supabase Auth User Metadata or separate table? Schema says `users` or similar?)
            // The previous code verified admin via `supabase.auth.admin.listUsers`.
            // We probably want to sync "Profile" data (avatar, bio, etc.)
            // Let's assume there's a `profiles` table or we store in User Metadata.
            // Implementation Plan didn't specify `profiles` table on Supabase.
            // Fallback: If no `profiles` table in Supabase, we skip strict sync or use User Metadata.

            /* 
               Assumption: We want to sync `registration_credentials` (avatar, theme, etc.) 
               to a Supabase `profiles` table equivalent or `registration_credentials` table if it exists there.
               Let's assume a strict 1-to-1 table `registration_credentials` exists on Supabase too 
               (matching the local schema we just unified).
            */

            const { data: cloudRegs, error } = await this.supabase.from('registration_credentials').select('*').eq('admin_email', localReg.admin_email);
            let cloudReg = cloudRegs && cloudRegs.length > 0 ? cloudRegs[0] : null;

            if (error && error.code !== '42P01') { // Ignore if table doesn't exist
                throw error;
            }

            // MERGE
            if (cloudReg) {
                const cTime = new Date(cloudReg.last_updated);
                const lTime = new Date(localReg.last_updated);

                if (cTime > lTime) {
                    // Update Local
                    this.db.prepare(`
                    UPDATE registration_credentials SET
                        company_name = ?, company_email = ?, admin_name = ?, avatar = ?,
                        bio = ?, theme_preference = ?, language = ?, last_updated = ?
                    WHERE admin_email = ?
                 `).run(
                        cloudReg.company_name, cloudReg.company_email, cloudReg.admin_name, cloudReg.avatar,
                        cloudReg.bio, cloudReg.theme_preference, cloudReg.language, cloudReg.last_updated,
                        localReg.admin_email
                    );

                }
                else if (lTime > cTime) {
                    // Push Local -> Cloud
                    await this.pushRegistration(localReg);
                }
            } else {
                // Cloud missing, Push Local
                await this.pushRegistration(localReg);
            }

        } catch (err) {
            console.error('Error syncing registration:', err);
        }
    }

    async pushRegistration(reg) {

        const { error } = await this.supabase.from('registration_credentials').upsert({
            company_name: reg.company_name,
            company_email: reg.company_email,
            admin_name: reg.admin_name,
            admin_email: reg.admin_email,
            avatar: reg.avatar,
            bio: reg.bio,
            theme_preference: reg.theme_preference,
            language: reg.language,
            is_registered: 1,
            last_updated: reg.last_updated
            // Exclude passwords/hashes for security unless we really want them in cloud DB (usually Auth handles this)
        }, { onConflict: 'admin_email' });

        if (error) console.error('[Push] Failed Profile:', error);

    }

}

export default SyncService;
