const Database = require('better-sqlite3');
const fs = require('fs');
const path = require('path');

class DatabaseService {
  constructor() {
    const userDataPath = require('electron').app.getPath('userData');
    this.dbPath = path.join(userDataPath, 'company-admin.sqlite');
    this.db = new Database(this.dbPath);
    this.db.pragma('journam_mode = WAL')
    this.initializeDatabase();
  }

  initializeDatabase() {
    this.db.pragma('foreign_keys = OFF');
    this.createTables();
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

  // Employee methods
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

  // Create a new department
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

  // Attendance methods
  getTodayAttendance() {
    const today = new Date().toISOString().split('T')[0];
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

  // Record attendance
  recordAttendance(attendance) {
    const stmt = this.db.prepare(`
      INSERT OR REPLACE INTO attendance 
      (employee_id, date, check_in, check_out, status, notes)
      VALUES (?, ?, ?, ?, ?, ?)
    `);

    try {
      const info = stmt.run(
        attendance.employee_id,
        attendance.date,
        attendance.check_in,
        attendance.check_out,
        attendance.status || 'Present',
        attendance.notes || null
      );
      return { id: info.lastInsertRowid, changes: info.changes };
    } catch (error) {
      console.error('Error recording attendance:', error);
      throw error;
    }
  }

  // Payroll methods
  processPayroll(payrollData) {
    const stmt = this.db.prepare(`
      INSERT INTO payroll (
        employee_id, period_start, period_end, basic_salary,
        allowances, deductions, net_salary, status, payment_date
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
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
      payrollData.payment_date || null
    );

    return { id: info.lastInsertRowid, changes: info.changes };
  }

  // Get all payroll records
  getAllPayroll() {
    const stmt = this.db.prepare(`
      SELECT 
        p.*,
        e.first_name || ' ' || e.last_name as employee_name,
        e.position
      FROM payroll p
      INNER JOIN employees e ON p.employee_id = e.id
      ORDER BY p.period_end DESC
    `);
    return stmt.all();
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