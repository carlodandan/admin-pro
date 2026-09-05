/**
 * The IPC seam.
 *
 * This file replaces `src/preload/preload.js`. Every member of the old
 * `window.api` object has the same name, the same argument order and
 * the same return shape here, so the pages and components that call it did not
 * have to change how they use it — only which global they reach for
 * (`window.api`).
 *
 * Tauri maps the camelCase keys below onto the Rust commands' snake_case
 * parameters, which is why the payload keys look the way they do.
 */

import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';

/**
 * `ipcRenderer.on(channel, callback)` handed the callback an event object plus
 * the payload. Tauri hands it a single event object, so callers that ignored
 * the argument — which is all of them — behave identically. The returned
 * promise resolves to an unsubscribe function; Electron gave nothing back.
 */
const on = (event, callback) => listen(event, callback);

const api = {
  // Admin functions
  backupAuthDatabase: () => invoke('backup_auth_database'),
  getRegistrationInfo: () => invoke('get_registration_info'),
  isSystemRegistered: () => invoke('is_system_registered'),
  registerSystem: (registrationData) => invoke('register_system', { registrationData }),
  resetRegistration: () => invoke('reset_registration'),

  // Authentication
  changePassword: (userId, currentPassword, newPassword) =>
    invoke('change_password', { userId, currentPassword, newPassword }),
  loginUser: (email, password) => invoke('login_user', { email, password }),
  logoutUser: () => invoke('logout_user'),
  resetAdminPassword: (email, superAdminPassword, newPassword) =>
    invoke('reset_admin_password', { email, superAdminPassword, newPassword }),
  verifySuperAdminPassword: (email, superAdminPassword) =>
    invoke('verify_super_admin_password', { email, superAdminPassword }),

  // Attendance operations
  deleteAttendance: (employeeId, date) => invoke('delete_attendance', { employeeId, date }),
  getAttendanceByDate: (date) => invoke('get_attendance_by_date', { date }),
  getCutoffAttendance: (year, month, isFirstHalf) =>
    invoke('get_cutoff_attendance', { year, month, isFirstHalf }),
  getMonthlyAttendanceReport: (year, month) =>
    invoke('get_monthly_attendance_report', { year, month }),
  getTodayAttendance: () => invoke('get_today_attendance'),
  getTodayAttendanceSummary: () => invoke('get_today_attendance_summary'),
  getWeeklyAttendance: () => invoke('get_weekly_attendance'),
  recordAttendance: (attendance) => invoke('record_attendance', { attendance }),

  // Company operations
  updateCompanyInfo: (companyData) => invoke('update_company_info', { companyData }),

  // Database operations
  backupDatabase: () => invoke('backup_database'),

  // Department operations
  createDepartment: (department) => invoke('create_department', { department }),
  deleteDepartment: (id) => invoke('delete_department', { id }),
  getAllDepartments: () => invoke('get_all_departments'),

  // Employee operations
  createEmployee: (employee) => invoke('create_employee', { employee }),
  deleteEmployee: (id) => invoke('delete_employee', { id }),
  getAllEmployees: () => invoke('get_all_employees'),
  getEmployeeById: (id) => invoke('get_employee_by_id', { id }),
  updateEmployee: (id, employee) => invoke('update_employee', { id, employee }),
  verifyEmployeePin: (employeeId, pin) => invoke('verify_employee_pin', { employeeId, pin }),
  updateEmployeePin: (employeeId, newPin) => invoke('update_employee_pin', { employeeId, newPin }),
  getLatestAttendance: (employeeId) => invoke('get_latest_attendance', { employeeId }),

  // Events
  onExportData: (callback) => on('export-data', callback),
  onWindowMaximized: (callback) => on('window-maximized', callback),
  onWindowUnmaximized: (callback) => on('window-unmaximized', callback),

  // Payroll operations
  getAllPayroll: () => invoke('get_all_payroll'),
  getPayrollByCutoff: (year, month, cutoffType) =>
    invoke('get_payroll_by_cutoff', { year, month, cutoffType }),
  getPayrollByEmployeePeriod: (employeeId, year, month) =>
    invoke('get_payroll_by_employee_period', { employeeId, year, month }),
  getPayrollSummary: (year, month) => invoke('get_payroll_summary', { year, month }),
  markPayrollAsPaid: (payrollId, paymentDate) =>
    invoke('mark_payroll_as_paid', { payrollId, paymentDate: paymentDate ?? null }),
  processBiMonthlyPayroll: (payrollData) => invoke('process_bi_monthly_payroll', { payrollData }),
  processPayroll: (payrollData) => invoke('process_payroll', { payrollData }),

  // Dashboard operations
  getRecentActivities: (limit) => invoke('get_recent_activities', { limit: limit ?? null }),
  getAnalyticsData: (filters) => invoke('get_analytics_data', { filters: filters ?? null }),

  // User management. All three were placeholders in Electron and still are.
  createUser: (userData) => invoke('create_user', { userData: userData ?? null }),
  getAllUsers: () => invoke('get_all_users'),
  updateUser: (userId, userData) =>
    invoke('update_user', { userId: userId ?? null, userData: userData ?? null }),

  // User profile operations
  getUserProfile: (email) => invoke('get_user_profile', { email: email ?? null }),
  // Kept for parity with the Electron channel list, but nothing calls it: it
  // selects `theme_preference, language` and nothing else, and `App.jsx` and
  // `UserContext.jsx` both used to read profile fields off it and get
  // `undefined`. Read profiles with `getUserProfile`.
  getUserSettings: (email) => invoke('get_user_settings', { email: email ?? null }),
  saveUserProfile: (userData) => invoke('save_user_profile', { userData }),
  updateUserAvatar: (email, avatarData) => invoke('update_user_avatar', { email, avatarData }),

  // Window controls. `ipcRenderer.send` returned nothing; these return a
  // promise that nothing awaits, which behaves the same way.
  closeWindow: () => invoke('close_window'),
  maximizeWindow: () => invoke('maximize_window'),
  minimizeWindow: () => invoke('minimize_window'),

  // New in the Tauri port: the window starts hidden and this reveals it once
  // React has painted, standing in for Electron's `ready-to-show`.
  frontendReady: () => invoke('frontend_ready'),
};

export default api;

// The app was written against a global, so the seam stays a global.
if (typeof window !== 'undefined') {
  window.api = api;
}
