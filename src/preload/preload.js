import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('electronAPI', {
  // Admin functions
  backupAuthDatabase: () => ipcRenderer.invoke('auth:backup-database'),
  getRegistrationInfo: () => ipcRenderer.invoke('auth:get-registration-info'),
  isSystemRegistered: () => ipcRenderer.invoke('auth:is-registered'),
  registerSystem: (registrationData) => ipcRenderer.invoke('auth:register', registrationData),
  resetRegistration: () => ipcRenderer.invoke('auth:reset-registration'),

  // Authentication
  changePassword: (userId, currentPassword, newPassword) => ipcRenderer.invoke('auth:change-password', userId, currentPassword, newPassword),
  loginUser: (email, password) => ipcRenderer.invoke('auth:login', email, password),
  resetAdminPassword: (email, superAdminPassword, newPassword) => ipcRenderer.invoke('auth:reset-admin-password', email, superAdminPassword, newPassword),
  verifySuperAdminPassword: (email, superAdminPassword) => ipcRenderer.invoke('auth:verify-super-admin', email, superAdminPassword),

  // Attendance operations
  getCutoffAttendance: (year, month, isFirstHalf) => ipcRenderer.invoke('attendance:get-cutoff', year, month, isFirstHalf),
  getMonthlyAttendanceReport: (year, month) => ipcRenderer.invoke('attendance:get-monthly-report', year, month),
  getTodayAttendance: () => ipcRenderer.invoke('attendance:get-today'),
  getTodayAttendanceSummary: () => ipcRenderer.invoke('attendance:get-today-summary'),
  getWeeklyAttendance: () => ipcRenderer.invoke('attendance:get-weekly'),
  recordAttendance: (attendance) => ipcRenderer.invoke('attendance:record', attendance),

  // Company operations
  updateCompanyInfo: (companyData) => ipcRenderer.invoke('auth:update-company-info', companyData),

  // Database operations
  backupDatabase: () => ipcRenderer.invoke('database:backup'),
  execute: (sql, params) => ipcRenderer.invoke('database:execute', sql, params),
  query: (sql, params) => ipcRenderer.invoke('database:query', sql, params),

  // Department operations
  createDepartment: (department) => ipcRenderer.invoke('departments:create', department),
  deleteDepartment: (id) => ipcRenderer.invoke('departments:delete', id),
  getAllDepartments: () => ipcRenderer.invoke('departments:get-all'),

  // Employee operations
  createEmployee: (employee) => ipcRenderer.invoke('employees:create', employee),
  deleteEmployee: (id) => ipcRenderer.invoke('employees:delete', id),
  getAllEmployees: () => ipcRenderer.invoke('employees:get-all'),
  getEmployeeById: (id) => ipcRenderer.invoke('employees:get-by-id', id),
  updateEmployee: (id, employee) => ipcRenderer.invoke('employees:update', id, employee),
  verifyEmployeePin: (employeeId, pin) => ipcRenderer.invoke('employees:verify-pin', employeeId, pin),
  updateEmployeePin: (employeeId, newPin) => ipcRenderer.invoke('employees:update-pin', employeeId, newPin),
  getLatestAttendance: (employeeId) => ipcRenderer.invoke('attendance:get-latest', employeeId),

  // Events
  onExportData: (callback) => ipcRenderer.on('export-data', callback),
  onWindowMaximized: (callback) => ipcRenderer.on('window-maximized', callback),
  onWindowUnmaximized: (callback) => ipcRenderer.on('window-unmaximized', callback),

  // Payroll operations
  getAllPayroll: () => ipcRenderer.invoke('payroll:get-all'),
  getPayrollByCutoff: (year, month, cutoffType) => ipcRenderer.invoke('payroll:get-by-cutoff', year, month, cutoffType),
  getPayrollByEmployeePeriod: (employeeId, year, month) => ipcRenderer.invoke('payroll:get-by-employee-period', employeeId, year, month),
  getPayrollSummary: (year, month) => ipcRenderer.invoke('payroll:get-summary', year, month),
  markPayrollAsPaid: (payrollId, paymentDate) => ipcRenderer.invoke('payroll:mark-paid', payrollId, paymentDate),
  processBiMonthlyPayroll: (payrollData) => ipcRenderer.invoke('payroll:process-bi-monthly', payrollData),
  processPayroll: (payrollData) => ipcRenderer.invoke('payroll:process', payrollData),

  // Dashboard operations
  getRecentActivities: (limit) => ipcRenderer.invoke('dashboard:get-recent-activities', limit),
  getAnalyticsData: (filters) => ipcRenderer.invoke('analytics:get-data', filters),

  // User management
  createUser: (userData) => ipcRenderer.invoke('auth:create-user', userData),
  getAllUsers: () => ipcRenderer.invoke('auth:get-users'),
  updateUser: (userId, userData) => ipcRenderer.invoke('auth:update-user', userId, userData),

  // User profile operations
  getUserProfile: (email) => ipcRenderer.invoke('user:get-profile', email),
  getUserSettings: (email) => ipcRenderer.invoke('user:get-settings', email),
  saveUserProfile: (userData) => ipcRenderer.invoke('user:save-profile', userData),
  updateUserAvatar: (email, avatarData) => ipcRenderer.invoke('user:update-avatar', email, avatarData),

  // Window controls
  closeWindow: () => ipcRenderer.send('window:close'),
  maximizeWindow: () => ipcRenderer.send('window:maximize'),
  minimizeWindow: () => ipcRenderer.send('window:minimize')
});