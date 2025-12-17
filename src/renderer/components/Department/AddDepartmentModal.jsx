import React, { useState } from 'react';
import { Loader2 } from 'lucide-react';

const AddDepartmentModal = ({ showModal, setShowModal, onDepartmentAdded }) => {
  const [newDepartment, setNewDepartment] = useState({ name: '', budget: '' });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState(null);

  const handleAddDepartment = async () => {
    if (!newDepartment.name.trim() || !newDepartment.budget) {
      alert('Please fill in all fields');
      return;
    }

    const budgetValue = parseFloat(newDepartment.budget);
    if (isNaN(budgetValue) || budgetValue < 0) {
      alert('Please enter a valid budget amount');
      return;
    }

    setIsSubmitting(true);
    setError('');

    try {
      console.log('Creating department:', newDepartment);
      await window.electronAPI.createDepartment({
        name: newDepartment.name.trim(),
        budget: budgetValue
      });
      
      console.log('Department created successfully');
      
      // Reset form
      setNewDepartment({ name: '', budget: '' });
      setShowModal(false);
      
      // Call parent callback to reload departments
      if (onDepartmentAdded) {
        await onDepartmentAdded();
      }
      
    } catch (error) {
      console.error('Error adding department:', error);
      const errorMessage = error.message || 'Unknown error occurred';
      setError(`Error adding department: ${errorMessage}`);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleClose = () => {
    if (!isSubmitting) {
      setShowModal(false);
      setNewDepartment({ name: '', budget: '' });
      setError(null);
    }
  };

  if (!showModal) return null;

  return (
    <div className="fixed inset-0 bg-gray-950/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl w-full max-w-md">
        <div className="p-6 border-b border-gray-200">
          <h2 className="text-l font-bold text-gray-900">Add New Department</h2>
        </div>
        
        <div className="p-6">
          {error && (
            <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded text-red-600 text-sm">
              {error}
            </div>
          )}
          
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Department Name *
              </label>
              <input
                type="text"
                value={newDepartment.name}
                onChange={(e) => setNewDepartment({...newDepartment, name: e.target.value})}
                className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                placeholder="e.g., Engineering"
                disabled={isSubmitting}
              />
            </div>
            
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Annual Budget *
              </label>
              <input
                type="number"
                value={newDepartment.budget}
                onChange={(e) => setNewDepartment({...newDepartment, budget: e.target.value})}
                className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                placeholder="e.g., 500000"
                min="0"
                step="1000"
                disabled={isSubmitting}
              />
            </div>
          </div>
          
          <div className="flex justify-end gap-3 mt-8 pt-6 border-t border-gray-200">
            <button
              onClick={handleClose}
              className="px-6 py-2.5 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              disabled={isSubmitting}
            >
              Cancel
            </button>
            <button
              onClick={handleAddDepartment}
              disabled={isSubmitting}
              className="px-6 py-2.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
            >
              {isSubmitting && <Loader2 className="h-4 w-4 animate-spin" />}
              {isSubmitting ? 'Adding...' : 'Add Department'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default AddDepartmentModal;