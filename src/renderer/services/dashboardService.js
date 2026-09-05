import DatabaseService from './database';
import { manilaMonth, manilaYear, relativeFromNow } from '../utils/manila';

/**
 * The dashboard's read model.
 *
 * Three of these figures used to be invented rather than queried:
 * `getWeeklyAttendance()` filled seven days with `Math.random()`,
 * `getCurrentMonthPayroll()` took the first five employees and gave each a
 * random bonus and an alternating Paid/Pending status, and
 * `calculateMonthlyRevenue()` returned the payroll total times three. The
 * payroll summary is real now; the fabricated week is gone because
 * `AttendanceChart` already queries `getWeeklyAttendance()` itself and nothing
 * read this copy; and the revenue figure is gone rather than corrected —
 * nothing in this app records revenue, so there was no number to correct it to.
 */
class DashboardService {
  static async getDashboardStats() {
    try {
      const [employees, departments, attendance] = await Promise.all([
        DatabaseService.getAllEmployees(),
        DatabaseService.getAllDepartments(),
        DatabaseService.getTodayAttendance()
      ]);

      const totalEmployees = employees.length;
      const activeEmployees = employees.filter((e) => e.status === 'Active').length;
      const onLeaveEmployees = employees.filter((e) => e.status === 'On Leave').length;

      // `employees.salary` is the *monthly* basic salary: the payroll
      // calculator divides it by 24 to get a daily rate. Both dashboard cards
      // used to label this average "Avg. Annual Salary".
      const totalSalary = employees.reduce((sum, emp) => sum + (emp.salary || 0), 0);
      const avgSalary = totalEmployees > 0 ? totalSalary / totalEmployees : 0;

      const presentToday = attendance.filter((a) => a.status === 'Present').length;
      const attendancePercentage =
        totalEmployees > 0 ? (presentToday / totalEmployees) * 100 : 0;

      const departmentStats = departments.map((dept) => ({
        name: dept.name,
        count: employees.filter((e) => e.department_id === dept.id).length,
        // `departments::get_all` averages the same monthly column.
        avgSalary: dept.avg_salary || 0,
        budget: dept.budget || 0
      }));

      // Independent queries, so they overlap rather than run in sequence.
      const [recentActivities, payrollSummary] = await Promise.all([
        this.getRecentActivities(),
        this.getCurrentMonthPayroll()
      ]);

      return {
        totalEmployees,
        activeEmployees,
        onLeaveEmployees,
        avgSalary,
        attendancePercentage,
        departmentStats,
        recentActivities,
        payrollSummary,
        totalDepartments: departments.length
      };
    } catch (error) {
      console.error('Error fetching dashboard stats:', error);
      throw error;
    }
  }

  /** Payroll filed for the current Manila month, from the payroll table. */
  static async getCurrentMonthPayroll() {
    const empty = { employees: [], total: 0, pending: 0, paid: 0 };
    if (!window.api) return empty;

    try {
      const records = await window.api.getPayrollSummary(manilaYear(), manilaMonth());
      if (!Array.isArray(records)) return empty;

      const payrollEmployees = records.map((record) => ({
        id: record.id,
        employee: record.employee_name,
        position: record.position,
        salary: record.basic_salary || 0,
        allowances: record.allowances || 0,
        deductions: record.deductions || 0,
        netPay: record.net_salary || 0,
        status: record.status || 'Pending',
        payDate: record.payment_date,
        cutoffType: record.cutoff_type,
        periodStart: record.cutoff_start,
        periodEnd: record.cutoff_end
      }));

      return {
        employees: payrollEmployees,
        total: payrollEmployees.reduce((sum, emp) => sum + emp.netPay, 0),
        pending: payrollEmployees.filter((emp) => emp.status === 'Pending').length,
        paid: payrollEmployees.filter((emp) => emp.status === 'Paid').length
      };
    } catch (error) {
      console.error('Error fetching payroll summary:', error);
      return empty;
    }
  }

  /** The activity feed, newest first, with relative times read as Manila. */
  static async getRecentActivities() {
    if (!window.api) return [];

    try {
      const activities = await window.api.getRecentActivities(10);

      return activities.map((activity) => ({
        user: `${activity.first_name ?? ''} ${activity.last_name ?? ''}`.trim(),
        action: activity.action,
        time: relativeFromNow(activity.timestamp) ?? 'Recently',
        initials: `${activity.first_name?.[0] || ''}${activity.last_name?.[0] || ''}`
      }));
    } catch (error) {
      console.error('Error converting recent activities:', error);
      return [];
    }
  }
}

export default DashboardService;
