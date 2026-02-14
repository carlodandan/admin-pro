import React, { useState } from 'react';
import { Trash2, Loader2 } from 'lucide-react';

const DeleteEmployee = ({ employeeId, employeeName, onDeleteSuccess, onDeleteError }) => {
  const [isDeleting, setIsDeleting] = useState(false);

  const handleDelete = async () => {
    if (!window.confirm(`Are you sure you want to delete employee "${employeeName}"? This action cannot be undone.`)) {
      return;
    }

    setIsDeleting(true);

    try {

      await window.electronAPI.deleteEmployee(employeeId);


      if (onDeleteSuccess) {
        onDeleteSuccess(`Employee "${employeeName}" deleted successfully!`);
      }
    } catch (error) {
      console.error('Error deleting employee:', error);
      const errorMessage = error.message || 'Unknown error occurred';

      if (onDeleteError) {
        onDeleteError(`Error deleting employee: ${errorMessage}`);
      }
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <button
      onClick={handleDelete}
      className="p-2 hover:bg-gray-100 rounded-lg disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
      disabled={isDeleting}
      title={`Delete ${employeeName}`}
    >
      {isDeleting ? (
        <Loader2 size={18} className="animate-spin text-red-600" />
      ) : (
        <Trash2 size={18} className="text-red-600 hover:text-red-700" />
      )}
    </button>
  );
};

export default DeleteEmployee;