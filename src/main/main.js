import { app, BrowserWindow, Menu, ipcMain, dialog, clipboard } from 'electron';
import path from 'node:path';
import DatabaseService from '../database/DatabaseService';
import AuthService from '../database/AuthService';
import fs from 'fs';

let mainWindow;
let dbService;
let authService;

// Read package.json to get version
const packageJsonPath = path.join(__dirname, '../../package.json');
let appVersion = '1.0.0';

try {
  const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
  appVersion = packageJson.version || '1.0.0';
} catch (error) {
  console.error('Failed to read package.json:', error);
}

if (require('electron-squirrel-startup')) app.quit();

function createWindow() {
  // Initialize database (no seeding)
  dbService = new DatabaseService();
  
  // Initialize auth service
  authService = new AuthService();

  // Create the browser window
  mainWindow = new BrowserWindow({
    width: 1920,
    height: 1080,
    minWidth: 1200,
    minHeight: 800,
    show: false,
    backgroundColor: '#FFFFFF',
    autoHideMenuBar: true,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js'),
      webSecurity: true,
      sandbox: true,
      defaultFontSize: 12
    },
    icon: path.join(__dirname, '../../icons/icon.ico'),
    titleBarStyle: 'default',
  });

  // Load the app
  if (process.env.NODE_ENV === 'development') {
    mainWindow.loadURL('http://localhost:5173');
    mainWindow.webContents.openDevTools();
  } else {
    mainWindow.loadFile(path.join(__dirname, '../renderer/src/index.html'));
  }

  // Create application menu
  createMenu();

  // Use this event to display the window cleanly
  mainWindow.on('ready-to-show', () => {
    mainWindow.show();
    mainWindow.maximize();
    mainWindow.focus();
  });
}

// Create application menu
function createMenu() {
  const template = [
    {
      label: 'File',
      submenu: [
        {
          label: 'Export Data',
          accelerator: 'CmdOrCtrl+E',
          click: () => {
            mainWindow.webContents.send('export-data');
          }
        },
        { type: 'separator' },
        {
          label: 'Quit',
          accelerator: 'CmdOrCtrl+Q',
          click: () => {
            app.quit();
          }
        }
      ]
    },
    {
      label: 'Edit',
      submenu: [
        { role: 'undo' },
        { role: 'redo' },
        { type: 'separator' },
        { role: 'cut' },
        { role: 'copy' },
        { role: 'paste' }
      ]
    },
    {
      label: 'View',
      submenu: [
        { role: 'reload' },
        { role: 'forceReload' },
        { role: 'toggleDevTools' },
        { type: 'separator' },
        { role: 'resetZoom' },
        { role: 'zoomIn' },
        { role: 'zoomOut' },
        { type: 'separator' },
        { role: 'togglefullscreen' }
      ]
    },
    {
      label: 'Help',
      submenu: [
        {
          label: 'App Version',
          click: () => {
            showVersionDialog();
          }
        },
        { type: 'separator' },
        {
          label: 'Documentation',
          click: async () => {
            const { shell } = require('electron');
            await shell.openExternal('https://github.com/carlodandan/admin-pro/wiki');
          }
        },
        {
          label: 'Report Issue',
          click: async () => {
            const { shell } = require('electron');
            await shell.openExternal('https://github.com/carlodandan/admin-pro/issues');
          }
        }
      ]
    }
  ];

  const menu = Menu.buildFromTemplate(template);
  Menu.setApplicationMenu(menu);
}

// Function to show version dialog
function showVersionDialog() {
  const buttons = ['OK', 'Copy Version'];
  
  dialog.showMessageBox(mainWindow, {
    type: 'info',
    title: 'Admin Pro - Version Information',
    message: 'Admin Pro - Admin Management System',
    detail: `Version: ${appVersion}\nElectron: ${process.versions.electron}\nNode.js: ${process.versions.node}\nChromium: ${process.versions.chrome}\nPlatform: ${process.platform} ${process.arch}`,
    buttons: buttons,
    defaultId: 0,
    cancelId: 0,
    icon: path.join(__dirname, '../../icons/icon.ico')
  }).then((result) => {
    if (result.response === 1) {
      clipboard.writeText(`Admin Pro v${appVersion}`);
    }
  });
}

