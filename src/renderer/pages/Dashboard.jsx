import React, { useState, useEffect } from 'react';
import OverviewCards from '../components/Dashboard/OverviewCards';
import AttendanceChart from '../components/Attendance/AttendanceChart';
import PayrollSummary from '../components/Payroll/PayrollSummary';
import DashboardService from '../services/dashboardService';
import { Loader2, Download, BarChart3 } from 'lucide-react';

const Dashboard = () => {
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    loadDashboardData();
  }, []);

  const loadDashboardData = async () => {
    try {
      setLoading(true);
      // NOTE: The console.error in the catch block of DashboardService.js (not shown)
      // indicates the actual source of the 'name' error is there.
      // This try/catch handles if the entire service call fails.
      const data = await DashboardService.getDashboardStats();
      setStats(data);
    } catch (err) {
      // The original error: TypeError: Cannot read properties of undefined (reading 'name')
      // is logged here. We set a generic user-friendly error message.
      setError('Failed to load dashboard data. Please check the service implementation.');
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleGenerateReport = () => {

    // Implement report generation
  };

  const handleViewAnalytics = () => {

    // Implement analytics view
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-96">
        <div className="text-center">
          <Loader2 className="h-8 w-8 animate-spin text-blue-500 mx-auto mb-4" />
          <p className="text-gray-600">Loading dashboard data...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-center h-96">
        <div className="text-center">
          <div className="text-red-500 mb-4">⚠️</div>
          <p className="text-gray-600 mb-4">{error}</p>
          <button
            onClick={loadDashboardData}
            className="bg-blue-500 text-white px-4 py-2 rounded-lg hover:bg-blue-600"
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  // Define fallback value for totalEmployees based on data, defaulting to 1 for division
  const totalEmployees = stats?.totalEmployees || 1;

  return (
    <div className="space-y-4">
      {/* Welcome Banner */}
      <div className="bg-linear-to-r from-blue-50 to-indigo-50 rounded-2xl p-3 border border-blue-100">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h1 className="text-l md:text-xl font-bold text-gray-900">
              Welcome back, Administrator
            </h1>
            <p className="text-sm text-gray-600 mt-2">
              Here's what's happening with your company today.
              You have {stats?.payrollSummary?.pending || 0} pending payroll items to review.
            </p>
          </div>
          <div className="flex gap-3">
            <button
              onClick={handleGenerateReport}
              className="flex items-center gap-2 bg-blue-600 text-white px-6 py-3 rounded-xl font-semibold hover:bg-blue-700 transition-colors"
            >
              <Download size={18} />
              Generate Report
            </button>
            <button
              onClick={handleViewAnalytics}
              className="flex items-center gap-2 border border-gray-300 text-gray-700 px-6 py-3 rounded-xl font-semibold hover:bg-gray-50 transition-colors"
            >
              <BarChart3 size={18} />
              View Analytics
            </button>
          </div>
        </div>
      </div>

      {/* Overview Cards (Assuming OverviewCards handles its own fallbacks based on the 'stats' prop) */}
      <OverviewCards stats={stats} />

      {/* Main Grid Layout */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left Column - Charts */}
        <div className="lg:col-span-2 space-y-6">
          {/* Charts (Assuming AttendanceChart and PayrollSummary handle data checks internally) */}
          <AttendanceChart weeklyAttendance={stats?.weeklyAttendance || []} />
          <PayrollSummary payrollData={stats?.payrollSummary} />
        </div>

        {/* Right Column - Quick Stats */}
        <div className="space-y-6">
          {/* Quick Stats */}
          <div className="bg-white rounded-xl border border-gray-200 p-6">
            <h3 className="font-bold text-lg mb-4">Quick Stats</h3>
            <div className="space-y-4">
              {[
                {
                  label: 'Total Departments',
                  value: stats?.totalDepartments || 0,
                  color: 'text-gray-900'
                },
                {
                  label: 'Avg. Attendance',
                  value: `${stats?.attendancePercentage?.toFixed(1) || 0}%`,
                  color: (stats?.attendancePercentage || 0) >= 90 ? 'text-green-600' : 'text-yellow-600'
                },
                {
                  label: 'Monthly Revenue',
                  value: new Intl.NumberFormat('en-US', {
                    style: 'currency',
                    currency: 'USD',
                    minimumFractionDigits: 0
                  }).format(stats?.monthlyRevenue || 0),
                  color: 'text-blue-600'
                },
              ].map((stat, index) => (
                <div key={index} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                  <span className="text-gray-600">{stat.label}</span>
                  <span className={`font-bold ${stat.color}`}>{stat.value}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Recent Activities */}
          <div className="bg-white rounded-xl border border-gray-200 p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-bold text-lg">Recent Activities</h3>
              <button className="text-sm text-blue-600 hover:text-blue-700 font-medium">
                View All
              </button>
            </div>
            <div className="space-y-4">
              {/* Check if recentActivities is an array and has length, otherwise display fallback */}
              {stats?.recentActivities?.length ? (
                stats.recentActivities.map((activity, index) => (
                  <div key={index} className="flex items-start gap-3 p-3 hover:bg-gray-50 rounded-lg transition-colors">
                    <div className="w-8 h-8 rounded-full bg-blue-100 flex items-center justify-center shrink-0">
                      <span className="text-blue-600 font-bold text-sm">
                        {activity.initials || '??'}
                      </span>
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm truncate">
                        <span className="font-semibold">{activity.user || 'Unknown User'}</span> {activity.action || 'performed an action'}
                      </p>
                      <p className="text-xs text-gray-500 mt-1">{activity.time || 'N/A'}</p>
                    </div>
                  </div>
                ))
              ) : (
                <div className="text-center text-gray-500 py-4">No recent activities available.</div>
              )}
            </div>
          </div>

          {/* Department Summary */}
          <div className="bg-white rounded-xl border border-gray-200 p-6">
            <h3 className="font-bold text-lg mb-4">Top Departments</h3>
            <div className="space-y-3">
              {/* Check if departmentStats is an array and has length, otherwise display fallback */}
              {stats?.departmentStats?.length ? (
                stats.departmentStats
                  .sort((a, b) => b.count - a.count)
                  .slice(0, 4)
                  .map((dept, index) => {
                    const deptCount = dept.count || 0;
                    const departmentName = dept.name || 'Unknown Department';
                    const avgSalary = Math.round(dept.avgSalary || 0).toLocaleString();
                    const percentage = totalEmployees > 0 ? ((deptCount / totalEmployees) * 100).toFixed(1) : 0;

                    return (
                      <div key={index} className="flex items-center justify-between">
                        <div className="flex-1">
                          <div className="flex justify-between mb-1">
                            <span className="text-sm font-medium text-gray-700">{departmentName}</span>
                            <span className="text-sm font-bold">{deptCount} {deptCount === 1 ? 'employee' : 'employees'}</span>
                          </div>
                          <div className="w-full bg-gray-200 rounded-full h-2">
                            <div
                              className="bg-blue-500 h-2 rounded-full"
                              style={{
                                // Ensure percentage doesn't exceed 100%
                                width: `${Math.min(100, percentage)}%`
                              }}
                            ></div>
                          </div>
                          <div className="flex justify-between mt-1">
                            <span className="text-xs text-gray-500">
                              Avg. Annual Salary: ₱{avgSalary}
                            </span>
                            <span className="text-xs text-gray-500">
                              {percentage}%
                            </span>
                          </div>
                        </div>
                      </div>
                    );
                  })
              ) : (
                <div className="text-center text-gray-500 py-4">No employee available yet.</div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Dashboard;