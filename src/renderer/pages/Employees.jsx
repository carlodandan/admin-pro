import React, { useState, useEffect } from 'react';
import { Plus, Filter, Download, Search, MoreVertical, Eye, Edit, Trash2, Mail, Phone, UserPlus, Users, Calendar, CreditCard, Loader2 } from 'lucide-react';
import AddEmployeeModal from '../components/Employees/AddEmployeeModal';

const Employees = () => {
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedDepartment, setSelectedDepartment] = useState('All');
  const [selectedStatus, setSelectedStatus] = useState('All');
  const [employees, setEmployees] = useState([]);
  const [loading, setLoading] = useState(true);
  const [departments, setDepartments] = useState([]);
  const [showAddModal, setShowAddModal] = useState(false);
  const [stats, setStats] = useState({
    totalEmployees: 0,
    activeToday: 0,
    onLeave: 0,
    avgSalary: 0
  });

  useEffect(() => {
    loadEmployees();
    loadDepartments();
  }, []);

  const loadEmployees = async () => {
    try {
      setLoading(true);
      const data = await window.electronAPI.getAllEmployees();
      console.log('Loaded employees:', data); // Debug log
      setEmployees(data || []);
      calculateStats(data || []);
    } catch (error) {
      console.error('Error loading employees:', error);
      setEmployees([]);
    } finally {
      setLoading(false);
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

  const calculateStats = (employeeData) => {
    if (!employeeData || employeeData.length === 0) {
      setStats({
        totalEmployees: 0,
        activeToday: 0,
        onLeave: 0,
        avgSalary: 0
      });
      return;
    }

    const total = employeeData.length;
    const active = employeeData.filter(e => e.status === 'Active').length;
    const onLeave = employeeData.filter(e => e.status === 'On Leave').length;
    const avgSalary = employeeData.reduce((sum, e) => sum + parseFloat(e.salary || 0), 0) / employeeData.length;

    setStats({
      totalEmployees: total,
      activeToday: active,
      onLeave: onLeave,
      avgSalary: Math.round(avgSalary)
    });
  };

  // Handle delete employee
  const handleDeleteEmployee = async (id) => {
    if (window.confirm('Are you sure you want to delete this employee?')) {
      try {
        await window.electronAPI.deleteEmployee(id);
        await loadEmployees(); // Refresh the list
      } catch (error) {
        console.error('Error deleting employee:', error);
        alert('Failed to delete employee');
      }
    }
  };

  // Transform database employee to UI employee
  const transformEmployeeForUI = (employee) => {
    if (!employee) return null;
    
    const firstName = employee.first_name || '';
    const lastName = employee.last_name || '';
    const fullName = `${firstName} ${lastName}`.trim();
    
    // Generate avatar initials
    const avatarText = (firstName[0] || '') + (lastName[0] || '') || '??';
    
    // Color mapping for avatars based on department
    const department = employee.department_name || 'Unknown';
    const avatarColors = {
      'Engineering': 'bg-blue-100',
      'Product': 'bg-purple-100',
      'Design': 'bg-green-100',
      'Human Resources': 'bg-yellow-100',
      'Sales': 'bg-red-100',
      'Marketing': 'bg-pink-100',
      'Finance': 'bg-indigo-100',
      'Unknown': 'bg-gray-100'
    };

    return {
      id: employee.id,
      name: fullName || 'Unknown Name',
      position: employee.position || 'Unknown',
      department: department,
      email: employee.email || 'No email',
      phone: employee.phone || 'No phone',
      hireDate: employee.hire_date ? new Date(employee.hire_date).toLocaleDateString() : 'Unknown',
      status: employee.status || 'Unknown',
      companyId: employee.company_id || 'No ID',
      salary: employee.salary ? `$${parseInt(employee.salary).toLocaleString()}` : '$0',
      avatarColor: avatarColors[department] || 'bg-gray-100',
      avatarText: avatarText,
      rawSalary: parseFloat(employee.salary || 0)
    };
  };

  const statuses = ['All', 'Active', 'Inactive', 'On Leave'];

  const filteredEmployees = (employees || [])
    .map(transformEmployeeForUI)
    .filter(employee => {
      if (!employee) return false;
      
      const matchesSearch = employee.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
                           employee.email.toLowerCase().includes(searchTerm.toLowerCase()) ||
                           employee.companyId.toLowerCase().includes(searchTerm.toLowerCase());
      const matchesDepartment = selectedDepartment === 'All' || employee.department === selectedDepartment;
      const matchesStatus = selectedStatus === 'All' || employee.status === selectedStatus;
      
      return matchesSearch && matchesDepartment && matchesStatus;
    })
    .filter(Boolean); // Remove any null values

  const getStatusColor = (status) => {
    switch (status) {
      case 'Active': return 'bg-green-100 text-green-800';
      case 'Inactive': return 'bg-red-100 text-red-800';
      case 'On Leave': return 'bg-yellow-100 text-yellow-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  };

  const getDepartmentColor = (department) => {
    switch (department) {
      case 'Engineering': return 'bg-blue-100 text-blue-800';
      case 'Product': return 'bg-purple-100 text-purple-800';
      case 'Design': return 'bg-green-100 text-green-800';
      case 'Human Resources': return 'bg-yellow-100 text-yellow-800';
      case 'Sales': return 'bg-red-100 text-red-800';
      case 'Marketing': return 'bg-pink-100 text-pink-800';
      case 'Finance': return 'bg-indigo-100 text-indigo-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  };

  // Format currency
  const formatCurrency = (amount) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0
    }).format(amount);
  };

  // Get unique departments from employees
  const uniqueDepartments = ['All', ...new Set((employees || []).map(e => e.department_name).filter(Boolean))];

  // Handle Add Employee button click
  const handleAddEmployeeClick = () => {
    setShowAddModal(true);
  };

  // Callback when employee is added
  const handleEmployeeAdded = () => {
    loadEmployees(); // Refresh the list
  };

  // Handle view employee details
  const handleViewEmployee = (id) => {
    console.log('View employee details:', id);
    // You can implement a modal or navigate to employee detail page
  };

  // Handle edit employee
  const handleEditEmployee = (id) => {
    console.log('Edit employee:', id);
    // You can implement edit modal or form
  };

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold text-gray-900">Employee Management</h1>
          <p className="text-gray-600 mt-1">Manage all employee information, departments, and roles</p>
        </div>
        <div className="flex gap-3">
          <button 
            className="flex items-center gap-2 px-4 py-2.5 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
            onClick={() => console.log('Export functionality')}
          >
            <Download size={18} />
            Export
          </button>
          <button 
            onClick={handleAddEmployeeClick}
            className="flex items-center gap-2 px-4 py-2.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
          >
            <UserPlus size={18} />
            Add Employee
          </button>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="bg-white p-5 rounded-xl border border-gray-200">
          <div className="flex justify-between items-start">
            <div>
              <p className="text-sm text-gray-600">Total Employees</p>
              <p className="text-2xl font-bold mt-1">{stats.totalEmployees}</p>
            </div>
            <div className="p-2 bg-blue-50 rounded-lg">
              <Users className="text-blue-500" size={20} />
            </div>
          </div>
          <p className="text-sm text-green-600 mt-2">
            {stats.totalEmployees > 0 ? `${stats.totalEmployees} employees in system` : 'No employees yet'}
          </p>
        </div>
        
        <div className="bg-white p-5 rounded-xl border border-gray-200">
          <div className="flex justify-between items-start">
            <div>
              <p className="text-sm text-gray-600">Active</p>
              <p className="text-2xl font-bold mt-1">{stats.activeToday}</p>
            </div>
            <div className="p-2 bg-green-50 rounded-lg">
              <Users className="text-green-500" size={20} />
            </div>
          </div>
          <p className="text-sm text-gray-600 mt-2">
            {stats.activeToday > 0 ? 'Active employees' : 'No active employees'}
          </p>
        </div>
        
        <div className="bg-white p-5 rounded-xl border border-gray-200">
          <div className="flex justify-between items-start">
            <div>
              <p className="text-sm text-gray-600">On Leave</p>
              <p className="text-2xl font-bold mt-1">{stats.onLeave}</p>
            </div>
            <div className="p-2 bg-yellow-50 rounded-lg">
              <Calendar className="text-yellow-500" size={20} />
            </div>
          </div>
          <p className="text-sm text-gray-600 mt-2">
            {stats.onLeave > 0 ? 'Employees on leave' : 'No employees on leave'}
          </p>
        </div>
        
        <div className="bg-white p-5 rounded-xl border border-gray-200">
          <div className="flex justify-between items-start">
            <div>
              <p className="text-sm text-gray-600">Avg. Salary</p>
              <p className="text-2xl font-bold mt-1">{formatCurrency(stats.avgSalary)}</p>
            </div>
            <div className="p-2 bg-purple-50 rounded-lg">
              <CreditCard className="text-purple-500" size={20} />
            </div>
          </div>
          <p className="text-sm text-gray-600 mt-2">
            {stats.avgSalary > 0 ? 'Average salary' : 'No salary data'}
          </p>
        </div>
      </div>

      {/* Filters and Search */}
      <div className="bg-white rounded-xl border border-gray-200 p-5">
        <div className="flex flex-col md:flex-row gap-4">
          {/* Search */}
          <div className="flex-1">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" size={20} />
              <input
                type="text"
                placeholder="Search employees by name, email, or ID..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-10 pr-4 py-2.5 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
            </div>
          </div>

          {/* Filters */}
          <div className="flex gap-3">
            <select
              value={selectedDepartment}
              onChange={(e) => setSelectedDepartment(e.target.value)}
              className="px-4 py-2.5 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            >
              {uniqueDepartments.map(dept => (
                <option key={dept} value={dept}>
                  {dept === 'All' ? 'All Departments' : dept}
                </option>
              ))}
            </select>

            <select
              value={selectedStatus}
              onChange={(e) => setSelectedStatus(e.target.value)}
              className="px-4 py-2.5 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            >
              {statuses.map(status => (
                <option key={status} value={status}>
                  {status}
                </option>
              ))}
            </select>

            <button 
              className="flex items-center gap-2 px-4 py-2.5 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
              onClick={() => console.log('More filters')}
            >
              <Filter size={18} />
              More Filters
            </button>
          </div>
        </div>
      </div>

      {/* Employee Table */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center p-12">
            <div className="flex flex-col items-center gap-3">
              <Loader2 className="h-8 w-8 animate-spin text-blue-500" />
              <p className="text-gray-600">Loading employees...</p>
            </div>
          </div>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="py-4 px-6 text-left text-sm font-semibold text-gray-700">Employee</th>
                    <th className="py-4 px-6 text-left text-sm font-semibold text-gray-700">Position</th>
                    <th className="py-4 px-6 text-left text-sm font-semibold text-gray-700">Department</th>
                    <th className="py-4 px-6 text-left text-sm font-semibold text-gray-700">Contact</th>
                    <th className="py-4 px-6 text-left text-sm font-semibold text-gray-700">Status</th>
                    <th className="py-4 px-6 text-left text-sm font-semibold text-gray-700">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200">
                  {filteredEmployees.length === 0 ? (
                    <tr>
                      <td colSpan="6" className="py-8 px-6 text-center text-gray-500">
                        {employees.length === 0 ? 'No employees found. Add your first employee using the "Add Employee" button.' : 'No employees match your filters.'}
                      </td>
                    </tr>
                  ) : (
                    filteredEmployees.map((employee) => (
                      <tr key={employee.id} className="hover:bg-gray-50">
                        <td className="py-4 px-6">
                          <div className="flex items-center gap-3">
                            <div className={`${employee.avatarColor} w-10 h-10 rounded-full flex items-center justify-center`}>
                              <span className="font-semibold text-gray-800">{employee.avatarText}</span>
                            </div>
                            <div>
                              <p className="font-medium">{employee.name}</p>
                              <p className="text-sm text-gray-500">ID: {employee.companyId}</p>
                              <p className="text-xs text-gray-400">Hired: {employee.hireDate}</p>
                            </div>
                          </div>
                        </td>
                        <td className="py-4 px-6">
                          <div>
                            <p className="font-medium">{employee.position}</p>
                            <p className="text-sm text-gray-500">{employee.salary}/year</p>
                          </div>
                        </td>
                        <td className="py-4 px-6">
                          <span className={`px-3 py-1 rounded-full text-xs font-medium ${getDepartmentColor(employee.department)}`}>
                            {employee.department}
                          </span>
                        </td>
                        <td className="py-4 px-6">
                          <div className="space-y-1">
                            <div className="flex items-center gap-2">
                              <Mail size={14} className="text-gray-400" />
                              <span className="text-sm truncate max-w-45">{employee.email}</span>
                            </div>
                            <div className="flex items-center gap-2">
                              <Phone size={14} className="text-gray-400" />
                              <span className="text-sm">{employee.phone}</span>
                            </div>
                          </div>
                        </td>
                        <td className="py-4 px-6">
                          <span className={`px-3 py-1 rounded-full text-xs font-medium ${getStatusColor(employee.status)}`}>
                            {employee.status}
                          </span>
                        </td>
                        <td className="py-4 px-6">
                          <div className="flex items-center gap-2">
                            <button 
                              className="p-2 hover:bg-gray-100 rounded-lg" 
                              title="View Details"
                              onClick={() => handleViewEmployee(employee.id)}
                            >
                              <Eye size={18} className="text-blue-600" />
                            </button>
                            <button 
                              className="p-2 hover:bg-gray-100 rounded-lg" 
                              title="Edit"
                              onClick={() => handleEditEmployee(employee.id)}
                            >
                              <Edit size={18} className="text-green-600" />
                            </button>
                            <button 
                              className="p-2 hover:bg-gray-100 rounded-lg" 
                              title="Delete"
                              onClick={() => handleDeleteEmployee(employee.id)}
                            >
                              <Trash2 size={18} className="text-red-600" />
                            </button>
                            <button 
                              className="p-2 hover:bg-gray-100 rounded-lg"
                              onClick={() => console.log('More options')}
                            >
                              <MoreVertical size={18} className="text-gray-600" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>

            {/* Pagination */}
            <div className="p-6 border-t border-gray-200 flex flex-col sm:flex-row justify-between items-center gap-4">
              <div className="text-sm text-gray-600">
                Showing {filteredEmployees.length > 0 ? 1 : 0} to {filteredEmployees.length} of {employees.length} employees
              </div>
              <div className="flex gap-2">
                <button 
                  className="px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
                  disabled={true}
                >
                  Previous
                </button>
                <button className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700">
                  1
                </button>
                <button 
                  className="px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50"
                  disabled={true}
                >
                  Next
                </button>
              </div>
            </div>
          </>
        )}
      </div>

      {/* Department Distribution */}
      <div className="bg-white rounded-xl border border-gray-200 p-6">
        <h3 className="font-bold text-lg mb-4">Department Distribution</h3>
        {departments.length === 0 ? (
          <p className="text-gray-500 text-center py-4">No departments found. Add departments to see distribution.</p>
        ) : (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {departments.slice(0, 4).map((dept, index) => {
              const employeeCount = (employees || []).filter(e => e.department_name === dept.name).length;
              const percentage = employees.length > 0 ? (employeeCount / employees.length * 100).toFixed(1) : 0;
              const colorMap = {
                'Engineering': 'bg-blue-500',
                'Product': 'bg-indigo-500',
                'Design': 'bg-teal-500',
                'Human Resources': 'bg-yellow-500',
                'Sales': 'bg-green-500',
                'Marketing': 'bg-purple-500',
                'Finance': 'bg-pink-500'
              };
              
              return (
                <div key={index} className="p-4 border border-gray-200 rounded-lg">
                  <div className="flex items-center justify-between mb-2">
                    <span className="font-medium">{dept.name}</span>
                    <span className="text-lg font-bold">{employeeCount}</span>
                  </div>
                  <div className="w-full h-2 bg-gray-200 rounded-full overflow-hidden">
                    <div 
                      className={`h-full ${colorMap[dept.name] || 'bg-gray-500'} rounded-full`}
                      style={{ width: `${percentage}%` }}
                    ></div>
                  </div>
                  <p className="text-sm text-gray-500 mt-2">{percentage}% of total ({employeeCount} employees)</p>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Add Employee Modal */}
      <AddEmployeeModal 
        isOpen={showAddModal}
        onClose={() => setShowAddModal(false)}
        onEmployeeAdded={handleEmployeeAdded}
      />
    </div>
  );
};

export default Employees;