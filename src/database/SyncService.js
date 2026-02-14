const crypto = require('crypto');

class SyncService {
    constructor(db, supabase) {
        this.db = db;
        this.supabase = supabase;
    }

    async syncAll() {
        try {
            console.log('[Sync] Starting syncAll...');
            const { data: { session }, error: sessionError } = await this.supabase.auth.getSession();
            if (sessionError) {
                console.error('[Sync] Session error:', sessionError);
                return;
            }
            if (!session) {
                console.warn('[Sync] No active session — skipping sync.');
                return;
            }
            console.log('[Sync] Session found for:', session.user?.email);

            const { error: rpcError } = await this.supabase.rpc('setup_schema');
            if (rpcError) console.warn('[Sync] Schema RPC failed:', rpcError.message);
            else console.log('[Sync] Schema RPC succeeded');

            console.log('[Sync] Syncing departments...');
            await this.syncDepartments();
            console.log('[Sync] Syncing employees...');
            await this.syncEmployees();
            console.log('[Sync] Syncing attendance...');
            await this.syncAttendance();
            console.log('[Sync] Syncing payroll...');
            await this.syncPayroll();
            console.log('[Sync] Syncing registration...');
            await this.syncRegistration();
            console.log('[Sync] ✅ All sync complete!');
        } catch (error) {
            console.error('[Sync] Fatal error:', error);
        }
    }

    getNow() {
        return new Date().toISOString();
    }

    // ============= 1. DEPARTMENTS =============
    async syncDepartments() {
        try {
            const { data: cloudDepts, error } = await this.supabase.from('departments').select('*');
            if (error) throw error;

            const cloudMap = new Map(cloudDepts.map(d => [d.name, d]));
            const localDepts = this.db.prepare('SELECT * FROM departments').all();
            const localMap = new Map(localDepts.map(d => [d.name, d]));

            // PULL (Cloud -> Local)
            for (const cDept of cloudDepts) {
                const lDept = localMap.get(cDept.name);
                if (!lDept) {
                    this.db.prepare(`
                        INSERT INTO departments (name, budget, created_at, updated_at, supabase_id)
                        VALUES (?, ?, ?, ?, ?)
                    `).run(cDept.name, cDept.budget, cDept.created_at, cDept.updated_at, cDept.id);
                } else if (new Date(cDept.updated_at) > new Date(lDept.updated_at)) {
                    this.db.prepare(`
                        UPDATE departments SET budget = ?, updated_at = ?, supabase_id = ? WHERE name = ?
                    `).run(cDept.budget, cDept.updated_at, cDept.id, cDept.name);
                }
            }

            // PUSH (Local -> Cloud) using insert/update
            console.log(`[Sync][Depts] Local: ${localDepts.length}, Cloud: ${cloudDepts.length}`);
            for (const lDept of localDepts) {
                const cDept = cloudMap.get(lDept.name);

                if (!cDept) {
                    // INSERT new record to cloud
                    console.log(`[Sync][Depts] Inserting: ${lDept.name}`);
                    const { data, error: pushError } = await this.supabase.from('departments').insert({
                        name: lDept.name,
                        budget: lDept.budget,
                        created_at: lDept.created_at,
                        updated_at: lDept.updated_at
                    }).select();

                    if (pushError) {
                        console.error(`[Sync][Depts] ❌ Insert failed ${lDept.name}:`, JSON.stringify(pushError));
                    } else {
                        console.log(`[Sync][Depts] ✅ Inserted ${lDept.name}`);
                        // Save the cloud ID locally for future reference
                        if (data && data[0]) {
                            this.db.prepare('UPDATE departments SET supabase_id = ? WHERE name = ?')
                                .run(data[0].id, lDept.name);
                        }
                    }
                } else if (new Date(lDept.updated_at) > new Date(cDept.updated_at)) {
                    // UPDATE existing record in cloud
                    console.log(`[Sync][Depts] Updating: ${lDept.name}`);
                    const { error: pushError } = await this.supabase.from('departments')
                        .update({
                            budget: lDept.budget,
                            updated_at: lDept.updated_at
                        })
                        .eq('name', lDept.name);

                    if (pushError) console.error(`[Sync][Depts] ❌ Update failed ${lDept.name}:`, JSON.stringify(pushError));
                    else console.log(`[Sync][Depts] ✅ Updated ${lDept.name}`);
                }
            }
        } catch (err) {
            console.error('[Sync][Depts] Error:', err);
        }
    }

