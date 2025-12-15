import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('electronAPI', {
  // Employee operations
  getAllEmployees: () => ipcRenderer.invoke('employees:get-all'),
  getEmployeeById: (id) => ipcRenderer.invoke('employees:get-by-id', id),
  createEmployee: (employee) => ipcRenderer.invoke('employees:create', employee),
  updateEmployee: (id, employee) => ipcRenderer.invoke('employees:update', id, employee),
  deleteEmployee: (id) => ipcRenderer.invoke('employees:delete', id),
  
  // Department operations
  getAllDepartments: () => ipcRenderer.invoke('departments:get-all'),
  createDepartment: (department) => ipcRenderer.invoke('departments:create', department), // Add this
  
  // Attendance operations
  getTodayAttendance: () => ipcRenderer.invoke('attendance:get-today'),
  recordAttendance: (attendance) => ipcRenderer.invoke('attendance:record', attendance), // Add this
  
  // Payroll operations
  processPayroll: (payrollData) => ipcRenderer.invoke('payroll:process', payrollData),
  getAllPayroll: () => ipcRenderer.invoke('payroll:get-all'), // Add this
  
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