// Electron app events
app.whenReady().then(() => {
  try {
    createWindow();
  } catch (error) {
    console.error('Failed to create window:', error);
  }
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});

//  AUTHENTICATION IPC HANDLERS 

// Backup auth database
ipcMain.handle('auth:backup-database', async () => {
  try {
    const result = authService.backupDatabase();
    return { success: true, data: result };
  } catch (error) {
    console.error('Error backing up auth database:', error);
    return { success: false, error: error.message };
  }
});

// Change password
ipcMain.handle('auth:change-password', async (event, email, currentPassword, newPassword) => {
  try {
    // Use the new changeAdminPassword method
    const result = await authService.changeAdminPassword(email, currentPassword, newPassword);
    return result;
  } catch (error) {
    console.error('Error changing password:', error);
    return { success: false, error: error.message };
  }
});

// Create user (for future multi-user support)
ipcMain.handle('auth:create-user', async (event, userData) => {
  try {
    // This would need to be implemented in AuthService
    console.log('Create user request:', userData);
    return { success: false, error: 'Not implemented yet' };
  } catch (error) {
    console.error('Error creating user:', error);
    return { success: false, error: error.message };
  }
});

// Get all users
ipcMain.handle('auth:get-users', async () => {
  try {
    const users = authService.getAllUsers();
    return { success: true, data: [] };
  } catch (error) {
    console.error('Error getting users:', error);
    return { success: false, error: error.message };
  }
});

// Get registration information
ipcMain.handle('auth:get-registration-info', async (event) => {
  try {
    const info = authService.getRegistrationInfo();
    return { success: true, data: info };
  } catch (error) {
    console.error('Error getting registration info:', error);
    return { success: false, error: error.message };
  }
});

// Check if system is registered
ipcMain.handle('auth:is-registered', async (event) => {
  try {
    const isRegistered = authService.isSystemRegistered();
    return { success: true, isRegistered };
  } catch (error) {
    console.error('Error checking registration:', error);
    return { success: false, error: error.message };
  }
});

// User login
ipcMain.handle('auth:login', async (event, email, password) => {
  try {
    console.log('Login attempt for:', email);
    const result = await authService.verifyAdminLogin(email, password);
    return result;
  } catch (error) {
    console.error('Error during login:', error);
    return { success: false, error: error.message };
  }
});

// Register system
ipcMain.handle('auth:register', async (event, registrationData) => {
  try {
    console.log('Registration request received');
    const result = await authService.storeRegistration(registrationData);
    return { success: true, data: result };
  } catch (error) {
    console.error('Registration error:', error);
    return { success: false, error: error.message };
  }
});

// Reset Admin Password
ipcMain.handle('auth:reset-admin-password', async (event, email, superAdminPassword, newPassword) => {
  try {
    console.log('Resetting admin password for:', email);
    const result = await authService.resetAdminPassword(email, superAdminPassword, newPassword);
    return result;
  } catch (error) {
    console.error('Error resetting admin password:', error);
    return { success: false, error: error.message };
  }
});

// Reset registration (for testing only)
ipcMain.handle('auth:reset-registration', async () => {
  try {
    const result = authService.resetRegistration();
    return { success: true, data: result };
  } catch (error) {
    console.error('Error resetting registration:', error);
    return { success: false, error: error.message };
  }
});

// Update company info
ipcMain.handle('auth:update-company-info', async (event, companyData) => {
  try {
    const stmt = authService.db.prepare(`
      UPDATE registration_credentials 
      SET 
        company_name = ?,
        company_email = ?,
        company_address = ?,
        company_contact = ?,
        last_updated = ?
      WHERE is_registered = 1
    `);
    
    stmt.run(
      companyData.company_name,
      companyData.company_email,
      companyData.company_address,
      companyData.company_contact,
      new Date().toISOString()
    );
    
    return { success: true, message: 'Company information updated' };
  } catch (error) {
    console.error('Error updating company info:', error);
    return { success: false, error: error.message };
  }
});

// Verify Super Admin Password
ipcMain.handle('auth:verify-super-admin', async (event, email, superAdminPassword) => {
  try {
    console.log('Verifying Super Admin Password for:', email);
    const result = await authService.verifySuperAdminPassword(email, superAdminPassword);
    return result;
  } catch (error) {
    console.error('Error verifying super admin password:', error);
    return { success: false, error: error.message };
  }
});

