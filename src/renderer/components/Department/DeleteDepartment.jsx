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
      
      // Use setTimeout to prevent blocking the main thread
      const result = await Promise.race([
        window.electronAPI.deleteDepartment(departmentId),
        new Promise((_, reject) => 
          setTimeout(() => reject(new Error('Delete operation timed out')), 10000)
        )
      ]);
      
      console.log('Department deleted successfully');
      
      // Use setTimeout for success callback to prevent blocking
      setTimeout(() => {
        if (onDeleteSuccess) {
          onDeleteSuccess(`Department "${departmentName}" deleted successfully!`);
        }
      }, 0);
      
    } catch (error) {
      console.error('Error deleting department:', error);
      const errorMessage = error.message || 'Unknown error occurred';
      
      // Use setTimeout for error callback to prevent blocking
      setTimeout(() => {
        if (onDeleteError) {
          onDeleteError(`Error deleting department: ${errorMessage}`);
        }
      }, 0);
    } finally {
      // Ensure we always clean up the deleting state
      setTimeout(() => {
        setIsDeleting(false);
      }, 0);
    }
  };

  return (
    <button 
      onClick={handleDelete}
      className="p-2 hover:bg-gray-100 rounded-lg disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
      disabled={isDeleting}
      title={`Delete ${departmentName}`}
    >
      {isDeleting ? (
        <Loader2 size={16} className="animate-spin text-red-600" />
      ) : (
        <Trash2 size={16} className="text-red-600 hover:text-red-700" />
      )}
    </button>
  );
};

export default DeleteDepartment;