import React, { useState, useEffect } from 'react';
import { Plus, Building, Loader2 } from 'lucide-react';
import AddDepartmentModal from '../components/Department/AddDepartmentModal';
import DepartmentCard from '../components/Department/DepartmentCard';

const Departments = () => {
  const [departments, setDepartments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showAddModal, setShowAddModal] = useState(false);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState('');

  useEffect(() => {
    console.log('Departments component mounted, loading data...');
    loadDepartments();
  }, []);

  const loadDepartments = async () => {
    try {
      console.log('Loading departments...');
      setLoading(true);
      setError(null);
      const data = await window.electronAPI.getAllDepartments();
      console.log('Departments loaded:', data);
      setDepartments(data || []);
    } catch (error) {
      console.error('Error loading departments:', error);
      setError('Failed to load departments');
      setDepartments([]);
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteSuccess = (message) => {
    setSuccess(message);
    // Reload departments after successful deletion
    loadDepartments();
    
    // Clear success message after 3 seconds
    setTimeout(() => setSuccess(''), 3000);
  };

  const handleDeleteError = (errorMessage) => {
    setError(errorMessage);
    
    // Clear error message after 5 seconds
    setTimeout(() => setError(''), 5000);
  };

  const handleEditDepartment = (dept) => {
    // You can implement edit functionality here
    setError(`Edit functionality for ${dept.name} would go here`);
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-xl md:text-2xl font-bold text-gray-900">Departments</h1>
          <p className="text-gray-600 mt-1">Manage company departments and budgets</p>
        </div>
        <button
          onClick={() => setShowAddModal(true)}
          className="flex items-center gap-2 px-4 py-2.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
        >
          <Plus size={18} />
          Add Department
        </button>
      </div>
      
      {/* Success and Error Messages */}
      {success && (
        <div className="p-3 bg-green-50 border border-green-200 rounded text-green-600 text-sm">
          {success}
        </div>
      )}
      
      {error && (
        <div className="p-3 bg-red-50 border border-red-200 rounded text-red-600 text-sm">
          {error}
        </div>
      )}
      
      {/* Departments Grid */}
      {loading ? (
        <div className="flex items-center justify-center p-12">
          <Loader2 className="h-8 w-8 animate-spin text-blue-500" />
        </div>
      ) : departments.length === 0 ? (
        <div className="text-center py-12 bg-white rounded-xl border border-gray-200">
          <Building className="h-12 w-12 text-gray-400 mx-auto mb-4" />
          <h3 className="text-lg font-medium text-gray-900 mb-2">No Departments Yet</h3>
          <p className="text-gray-600 mb-4">Add your first department to get started</p>
          <button
            onClick={() => setShowAddModal(true)}
            className="px-6 py-2.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
          >
            Add Department
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {departments.map((dept) => (
            <DepartmentCard
              key={dept.id}
              department={dept}
              onEdit={handleEditDepartment}
              onDeleteSuccess={handleDeleteSuccess}
              onDeleteError={handleDeleteError}
            />
          ))}
        </div>
      )}

      {/* Add Department Modal */}
      <AddDepartmentModal
        showModal={showAddModal}
        setShowModal={setShowAddModal}
        onDepartmentAdded={loadDepartments}
      />
    </div>
  );
};

export default Departments;