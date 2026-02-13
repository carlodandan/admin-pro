const Database = require('better-sqlite3');
const fs = require('fs');
const path = require('path');

class DatabaseService {
  constructor() {
    const userDataPath = require('electron').app.getPath('userData');
    this.dbPath = path.join(userDataPath, 'company-admin.sqlite');
    this.db = new Database(this.dbPath);
    this.db.pragma('journal_mode = WAL')
    this.db.pragma('foreign_keys = ON');
    this.initializeDatabase();
  }

  getManilaDate() {
    return new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Asia/Manila',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit'
    }).format(new Date());
  }

  getManilaTime() {
    return new Intl.DateTimeFormat('en-GB', {
      timeZone: 'Asia/Manila',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false
    }).format(new Date());
  }

  initializeDatabase() {
    this.createTables();
    this.migrateDatabase();
    this.createUsersTable();
    this.initializeDefaultUser();
    this.migrateEmployeesTable();
  }

  createTables() {
    // Departments table
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS departments (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL UNIQUE,
        budget REAL NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Employees table
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS employees (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        company_id TEXT UNIQUE,
        first_name TEXT NOT NULL,
        last_name TEXT NOT NULL,
        email TEXT NOT NULL UNIQUE,
        phone TEXT,
        position TEXT NOT NULL,
        department_id INTEGER,
        salary REAL NOT NULL,
        hire_date DATE NOT NULL,
        status TEXT NOT NULL DEFAULT 'Active',
        pin_code TEXT DEFAULT '1234',
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (department_id) REFERENCES departments(id) ON DELETE SET NULL
      )
    `);

    // Attendance table
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS attendance (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        employee_id INTEGER NOT NULL,
        date DATE NOT NULL,
        check_in TIME,
        check_out TIME,
        status TEXT NOT NULL DEFAULT 'Present',
        notes TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (employee_id) REFERENCES employees(id) ON DELETE CASCADE,
        UNIQUE(employee_id, date)
      )
    `);

    // Payroll table
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS payroll (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        employee_id INTEGER NOT NULL,
        period_start DATE NOT NULL,
        period_end DATE NOT NULL,
        basic_salary REAL NOT NULL,
        allowances REAL DEFAULT 0,
        deductions REAL DEFAULT 0,
        net_salary REAL NOT NULL,
        status TEXT NOT NULL DEFAULT 'Pending',
        payment_date DATE,
        cutoff_type TEXT DEFAULT 'Full Month',
        working_days INTEGER DEFAULT 24,
        days_present INTEGER DEFAULT 24,
        daily_rate REAL DEFAULT 0,
        breakdown TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (employee_id) REFERENCES employees(id) ON DELETE CASCADE,
        UNIQUE(employee_id, period_start, period_end)
      )
    `);

    // Create indexes for better performance
    this.db.exec(`
      CREATE INDEX IF NOT EXISTS idx_employees_department_id ON employees(department_id);
      CREATE INDEX IF NOT EXISTS idx_employees_status ON employees(status);
      CREATE INDEX IF NOT EXISTS idx_attendance_date ON attendance(date);
      CREATE INDEX IF NOT EXISTS idx_attendance_employee_date ON attendance(employee_id, date);
      CREATE INDEX IF NOT EXISTS idx_payroll_period ON payroll(period_start, period_end);
    `);
  }

  createUsersTable() {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        email TEXT NOT NULL UNIQUE,
        display_name TEXT NOT NULL,
        avatar TEXT,
        phone TEXT,
        position TEXT,
        bio TEXT,
        theme_preference TEXT DEFAULT 'light',
        language TEXT DEFAULT 'en',
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);
  }

  // Initialize default admin user - Only one user allowed
  initializeDefaultUser() {
    try {
      // First, check if any user exists
      const checkStmt = this.db.prepare('SELECT COUNT(*) as count FROM users');
      const result = checkStmt.get();

      // Only create default user if the table is completely empty
      if (result.count === 0) {
        const stmt = this.db.prepare(`
          INSERT INTO users (email, display_name, position, bio)
          VALUES (?, ?, ?, ?)
        `);

        stmt.run(
          'adminpro@company.com',
          'Admin Pro',
          'System Administrator',
          'System administrator with full access to all features.'
        );
        console.log('Default admin user created');
      }
    } catch (error) {
      console.error('Error initializing default user:', error);
    }
  }

  // Save/Update user profile - Always overwrites the existing single user
  saveUserProfile(userData) {
    try {
      // Get the current user count
      const countStmt = this.db.prepare('SELECT COUNT(*) as count FROM users');
      const countResult = countStmt.get();

      if (countResult.count === 0) {
        // No user exists, insert new user
        const insertStmt = this.db.prepare(`
          INSERT INTO users (
            email, display_name, avatar, phone, position, 
            bio, theme_preference, language
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        `);

        const info = insertStmt.run(
          userData.email || 'adminpro@company.com',
          userData.displayName || 'Admin Pro',
          userData.avatar || null,
          userData.phone || null,
          userData.position || 'System Administrator',
          userData.bio || 'System administrator with full access to all features.',
          userData.themePreference || 'light',
          userData.language || 'en'
        );

        return { id: info.lastInsertRowid, changes: info.changes };
      } else {
        // Always update the first (and only) user
        // If there are multiple users (shouldn't happen), delete all but the first
        if (countResult.count > 1) {
          console.warn('Multiple users found, cleaning up to maintain single user policy');
          this.cleanupMultipleUsers();
        }

        // Get the first user's ID
        const firstUserStmt = this.db.prepare('SELECT id FROM users ORDER BY id LIMIT 1');
        const firstUser = firstUserStmt.get();

        // Update the single user record
        const updateStmt = this.db.prepare(`
          UPDATE users SET
            email = ?,
            display_name = ?,
            avatar = ?,
            phone = ?,
            position = ?,
            bio = ?,
            theme_preference = ?,
            language = ?,
            updated_at = CURRENT_TIMESTAMP
          WHERE id = ?
        `);

        const info = updateStmt.run(
          userData.email || 'adminpro@company.com',
          userData.displayName || 'Admin Pro',
          userData.avatar || null,
          userData.phone || null,
          userData.position || 'System Administrator',
          userData.bio || 'System administrator with full access to all features.',
          userData.themePreference || 'light',
          userData.language || 'en',
          firstUser.id
        );

        return { id: firstUser.id, changes: info.changes };
      }
    } catch (error) {
      console.error('Error saving user profile:', error);
      throw error;
    }
  }

  // Helper method to ensure only one user exists
  cleanupMultipleUsers() {
    try {
      // Get the first user
      const firstUserStmt = this.db.prepare('SELECT * FROM users ORDER BY id LIMIT 1');
      const firstUser = firstUserStmt.get();

      if (firstUser) {
        // Delete all other users
        const deleteStmt = this.db.prepare('DELETE FROM users WHERE id != ?');
        deleteStmt.run(firstUser.id);
        console.log('Cleaned up multiple users, keeping only:', firstUser.email);
      }
    } catch (error) {
      console.error('Error cleaning up multiple users:', error);
    }
  }

  // Get user profile - Always returns the single user
  getUserProfile() {
    try {
      const stmt = this.db.prepare(`
        SELECT * FROM users 
        ORDER BY id LIMIT 1
      `);
      return stmt.get();
    } catch (error) {
      console.error('Error getting user profile:', error);
      return null;
    }
  }

  // Update user avatar for the single user
  updateUserAvatar(avatarData) {
    try {
      const user = this.getUserProfile();
      if (!user) {
        throw new Error('No user found to update avatar');
      }

      const stmt = this.db.prepare(`
        UPDATE users 
        SET avatar = ?, updated_at = CURRENT_TIMESTAMP 
        WHERE id = ?
      `);

      const info = stmt.run(avatarData, user.id);
      return { changes: info.changes };
    } catch (error) {
      console.error('Error updating user avatar:', error);
      throw error;
    }
  }

  // Get all user settings (including preferences)
  getUserSettings() {
    try {
      const stmt = this.db.prepare(`
        SELECT 
          email,
          display_name as displayName,
          avatar,
          phone,
          position,
          bio,
          theme_preference as themePreference,
          language,
          created_at as createdAt,
          updated_at as updatedAt
        FROM users 
        ORDER BY id LIMIT 1
      `);

      return stmt.get();
    } catch (error) {
      console.error('Error getting user settings:', error);
      return null;
    }
  }

  // Delete all users (for reset functionality)
  deleteAllUsers() {
    try {
      const stmt = this.db.prepare('DELETE FROM users');
      const info = stmt.run();
      return { changes: info.changes };
    } catch (error) {
      console.error('Error deleting all users:', error);
      throw error;
    }
  }

  // Get the current user count (should always be 0 or 1)
  getUserCount() {
    try {
      const stmt = this.db.prepare('SELECT COUNT(*) as count FROM users');
      return stmt.get().count;
    } catch (error) {
      console.error('Error getting user count:', error);
      return 0;
    }
  }

  // Employee methods (unchanged from your original code)
  getAllEmployees() {
    const stmt = this.db.prepare(`
      SELECT 
        e.*,
        d.name as department_name
      FROM employees e
      LEFT JOIN departments d ON e.department_id = d.id
      ORDER BY e.created_at DESC
    `);
    return stmt.all();
  }

  getEmployeeById(id) {
    const stmt = this.db.prepare(`
      SELECT 
        e.*,
        d.name as department_name
      FROM employees e
      LEFT JOIN departments d ON e.department_id = d.id
      WHERE e.id = ?
    `);
    return stmt.get(id);
  }

  createEmployee(employee) {
    const stmt = this.db.prepare(`
      INSERT INTO employees (
        company_id, first_name, last_name, email, phone, 
        position, department_id, salary, hire_date, status
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    try {
      const info = stmt.run(
        employee.company_id,
        employee.first_name,
        employee.last_name,
        employee.email,
        employee.phone,
        employee.position,
        employee.department_id,
        employee.salary,
        employee.hire_date,
        employee.status || 'Active'
      );
      return { id: info.lastInsertRowid, changes: info.changes };
    } catch (error) {
      console.error('Error creating employee:', error);
      throw error;
    }
  }

  updateEmployee(id, employeeData) {
    const fields = [];
    const values = [];

    // Build dynamic update query
    Object.entries(employeeData).forEach(([key, value]) => {
      if (value !== undefined && key !== 'id') {
        fields.push(`${key} = ?`);
        values.push(value);
      }
    });

    // Add updated_at timestamp
    fields.push('updated_at = CURRENT_TIMESTAMP');

    if (fields.length === 0) {
      return { changes: 0 };
    }

    const sql = `UPDATE employees SET ${fields.join(', ')} WHERE id = ?`;
    values.push(id);

    const stmt = this.db.prepare(sql);
    const info = stmt.run(...values);
    return { changes: info.changes };
  }

  deleteEmployee(id) {
    const stmt = this.db.prepare('DELETE FROM employees WHERE id = ?');
    const info = stmt.run(id);
    return { changes: info.changes };
  }

  migrateEmployeesTable() {
    try {
      const tableInfo = this.db.pragma('table_info(employees)');
      const hasPinCode = tableInfo.some(column => column.name === 'pin_code');

      if (!hasPinCode) {
        console.log('Migrating employees table: adding pin_code column...');
        this.db.exec("ALTER TABLE employees ADD COLUMN pin_code TEXT DEFAULT '1234'");
        console.log('Migration successful: pin_code column added.');
      }
    } catch (error) {
      console.error('Error migrating employees table:', error);
    }
  }

  verifyEmployeePin(employeeId, pin) {
    try {
      const stmt = this.db.prepare('SELECT * FROM employees WHERE (id = ? OR company_id = ?) AND pin_code = ?');
      const employee = stmt.get(employeeId, employeeId, pin);

      if (!employee) return { success: false, message: 'Invalid Employee ID or PIN' };
      if (employee.status !== 'Active') return { success: false, message: 'Employee is not active' };

      return { success: true, employee };
    } catch (error) {
      console.error('Error verifying PIN:', error);
      return { success: false, message: 'System error during verification' };
    }
  }

  updateEmployeePin(employeeId, newPin) {
    try {
      const stmt = this.db.prepare('UPDATE employees SET pin_code = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?');
      const info = stmt.run(newPin, employeeId);

      if (info.changes === 0) return { success: false, message: 'Employee not found' };

      return { success: true, message: 'PIN updated successfully' };
    } catch (error) {
      console.error('Error updating PIN:', error);
      return { success: false, message: 'Failed to update PIN' };
    }
  }

  getLatestAttendance(employeeId) {
    try {
      const today = this.getManilaDate();
      const stmt = this.db.prepare(`
        SELECT * FROM attendance 
        WHERE employee_id = ? AND date = ?
      `);
      return stmt.get(employeeId, today);
    } catch (error) {
      console.error('Error getting latest attendance:', error);
      return null;
    }
  }

  // Department methods
  getAllDepartments() {
    const stmt = this.db.prepare(`
      SELECT 
        d.*,
        COUNT(e.id) as employee_count,
        COALESCE(AVG(e.salary), 0) as avg_salary
      FROM departments d
      LEFT JOIN employees e ON d.id = e.department_id AND e.status = 'Active'
      GROUP BY d.id
      ORDER BY d.name
    `);
    return stmt.all();
  }

  createDepartment(department) {
    const stmt = this.db.prepare(`
      INSERT INTO departments (name, budget) 
      VALUES (?, ?)
    `);

    try {
      const info = stmt.run(department.name, department.budget);
      return { id: info.lastInsertRowid, changes: info.changes };
    } catch (error) {
      console.error('Error creating department:', error);
      throw error;
    }
  }

  deleteDepartment(id) {
    try {
      // First check if there are any employees in this department
      const checkStmt = this.db.prepare('SELECT COUNT(*) as count FROM employees WHERE department_id = ?');
      const result = checkStmt.get(id);

      if (result.count > 0) {
        throw new Error('Cannot delete department that has employees. Please reassign or delete employees first.');
      }

      const stmt = this.db.prepare('DELETE FROM departments WHERE id = ?');
      const info = stmt.run(id);
      return { changes: info.changes };
    } catch (error) {
      console.error('Error deleting department:', error);
      throw error;
    }
  }

  // Attendance methods
  getTodayAttendance() {
    const today = this.getManilaDate();
    const stmt = this.db.prepare(`
      SELECT 
        a.*,
        e.first_name || ' ' || e.last_name as employee_name,
        e.position,
        d.name as department_name
      FROM attendance a
      INNER JOIN employees e ON a.employee_id = e.id
      LEFT JOIN departments d ON e.department_id = d.id
      WHERE date(a.date) = date(?)
      ORDER BY a.check_in DESC
    `);
    return stmt.all(today);
  }

  recordAttendance(attendance) {
    const stmt = this.db.prepare(`
      INSERT INTO attendance 
      (employee_id, date, check_in, check_out, status, notes)
      VALUES (?, ?, ?, ?, ?, ?)
      ON CONFLICT(employee_id, date) DO UPDATE SET
        check_in = COALESCE(excluded.check_in, attendance.check_in),
        check_out = COALESCE(excluded.check_out, attendance.check_out),
        status = COALESCE(excluded.status, attendance.status),
        notes = COALESCE(excluded.notes, attendance.notes)
    `);

    try {
      const info = stmt.run(
        attendance.employee_id,
        attendance.date,
        attendance.check_in || null,
        attendance.check_out || null,
        attendance.status || 'Present',
        attendance.notes || null
      );
      return { id: info.lastInsertRowid, changes: info.changes };
    } catch (error) {
      console.error('Error recording attendance:', error);
      throw error;
    }
  }

  getWeeklyAttendance() {
    try {
      const today = new Date(new Intl.DateTimeFormat('en-US', { timeZone: 'Asia/Manila' }).format(new Date()));
      const startDate = new Date(today);
      startDate.setDate(today.getDate() - 6); // Last 7 days including today

      const startDateStr = startDate.toISOString().split('T')[0];
      const endDateStr = today.toISOString().split('T')[0];

      const stmt = this.db.prepare(`
        SELECT 
          date(a.date) as date,
          strftime('%w', a.date) as day_of_week,
          COUNT(CASE WHEN a.status = 'Present' THEN 1 END) as present,
          COUNT(CASE WHEN a.status = 'Absent' THEN 1 END) as absent,
          COUNT(CASE WHEN a.status = 'Late' THEN 1 END) as late,
          COUNT(CASE WHEN a.status = 'On Leave' THEN 1 END) as leave,
          COUNT(*) as total
        FROM attendance a
        WHERE date(a.date) BETWEEN date(?) AND date(?)
        GROUP BY date(a.date)
        ORDER BY date(a.date) ASC
      `);

      const rows = stmt.all(startDateStr, endDateStr);

      // Create an array for all 7 days
      const weeklyData = [];
      const currentDate = new Date(startDate);

      while (currentDate <= today) {
        const dateStr = currentDate.toISOString().split('T')[0];
        const dayName = currentDate.toLocaleDateString('en-US', { weekday: 'short' });
        const dayNumber = currentDate.getDate();

        // Find data for this date
        const dayData = rows.find(row => row.date === dateStr);

        weeklyData.push({
          day: dayName,
          date: dateStr,
          present: dayData ? dayData.present : 0,
          absent: dayData ? dayData.absent : 0,
          late: dayData ? dayData.late : 0,
          leave: dayData ? dayData.leave : 0,
          total: dayData ? dayData.total : 0
        });

        currentDate.setDate(currentDate.getDate() + 1);
      }

      return weeklyData;
    } catch (error) {
      console.error('Error getting weekly attendance:', error);
      throw error;
    }
  }

  getTodayAttendanceSummary() {
    try {
      const today = this.getManilaDate();

      const stmt = this.db.prepare(`
        SELECT 
          COUNT(CASE WHEN a.status = 'Present' THEN 1 END) as present,
          COUNT(CASE WHEN a.status = 'Absent' THEN 1 END) as absent,
          COUNT(CASE WHEN a.status = 'Late' THEN 1 END) as late,
          COUNT(CASE WHEN a.status = 'On Leave' THEN 1 END) as leave,
          COUNT(*) as total
        FROM attendance a
        WHERE date(a.date) = date(?)
      `);

      const result = stmt.get(today);

      if (result && result.total > 0) {
        const rate = ((result.present / result.total) * 100).toFixed(1);
        return {
          presentToday: result.present,
          absentToday: result.absent,
          lateToday: result.late,
          leaveToday: result.leave,
          attendanceRate: `${rate}%`
        };
      }

      // Return defaults if no data
      return {
        presentToday: 0,
        absentToday: 0,
        lateToday: 0,
        leaveToday: 0,
        attendanceRate: '0%'
      };
    } catch (error) {
      console.error('Error getting today\'s attendance summary:', error);
      return {
        presentToday: 0,
        absentToday: 0,
        lateToday: 0,
        leaveToday: 0,
        attendanceRate: '0%'
      };
    }
  }

  getMonthlyAttendanceReport(year, month) {
    try {
      // Calculate start and end dates for the month
      const startDate = `${year}-${month.toString().padStart(2, '0')}-01`;
      const endDate = `${year}-${month.toString().padStart(2, '0')}-31`;

      const stmt = this.db.prepare(`
        SELECT 
          e.id as employee_id,
          e.first_name || ' ' || e.last_name as employee_name,
          d.name as department_name,
          COUNT(CASE WHEN a.status = 'Present' THEN 1 END) as present_days,
          COUNT(CASE WHEN a.status = 'Absent' THEN 1 END) as absent_days,
          COUNT(CASE WHEN a.status = 'Late' THEN 1 END) as late_days,
          COUNT(CASE WHEN a.status = 'On Leave' THEN 1 END) as leave_days,
          COUNT(a.id) as total_recorded_days
        FROM employees e
        LEFT JOIN departments d ON e.department_id = d.id
        LEFT JOIN attendance a ON e.id = a.employee_id 
          AND strftime('%Y-%m', a.date) = ?
        WHERE e.status = 'Active'
        GROUP BY e.id
        ORDER BY e.first_name, e.last_name
      `);

      return stmt.all(`${year}-${month.toString().padStart(2, '0')}`);
    } catch (error) {
      console.error('Error getting monthly attendance report:', error);
      throw error;
    }
  }

  // Payroll methods
  processPayroll(payrollData) {
    const stmt = this.db.prepare(`
      INSERT INTO payroll (
        employee_id, period_start, period_end, basic_salary,
        allowances, deductions, net_salary, status, payment_date,
        cutoff_type, working_days, days_present, daily_rate, breakdown
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    const info = stmt.run(
      payrollData.employee_id,
      payrollData.period_start,
      payrollData.period_end,
      payrollData.basic_salary,
      payrollData.allowances || 0,
      payrollData.deductions || 0,
      payrollData.net_salary,
      payrollData.status || 'Pending',
      payrollData.payment_date || null,
      payrollData.cutoff_type || 'Full Month',
      payrollData.working_days || 24,
      payrollData.days_present || 24,
      payrollData.daily_rate || (payrollData.basic_salary / 24),
      JSON.stringify(payrollData.breakdown || {})
    );

    return { id: info.lastInsertRowid, changes: info.changes };
  }

  getAllPayroll() {
    const stmt = this.db.prepare(`
      SELECT 
        p.*,
        e.first_name || ' ' || e.last_name as employee_name,
        e.position,
        e.salary as monthly_salary,
        d.name as department_name
      FROM payroll p
      INNER JOIN employees e ON p.employee_id = e.id
      LEFT JOIN departments d ON e.department_id = d.id
      ORDER BY p.period_end DESC
    `);
    return stmt.all();
  }

  getPayrollSummary(year, month) {
    try {
      const startDate = `${year}-${month.toString().padStart(2, '0')}-01`;
      const endDate = `${year}-${month.toString().padStart(2, '0')}-31`;

      const stmt = this.db.prepare(`
        SELECT 
          p.*,
          e.first_name || ' ' || e.last_name as employee_name,
          e.position,
          e.salary as basic_salary,
          d.name as department_name
        FROM payroll p
        INNER JOIN employees e ON p.employee_id = e.id
        LEFT JOIN departments d ON e.department_id = d.id
        WHERE p.period_start >= date(?) AND p.period_end <= date(?)
        ORDER BY p.period_end DESC, e.last_name
      `);

      return stmt.all(startDate, endDate);
    } catch (error) {
      console.error('Error getting payroll summary:', error);
      throw error;
    }
  }

  markPayrollAsPaid(payrollId, paymentDate = null) {
    try {
      const date = paymentDate || this.getManilaDate();
      const stmt = this.db.prepare(`
        UPDATE payroll 
        SET status = 'Paid', payment_date = ?
        WHERE id = ?
      `);

      const info = stmt.run(date, payrollId);
      return { changes: info.changes };
    } catch (error) {
      console.error('Error marking payroll as paid:', error);
      throw error;
    }
  }

  getPayrollByEmployeeAndPeriod(employeeId, year, month) {
    try {
      const startDate = `${year}-${month.toString().padStart(2, '0')}-01`;
      const endDate = `${year}-${month.toString().padStart(2, '0')}-31`;

      const stmt = this.db.prepare(`
        SELECT * FROM payroll 
        WHERE employee_id = ? 
          AND period_start >= date(?) 
          AND period_end <= date(?)
      `);

      return stmt.get(employeeId, startDate, endDate);
    } catch (error) {
      console.error('Error getting payroll by employee and period:', error);
      throw error;
    }
  }

  getAttendanceForCutoff(year, month, isFirstHalf) {
    try {
      const startDate = `${year}-${month.toString().padStart(2, '0')}-${isFirstHalf ? '01' : '11'}`;
      const endDate = `${year}-${month.toString().padStart(2, '0')}-${isFirstHalf ? '10' : '25'}`;

      const stmt = this.db.prepare(`
        SELECT 
          e.id as employee_id,
          e.first_name || ' ' || e.last_name as employee_name,
          e.salary as monthly_salary,
          COUNT(CASE WHEN a.status = 'Present' THEN 1 END) as days_present,
          COUNT(CASE WHEN a.status = 'Absent' THEN 1 END) as days_absent,
          COUNT(CASE WHEN a.status = 'Late' THEN 1 END) as days_late,
          COUNT(CASE WHEN a.status = 'On Leave' THEN 1 END) as days_leave,
          COUNT(*) as total_recorded_days
        FROM employees e
        LEFT JOIN attendance a ON e.id = a.employee_id 
          AND date(a.date) BETWEEN date(?) AND date(?)
        WHERE e.status = 'Active'
        GROUP BY e.id
        ORDER BY e.first_name, e.last_name
      `);

      return stmt.all(startDate, endDate);
    } catch (error) {
      console.error('Error getting attendance for cutoff:', error);
      throw error;
    }
  }

  processBiMonthlyPayroll(payrollData) {
    try {
      const stmt = this.db.prepare(`
        INSERT INTO payroll (
          employee_id, period_start, period_end, basic_salary,
          allowances, deductions, net_salary, status, payment_date,
          cutoff_type, working_days, days_present, daily_rate, breakdown
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);

      const info = stmt.run(
        payrollData.employee_id,
        payrollData.period_start,
        payrollData.period_end,
        payrollData.basic_salary,
        payrollData.allowances || 0,
        payrollData.deductions || 0,
        payrollData.net_salary,
        payrollData.status || 'Pending',
        payrollData.payment_date || null,
        payrollData.cutoff_type || 'First Half',
        payrollData.working_days || 12,
        payrollData.days_present || 12,
        payrollData.daily_rate || 0,
        JSON.stringify(payrollData.breakdown || {})
      );

      return { id: info.lastInsertRowid, changes: info.changes };
    } catch (error) {
      console.error('Error processing bi-monthly payroll:', error);
      throw error;
    }
  }

  getPayrollByCutoff(year, month, cutoffType) {
    try {
      const startDate = `${year}-${month.toString().padStart(2, '0')}-${cutoffType === 'First Half' ? '01' : '11'}`;
      const endDate = `${year}-${month.toString().padStart(2, '0')}-${cutoffType === 'First Half' ? '10' : '25'}`;

      const stmt = this.db.prepare(`
        SELECT 
          p.*,
          e.first_name || ' ' || e.last_name as employee_name,
          e.position,
          e.salary as monthly_salary,
          d.name as department_name
        FROM payroll p
        INNER JOIN employees e ON p.employee_id = e.id
        LEFT JOIN departments d ON e.department_id = d.id
        WHERE p.period_start = date(?) AND p.period_end = date(?)
        ORDER BY e.last_name
      `);

      const result = stmt.all(startDate, endDate);

      // Add cutoff_type to results for backward compatibility
      return result.map(row => ({
        ...row,
        cutoff_type: row.cutoff_type || cutoffType
      }));

    } catch (error) {
      console.error('Error getting payroll by cutoff:', error);
      // Fallback to query without cutoff_type column
      const startDate = `${year}-${month.toString().padStart(2, '0')}-${cutoffType === 'First Half' ? '01' : '11'}`;
      const endDate = `${year}-${month.toString().padStart(2, '0')}-${cutoffType === 'First Half' ? '10' : '25'}`;

      const stmt = this.db.prepare(`
        SELECT 
          p.*,
          e.first_name || ' ' || e.last_name as employee_name,
          e.position,
          e.salary as monthly_salary,
          d.name as department_name
        FROM payroll p
        INNER JOIN employees e ON p.employee_id = e.id
        LEFT JOIN departments d ON e.department_id = d.id
        WHERE p.period_start = date(?) AND p.period_end = date(?)
        ORDER BY e.last_name
      `);

      const result = stmt.all(startDate, endDate);

      // Add cutoff_type for backward compatibility
      return result.map(row => ({
        ...row,
        cutoff_type: cutoffType
      }));
    }
  }

  migrateDatabase() {
    try {
      // Check if new columns exist, if not add them
      const columns = this.db.prepare(`
        PRAGMA table_info(payroll)
      `).all();

      const columnNames = columns.map(col => col.name);

      // Add cutoff_type if it doesn't exist
      if (!columnNames.includes('cutoff_type')) {
        this.db.exec(`ALTER TABLE payroll ADD COLUMN cutoff_type TEXT DEFAULT 'Full Month'`);
        console.log('Added cutoff_type column to payroll table');
      }

      // Add working_days if it doesn't exist
      if (!columnNames.includes('working_days')) {
        this.db.exec(`ALTER TABLE payroll ADD COLUMN working_days INTEGER DEFAULT 24`);
        console.log('Added working_days column to payroll table');
      }

      // Add days_present if it doesn't exist
      if (!columnNames.includes('days_present')) {
        this.db.exec(`ALTER TABLE payroll ADD COLUMN days_present INTEGER DEFAULT 24`);
        console.log('Added days_present column to payroll table');
      }

      // Add daily_rate if it doesn't exist
      if (!columnNames.includes('daily_rate')) {
        this.db.exec(`ALTER TABLE payroll ADD COLUMN daily_rate REAL DEFAULT 0`);
        console.log('Added daily_rate column to payroll table');
      }

      // Add breakdown if it doesn't exist
      if (!columnNames.includes('breakdown')) {
        this.db.exec(`ALTER TABLE payroll ADD COLUMN breakdown TEXT`);
        console.log('Added breakdown column to payroll table');
      }

      // Check and migrate users table
      const usersColumns = this.db.prepare(`
        PRAGMA table_info(users)
      `).all();

      const usersColumnNames = usersColumns.map(col => col.name);

      // Add display_name if it doesn't exist
      if (!usersColumnNames.includes('display_name')) {
        this.db.exec(`ALTER TABLE users ADD COLUMN display_name TEXT DEFAULT ''`);
        console.log('Added display_name column to users table');
      }

      // Add avatar if it doesn't exist
      if (!usersColumnNames.includes('avatar')) {
        this.db.exec(`ALTER TABLE users ADD COLUMN avatar TEXT`);
        console.log('Added avatar column to users table');
      }

      // Add phone if it doesn't exist
      if (!usersColumnNames.includes('phone')) {
        this.db.exec(`ALTER TABLE users ADD COLUMN phone TEXT`);
        console.log('Added phone column to users table');
      }

      // Add position if it doesn't exist
      if (!usersColumnNames.includes('position')) {
        this.db.exec(`ALTER TABLE users ADD COLUMN position TEXT`);
        console.log('Added position column to users table');
      }

      // Add bio if it doesn't exist
      if (!usersColumnNames.includes('bio')) {
        this.db.exec(`ALTER TABLE users ADD COLUMN bio TEXT`);
        console.log('Added bio column to users table');
      }

      // Add theme_preference if it doesn't exist
      if (!usersColumnNames.includes('theme_preference')) {
        this.db.exec(`ALTER TABLE users ADD COLUMN theme_preference TEXT DEFAULT 'light'`);
        console.log('Added theme_preference column to users table');
      }

      // Add language if it doesn't exist
      if (!usersColumnNames.includes('language')) {
        this.db.exec(`ALTER TABLE users ADD COLUMN language TEXT DEFAULT 'en'`);
        console.log('Added language column to users table');
      }

      console.log('Database migration completed successfully');
    } catch (error) {
      console.error('Error during database migration:', error);
    }
  }

  // Generic query methods for IPC
  query(sql, params = []) {
    try {
      const stmt = this.db.prepare(sql);
      return stmt.all(...params);
    } catch (error) {
      console.error('Query error:', error);
      throw error;
    }
  }

  execute(sql, params = []) {
    try {
      const stmt = this.db.prepare(sql);
      const result = stmt.run(...params);
      return { lastInsertRowid: result.lastInsertRowid, changes: result.changes };
    } catch (error) {
      console.error('Execute error:', error);
      throw error;
    }
  }

  // Close database connection
  close() {
    if (this.db) {
      this.db.close();
    }
  }
}

export default DatabaseService;