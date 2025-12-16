import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('electronAPI', {

  // Registration checks
  isSystemRegistered: () => ipcRenderer.invoke('auth:is-registered'),
  getRegistrationInfo: () => ipcRenderer.invoke('auth:get-registration-info'),
  
  // Registration
  registerSystem: (registrationData) => ipcRenderer.invoke('auth:register', registrationData),
  verifySuperAdminPassword: (email, superAdminPassword) => ipcRenderer.invoke('auth:verify-super-admin', email, superAdminPassword),
  resetAdminPassword: (email, superAdminPassword, newPassword) => ipcRenderer.invoke('auth:reset-admin-password', email, superAdminPassword, newPassword),
  
  // Login
  loginUser: (email, password) => ipcRenderer.invoke('auth:login', email, password),
  
  // User management
  createUser: (userData) => ipcRenderer.invoke('auth:create-user', userData),
  getAllUsers: () => ipcRenderer.invoke('auth:get-users'),
  updateUser: (userId, userData) => ipcRenderer.invoke('auth:update-user', userId, userData),
  changePassword: (userId, currentPassword, newPassword) => 
    ipcRenderer.invoke('auth:change-password', userId, currentPassword, newPassword),
  
  // Admin functions
  resetRegistration: () => ipcRenderer.invoke('auth:reset-registration'),
  backupAuthDatabase: () => ipcRenderer.invoke('auth:backup-database'),

  
  // Employee operations
  getAllEmployees: () => ipcRenderer.invoke('employees:get-all'),
  getEmployeeById: (id) => ipcRenderer.invoke('employees:get-by-id', id),
  createEmployee: (employee) => ipcRenderer.invoke('employees:create', employee),
  updateEmployee: (id, employee) => ipcRenderer.invoke('employees:update', id, employee),
  deleteEmployee: (id) => ipcRenderer.invoke('employees:delete', id),
  
  // Department operations
  getAllDepartments: () => ipcRenderer.invoke('departments:get-all'),
  createDepartment: (department) => ipcRenderer.invoke('departments:create', department),
  deleteDepartment: (id) => ipcRenderer.invoke('departments:delete', id),
  
  // Attendance operations
  getTodayAttendance: () => ipcRenderer.invoke('attendance:get-today'),
  recordAttendance: (attendance) => ipcRenderer.invoke('attendance:record', attendance),
  getMonthlyAttendanceReport: (year, month) => ipcRenderer.invoke('attendance:get-monthly-report', year, month),
  getWeeklyAttendance: () => ipcRenderer.invoke('attendance:get-weekly'),
  getTodayAttendanceSummary: () => ipcRenderer.invoke('attendance:get-today-summary'),

  // Payroll operations
  processPayroll: (payrollData) => ipcRenderer.invoke('payroll:process', payrollData),
  getAllPayroll: () => ipcRenderer.invoke('payroll:get-all'),
  getPayrollSummary: (year, month) => ipcRenderer.invoke('payroll:get-summary', year, month),
  markPayrollAsPaid: (payrollId, paymentDate) => ipcRenderer.invoke('payroll:mark-paid', payrollId, paymentDate),
  getPayrollByEmployeePeriod: (employeeId, year, month) => ipcRenderer.invoke('payroll:get-by-employee-period', employeeId, year, month),
  getCutoffAttendance: (year, month, isFirstHalf) => ipcRenderer.invoke('attendance:get-cutoff', year, month, isFirstHalf),
  processBiMonthlyPayroll: (payrollData) => ipcRenderer.invoke('payroll:process-bi-monthly', payrollData),
  getPayrollByCutoff: (year, month, cutoffType) => ipcRenderer.invoke('payroll:get-by-cutoff', year, month, cutoffType),

  // Database operations
  query: (sql, params) => ipcRenderer.invoke('database:query', sql, params),
  execute: (sql, params) => ipcRenderer.invoke('database:execute', sql, params),
  backupDatabase: () => ipcRenderer.invoke('database:backup'),
  
  // Window controls
  minimizeWindow: () => ipcRenderer.send('window:minimize'),
  maximizeWindow: () => ipcRenderer.send('window:maximize'),
  closeWindow: () => ipcRenderer.send('window:close'),
  
  // Events
  onWindowMaximized: (callback) => ipcRenderer.on('window-maximized', callback),
  onWindowUnmaximized: (callback) => ipcRenderer.on('window-unmaximized', callback),
  onExportData: (callback) => ipcRenderer.on('export-data', callback)
});