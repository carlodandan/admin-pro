import React from 'react';
import { Users, PhilippinePeso, Edit } from 'lucide-react';
import DeleteDepartment from './DeleteDepartment';

const DepartmentCard = ({ 
  department, 
  onEdit, 
  onDeleteSuccess, 
  onDeleteError 
}) => {
  const formatCurrency = (amount) => {
    return new Intl.NumberFormat('en-PH', {
      style: 'currency',
      currency: 'PHP',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0
    }).format(amount);
  };

  return (
    <div className="bg-white p-6 rounded-xl border border-gray-200 hover:shadow-md transition-shadow">
      <div className="flex justify-between items-start mb-4">
        <div>
          <h3 className="font-bold text-lg text-gray-900">{department.name}</h3>
        </div>
        <div className="flex gap-2">
          <button 
            onClick={() => onEdit(department)}
            className="p-2 hover:bg-gray-100 rounded-lg"
            title={`Edit ${department.name}`}
          >
            <Edit size={16} className="text-blue-600" />
          </button>
          <DeleteDepartment
            departmentId={department.id}
            departmentName={department.name}
            onDeleteSuccess={onDeleteSuccess}
            onDeleteError={onDeleteError}
          />
        </div>
      </div>
      
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <PhilippinePeso size={16} className="text-green-600" />
            <span className="text-sm text-gray-600">Annual Budget</span>
          </div>
          <span className="font-bold text-gray-900">{formatCurrency(department.budget)}</span>
        </div>
        
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Users size={16} className="text-blue-600" />
            <span className="text-sm text-gray-600">Employees</span>
          </div>
          <span className="font-bold text-gray-900">{department.employee_count || 0}</span>
        </div>
        
        <div className="flex items-center justify-between">
          <span className="text-sm text-gray-600">Avg. Salary</span>
          <span className="font-bold text-gray-900">{formatCurrency(department.avg_salary || 0)}</span>
        </div>
      </div>
      
      <div className="mt-4 pt-4 border-t border-gray-200">
        <div className="text-xs text-gray-500">
          Created: {new Date(department.created_at).toLocaleDateString()}
        </div>
      </div>
    </div>
  );
};

export default DepartmentCard;