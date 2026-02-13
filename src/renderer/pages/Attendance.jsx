import React, { useState, useEffect } from 'react';
import { Calendar, Clock, CheckCircle, XCircle, Users, Search, Filter, RefreshCw, Loader2, AlertCircle, ChevronLeft, ChevronRight } from 'lucide-react';
import AttendanceChart from '../components/Attendance/AttendanceChart';
import MonthlyAttendanceReport from '../components/Attendance/MonthlyAttendanceReport';

// Helper to get current time in Asia/Manila
const getManilaTime = () => {
  return new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Manila',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false
  }).format(new Date());
};

// Helper to get current date in Asia/Manila (YYYY-MM-DD)
const getManilaDate = () => {
  const d = new Date();
  const manilaDate = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Manila',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).format(d);
  return manilaDate;
};

const Attendance = () => {
  const [attendanceData, setAttendanceData] = useState([]);
  const [employees, setEmployees] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedDate, setSelectedDate] = useState(getManilaDate());
  const [searchTerm, setSearchTerm] = useState('');
  const [filterDepartment, setFilterDepartment] = useState('');
  const [departments, setDepartments] = useState([]);
  const [isRecording, setIsRecording] = useState(false);

  // Load initial data
  useEffect(() => {
    loadAttendanceData(selectedDate);
    loadEmployees();
    loadDepartments();
  }, [selectedDate]);

  const loadAttendanceData = async (date = null) => {
    try {
      setLoading(true);
      // Use the provided date or selectedDate
      const targetDate = date || selectedDate;

      // You need a new API method to get attendance for a specific date
      // Let's create one by querying the database
      const attendanceQuery = `
        SELECT * FROM attendance 
        WHERE date = ? 
        ORDER BY employee_id
      `;

      const data = await window.electronAPI.query(attendanceQuery, [targetDate]);
      setAttendanceData(data || []);
    } catch (error) {
      console.error('Error loading attendance:', error);
      setAttendanceData([]);
    } finally {
      setLoading(false);
    }
  };

  const loadEmployees = async () => {
    try {
      const data = await window.electronAPI.getAllEmployees();
      setEmployees(data || []);
    } catch (error) {
      console.error('Error loading employees:', error);
      setEmployees([]);
    }
  };

  const loadDepartments = async () => {
    try {
      const data = await window.electronAPI.getAllDepartments();
      setDepartments(data || []);
    } catch (error) {
      console.error('Error loading departments:', error);
      setDepartments([]);
    }
  };

  const handleTimeIn = async (employeeId) => {
    try {
      setIsRecording(true);
      const currentTime = getManilaTime();

      const attendanceRecord = {
        employee_id: employeeId,
        date: selectedDate,
        status: 'Present',
        check_in: currentTime,
        notes: `Timed in at ${currentTime} (Manila Time)`
      };

      await window.electronAPI.recordAttendance(attendanceRecord);
      await loadAttendanceData(selectedDate);

      const employee = employees.find(emp => emp.id === employeeId);
      if (employee) {
        console.log(`Successfully timed in ${employee.first_name} at ${currentTime}`);
      }
    } catch (error) {
      console.error('Error recording time in:', error);
      alert(`Error: ${error.message}`);
    } finally {
      setIsRecording(false);
    }
  };

  const handleTimeOut = async (employeeId) => {
    try {
      setIsRecording(true);
      const currentTime = getManilaTime();

      const attendanceRecord = {
        employee_id: employeeId,
        date: selectedDate,
        check_out: currentTime,
        status: 'Present', // Ensure status stays Present
        notes: `Timed out at ${currentTime} (Manila Time)`
      };

      await window.electronAPI.recordAttendance(attendanceRecord);
      await loadAttendanceData(selectedDate);

      const employee = employees.find(emp => emp.id === employeeId);
      if (employee) {
        console.log(`Successfully timed out ${employee.first_name} at ${currentTime}`);
      }
    } catch (error) {
      console.error('Error recording time out:', error);
      alert(`Error: ${error.message}`);
    } finally {
      setIsRecording(false);
    }
  };

  const handleMarkAbsent = async (employeeId) => {
    try {
      setIsRecording(true);

      const attendanceRecord = {
        employee_id: employeeId,
        date: selectedDate,
        status: 'Absent',
        check_in: null,
        check_out: null,
        notes: 'Marked as Absent'
      };

      await window.electronAPI.recordAttendance(attendanceRecord);
      await loadAttendanceData(selectedDate);
    } catch (error) {
      console.error('Error marking absent:', error);
      alert(`Error: ${error.message}`);
    } finally {
      setIsRecording(false);
    }
  };

  const handleMarkAllPresent = async () => {
    if (!window.confirm(`Mark all employees as present (timed in) for ${selectedDate}?`)) {
      return;
    }

    try {
      setIsRecording(true);
      const currentTime = getManilaTime();

      for (const employee of filteredEmployees) {
        const existingRecord = attendanceData.find(record =>
          record.employee_id === employee.id &&
          record.date === selectedDate
        );

        if (!existingRecord) {
          const attendanceRecord = {
            employee_id: employee.id,
            date: selectedDate,
            status: 'Present',
            check_in: currentTime,
            notes: 'Bulk marked present (timed in)'
          };

          await window.electronAPI.recordAttendance(attendanceRecord);
        }
      }

      await loadAttendanceData(selectedDate);
    } catch (error) {
      console.error('Error bulk marking attendance:', error);
      alert(`Error: ${error.message}`);
    } finally {
      setIsRecording(false);
    }
  };

  const formatTime = (time) => {
    if (!time) return '--:--';
    return time.substring(0, 5); // Remove seconds
  };

  const getStatusColor = (status) => {
    switch (status) {
      case 'Present': return 'bg-green-100 text-green-800';
      case 'Absent': return 'bg-red-100 text-red-800';
      case 'Late': return 'bg-yellow-100 text-yellow-800';
      case 'On Leave': return 'bg-blue-100 text-blue-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  };

  // Filter employees
  const filteredEmployees = employees.filter(employee => {
    // Filter by search term
    if (searchTerm && !`${employee.first_name} ${employee.last_name}`.toLowerCase().includes(searchTerm.toLowerCase())) {
      return false;
    }

    // Filter by department
    if (filterDepartment && employee.department_id != filterDepartment) {
      return false;
    }

    return true;
  });

  // Get attendance summary
  const presentCount = attendanceData.filter(record => record.status === 'Present').length;
  const absentCount = attendanceData.filter(record => record.status === 'Absent').length;
  const totalEmployees = employees.length;

  // Navigate dates
  const navigateDate = (days) => {
    const currentDate = new Date(selectedDate);
    currentDate.setDate(currentDate.getDate() + days);
    setSelectedDate(currentDate.toISOString().split('T')[0]);
  };

  const isToday = selectedDate === getManilaDate();

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-xl md:text-2xl font-bold text-gray-900">Attendance</h1>
          <p className="text-gray-600 mt-1">Track and manage employee attendance</p>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={() => navigateDate(-1)}
            className="p-2 hover:bg-gray-100 rounded-lg"
            title="Previous day"
          >
            <ChevronLeft size={20} />
          </button>

          <div className="flex items-center gap-2 px-4 py-2 bg-white border border-gray-300 rounded-lg">
            <Calendar size={18} className="text-gray-500" />
            <input
              type="date"
              value={selectedDate}
              onChange={(e) => setSelectedDate(e.target.value)}
              className="bg-transparent outline-none"
            />
            {!isToday && (
              <button
                onClick={() => setSelectedDate(getManilaDate())}
                className="text-sm text-blue-600 hover:text-blue-800"
              >
                Today
              </button>
            )}
          </div>

          <button
            onClick={() => navigateDate(1)}
            className="p-2 hover:bg-gray-100 rounded-lg"
            title="Next day"
          >
            <ChevronRight size={20} />
          </button>

          <button
            onClick={loadAttendanceData}
            disabled={loading}
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50"
          >
            <RefreshCw size={18} className={loading ? 'animate-spin' : ''} />
            Refresh
          </button>

          <button
            onClick={() => window.open('#/kiosk', '_self')}
            className="flex items-center gap-2 px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition-colors shadow-sm ml-2"
            title="Launch Kiosk Mode"
          >
            <Clock size={18} />
            <span className="hidden md:inline">Kiosk Mode</span>
          </button>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="bg-white p-6 rounded-xl border border-gray-200 shadow-sm">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-600">Total Employees</p>
              <p className="text-xl font-bold mt-1">{totalEmployees}</p>
            </div>
            <Users className="text-blue-500" size={24} />
          </div>
        </div>

        <div className="bg-white p-6 rounded-xl border border-gray-200 shadow-sm">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-600">Present Today</p>
              <p className="text-xl font-bold mt-1 text-green-600">{presentCount}</p>
            </div>
            <CheckCircle className="text-green-500" size={24} />
          </div>
        </div>

        <div className="bg-white p-6 rounded-xl border border-gray-200 shadow-sm">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-600">Absent Today</p>
              <p className="text-xl font-bold mt-1 text-red-600">{absentCount}</p>
            </div>
            <XCircle className="text-red-500" size={24} />
          </div>
        </div>

        <div className="bg-white p-6 rounded-xl border border-gray-200 shadow-sm">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-600">Attendance Rate</p>
              <p className="text-xl font-bold mt-1 text-blue-600">
                {totalEmployees > 0 ? `${((presentCount / totalEmployees) * 100).toFixed(1)}%` : '0%'}
              </p>
            </div>
            <Clock className="text-blue-500" size={24} />
          </div>
        </div>
      </div>

      {/* Filters and Actions */}
      <div className="bg-white p-4 rounded-xl border border-gray-200">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex flex-col md:flex-row gap-4">
            {/* Search */}
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" size={18} />
              <input
                type="text"
                placeholder="Search employees..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-10 pr-4 py-2 border border-gray-300 rounded-lg w-full md:w-64 focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            {/* Department Filter */}
            <div className="flex items-center gap-2">
              <Filter size={18} className="text-gray-500" />
              <select
                value={filterDepartment}
                onChange={(e) => setFilterDepartment(e.target.value)}
                className="px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="">All Departments</option>
                {departments.map(dept => (
                  <option key={dept.id} value={dept.id}>
                    {dept.name}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="flex gap-3">
            <button
              onClick={handleMarkAllPresent}
              disabled={isRecording || filteredEmployees.length === 0}
              className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50 flex items-center gap-2"
            >
              {isRecording ? (
                <Loader2 size={18} className="animate-spin" />
              ) : (
                <CheckCircle size={18} />
              )}
              Mark All Present
            </button>

            <button
              onClick={() => {
                setSearchTerm('');
                setFilterDepartment('');
              }}
              className="px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50"
            >
              Clear Filters
            </button>
          </div>
        </div>
      </div>

      {/* Attendance Table */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="p-4 border-b border-gray-200 bg-gray-50">
          <h3 className="font-semibold text-gray-900">
            Employee Attendance for {new Date(selectedDate).toLocaleDateString('en-US', {
              weekday: 'long',
              year: 'numeric',
              month: 'long',
              day: 'numeric'
            })}
          </h3>
          <p className="text-sm text-gray-600">
            Showing {filteredEmployees.length} employee{filteredEmployees.length !== 1 ? 's' : ''}
          </p>
        </div>

        {loading ? (
          <div className="flex items-center justify-center p-12">
            <Loader2 className="h-8 w-8 animate-spin text-blue-500" />
          </div>
        ) : filteredEmployees.length === 0 ? (
          <div className="text-center py-12">
            <Users className="h-12 w-12 text-gray-400 mx-auto mb-4" />
            <h3 className="text-lg font-medium text-gray-900 mb-2">No Employees Found</h3>
            <p className="text-gray-600">Try adjusting your search or filter criteria</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-200">
                  <th className="py-3 px-4 text-left text-sm font-semibold text-gray-900">Employee</th>
                  <th className="py-3 px-4 text-left text-sm font-semibold text-gray-900">Department</th>
                  <th className="py-3 px-4 text-left text-sm font-semibold text-gray-900">Position</th>
                  <th className="py-3 px-4 text-left text-sm font-semibold text-gray-900">Check In</th>
                  <th className="py-3 px-4 text-left text-sm font-semibold text-gray-900">Check Out</th>
                  <th className="py-3 px-4 text-left text-sm font-semibold text-gray-900">Status</th>
                  <th className="py-3 px-4 text-left text-sm font-semibold text-gray-900">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredEmployees.map(employee => {
                  const attendanceRecord = attendanceData.find(record =>
                    record.employee_id === employee.id
                  );

                  return (
                    <tr key={employee.id} className="border-b border-gray-200 hover:bg-gray-50">
                      <td className="py-4 px-4">
                        <div className="flex items-center gap-3">
                          <div className="w-8 h-8 bg-blue-100 rounded-full flex items-center justify-center">
                            <span className="text-sm font-semibold text-blue-600">
                              {employee.first_name.charAt(0)}{employee.last_name.charAt(0)}
                            </span>
                          </div>
                          <div>
                            <p className="font-medium text-gray-900">
                              {employee.first_name} {employee.last_name}
                            </p>
                            <p className="text-sm text-gray-600">{employee.company_id}</p>
                          </div>
                        </div>
                      </td>
                      <td className="py-4 px-4">
                        <span className="text-gray-900">{employee.department_name || 'No Department'}</span>
                      </td>
                      <td className="py-4 px-4">
                        <span className="text-gray-900">{employee.position}</span>
                      </td>
                      <td className="py-4 px-4">
                        <span className={`font-mono ${attendanceRecord?.check_in ? 'text-gray-900' : 'text-gray-400'}`}>
                          {formatTime(attendanceRecord?.check_in)}
                        </span>
                      </td>
                      <td className="py-4 px-4">
                        <span className={`font-mono ${attendanceRecord?.check_out ? 'text-gray-900' : 'text-gray-400'}`}>
                          {formatTime(attendanceRecord?.check_out)}
                        </span>
                      </td>
                      <td className="py-4 px-4">
                        {attendanceRecord ? (
                          <span className={`px-3 py-1 rounded-full text-xs font-semibold ${getStatusColor(attendanceRecord.status)}`}>
                            {attendanceRecord.status}
                          </span>
                        ) : (
                          <span className="px-3 py-1 rounded-full text-xs font-semibold bg-gray-100 text-gray-800">
                            Not Recorded
                          </span>
                        )}
                      </td>
                      <td className="py-4 px-4">
                        <div className="flex gap-2">
                          {!attendanceRecord?.check_in && (
                            <button
                              onClick={() => handleTimeIn(employee.id)}
                              disabled={isRecording || attendanceRecord?.status === 'Absent'}
                              className="px-3 py-1.5 bg-green-100 text-green-700 rounded-lg text-sm font-medium hover:bg-green-200 disabled:opacity-50 flex items-center gap-1"
                            >
                              <Clock size={14} />
                              Time In
                            </button>
                          )}

                          {attendanceRecord?.check_in && !attendanceRecord?.check_out && (
                            <button
                              onClick={() => handleTimeOut(employee.id)}
                              disabled={isRecording}
                              className="px-3 py-1.5 bg-orange-100 text-orange-700 rounded-lg text-sm font-medium hover:bg-orange-200 disabled:opacity-50 flex items-center gap-1"
                            >
                              <Clock size={14} />
                              Time Out
                            </button>
                          )}

                          {attendanceRecord?.status !== 'Absent' && !attendanceRecord?.check_in && (
                            <button
                              onClick={() => handleMarkAbsent(employee.id)}
                              disabled={isRecording}
                              className="px-3 py-1.5 bg-red-100 text-red-700 rounded-lg text-sm font-medium hover:bg-red-200 disabled:opacity-50 flex items-center gap-1"
                            >
                              <XCircle size={14} />
                              Absent
                            </button>
                          )}

                          {attendanceRecord && (
                            <button
                              onClick={async () => {
                                if (window.confirm('Remove attendance record?')) {
                                  try {
                                    setIsRecording(true);
                                    await window.electronAPI.execute('DELETE FROM attendance WHERE employee_id = ? AND date = ?', [employee.id, selectedDate]);
                                    await loadAttendanceData(selectedDate);
                                  } catch (err) {
                                    console.error('Error deleting record:', err);
                                  } finally {
                                    setIsRecording(false);
                                  }
                                }
                              }}
                              disabled={isRecording}
                              className="px-3 py-1.5 bg-gray-100 text-gray-700 rounded-lg text-sm font-medium hover:bg-gray-200 disabled:opacity-50"
                            >
                              Remove
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
      <AttendanceChart />
      <MonthlyAttendanceReport />
      {/* Help Section */}
      <div className="bg-blue-50 border border-blue-200 rounded-xl p-4">
        <div className="flex items-start gap-3">
          <AlertCircle className="text-blue-600 mt-0.5 flex-shrink-0" size={20} />
          <div>
            <h4 className="font-medium text-blue-900">How to Use Attendance Tracking</h4>
            <ul className="text-sm text-blue-800 mt-2 space-y-1">
              <li>• Select a date to view/manage attendance for that day</li>
              <li>• Click "Present" or "Absent" buttons to mark individual employees</li>
              <li>• Use "Mark All Present" to quickly mark all employees as present</li>
              <li>• Search and filter by department to find specific employees</li>
              <li>• Attendance records are stored in your database and can be exported</li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Attendance;