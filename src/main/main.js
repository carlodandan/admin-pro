import { app, BrowserWindow, Menu, ipcMain } from 'electron';
import path from 'node:path';
import DatabaseService from '../database/database';

let mainWindow;
let dbService;

if (require('electron-squirrel-startup')) app.quit();

function createWindow() {
  // Initialize database (no seeding)
  dbService = new DatabaseService();

  // Create the browser window
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 1200,
    minHeight: 800,
    show: false,
    backgroundColor: '#FFFFFF',
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js'),
      webSecurity: true,
      sandbox: true
    },
    icon: path.join(__dirname, '../../icons/admin.ico'),
    titleBarStyle: 'default'
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
          label: 'Documentation',
          click: async () => {
            const { shell } = require('electron');
            await shell.openExternal('https://docs.example.com');
          }
        },
        {
          label: 'Report Issue',
          click: async () => {
            const { shell } = require('electron');
            await shell.openExternal('https://github.com/example/issues');
          }
        }
      ]
    }
  ];

  const menu = Menu.buildFromTemplate(template);
  Menu.setApplicationMenu(menu);
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

// IPC Handlers for database operations
ipcMain.handle('database:query', async (event, sql, params) => {
  try {
    return dbService.query(sql, params);
  } catch (error) {
    console.error('Database query error:', error);
    throw error;
  }
});

ipcMain.handle('database:execute', async (event, sql, params) => {
  try {
    return dbService.execute(sql, params);
  } catch (error) {
    console.error('Database execute error:', error);
    throw error;
  }
});

ipcMain.handle('employees:get-all', async () => {
  try {
    return dbService.getAllEmployees();
  } catch (error) {
    console.error('Error getting all employees:', error);
    return [];
  }
});

ipcMain.handle('employees:get-by-id', async (event, id) => {
  try {
    return dbService.getEmployeeById(id);
  } catch (error) {
    console.error('Error getting employee by id:', error);
    return null;
  }
});

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

ipcMain.handle('employees:update', async (event, id, employee) => {
  try {
    return dbService.updateEmployee(id, employee);
  } catch (error) {
    console.error('Error updating employee:', error);
    throw error;
  }
});

ipcMain.handle('employees:delete', async (event, id) => {
  try {
    return dbService.deleteEmployee(id);
  } catch (error) {
    console.error('Error deleting employee:', error);
    throw error;
  }
});

ipcMain.handle('departments:get-all', async () => {
  try {
    return dbService.getAllDepartments();
  } catch (error) {
    console.error('Error getting all departments:', error);
    return [];
  }
});

ipcMain.handle('attendance:get-today', async () => {
  try {
    return dbService.getTodayAttendance();
  } catch (error) {
    console.error('Error getting today\'s attendance:', error);
    return [];
  }
});

ipcMain.handle('attendance:record', async (event, attendance) => {
  try {
    return dbService.recordAttendance(attendance);
  } catch (error) {
    console.error('Error recording attendance:', error);
    throw error;
  }
});

ipcMain.handle('payroll:process', async (event, payrollData) => {
  try {
    return dbService.processPayroll(payrollData);
  } catch (error) {
    console.error('Error processing payroll:', error);
    throw error;
  }
});

ipcMain.handle('payroll:get-all', async () => {
  try {
    return dbService.getAllPayroll();
  } catch (error) {
    console.error('Error getting all payroll:', error);
    return [];
  }
});

// Window control handlers
ipcMain.on('window:minimize', () => {
  if (mainWindow) {
    mainWindow.minimize();
  }
});

ipcMain.on('window:maximize', () => {
  if (mainWindow) {
    if (mainWindow.isMaximized()) {
      mainWindow.unmaximize();
    } else {
      mainWindow.maximize();
    }
  }
});

ipcMain.on('window:close', () => {
  if (mainWindow) {
    mainWindow.close();
  }
});

ipcMain.handle('departments:create', async (event, department) => {
  try {
    return dbService.createDepartment(department);
  } catch (error) {
    console.error('Error creating department:', error);
    throw error;
  }
});

// Database backup/export
ipcMain.handle('database:backup', async () => {
  try {
    const userDataPath = app.getPath('userData');
    const dbPath = path.join(userDataPath, 'company-admin.db');
    const backupPath = path.join(userDataPath, `company-admin-backup-${Date.now()}.db`);
    
    const fs = require('fs');
    fs.copyFileSync(dbPath, backupPath);
    
    return { success: true, path: backupPath };
  } catch (error) {
    console.error('Database backup error:', error);
    return { success: false, error: error.message };
  }
});