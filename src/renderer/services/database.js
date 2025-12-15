class DatabaseService {
  // Employees
  static async getAllEmployees() {
    if (!window.electronAPI) {
      // Fallback for development without Electron
      return this.getMockEmployees();
    }
    return window.electronAPI.getAllEmployees();
  }

  static async getEmployeeById(id) {
    if (!window.electronAPI) {
      return this.getMockEmployees().find(e => e.id === id);
    }
    return window.electronAPI.getEmployeeById(id);
  }

  static async createEmployee(employeeData) {
    if (!window.electronAPI) {
      console.log('Mock create employee:', employeeData);
      return { id: Date.now(), changes: 1 };
    }
    return window.electronAPI.createEmployee(employeeData);
  }

  static async updateEmployee(id, employeeData) {
    if (!window.electronAPI) {
      console.log('Mock update employee:', id, employeeData);
      return { changes: 1 };
    }
    return window.electronAPI.updateEmployee(id, employeeData);
  }

  static async deleteEmployee(id) {
    if (!window.electronAPI) {
      console.log('Mock delete employee:', id);
      return { changes: 1 };
    }
    return window.electronAPI.deleteEmployee(id);
  }

    static async createEmployee(employeeData) {
    if (!window.electronAPI) {
      console.log('Mock creating employee:', employeeData);
      // Generate a mock ID
      const mockId = Math.floor(Math.random() * 1000) + 100;
      return { id: mockId, changes: 1 };
    }
    
    try {
      console.log('Creating employee via API:', employeeData);
      const result = await window.electronAPI.createEmployee(employeeData);
      console.log('Create employee result:', result);
      return result;
    } catch (error) {
      console.error('Error creating employee:', error);
      throw error;
    }
  }

  // Departments
  static async getAllDepartments() {
    if (!window.electronAPI) {
      return this.getMockDepartments();
    }
    return window.electronAPI.getAllDepartments();
  }

  static async getAllDepartments() {
    if (!window.electronAPI) {
      return this.getMockDepartments();
    }
    try {
      return await window.electronAPI.getAllDepartments();
    } catch (error) {
      console.error('Error getting departments:', error);
      return this.getMockDepartments();
    }
  }

  static async getTodayAttendance() {
    if (!window.electronAPI) {
      return [];
    }
    try {
      return await window.electronAPI.getTodayAttendance();
    } catch (error) {
      console.error('Error getting today\'s attendance:', error);
      return [];
    }
  }
}

export default DatabaseService;