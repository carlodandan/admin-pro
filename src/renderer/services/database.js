/**
 * A thin facade over `window.api`, kept because `dashboardService.js` reads
 * through it. Every method here is one `window.api` call with a guard for the
 * case where the bridge is missing — reads answer with an empty value, writes
 * throw — exactly as the Electron version did against `window.electronAPI`.
 *
 * The `query` / `execute` pair is gone along with the raw SQL passthrough it
 * called; attendance reads and deletes have their own commands now.
 */
class DatabaseService {
  // Employee operations
  static async getAllEmployees() {
    if (!window.api) {
      return [];
    }
    return window.api.getAllEmployees();
  }

  static async getEmployeeById(id) {
    if (!window.api) {
      return null;
    }
    return window.api.getEmployeeById(id);
  }

  static async createEmployee(employeeData) {
    if (!window.api) {
      throw new Error('Desktop API not available');
    }
    return window.api.createEmployee(employeeData);
  }

  static async updateEmployee(id, employeeData) {
    if (!window.api) {
      throw new Error('Desktop API not available');
    }
    return window.api.updateEmployee(id, employeeData);
  }

  static async deleteEmployee(id) {
    if (!window.api) {
      throw new Error('Desktop API not available');
    }
    return window.api.deleteEmployee(id);
  }

  // Department operations
  static async getAllDepartments() {
    if (!window.api) {
      return [];
    }
    return window.api.getAllDepartments();
  }

  // Attendance operations
  static async getTodayAttendance() {
    if (!window.api) {
      return [];
    }
    return window.api.getTodayAttendance();
  }

  static async recordAttendance(attendanceData) {
    if (!window.api) {
      throw new Error('Desktop API not available');
    }
    return window.api.recordAttendance(attendanceData);
  }

  // Payroll operations
  static async processPayroll(payrollData) {
    if (!window.api) {
      throw new Error('Desktop API not available');
    }
    return window.api.processPayroll(payrollData);
  }

  static async getAllPayroll() {
    if (!window.api) {
      return [];
    }
    return window.api.getAllPayroll();
  }

  static async backupDatabase() {
    if (!window.api) {
      throw new Error('Desktop API not available');
    }
    return window.api.backupDatabase();
  }
}

export default DatabaseService;
