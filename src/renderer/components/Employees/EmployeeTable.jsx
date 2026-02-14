import React, { useState } from 'react';
import { MoreVertical, Mail, Phone, Edit, Trash2, Eye } from 'lucide-react';

const EmployeeTable = () => {
  const [employees] = useState([]);

  const getStatusColor = (status) => {
    switch (status) {
      case 'Active': return 'bg-green-100 text-green-800';
      case 'On Leave': return 'bg-yellow-100 text-yellow-800';
      case 'Inactive': return 'bg-red-100 text-red-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  };

  const handleViewEmployee = (employeeId) => {

    alert(`Viewing employee ${employeeId}`);
  };

  const handleEditEmployee = (employeeId) => {

    alert(`Editing employee ${employeeId}`);
  };

  const handleDeleteEmployee = (employeeId) => {

    if (window.confirm('Are you sure you want to delete this employee?')) {
      alert(`Employee ${employeeId} deleted`);
    }
  };

  return (
    <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
      <div className="p-6 border-b border-gray-200">
        <div className="flex justify-between items-center">
          <div>
            <h2 className="text-l font-bold">Employee Directory</h2>
            <p className="text-gray-600">Manage all employee information</p>
          </div>
          <button className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 transition-colors">
            + Add Employee
          </button>
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full">
          <thead className="bg-gray-50">
            <tr>
              <th className="py-3 px-6 text-left text-sm font-semibold text-gray-700">Employee</th>
              <th className="py-3 px-6 text-left text-sm font-semibold text-gray-700">Position</th>
              <th className="py-3 px-6 text-left text-sm font-semibold text-gray-700">Department</th>
              <th className="py-3 px-6 text-left text-sm font-semibold text-gray-700">Contact</th>
              <th className="py-3 px-6 text-left text-sm font-semibold text-gray-700">Salary</th>
              <th className="py-3 px-6 text-left text-sm font-semibold text-gray-700">Status</th>
              <th className="py-3 px-6 text-left text-sm font-semibold text-gray-700">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200">
            {employees.map((employee) => (
              <tr key={employee.id} className="hover:bg-gray-50">
                <td className="py-4 px-6">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-full bg-blue-100 flex items-center justify-center">
                      <span className="font-semibold text-blue-600">
                        {employee.name.split(' ').map(n => n[0]).join('')}
                      </span>
                    </div>
                    <div>
                      <p className="font-medium">{employee.name}</p>
                      <p className="text-sm text-gray-500">ID: {employee.companyId}</p>
                      <p className="text-sm text-gray-500">Hired: {employee.hireDate}</p>
                    </div>
                  </div>
                </td>
                <td className="py-4 px-6">
                  <p className="font-medium">{employee.position}</p>
                </td>
                <td className="py-4 px-6">
                  <span className="px-3 py-1 bg-gray-100 rounded-full text-sm">
                    {employee.department}
                  </span>
                </td>
                <td className="py-4 px-6">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <Mail size={14} className="text-gray-400" />
                      <span className="text-sm">{employee.email}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <Phone size={14} className="text-gray-400" />
                      <span className="text-sm">{employee.phone}</span>
                    </div>
                  </div>
                </td>
                <td className="py-4 px-6">
                  <p className="font-semibold">{employee.salary}</p>
                  <p className="text-sm text-gray-500">Annual</p>
                </td>
                <td className="py-4 px-6">
                  <span className={`px-3 py-1 rounded-full text-sm font-medium ${getStatusColor(employee.status)}`}>
                    {employee.status}
                  </span>
                </td>
                <td className="py-4 px-6">
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => handleViewEmployee(employee.id)}
                      className="p-2 hover:bg-gray-100 rounded-lg"
                      title="View Details"
                    >
                      <Eye size={18} className="text-blue-600" />
                    </button>
                    <button
                      onClick={() => handleEditEmployee(employee.id)}
                      className="p-2 hover:bg-gray-100 rounded-lg"
                      title="Edit"
                    >
                      <Edit size={18} className="text-green-600" />
                    </button>
                    <button
                      onClick={() => handleDeleteEmployee(employee.id)}
                      className="p-2 hover:bg-gray-100 rounded-lg"
                      title="Delete"
                    >
                      <Trash2 size={18} className="text-red-600" />
                    </button>
                    <button className="p-2 hover:bg-gray-100 rounded-lg">
                      <MoreVertical size={18} />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      <div className="p-6 border-t border-gray-200 flex justify-between items-center">
        <div className="text-sm text-gray-600">
          Showing 1 to 5 of 245 employees
        </div>
        <div className="flex gap-2">
          <button className="px-3 py-1 border border-gray-300 rounded-lg hover:bg-gray-50">
            Previous
          </button>
          <button className="px-3 py-1 bg-blue-600 text-white rounded-lg hover:bg-blue-700">
            1
          </button>
          <button className="px-3 py-1 border border-gray-300 rounded-lg hover:bg-gray-50">
            2
          </button>
          <button className="px-3 py-1 border border-gray-300 rounded-lg hover:bg-gray-50">
            3
          </button>
          <button className="px-3 py-1 border border-gray-300 rounded-lg hover:bg-gray-50">
            Next
          </button>
        </div>
      </div>
    </div>
  );
};

export default EmployeeTable;