    // ============= 2. EMPLOYEES =============
    async syncEmployees() {
        try {
            const { data: cloudEmps, error } = await this.supabase.from('employees').select('*');
            if (error) throw error;
            const cloudMap = new Map(cloudEmps.map(e => [e.id, e]));

            const localEmps = this.db.prepare('SELECT * FROM employees').all();

            // Ensure local employees have UUIDs
            for (const emp of localEmps) {
                if (!emp.supabase_id) {
                    const newUuid = crypto.randomUUID();
                    this.db.prepare('UPDATE employees SET supabase_id = ? WHERE id = ?').run(newUuid, emp.id);
                    emp.supabase_id = newUuid;
                }
            }
            const localMap = new Map(localEmps.map(e => [e.supabase_id, e]));

            // PULL (Cloud -> Local)
            for (const cEmp of cloudEmps) {
                const lEmp = localMap.get(cEmp.id);
                let localDeptId = null;
                if (cEmp.department_id) {
                    const dept = this.db.prepare('SELECT id FROM departments WHERE supabase_id = ?').get(cEmp.department_id);
                    if (dept) localDeptId = dept.id;
                }

                if (!lEmp) {
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

            // PUSH (Local -> Cloud) using insert/update
            // Fetch valid cloud department IDs to validate FK references
            const { data: currentCloudDepts } = await this.supabase.from('departments').select('id');
            const validCloudDeptIds = new Set((currentCloudDepts || []).map(d => d.id));

            console.log(`[Sync][Emps] Local: ${localEmps.length}, Cloud: ${cloudEmps.length}, Valid cloud depts: ${validCloudDeptIds.size}`);
            for (const lEmp of localEmps) {
                const cEmp = cloudMap.get(lEmp.supabase_id);

                // Resolve cloud department_id and validate it exists
                let cloudDeptId = null;
                if (lEmp.department_id) {
                    const dept = this.db.prepare('SELECT supabase_id FROM departments WHERE id = ?').get(lEmp.department_id);
                    if (dept && dept.supabase_id) {
                        const candidateId = parseInt(dept.supabase_id);
                        if (validCloudDeptIds.has(candidateId)) {
                            cloudDeptId = candidateId;
                        } else {
                            console.warn(`[Sync][Emps] Cloud dept ${candidateId} not found in Supabase, setting to null`);
                        }
                    } else {
                        console.warn(`[Sync][Emps] No cloud dept for local dept ${lEmp.department_id}`);
                    }
                }

                const empPayload = {
                    id: lEmp.supabase_id,
                    company_id: lEmp.company_id,
                    first_name: lEmp.first_name,
                    last_name: lEmp.last_name,
                    email: lEmp.email,
                    phone: lEmp.phone,
                    department_id: cloudDeptId,
                    position: lEmp.position,
                    salary: lEmp.salary,
                    hire_date: lEmp.hire_date,
                    status: lEmp.status,
                    pin_code: lEmp.pin_code,
                    created_at: lEmp.created_at,
                    updated_at: lEmp.updated_at
                };

                if (!cEmp) {
                    // INSERT new employee to cloud
                    console.log(`[Sync][Emps] Inserting: ${lEmp.email} (uuid: ${lEmp.supabase_id})`);
                    const { error: pushError } = await this.supabase.from('employees').insert(empPayload);

                    if (pushError) console.error(`[Sync][Emps] ❌ Insert failed ${lEmp.email}:`, JSON.stringify(pushError));
                    else console.log(`[Sync][Emps] ✅ Inserted ${lEmp.email}`);

                } else if (new Date(lEmp.updated_at) > new Date(cEmp.updated_at)) {
                    // UPDATE existing employee in cloud
                    console.log(`[Sync][Emps] Updating: ${lEmp.email}`);
                    const { id, created_at, ...updatePayload } = empPayload;
                    const { error: pushError } = await this.supabase.from('employees')
                        .update(updatePayload)
                        .eq('id', lEmp.supabase_id);

                    if (pushError) console.error(`[Sync][Emps] ❌ Update failed ${lEmp.email}:`, JSON.stringify(pushError));
                    else console.log(`[Sync][Emps] ✅ Updated ${lEmp.email}`);
                }
            }
        } catch (err) {
            console.error('[Sync][Emps] Error:', err);
        }
    }

    // ============= 3. ATTENDANCE =============
    async syncAttendance() {
        try {
            const { data: cloudAtt, error } = await this.supabase.from('attendance').select('*');
            if (error) throw error;

            const getAttKey = (empId, date) => `${empId}_${date}`;
            const cloudMap = new Map(cloudAtt.map(a => [getAttKey(a.employee_id, a.date), a]));

            const localAtt = this.db.prepare(`
                SELECT a.*, e.supabase_id as emp_uuid
                FROM attendance a
                JOIN employees e ON a.employee_id = e.id
                WHERE e.supabase_id IS NOT NULL
            `).all();
            const localMap = new Map(localAtt.map(a => [getAttKey(a.emp_uuid, a.date), a]));

            // PULL (Cloud -> Local)
            for (const cAtt of cloudAtt) {
                const localEmp = this.db.prepare('SELECT id FROM employees WHERE supabase_id = ?').get(cAtt.employee_id);
                if (!localEmp) continue;

                const key = getAttKey(cAtt.employee_id, cAtt.date);
                const lAtt = localMap.get(key);
                const cTime = cAtt.updated_at ? new Date(cAtt.updated_at) : new Date(0);
                const lTime = lAtt && lAtt.updated_at ? new Date(lAtt.updated_at) : new Date(0);

                if (!lAtt) {
                    this.db.prepare(`
                        INSERT INTO attendance (employee_id, date, check_in, check_out, status, notes, created_at)
                        VALUES (?, ?, ?, ?, ?, ?, ?)
                    `).run(localEmp.id, cAtt.date, cAtt.check_in, cAtt.check_out, cAtt.status, cAtt.notes, cAtt.created_at);
                } else if (cTime > lTime) {
                    this.db.prepare(`
                        UPDATE attendance SET check_in = ?, check_out = ?, status = ?, notes = ? WHERE id = ?
                    `).run(cAtt.check_in, cAtt.check_out, cAtt.status, cAtt.notes, lAtt.id);
                }
            }

            // PUSH (Local -> Cloud) using insert/update
            // Fetch valid cloud employee IDs to validate FK references
            const { data: currentCloudEmps } = await this.supabase.from('employees').select('id');
            const validCloudEmpIds = new Set((currentCloudEmps || []).map(e => e.id));

            console.log(`[Sync][Att] Local: ${localAtt.length}, Cloud: ${cloudAtt.length}, Valid cloud emps: ${validCloudEmpIds.size}`);
            for (const lAtt of localAtt) {
                // Skip if employee doesn't exist in cloud yet
                if (!validCloudEmpIds.has(lAtt.emp_uuid)) {
                    console.warn(`[Sync][Att] Skipping ${lAtt.emp_uuid}_${lAtt.date} — employee not in cloud`);
                    continue;
                }

                const key = getAttKey(lAtt.emp_uuid, lAtt.date);
                const cAtt = cloudMap.get(key);

                const attPayload = {
                    employee_id: lAtt.emp_uuid,
                    date: lAtt.date,
                    check_in: lAtt.check_in,
                    check_out: lAtt.check_out,
                    status: lAtt.status,
                    notes: lAtt.notes,
                    created_at: lAtt.created_at
                };

                if (!cAtt) {
                    // INSERT new attendance to cloud
                    console.log(`[Sync][Att] Inserting: ${key}`);
                    const { error: pushError } = await this.supabase.from('attendance').insert(attPayload);

                    if (pushError) console.error(`[Sync][Att] ❌ Insert failed ${key}:`, JSON.stringify(pushError));
                    else console.log(`[Sync][Att] ✅ Inserted ${key}`);

                } else if (!cAtt.check_out && lAtt.check_out) {
                    // UPDATE: local has check_out but cloud doesn't
                    console.log(`[Sync][Att] Updating checkout: ${key}`);
                    const { error: pushError } = await this.supabase.from('attendance')
                        .update({ check_out: lAtt.check_out, status: lAtt.status })
                        .eq('id', cAtt.id);

                    if (pushError) console.error(`[Sync][Att] ❌ Update failed ${key}:`, JSON.stringify(pushError));
                    else console.log(`[Sync][Att] ✅ Updated ${key}`);
                }
            }
        } catch (err) {
            console.error('[Sync][Att] Error:', err);
        }
    }

    // ============= 4. PAYROLL =============
    async syncPayroll() {
        try {
            const { data: cloudPay, error } = await this.supabase.from('payroll').select('*');
            if (error) throw error;

            const getPayKey = (eid, start, end) => `${eid}_${start}_${end}`;
            const cloudMap = new Map(cloudPay.map(p => [getPayKey(p.employee_id, p.cutoff_start, p.cutoff_end), p]));

            const localPay = this.db.prepare(`
                SELECT p.*, e.supabase_id as emp_uuid
                FROM payroll p
                JOIN employees e ON p.employee_id = e.id
                WHERE e.supabase_id IS NOT NULL
            `).all();
            const localMap = new Map(localPay.map(p => [getPayKey(p.emp_uuid, p.cutoff_start, p.cutoff_end), p]));

            // PULL (Cloud -> Local)
            for (const cPay of cloudPay) {
                const localEmp = this.db.prepare('SELECT id FROM employees WHERE supabase_id = ?').get(cPay.employee_id);
                if (!localEmp) continue;

                const key = getPayKey(cPay.employee_id, cPay.cutoff_start, cPay.cutoff_end);
                const lPay = localMap.get(key);

                if (!lPay) {
                    this.db.prepare(`
                        INSERT INTO payroll (
                            employee_id, cutoff_start, cutoff_end, basic_salary, allowances, deductions,
                            net_salary, status, payment_date, cutoff_type, working_days, days_present,
                            daily_rate, breakdown, created_at
                        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                    `).run(
                        localEmp.id, cPay.cutoff_start, cPay.cutoff_end, cPay.gross_pay, 0,
                        JSON.stringify(cPay.deductions || {}),
                        cPay.net_pay, cPay.status, cPay.payment_date,
                        'Full Month', 24, 24, 0, null, cPay.created_at
                    );
                } else if (cPay.status !== lPay.status && cPay.updated_at > (lPay.updated_at || lPay.created_at)) {
                    this.db.prepare('UPDATE payroll SET status = ?, payment_date = ? WHERE id = ?')
                        .run(cPay.status, cPay.payment_date, lPay.id);
                }
            }

            // PUSH (Local -> Cloud) using insert/update
            // Fetch valid cloud employee IDs to validate FK references
            const { data: currentCloudEmps } = await this.supabase.from('employees').select('id');
            const validCloudEmpIds = new Set((currentCloudEmps || []).map(e => e.id));

            console.log(`[Sync][Pay] Local: ${localPay.length}, Cloud: ${cloudPay.length}, Valid cloud emps: ${validCloudEmpIds.size}`);
            for (const lPay of localPay) {
                // Skip if employee doesn't exist in cloud yet
                if (!validCloudEmpIds.has(lPay.emp_uuid)) {
                    console.warn(`[Sync][Pay] Skipping ${lPay.emp_uuid} — employee not in cloud`);
                    continue;
                }

                const key = getPayKey(lPay.emp_uuid, lPay.cutoff_start, lPay.cutoff_end);
                const cPay = cloudMap.get(key);

                const payPayload = {
                    employee_id: lPay.emp_uuid,
                    cutoff_start: lPay.cutoff_start,
                    cutoff_end: lPay.cutoff_end,
                    gross_pay: lPay.basic_salary,       // local basic_salary -> cloud gross_pay
                    net_pay: lPay.net_salary,            // local net_salary -> cloud net_pay
                    deductions: lPay.breakdown ? JSON.parse(lPay.breakdown) : {},
                    status: lPay.status,
                    payment_date: lPay.payment_date,
                    created_at: lPay.created_at
                };

                if (!cPay) {
                    // INSERT new payroll to cloud
                    console.log(`[Sync][Pay] Inserting: ${key}`);
                    const { error: pushError } = await this.supabase.from('payroll').insert(payPayload);

                    if (pushError) console.error(`[Sync][Pay] ❌ Insert failed ${key}:`, JSON.stringify(pushError));
                    else console.log(`[Sync][Pay] ✅ Inserted ${key}`);

                } else if (lPay.status !== cPay.status) {
                    // UPDATE status change to cloud
                    console.log(`[Sync][Pay] Updating status: ${key} (${cPay.status} -> ${lPay.status})`);
                    const { error: pushError } = await this.supabase.from('payroll')
                        .update({ status: lPay.status, payment_date: lPay.payment_date })
                        .eq('id', cPay.id);

                    if (pushError) console.error(`[Sync][Pay] ❌ Update failed ${key}:`, JSON.stringify(pushError));
                    else console.log(`[Sync][Pay] ✅ Updated ${key}`);
                }
            }
        } catch (err) {
            console.error('[Sync][Pay] Error:', err);
        }
    }

    // ============= 5. REGISTRATION =============
    async syncRegistration() {
        try {
            const localReg = this.db.prepare('SELECT * FROM registration_credentials WHERE is_registered = 1').get();
            if (!localReg) return;

            const { data: cloudRegs, error } = await this.supabase.from('registration_credentials').select('*').eq('admin_email', localReg.admin_email);
            let cloudReg = cloudRegs && cloudRegs.length > 0 ? cloudRegs[0] : null;

            if (error && error.code !== '42P01') throw error;

            if (cloudReg) {
                const cTime = new Date(cloudReg.last_updated);
                const lTime = new Date(localReg.last_updated);

                if (cTime > lTime) {
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
                } else if (lTime > cTime) {
                    await this.pushRegistration(localReg, false);
                }
            } else {
                await this.pushRegistration(localReg, true);
            }
        } catch (err) {
            console.error('[Sync][Reg] Error:', err);
        }
    }

    async pushRegistration(reg, isNew) {
        const payload = {
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
        };

        let error;
        if (isNew) {
            console.log(`[Sync][Reg] Inserting profile for: ${reg.admin_email}`);
            ({ error } = await this.supabase.from('registration_credentials').insert(payload));
        } else {
            console.log(`[Sync][Reg] Updating profile for: ${reg.admin_email}`);
            ({ error } = await this.supabase.from('registration_credentials')
                .update(payload)
                .eq('admin_email', reg.admin_email));
        }

        if (error) console.error(`[Sync][Reg] ❌ Push failed:`, JSON.stringify(error));
        else console.log(`[Sync][Reg] ✅ Push succeeded for ${reg.admin_email}`);
    }
}

export default SyncService;
