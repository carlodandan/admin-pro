import React, { useState } from 'react';
import { Loader2, Trash2 } from 'lucide-react';
import ConfirmDialog from '../ui/ConfirmDialog';

/**
 * The delete action on a department card.
 *
 * The original wrapped all three callbacks in `setTimeout(…, 0)` "to prevent
 * blocking the main thread", which does nothing: deferring a `setState` by a
 * tick cannot unblock a thread that is already free. The 10 s timeout it raced
 * the delete against is kept — it is the only thing standing between a wedged
 * call and a confirmation dialog whose Cancel button stays disabled forever.
 */
const DeleteDepartment = ({ departmentId, departmentName, onDeleteSuccess, onDeleteError }) => {
  const [confirming, setConfirming] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  const handleDelete = async () => {
    setIsDeleting(true);

    try {
      await Promise.race([
        window.api.deleteDepartment(departmentId),
        new Promise((_, reject) =>
          setTimeout(() => reject(new Error('Delete operation timed out')), 10000)
        )
      ]);

      setConfirming(false);
      if (onDeleteSuccess) {
        onDeleteSuccess(`Department "${departmentName}" deleted successfully!`);
      }
    } catch (error) {
      console.error('Error deleting department:', error);
      // The backend refuses to delete a department that still has employees and
      // says so in this message, which is the useful half of the failure.
      const errorMessage = error.message || 'Unknown error occurred';
      setConfirming(false);
      if (onDeleteError) {
        onDeleteError(`Error deleting department: ${errorMessage}`);
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
        aria-label={`Delete ${departmentName}`}
        title={`Delete ${departmentName}`}
      >
        {isDeleting ? (
          <Loader2 size={16} className="animate-spin" aria-hidden="true" />
        ) : (
          <Trash2 size={16} aria-hidden="true" />
        )}
      </button>

      <ConfirmDialog
        isOpen={confirming}
        title="Delete department?"
        body={`${departmentName} will be removed from the local database. Departments that still have employees assigned — including inactive ones, which the card's count leaves out — cannot be deleted.`}
        confirmLabel="Delete department"
        busyLabel="Deleting…"
        busy={isDeleting}
        onConfirm={handleDelete}
        onCancel={() => setConfirming(false)}
      />
    </>
  );
};

export default DeleteDepartment;