//  ATTENDANCE IPC HANDLERS 

// Get attendance for cutoff period
ipcMain.handle('attendance:get-cutoff', async (event, year, month, isFirstHalf) => {
  try {
    return dbService.getAttendanceForCutoff(year, month, isFirstHalf);
  } catch (error) {
    console.error('Error getting cutoff attendance:', error);
    return [];
  }
});

// Get monthly attendance report
ipcMain.handle('attendance:get-monthly-report', async (event, year, month) => {
  try {
    return dbService.getMonthlyAttendanceReport(year, month);
  } catch (error) {
    console.error('Error getting monthly attendance report:', error);
    return [];
  }
});

// Get today's attendance
ipcMain.handle('attendance:get-today', async () => {
  try {
    return dbService.getTodayAttendance();
  } catch (error) {
    console.error('Error getting today\'s attendance:', error);
    return [];
  }
});

// Get today's attendance summary
ipcMain.handle('attendance:get-today-summary', async () => {
  try {
    return dbService.getTodayAttendanceSummary();
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
});

// Get weekly attendance
ipcMain.handle('attendance:get-weekly', async () => {
  try {
    return dbService.getWeeklyAttendance();
  } catch (error) {
    console.error('Error getting weekly attendance:', error);
    return [];
  }
});

// Record attendance
ipcMain.handle('attendance:record', async (event, attendance) => {
  try {
    return dbService.recordAttendance(attendance);
  } catch (error) {
    console.error('Error recording attendance:', error);
    throw error;
  }
});

//  DATABASE IPC HANDLERS 

// Database backup/export
ipcMain.handle('database:backup', async () => {
  try {
    const userDataPath = app.getPath('userData');
    const dbPath = path.join(userDataPath, 'company-admin.sqlite');
    const backupPath = path.join(userDataPath, `company-admin-backup-${Date.now()}.db`);
    
    const fs = require('fs');
    fs.copyFileSync(dbPath, backupPath);
    
    return { success: true, path: backupPath };
  } catch (error) {
    console.error('Database backup error:', error);
    return { success: false, error: error.message };
  }
});

// Database execute
ipcMain.handle('database:execute', async (event, sql, params) => {
  try {
    return dbService.execute(sql, params);
  } catch (error) {
    console.error('Database execute error:', error);
    throw error;
  }
});

// Database query
ipcMain.handle('database:query', async (event, sql, params) => {
  try {
    return dbService.query(sql, params);
  } catch (error) {
    console.error('Database query error:', error);
    throw error;
  }
});

//  DEPARTMENT IPC HANDLERS 

// Create department
ipcMain.handle('departments:create', async (event, department) => {
  return new Promise((resolve, reject) => {
    setImmediate(() => {
      try {
        resolve(dbService.createDepartment(department));
      } catch (error) {
        console.error('Error creating department:', error);
        reject(error);
      }
    });
  });
});

// Delete department
ipcMain.handle('departments:delete', async (event, id) => {
  return new Promise((resolve, reject) => {
    setImmediate(() => {
      try {
        resolve(dbService.deleteDepartment(id));
      } catch (error) {
        console.error('Error deleting department:', error);
        reject(error);
      }
    });
  });
});

// Get all departments
ipcMain.handle('departments:get-all', async () => {
  return new Promise((resolve, reject) => {
    setImmediate(() => {
      try {
        resolve(dbService.getAllDepartments());
      } catch (error) {
        console.error('Error getting all departments:', error);
        resolve([]); // safe fallback
      }
    });
  });
});

//  EMPLOYEE IPC HANDLERS 

// Create employee
ipcMain.handle('employees:create', async (event, employee) => {
  try {
    console.log('Creating employee in main process:', employee);
    const result = dbService.createEmployee(employee);
    console.log('Employee created:', result);
    return result;
  } catch (error) {
    console.error('Error creating employee:', error);
    throw error;
  }
});

// Delete employee
ipcMain.handle('employees:delete', async (event, id) => {
  try {
    return dbService.deleteEmployee(id);
  } catch (error) {
    console.error('Error deleting employee:', error);
    throw error;
  }
});

// Get all employees
ipcMain.handle('employees:get-all', async () => {
  try {
    return dbService.getAllEmployees();
  } catch (error) {
    console.error('Error getting all employees:', error);
    return [];
  }
});

// Get employee by id
ipcMain.handle('employees:get-by-id', async (event, id) => {
  try {
    return dbService.getEmployeeById(id);
  } catch (error) {
    console.error('Error getting employee by id:', error);
    return null;
  }
});

// Update employee
ipcMain.handle('employees:update', async (event, id, employee) => {
  try {
    return dbService.updateEmployee(id, employee);
  } catch (error) {
    console.error('Error updating employee:', error);
    throw error;
  }
});

//  PAYROLL IPC HANDLERS 

// Get all payroll
ipcMain.handle('payroll:get-all', async () => {
  try {
    return dbService.getAllPayroll();
  } catch (error) {
    console.error('Error getting all payroll:', error);
    return [];
  }
});

// Get payroll by cutoff period
ipcMain.handle('payroll:get-by-cutoff', async (event, year, month, cutoffType) => {
  try {
    return dbService.getPayrollByCutoff(year, month, cutoffType);
  } catch (error) {
    console.error('Error getting payroll by cutoff:', error);
    return [];
  }
});

// Get payroll by employee and period
ipcMain.handle('payroll:get-by-employee-period', async (event, employeeId, year, month) => {
  try {
    return dbService.getPayrollByEmployeeAndPeriod(employeeId, year, month);
  } catch (error) {
    console.error('Error getting payroll by employee and period:', error);
    return null;
  }
});

// Get payroll summary
ipcMain.handle('payroll:get-summary', async (event, year, month) => {
  try {
    return dbService.getPayrollSummary(year, month);
  } catch (error) {
    console.error('Error getting payroll summary:', error);
    return [];
  }
});

// Mark payroll as paid
ipcMain.handle('payroll:mark-paid', async (event, payrollId, paymentDate) => {
  try {
    return dbService.markPayrollAsPaid(payrollId, paymentDate);
  } catch (error) {
    console.error('Error marking payroll as paid:', error);
    throw error;
  }
});

// Process bi-monthly payroll
ipcMain.handle('payroll:process-bi-monthly', async (event, payrollData) => {
  try {
    return dbService.processBiMonthlyPayroll(payrollData);
  } catch (error) {
    console.error('Error processing bi-monthly payroll:', error);
    throw error;
  }
});

// Process payroll
ipcMain.handle('payroll:process', async (event, payrollData) => {
  try {
    return dbService.processPayroll(payrollData);
  } catch (error) {
    console.error('Error processing payroll:', error);
    throw error;
  }
});

//  USER PROFILE IPC HANDLERS 

// Get user profile
ipcMain.handle('user:get-profile', async (event, email) => {
  try {
    return dbService.getUserProfile(email);
  } catch (error) {
    console.error('Error getting user profile:', error);
    return null;
  }
});

// Get user settings
ipcMain.handle('user:get-settings', async (event, email) => {
  try {
    return dbService.getUserSettings(email);
  } catch (error) {
    console.error('Error getting user settings:', error);
    return null;
  }
});

// Save user profile
ipcMain.handle('user:save-profile', async (event, userData) => {
  try {
    return dbService.saveUserProfile(userData);
  } catch (error) {
    console.error('Error saving user profile:', error);
    throw error;
  }
});

// Update user avatar
ipcMain.handle('user:update-avatar', async (event, email, avatarData) => {
  try {
    return dbService.updateUserAvatar(email, avatarData);
  } catch (error) {
    console.error('Error updating avatar:', error);
    throw error;
  }
});

// WINDOW CONTROL HANDLERS 

// Close window
ipcMain.on('window:close', () => {
  if (mainWindow) {
    mainWindow.close();
  }
});

// Maximize window
ipcMain.on('window:maximize', () => {
  if (mainWindow) {
    if (mainWindow.isMaximized()) {
      mainWindow.unmaximize();
    } else {
      mainWindow.maximize();
    }
  }
});

// Minimize window
ipcMain.on('window:minimize', () => {
  if (mainWindow) {
    mainWindow.minimize();
  }
});