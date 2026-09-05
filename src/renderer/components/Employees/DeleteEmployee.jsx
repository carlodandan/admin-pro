import React, { useState } from 'react';
import { Loader2, Trash2 } from 'lucide-react';
import ConfirmDialog from '../ui/ConfirmDialog';

/**
 * The delete action for one roster row. The success and error strings are still
 * handed to the parent, which owns the page-level alert.
 */
const DeleteEmployee = ({ employeeId, employeeName, onDeleteSuccess, onDeleteError }) => {
  const [confirming, setConfirming] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  const handleDelete = async () => {
    setIsDeleting(true);

    try {
      await window.api.deleteEmployee(employeeId);
      setConfirming(false);
      if (onDeleteSuccess) {
        onDeleteSuccess(`Employee "${employeeName}" deleted successfully!`);
      }
    } catch (error) {
      console.error('Error deleting employee:', error);
      const errorMessage = error.message || 'Unknown error occurred';
      setConfirming(false);
      if (onDeleteError) {
        onDeleteError(`Error deleting employee: ${errorMessage}`);
      }
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <>
      <button
        type="button"
        onClick={() => setConfirming(true)}
        disabled={isDeleting}
        className="btn btn-danger-ghost btn-icon"
        // The old button had a `title` and no accessible name, so a screen
        // reader announced it as "button".
        aria-label={`Delete ${employeeName}`}
        title={`Delete ${employeeName}`}
      >
        {isDeleting ? (
          <Loader2 size={16} className="animate-spin" aria-hidden="true" />
        ) : (
          <Trash2 size={16} aria-hidden="true" />
        )}
      </button>

      <ConfirmDialog
        isOpen={confirming}
        title="Delete employee?"
        body={`${employeeName} will be removed from the local database, along with the attendance and payroll rows that reference them. This cannot be undone.`}
        confirmLabel="Delete employee"
        busyLabel="Deleting…"
        busy={isDeleting}
        onConfirm={handleDelete}
        onCancel={() => setConfirming(false)}
      />
    </>
  );
};

export default DeleteEmployee;
