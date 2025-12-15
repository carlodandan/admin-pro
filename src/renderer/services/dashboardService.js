import DatabaseService from './database';

class DashboardService {
  // Get dashboard statistics
  static async getDashboardStats() {
    try {
      const [employees, departments, attendance] = await Promise.all([
        DatabaseService.getAllEmployees(),
        DatabaseService.getAllDepartments(),
        DatabaseService.getTodayAttendance()
      ]);

      // Calculate stats
      const totalEmployees = employees.length;
      const activeEmployees = employees.filter(e => e.status === 'Active').length;
      const onLeaveEmployees = employees.filter(e => e.status === 'On Leave').length;
      
      // Calculate average salary
      const totalSalary = employees.reduce((sum, emp) => sum + (emp.salary || 0), 0);
      const avgSalary = employees.length > 0 ? totalSalary / employees.length : 0;

      // Calculate today's attendance percentage
      const today = new Date().toISOString().split('T')[0];
      const presentToday = attendance.filter(a => a.status === 'Present').length;
      const attendancePercentage = totalEmployees > 0 ? (presentToday / totalEmployees * 100) : 0;

      // Calculate department distribution
      const departmentStats = departments.map(dept => ({
        name: dept.name,
        count: employees.filter(e => e.department_id === dept.id).length,
        avgSalary: dept.avg_salary || 0,
        budget: dept.budget || 0
      }));

      // Get recent activities (simulated - you can create an actual activities table)
      const recentActivities = this.getRecentActivities(employees);

      // Get payroll summary for current month
      const payrollSummary = await this.getCurrentMonthPayroll();

      // Weekly attendance data
      const weeklyAttendance = await this.getWeeklyAttendance();

      return {
        totalEmployees,
        activeEmployees,
        onLeaveEmployees,
        avgSalary,
        attendancePercentage,
        departmentStats,
        recentActivities,
        payrollSummary,
        weeklyAttendance,
        totalDepartments: departments.length,
        monthlyRevenue: this.calculateMonthlyRevenue(payrollSummary)
      };
    } catch (error) {
      console.error('Error fetching dashboard stats:', error);
      throw error;
    }
  }

  // Get weekly attendance data
  static async getWeeklyAttendance() {
    try {
      // This is a simplified version - you should create a proper attendance query
      const today = new Date();
      const weekDays = [];
      
      // Generate last 7 days
      for (let i = 6; i >= 0; i--) {
        const date = new Date(today);
        date.setDate(today.getDate() - i);
        const dateStr = date.toISOString().split('T')[0];
        
        // In a real app, you would query the database for each day
        // For now, simulate data
        const dayName = date.toLocaleDateString('en-US', { weekday: 'short' });
        const present = Math.floor(Math.random() * 200) + 50; // Simulated
        const absent = Math.floor(Math.random() * 20) + 1; // Simulated
        
        weekDays.push({
          day: dayName,
          date: dateStr,
          present,
          absent,
          total: present + absent
        });
      }
      
      return weekDays;
    } catch (error) {
      console.error('Error fetching weekly attendance:', error);
      return [];
    }
  }

  // Get current month payroll summary
  static async getCurrentMonthPayroll() {
    try {
      // In a real app, you would query the payroll table
      // For now, simulate with employee data
      const employees = await DatabaseService.getAllEmployees();
      
      const currentMonth = new Date().getMonth();
      const currentYear = new Date().getFullYear();
      
      // Filter employees hired this month (simulated payroll)
      const payrollEmployees = employees.slice(0, 5).map((emp, index) => ({
        id: emp.id,
        employee: `${emp.first_name} ${emp.last_name}`,
        position: emp.position,
        salary: emp.salary || 0,
        bonus: Math.floor(Math.random() * 1000),
        deductions: Math.floor(Math.random() * 500),
        status: index % 3 === 0 ? 'Pending' : 'Paid',
        payDate: `${currentYear}-${String(currentMonth + 1).padStart(2, '0')}-28`
      }));

      const totalPayroll = payrollEmployees.reduce((sum, emp) => 
        sum + emp.salary + emp.bonus - emp.deductions, 0
      );

      return {
        employees: payrollEmployees,
        total: totalPayroll,
        pending: payrollEmployees.filter(e => e.status === 'Pending').length,
        paid: payrollEmployees.filter(e => e.status === 'Paid').length
      };
    } catch (error) {
      console.error('Error fetching payroll summary:', error);
      return { employees: [], total: 0, pending: 0, paid: 0 };
    }
  }

  // Calculate monthly revenue (simplified)
  static calculateMonthlyRevenue(payrollSummary) {
    // In a real app, this would come from your accounting system
    // For now, estimate based on payroll
    return payrollSummary.total * 3; // Assuming revenue is 3x payroll
  }

  // Get recent activities (simulated)
  static getRecentActivities(employees) {
    const actions = [
      'added new employee',
      'updated profile',
      'approved leave request',
      'processed payroll',
      'updated department',
      'created report'
    ];

    // --- FIX APPLIED HERE: If employees is empty, exit early. ---
    if (!employees || employees.length === 0) {
      return [];
    }
    // -----------------------------------------------------------

    const users = employees.slice(0, 5).map(emp => ({
      name: `${emp.first_name} ${emp.last_name}`,
      initials: `${emp.first_name?.[0] || ''}${emp.last_name?.[0] || ''}`
    }));

    const activities = [];
    const now = new Date();

    for (let i = 0; i < 3; i++) {
      const user = users[i % users.length];
      const timeAgo = i === 0 ? '2 min ago' : i === 1 ? '15 min ago' : '1 hour ago';
      
      activities.push({
        user: user.name, // This is now safe because we checked if users.length > 0
        action: actions[i % actions.length],
        time: timeAgo,
        initials: user.initials
      });
    }

    return activities;
  }
}

export default DashboardService;