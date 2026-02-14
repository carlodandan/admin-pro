import React, { useState, useEffect } from 'react';
import { X, User, Mail, Phone, Briefcase, PhilippinePeso, Calendar, Building, Save, Loader2, AlertCircle } from 'lucide-react';

const AddEmployee = ({ isOpen, onClose, onEmployeeAdded }) => {
  const [loading, setLoading] = useState(false);
  const [loadingDepartments, setLoadingDepartments] = useState(true);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const [formData, setFormData] = useState({
    first_name: '',
    last_name: '',
    email: '',
    phone: '',
    position: '',
    department_id: '',
    salary: '',
    hire_date: new Date().toISOString().split('T')[0],
    status: 'Active'
  });

  const [departments, setDepartments] = useState([]);

  // Load departments from database
  useEffect(() => {
    if (isOpen) {
      loadDepartments();
    }
  }, [isOpen]);

  const loadDepartments = async () => {
    try {
      setLoadingDepartments(true);
      const data = await window.electronAPI.getAllDepartments();

      if (data && data.length > 0) {
        setDepartments(data.map(dept => ({
          id: dept.id,
          name: dept.name
        })));

        // Set default department to first one if not set
        if (!formData.department_id && data.length > 0) {
          setFormData(prev => ({
            ...prev,
            department_id: data[0].id
          }));
        }
      } else {
        setDepartments([]);
      }
    } catch (error) {
      console.error('Error loading departments:', error);
      setError('Failed to load departments from database');
      setDepartments([]);
    } finally {
      setLoadingDepartments(false);
    }
  };

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: name === 'salary' ? parseFloat(value) || 0 : value
    }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    // Validate department selection
    if (!formData.department_id) {
      setError('Please select a department for the employee');
      return;
    }

    setLoading(true);
    setError('');
    setSuccess('');

    try {
      // Generate company ID
      const company_id = `EMP-${Date.now().toString().slice(-6)}`;

      const employeeData = {
        ...formData,
        company_id,
        salary: parseFloat(formData.salary) || 0
      };



      const result = await window.electronAPI.createEmployee(employeeData);

      if (result && (result.id || result.changes > 0)) {
        setSuccess('Employee added successfully!');

        // Clear form
        setFormData({
          first_name: '',
          last_name: '',
          email: '',
          phone: '',
          position: '',
          department_id: departments.length > 0 ? departments[0].id : '',
          salary: '',
          hire_date: new Date().toISOString().split('T')[0],
          status: 'Active'
        });

        // Call callback to refresh employee list
        if (onEmployeeAdded) {
          onEmployeeAdded();
        }

        // Auto close after 2 seconds
        setTimeout(() => {
          onClose();
        }, 2000);
      } else {
        setError('Failed to add employee. Please try again.');
      }
    } catch (err) {
      console.error('Error adding employee:', err);
      setError(err.message || 'An error occurred while adding employee.');
    } finally {
      setLoading(false);
    }
  };

  const formatCurrency = (amount) => {
    return new Intl.NumberFormat('en-PH', {
      style: 'currency',
      currency: 'PHP',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0
    }).format(amount);
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto">
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-gray-950/50 transition-opacity"
        onClick={onClose}
      />

      {/* Modal */}
      <div className="flex items-center justify-center min-h-screen p-4">
        <div className="relative bg-white rounded-2xl shadow-xl w-full max-w-2xl">
          {/* Header */}
          <div className="flex items-center justify-between p-6 border-b border-gray-200">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-blue-100 rounded-lg">
                <User className="text-blue-600" size={24} />
              </div>
              <div>
                <h2 className="text-l font-bold text-gray-900">Add New Employee</h2>
                <p className="text-sm text-gray-600">Fill in the employee details below</p>
              </div>
            </div>
            <button
              onClick={onClose}
              className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
            >
              <X size={20} className="text-gray-500" />
            </button>
          </div>

          {/* Form */}
          <form onSubmit={handleSubmit}>
            <div className="p-6 space-y-6">
              {/* Success/Error Messages */}
              {success && (
                <div className="p-3 bg-green-50 text-green-700 rounded-lg border border-green-200">
                  {success}
                </div>
              )}

              {error && (
                <div className="p-3 bg-red-50 text-red-700 rounded-lg border border-red-200">
                  {error}
                </div>
              )}

              {/* Department Warning */}
              {departments.length === 0 && !loadingDepartments && (
                <div className="p-3 bg-yellow-50 border border-yellow-200 rounded-lg">
                  <div className="flex items-start gap-2">
                    <AlertCircle size={18} className="text-yellow-600 mt-0.5 flex-shrink-0" />
                    <div>
                      <p className="text-sm text-yellow-800 font-medium">
                        No departments found!
                      </p>
                      <p className="text-sm text-yellow-700 mt-1">
                        Make sure to create/add a department first before adding employees.
                      </p>
                    </div>
                  </div>
                </div>
              )}

              {/* Personal Information */}
              <div>
                <h3 className="text-lg font-semibold mb-4 text-gray-900">Personal Information</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      First Name *
                    </label>
                    <div className="relative">
                      <User className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" size={18} />
                      <input
                        type="text"
                        name="first_name"
                        value={formData.first_name}
                        onChange={handleChange}
                        required
                        disabled={departments.length === 0 || loading}
                        className="w-full pl-10 pr-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent disabled:bg-gray-50 disabled:cursor-not-allowed"
                        placeholder="John"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Last Name *
                    </label>
                    <div className="relative">
                      <User className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" size={18} />
                      <input
                        type="text"
                        name="last_name"
                        value={formData.last_name}
                        onChange={handleChange}
                        required
                        disabled={departments.length === 0 || loading}
                        className="w-full pl-10 pr-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent disabled:bg-gray-50 disabled:cursor-not-allowed"
                        placeholder="Doe"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Email Address *
                    </label>
                    <div className="relative">
                      <Mail className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" size={18} />
                      <input
                        type="email"
                        name="email"
                        value={formData.email}
                        onChange={handleChange}
                        required
                        disabled={departments.length === 0 || loading}
                        className="w-full pl-10 pr-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent disabled:bg-gray-50 disabled:cursor-not-allowed"
                        placeholder="john.doe@company.com"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Phone Number
                    </label>
                    <div className="relative">
                      <Phone className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" size={18} />
                      <input
                        type="tel"
                        name="phone"
                        value={formData.phone}
                        onChange={handleChange}
                        disabled={departments.length === 0 || loading}
                        className="w-full pl-10 pr-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent disabled:bg-gray-50 disabled:cursor-not-allowed"
                        placeholder="+63(900)000-0000"
                      />
                    </div>
                  </div>
                </div>
              </div>

              {/* Employment Information */}
              <div>
                <h3 className="text-lg font-semibold mb-4 text-gray-900">Employment Information</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Position *
                    </label>
                    <div className="relative">
                      <Briefcase className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" size={18} />
                      <input
                        type="text"
                        name="position"
                        value={formData.position}
                        onChange={handleChange}
                        required
                        disabled={departments.length === 0 || loading}
                        className="w-full pl-10 pr-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent disabled:bg-gray-50 disabled:cursor-not-allowed"
                        placeholder="Senior Developer"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Department *
                    </label>
                    <div className="relative">
                      <Building className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" size={18} />
                      <select
                        name="department_id"
                        value={formData.department_id}
                        onChange={handleChange}
                        required
                        disabled={departments.length === 0 || loading || loadingDepartments}
                        className="w-full pl-10 pr-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent appearance-none disabled:bg-gray-50 disabled:cursor-not-allowed"
                      >
                        {loadingDepartments ? (
                          <option value="">Loading departments...</option>
                        ) : departments.length === 0 ? (
                          <option value="">No departments available</option>
                        ) : (
                          <>
                            <option value="">Select a department</option>
                            {departments.map(dept => (
                              <option key={dept.id} value={dept.id}>
                                {dept.name}
                              </option>
                            ))}
                          </>
                        )}
                      </select>
                    </div>
                    {!loadingDepartments && departments.length > 0 && (
                      <p className="text-xs text-gray-500 mt-2">
                        {departments.length} department{departments.length !== 1 ? 's' : ''} available
                      </p>
                    )}
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Salary (Monthly) *
                    </label>
                    <div className="relative">
                      <PhilippinePeso className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" size={18} />
                      <input
                        type="number"
                        name="salary"
                        value={formData.salary}
                        onChange={handleChange}
                        required
                        min="0"
                        step="1000"
                        disabled={departments.length === 0 || loading}
                        className="w-full pl-10 pr-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent disabled:bg-gray-50 disabled:cursor-not-allowed"
                        placeholder="85000"
                      />
                    </div>
                    {formData.salary && (
                      <p className="text-xs text-green-600 mt-2">
                        ≈ {formatCurrency(parseFloat(formData.salary) / 24)} per day.
                      </p>
                    )}
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Hire Date *
                    </label>
                    <div className="relative">
                      <Calendar className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" size={18} />
                      <input
                        type="date"
                        name="hire_date"
                        value={formData.hire_date}
                        onChange={handleChange}
                        required
                        disabled={departments.length === 0 || loading}
                        className="w-full pl-10 pr-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent disabled:bg-gray-50 disabled:cursor-not-allowed"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Status *
                    </label>
                    <div className="relative">
                      <select
                        name="status"
                        value={formData.status}
                        onChange={handleChange}
                        required
                        disabled={departments.length === 0 || loading}
                        className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent disabled:bg-gray-50 disabled:cursor-not-allowed"
                      >
                        <option value="Active">Active</option>
                        <option value="Inactive">Inactive</option>
                        <option value="On Leave">On Leave</option>
                      </select>
                    </div>
                  </div>
                </div>
              </div>

              {/* Department Note */}
              {departments.length === 0 && !loadingDepartments && (
                <div className="p-4 bg-blue-50 border border-blue-200 rounded-lg">
                  <div className="flex items-start gap-2">
                    <Building size={18} className="text-blue-600 mt-0.5 flex-shrink-0" />
                    <div>
                      <p className="text-sm text-blue-800 font-medium">
                        Departments Required
                      </p>
                      <p className="text-sm text-blue-700 mt-1">
                        Make sure to create/add department first, if it does not exist yet.
                        Employees must be assigned to a department.
                      </p>
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Footer */}
            <div className="p-6 border-t border-gray-200 flex justify-end gap-3">
              <button
                type="button"
                onClick={onClose}
                disabled={loading}
                className="px-6 py-3 border border-gray-300 text-gray-700 rounded-lg font-semibold hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={loading || departments.length === 0 || loadingDepartments}
                className="flex items-center gap-2 px-6 py-3 bg-blue-600 text-white rounded-lg font-semibold hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {loading ? (
                  <>
                    <Loader2 className="animate-spin" size={18} />
                    Adding...
                  </>
                ) : (
                  <>
                    <Save size={18} />
                    Add Employee
                  </>
                )}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
};

export default AddEmployee;