import React, { useState } from 'react';
import { Trash2, Loader2 } from 'lucide-react';

const DeleteDepartment = ({ departmentId, departmentName, onDeleteSuccess, onDeleteError }) => {
  const [isDeleting, setIsDeleting] = useState(false);

  const handleDelete = async () => {
    if (!window.confirm(`Are you sure you want to delete the department "${departmentName}"?`)) {
      return;
    }

    setIsDeleting(true);

    try {
      console.log('Deleting department ID:', departmentId);
      await window.electronAPI.deleteDepartment(departmentId);
      console.log('Department deleted successfully');
      
      if (onDeleteSuccess) {
        onDeleteSuccess(`Department "${departmentName}" deleted successfully!`);
      }
    } catch (error) {
      console.error('Error deleting department:', error);
      const errorMessage = error.message || 'Unknown error occurred';
      
      if (onDeleteError) {
        onDeleteError(`Error deleting department: ${errorMessage}`);
      }
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <button 
      onClick={handleDelete}
      className="p-2 hover:bg-gray-100 rounded-lg disabled:opacity-50 disabled:cursor-not-allowed"
      disabled={isDeleting}
      title={`Delete ${departmentName}`}
    >
      {isDeleting ? (
        <Loader2 size={16} className="animate-spin text-red-600" />
      ) : (
        <Trash2 size={16} className="text-red-600" />
      )}
    </button>
  );
};

export default DeleteDepartment;