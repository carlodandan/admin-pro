import React, { useState } from 'react';
import { AlertCircle, Building, Loader2, PhilippinePeso, Save, X } from 'lucide-react';
import { useDialog } from '../../hooks/useDialog';

const emptyForm = { name: '', budget: '' };

const formatCurrency = (amount) =>
  new Intl.NumberFormat('en-PH', {
    style: 'currency',
    currency: 'PHP',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0
  }).format(amount || 0);

/**
 * The new-department dialog.
 *
 * The two validation failures used `alert()`, which blocks the webview and puts
 * an OS dialog over an app dialog. They are inline messages on the field that is
 * wrong, and the form is a real `<form>` now, so Enter submits it.
 */
const AddDepartment = ({ showModal, setShowModal, onDepartmentAdded }) => {
  const [newDepartment, setNewDepartment] = useState(emptyForm);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState(null);
  const [fieldError, setFieldError] = useState({});

  const handleClose = () => {
    if (isSubmitting) return;
    setShowModal(false);
    setNewDepartment(emptyForm);
    setError(null);
    setFieldError({});
  };

  const panelRef = useDialog(showModal, handleClose);

  const handleAddDepartment = async (event) => {
    event.preventDefault();

    // Same two checks as before, in the same order — reported next to the input
    // they are about instead of in a modal alert.
    const budgetValue = Number.parseFloat(newDepartment.budget);
    const problems = {};
    if (!newDepartment.name.trim()) problems.name = 'Give the department a name.';
    if (!newDepartment.budget) problems.budget = 'Enter an annual budget.';
    else if (Number.isNaN(budgetValue) || budgetValue < 0) {
      problems.budget = 'Enter a valid budget amount.';
    }

    setFieldError(problems);
    if (Object.keys(problems).length > 0) return;

    setIsSubmitting(true);
    setError('');

    try {
      await window.api.createDepartment({
        name: newDepartment.name.trim(),
        budget: budgetValue
      });

      setNewDepartment(emptyForm);
      setShowModal(false);

      if (onDepartmentAdded) {
        await onDepartmentAdded();
      }
    } catch (err) {
      console.error('Error adding department:', err);
      const errorMessage = err.message || 'Unknown error occurred';
      // `departments.name` is UNIQUE, so the most likely failure here is a
      // duplicate; the constraint text is unhelpful on its own.
      setError(
        /unique/i.test(errorMessage)
          ? `A department named "${newDepartment.name.trim()}" already exists.`
          : `Error adding department: ${errorMessage}`
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!showModal) return null;

  const budgetPreview = Number.parseFloat(newDepartment.budget);

  return (
    <div
      className="modal-backdrop"
      onClick={(event) => {
        if (event.target === event.currentTarget) handleClose();
      }}
    >
      <div
        ref={panelRef}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-labelledby="add-department-title"
        className="modal-panel max-w-md"
      >
        <div className="flex items-start justify-between gap-3 border-b border-[rgb(248_250_252/0.1)] px-5 py-4">
          <div className="flex min-w-0 items-center gap-3">
            <span className="kpi-icon bg-[rgb(34_197_94/0.14)] text-accent">
              <Building size={20} aria-hidden="true" />
            </span>
            <div className="min-w-0">
              <h2 id="add-department-title" className="section-title">
                Add department
              </h2>
              <p className="page-subtitle mt-0.5">Employees are assigned to one of these</p>
            </div>
          </div>
          <button
            type="button"
            onClick={handleClose}
            disabled={isSubmitting}
            className="btn btn-ghost btn-icon"
            aria-label="Close"
          >
            <X size={18} aria-hidden="true" />
          </button>
        </div>

        <form onSubmit={handleAddDepartment}>
          <div className="flex flex-col gap-4 px-5 py-4">
            {error && (
              <div className="alert alert-danger" role="alert">
                <AlertCircle size={16} className="mt-0.5 shrink-0" aria-hidden="true" />
                <p className="flex-1">{error}</p>
              </div>
            )}

            <div className="min-w-0">
              <label htmlFor="department-name" className="label label-required">
                Department name
              </label>
              <div className="input-group">
                <Building className="input-icon" size={16} aria-hidden="true" />
                <input
                  id="department-name"
                  type="text"
                  data-autofocus
                  value={newDepartment.name}
                  onChange={(event) =>
                    setNewDepartment({ ...newDepartment, name: event.target.value })
                  }
                  disabled={isSubmitting}
                  className={`input ${fieldError.name ? 'input-invalid' : ''}`}
                  placeholder="Engineering"
                  aria-describedby={fieldError.name ? 'department-name-error' : undefined}
                  aria-invalid={fieldError.name ? true : undefined}
                />
              </div>
              {fieldError.name && (
                <p id="department-name-error" className="error-text">
                  {fieldError.name}
                </p>
              )}
            </div>

            <div className="min-w-0">
              <label htmlFor="department-budget" className="label label-required">
                Annual budget
              </label>
              <div className="input-group">
                <PhilippinePeso className="input-icon" size={16} aria-hidden="true" />
                <input
                  id="department-budget"
                  type="number"
                  min="0"
                  step="1000"
                  inputMode="numeric"
                  value={newDepartment.budget}
                  onChange={(event) =>
                    setNewDepartment({ ...newDepartment, budget: event.target.value })
                  }
                  disabled={isSubmitting}
                  className={`input ${fieldError.budget ? 'input-invalid' : ''}`}
                  placeholder="500000"
                  aria-describedby={
                    fieldError.budget ? 'department-budget-error' : 'department-budget-help'
                  }
                  aria-invalid={fieldError.budget ? true : undefined}
                />
              </div>
              {fieldError.budget ? (
                <p id="department-budget-error" className="error-text">
                  {fieldError.budget}
                </p>
              ) : (
                <p id="department-budget-help" className="help-text">
                  {Number.isFinite(budgetPreview) && budgetPreview > 0
                    ? `${formatCurrency(budgetPreview)} a year · ${formatCurrency(budgetPreview / 12)} a month.`
                    : 'Used for the budget figures on the department cards.'}
                </p>
              )}
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-end gap-2 border-t border-[rgb(248_250_252/0.1)] px-5 py-4">
            <button
              type="button"
              onClick={handleClose}
              disabled={isSubmitting}
              className="btn btn-outline"
            >
              Cancel
            </button>
            <button type="submit" disabled={isSubmitting} className="btn btn-primary">
              {isSubmitting ? (
                <>
                  <Loader2 size={16} className="animate-spin" aria-hidden="true" />
                  Adding…
                </>
              ) : (
                <>
                  <Save size={16} aria-hidden="true" />
                  Add department
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default AddDepartment;
