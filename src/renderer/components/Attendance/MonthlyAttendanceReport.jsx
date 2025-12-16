import React, { useState, useEffect } from 'react';
import { Calendar, Download, Filter, Loader2, Users, CheckCircle, XCircle, Clock, AlertCircle } from 'lucide-react';

const MonthlyAttendanceReport = () => {
  const [selectedMonth, setSelectedMonth] = useState(
    new Date().toISOString().split('T')[0].substring(0, 7) // YYYY-MM
  );
  const [reportData, setReportData] = useState([]);
  const [loading, setLoading] = useState(false);
  const [summary, setSummary] = useState({
    totalEmployees: 0,
    totalPresentDays: 0,
    totalAbsentDays: 0,
    totalLateDays: 0,
    totalLeaveDays: 0,
    averageAttendance: '0%'
  });

  useEffect(() => {
    generateReport();
  }, [selectedMonth]);

  // Calculate working days in a month (26 days total, 2 days off = 24 working days)
  const getWorkingDaysInMonth = (year, month) => {
    return 24; // Fixed 24 working days per month
  };

  // Calculate actual working days based on attendance records
  const calculateWorkingDays = (attendanceData) => {
    // Count unique days where there's at least one attendance record
    const uniqueDays = new Set();
    attendanceData.forEach(record => {
      if (record.date) {
        uniqueDays.add(record.date);
      }
    });
    return uniqueDays.size;
  };

  const generateReport = async () => {
    setLoading(true);
    try {
      const [year, month] = selectedMonth.split('-').map(Number);
      
      // Get real data from database
      const data = await window.electronAPI.getMonthlyAttendanceReport(year, month);
      
      setReportData(data || []);
      
      // Calculate summary statistics
      if (data && data.length > 0) {
        const totalEmployees = data.length;
        const totalPresentDays = data.reduce((sum, row) => sum + (row.present_days || 0), 0);
        const totalAbsentDays = data.reduce((sum, row) => sum + (row.absent_days || 0), 0);
        const totalLateDays = data.reduce((sum, row) => sum + (row.late_days || 0), 0);
        const totalLeaveDays = data.reduce((sum, row) => sum + (row.leave_days || 0), 0);
        
        // Working days per employee in this month
        const workingDaysPerMonth = getWorkingDaysInMonth(year, month);
        const totalPossibleDays = totalEmployees * workingDaysPerMonth;
        const averageAttendance = totalPossibleDays > 0 
          ? ((totalPresentDays / totalPossibleDays) * 100).toFixed(1) + '%'
          : '0%';
        
        setSummary({
          totalEmployees,
          totalPresentDays,
          totalAbsentDays,
          totalLateDays,
          totalLeaveDays,
          averageAttendance,
          workingDaysPerMonth
        });
      } else {
        setSummary({
          totalEmployees: 0,
          totalPresentDays: 0,
          totalAbsentDays: 0,
          totalLateDays: 0,
          totalLeaveDays: 0,
          averageAttendance: '0%',
          workingDaysPerMonth: getWorkingDaysInMonth(year, month)
        });
      }
    } catch (error) {
      console.error('Error generating report:', error);
      setReportData([]);
    } finally {
      setLoading(false);
    }
  };

  const handleExport = () => {
    if (reportData.length === 0) {
      alert('No data to export');
      return;
    }

    try {
      // Convert data to CSV
      const headers = ['Employee ID', 'Employee Name', 'Department', 'Present Days', 'Absent Days', 'Late Days', 'Leave Days', 'Total Recorded Days', 'Working Days Required', 'Attendance Rate'];
      const csvData = reportData.map(row => [
        row.employee_id,
        row.employee_name,
        row.department_name || 'No Department',
        row.present_days || 0,
        row.absent_days || 0,
        row.late_days || 0,
        row.leave_days || 0,
        row.total_recorded_days || 0,
        summary.workingDaysPerMonth,
        row.total_recorded_days > 0 
          ? `${(((row.present_days || 0) / row.total_recorded_days) * 100).toFixed(1)}%`
          : '0%'
      ]);
      
      const csvContent = [
        headers.join(','),
        ...csvData.map(row => row.join(','))
      ].join('\n');
      
      // Create download link
      const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `attendance-report-${selectedMonth}.csv`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(url);
    } catch (error) {
      console.error('Error exporting CSV:', error);
      alert('Error exporting data: ' + error.message);
    }
  };

  const formatDate = (yearMonth) => {
    const [year, month] = yearMonth.split('-');
    const date = new Date(year, month - 1);
    return date.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
  };

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-6">
      <div className="flex justify-between items-center mb-6">
        <div>
          <h3 className="text-lg font-semibold">Monthly Attendance Report</h3>
          <p className="text-gray-600">Detailed attendance breakdown for {formatDate(selectedMonth)}</p>
          <p className="text-sm text-gray-500 mt-1">
            Monthly requirement: 26 calendar days (24 working days + 2 days off)
          </p>
        </div>
        <div className="flex gap-3">
          <div className="flex items-center gap-2">
            <Calendar size={18} className="text-gray-500" />
            <input
              type="month"
              value={selectedMonth}
              onChange={(e) => setSelectedMonth(e.target.value)}
              className="px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              max={new Date().toISOString().split('T')[0].substring(0, 7)}
            />
          </div>
          <button
            onClick={handleExport}
            disabled={reportData.length === 0}
            className="flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <Download size={18} />
            Export CSV
          </button>
          <button
            onClick={generateReport}
            disabled={loading}
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
          >
            {loading ? <Loader2 size={18} className="animate-spin" /> : <Filter size={18} />}
            Refresh
          </button>
        </div>
      </div>

      {/* Summary Statistics */}
      <div className="grid grid-cols-2 md:grid-cols-6 gap-4 mb-6">
        <div className="bg-blue-50 p-4 rounded-lg border border-blue-100">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-600">Total Employees</p>
              <p className="text-xl font-bold mt-1">{summary.totalEmployees}</p>
            </div>
            <Users className="text-blue-500" size={20} />
          </div>
        </div>
        
        <div className="bg-green-50 p-4 rounded-lg border border-green-100">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-600">Present Days</p>
              <p className="text-xl font-bold mt-1">{summary.totalPresentDays}</p>
            </div>
            <CheckCircle className="text-green-500" size={20} />
          </div>
        </div>
        
        <div className="bg-red-50 p-4 rounded-lg border border-red-100">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-600">Absent Days</p>
              <p className="text-xl font-bold mt-1">{summary.totalAbsentDays}</p>
            </div>
            <XCircle className="text-red-500" size={20} />
          </div>
        </div>
        
        <div className="bg-yellow-50 p-4 rounded-lg border border-yellow-100">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-600">Late Days</p>
              <p className="text-xl font-bold mt-1">{summary.totalLateDays}</p>
            </div>
            <Clock className="text-yellow-500" size={20} />
          </div>
        </div>
        
        <div className="bg-purple-50 p-4 rounded-lg border border-purple-100">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-600">Leave Days</p>
              <p className="text-xl font-bold mt-1">{summary.totalLeaveDays}</p>
            </div>
            <AlertCircle className="text-purple-500" size={20} />
          </div>
        </div>
        
        <div className="bg-indigo-50 p-4 rounded-lg border border-indigo-100">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-600">Avg. Attendance</p>
              <p className="text-xl font-bold mt-1">{summary.averageAttendance}</p>
              <p className="text-xs text-gray-500 mt-1">{summary.workingDaysPerMonth || 24} working days</p>
            </div>
            <div className="w-5 h-5 rounded-full bg-indigo-500 flex items-center justify-center">
              <span className="text-xs text-white">%</span>
            </div>
          </div>
        </div>
      </div>

      {loading ? (
        <div className="flex flex-col items-center justify-center p-12">
          <Loader2 className="h-10 w-10 animate-spin text-blue-500 mb-4" />
          <p className="text-gray-600">Loading attendance data...</p>
          <p className="text-sm text-gray-500 mt-2">Querying database for {formatDate(selectedMonth)}</p>
        </div>
      ) : reportData.length === 0 ? (
        <div className="text-center py-12 border-2 border-dashed border-gray-200 rounded-lg">
          <Users className="h-12 w-12 text-gray-400 mx-auto mb-4" />
          <h3 className="text-lg font-medium text-gray-900 mb-2">No Attendance Data Found</h3>
          <p className="text-gray-600 mb-4">
            No attendance records found for {formatDate(selectedMonth)}
          </p>
          <div className="space-y-2 max-w-md mx-auto">
            <p className="text-sm text-gray-500">
              To see data here:
            </p>
            <ul className="text-sm text-gray-500 text-left list-disc pl-5 inline-block">
              <li>Mark employees as present or absent in the Attendance page</li>
              <li>Ensure you have active employees in the system</li>
              <li>Check if you have attendance records for this month</li>
            </ul>
          </div>
        </div>
      ) : (
        <>
          <div className="mb-4 flex items-center justify-between">
            <div>
              <h4 className="font-medium text-gray-900">Employee Breakdown</h4>
              <p className="text-sm text-gray-600">
                Showing {reportData.length} employee{reportData.length !== 1 ? 's' : ''}
              </p>
            </div>
            <div className="text-sm text-gray-600">
              Working days this month: <span className="font-semibold">{summary.workingDaysPerMonth || 24}</span>
              <span className="text-xs text-gray-400 ml-2">(26 days with 2 days off)</span>
            </div>
          </div>
          
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-200">
                  <th className="py-3 px-4 text-left text-sm font-semibold text-gray-900">Employee</th>
                  <th className="py-3 px-4 text-left text-sm font-semibold text-gray-900">Department</th>
                  <th className="py-3 px-4 text-left text-sm font-semibold text-gray-900">Present Days</th>
                  <th className="py-3 px-4 text-left text-sm font-semibold text-gray-900">Absent Days</th>
                  <th className="py-3 px-4 text-left text-sm font-semibold text-gray-900">Late Days</th>
                  <th className="py-3 px-4 text-left text-sm font-semibold text-gray-900">Leave Days</th>
                  <th className="py-3 px-4 text-left text-sm font-semibold text-gray-900">Total Recorded</th>
                  <th className="py-3 px-4 text-left text-sm font-semibold text-gray-900">Working Days</th>
                  <th className="py-3 px-4 text-left text-sm font-semibold text-gray-900">Attendance Rate</th>
                </tr>
              </thead>
              <tbody>
                {reportData.map((row) => {
                  const workingDaysRequired = summary.workingDaysPerMonth || 24;
                  const totalRecorded = row.total_recorded_days || 0;
                  const attendanceRate = totalRecorded > 0 
                    ? ((row.present_days || 0) / totalRecorded) * 100
                    : 0;
                  const workingDaysRate = workingDaysRequired > 0
                    ? ((row.present_days || 0) / workingDaysRequired) * 100
                    : 0;
                  
                  return (
                    <tr key={row.employee_id} className="border-b border-gray-200 hover:bg-gray-50">
                      <td className="py-3 px-4">
                        <div className="font-medium text-gray-900">{row.employee_name}</div>
                        <div className="text-xs text-gray-500">ID: {row.employee_id}</div>
                      </td>
                      <td className="py-3 px-4">
                        <span className="px-2 py-1 bg-gray-100 rounded text-sm">
                          {row.department_name || 'No Department'}
                        </span>
                      </td>
                      <td className="py-3 px-4">
                        <div className="flex items-center">
                          <div className="w-6 h-6 bg-green-100 rounded flex items-center justify-center mr-2">
                            <CheckCircle size={12} className="text-green-600" />
                          </div>
                          <span className="font-semibold text-green-600">{row.present_days || 0}</span>
                        </div>
                      </td>
                      <td className="py-3 px-4">
                        <div className="flex items-center">
                          <div className="w-6 h-6 bg-red-100 rounded flex items-center justify-center mr-2">
                            <XCircle size={12} className="text-red-600" />
                          </div>
                          <span className="font-semibold text-red-600">{row.absent_days || 0}</span>
                        </div>
                      </td>
                      <td className="py-3 px-4">
                        <div className="flex items-center">
                          <div className="w-6 h-6 bg-yellow-100 rounded flex items-center justify-center mr-2">
                            <Clock size={12} className="text-yellow-600" />
                          </div>
                          <span className="font-semibold text-yellow-600">{row.late_days || 0}</span>
                        </div>
                      </td>
                      <td className="py-3 px-4">
                        <div className="flex items-center">
                          <div className="w-6 h-6 bg-purple-100 rounded flex items-center justify-center mr-2">
                            <AlertCircle size={12} className="text-purple-600" />
                          </div>
                          <span className="font-semibold text-purple-600">{row.leave_days || 0}</span>
                        </div>
                      </td>
                      <td className="py-3 px-4">
                        <span className="font-medium text-gray-700">{totalRecorded}</span>
                        <div className="text-xs text-gray-500">
                          recorded days
                        </div>
                      </td>
                      <td className="py-3 px-4">
                        <div className="text-center">
                          <span className="font-medium text-gray-700">{row.present_days || 0}</span>
                          <div className="text-xs text-gray-500">
                            of {workingDaysRequired}
                          </div>
                        </div>
                      </td>
                      <td className="py-3 px-4">
                        <div className="space-y-2">
                          <div className="flex items-center">
                            <div className="w-full bg-gray-200 rounded-full h-2.5 mr-3">
                              <div 
                                className={`h-2.5 rounded-full ${
                                  attendanceRate >= 90 ? 'bg-green-500' :
                                  attendanceRate >= 75 ? 'bg-yellow-500' :
                                  'bg-red-500'
                                }`}
                                style={{ width: `${Math.min(attendanceRate, 100)}%` }}
                              ></div>
                            </div>
                            <span className={`text-xs font-semibold ${attendanceRate >= 90 ? 'text-green-600' : attendanceRate >= 75 ? 'text-yellow-600' : 'text-red-600'}`}>
                              {attendanceRate.toFixed(1)}%
                            </span>
                          </div>
                          <div className="text-xs text-gray-500 text-center">
                            Working days: {workingDaysRate.toFixed(1)}%
                          </div>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          
          {/* Legend */}
          <div className="mt-6 pt-4 border-t border-gray-200">
            <div className="flex flex-wrap gap-4">
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 bg-green-500 rounded-full"></div>
                <span className="text-sm text-gray-600">≥90% - Excellent</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 bg-yellow-500 rounded-full"></div>
                <span className="text-sm text-gray-600">75-89% - Good</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 bg-red-500 rounded-full"></div>
                <span className="text-sm text-gray-600">&lt;75% - Needs Improvement</span>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
};

export default MonthlyAttendanceReport;