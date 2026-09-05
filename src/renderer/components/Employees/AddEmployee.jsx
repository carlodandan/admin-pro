import React, { useEffect, useRef, useState } from 'react';
import {
  AlertCircle,
  Briefcase,
  Building,
  Calendar,
  CheckCircle,
  Loader2,
  Mail,
  PhilippinePeso,
  Phone,
  Save,
  User,
  X
} from 'lucide-react';
import { manilaDate } from '../../utils/manila';
import { useDialog } from '../../hooks/useDialog';

/** `salary` is the monthly basic rate; the payroll calculator divides it by 24. */
const emptyForm = (departmentId = '') => ({
  first_name: '',
  last_name: '',
  email: '',
  phone: '',
  position: '',
  department_id: departmentId,
  salary: '',
  // Was `new Date().toISOString().split('T')[0]`, which is yesterday's date in
  // Manila for the first eight hours of every day.
  hire_date: manilaDate(),
  status: 'Active'
});

const formatCurrency = (amount) =>
  new Intl.NumberFormat('en-PH', {
    style: 'currency',
    currency: 'PHP',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0
  }).format(amount || 0);

const AddEmployee = ({ isOpen, onClose, onEmployeeAdded }) => {
  const [loading, setLoading] = useState(false);
  const [loadingDepartments, setLoadingDepartments] = useState(true);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [departments, setDepartments] = useState([]);
  const [formData, setFormData] = useState(emptyForm());
  const closeTimer = useRef(null);
  const panelRef = useDialog(isOpen, onClose);

  useEffect(() => {
    if (isOpen) loadDepartments();
  }, [isOpen]);

  // The success path closes the dialog on a timer; if it is dismissed first the
  // timer has to go with it.
  useEffect(() => () => clearTimeout(closeTimer.current), []);

  const loadDepartments = async () => {
    try {
      setLoadingDepartments(true);
      const data = await window.api.getAllDepartments();
      const list = Array.isArray(data)
        ? data.map((department) => ({ id: department.id, name: department.name }))
        : [];

      setDepartments(list);
      // Preselect the first, as before, so the required select is never left
      // empty by accident.
      setFormData((prev) =>
        prev.department_id ? prev : { ...prev, department_id: list[0]?.id ?? '' }
      );
    } catch (err) {
      console.error('Error loading departments:', err);
      setError('Failed to load departments from the database.');
      setDepartments([]);
    } finally {
      setLoadingDepartments(false);
    }
  };

  // `salary` used to be coerced with `parseFloat(value) || 0` on every
  // keystroke, which turned an emptied field into `0` and swallowed the decimal
  // point as it was typed. It is coerced once, on submit, which is where the
  // stored value is decided.
  const handleChange = (event) => {
    const { name, value } = event.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  const handleSubmit = async (event) => {
    event.preventDefault();

    if (!formData.department_id) {
      setError('Select a department for this employee.');
      return;
    }

    setLoading(true);
    setError('');
    setSuccess('');

    try {
      const result = await window.api.createEmployee({
        ...formData,
        // `EMP-` plus the last six digits of the epoch millisecond count, as
        // before. The column is unique and those digits repeat every 1000
        // seconds, so a collision is possible and surfaces as the constraint
        // error below; generating IDs is the database's job, not the form's,
        // and changing that is outside a port.
        company_id: `EMP-${Date.now().toString().slice(-6)}`,
        salary: Number.parseFloat(formData.salary) || 0
      });

      if (result && (result.id || result.changes > 0)) {
        setSuccess('Employee added.');
        setFormData(emptyForm(departments[0]?.id ?? ''));
        if (onEmployeeAdded) onEmployeeAdded();
        closeTimer.current = setTimeout(() => onClose(), 2000);
      } else {
        setError('Failed to add the employee. Please try again.');
      }
    } catch (err) {
      console.error('Error adding employee:', err);
      setError(err.message || 'An error occurred while adding the employee.');
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen) return null;

  // Every field is disabled until a department exists to assign, which is what
  // the original did one attribute at a time.
  const disabled = loading || departments.length === 0;
  const dailyRate = Number.parseFloat(formData.salary);

  return (
    <div
      className="modal-backdrop"
      onClick={(event) => {
        // Only a click that both starts and ends on the backdrop dismisses, and
        // never while a write is in flight.
        if (event.target === event.currentTarget && !loading) onClose();
      }}
    >
      <div
        ref={panelRef}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-labelledby="add-employee-title"
        className="modal-panel max-w-2xl"
      >
        <div className="flex items-start justify-between gap-3 border-b border-[rgb(248_250_252/0.1)] px-5 py-4">
          <div className="flex min-w-0 items-center gap-3">
            <span className="kpi-icon bg-[rgb(96_165_250/0.14)] text-info">
              <User size={20} aria-hidden="true" />
            </span>
            <div className="min-w-0">
              <h2 id="add-employee-title" className="section-title">
                Add employee
              </h2>
              <p className="page-subtitle mt-0.5">Creates a record in the local database</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={loading}
            className="btn btn-ghost btn-icon"
            aria-label="Close"
          >
            <X size={18} aria-hidden="true" />
          </button>
        </div>

        <form onSubmit={handleSubmit}>
          <div className="flex flex-col gap-4 px-5 py-4">
            {success && (
              <div className="alert alert-success" role="status">
                <CheckCircle size={16} className="mt-0.5 shrink-0" aria-hidden="true" />
                <p className="flex-1">{success}</p>
              </div>
            )}
            {error && (
              <div className="alert alert-danger" role="alert">
                <AlertCircle size={16} className="mt-0.5 shrink-0" aria-hidden="true" />
                <p className="flex-1">{error}</p>
              </div>
            )}

            {/* One notice, not two. The original said the same thing twice: a
                yellow "No departments found!" above the fields and a blue
                "Departments Required" below them. */}
            {!loadingDepartments && departments.length === 0 && (
              <div className="alert alert-warning" role="alert">
                <Building size={16} className="mt-0.5 shrink-0" aria-hidden="true" />
                <div className="flex-1">
                  <p className="font-medium">No departments yet</p>
                  <p className="mt-1">
                    Every employee is assigned to one, so create a department first. The form
                    stays disabled until there is one to pick.
                  </p>
                </div>
              </div>
            )}

            <fieldset disabled={disabled} className="m-0 min-w-0 border-0 p-0">
              <legend className="eyebrow mb-3">Personal information</legend>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div className="min-w-0">
                  <label htmlFor="employee-first-name" className="label label-required">
                    First name
                  </label>
                  <div className="input-group">
                    <User className="input-icon" size={16} aria-hidden="true" />
                    <input
                      id="employee-first-name"
                      name="first_name"
                      type="text"
                      required
                      autoComplete="given-name"
                      data-autofocus
                      value={formData.first_name}
                      onChange={handleChange}
                      className="input"
                      placeholder="Juan"
                    />
                  </div>
                </div>

                <div className="min-w-0">
                  <label htmlFor="employee-last-name" className="label label-required">
                    Last name
                  </label>
                  <div className="input-group">
                    <User className="input-icon" size={16} aria-hidden="true" />
                    <input
                      id="employee-last-name"
                      name="last_name"
                      type="text"
                      required
                      autoComplete="family-name"
                      value={formData.last_name}
                      onChange={handleChange}
                      className="input"
                      placeholder="Dela Cruz"
                    />
                  </div>
                </div>

                <div className="min-w-0">
                  <label htmlFor="employee-email" className="label label-required">
                    Email address
                  </label>
                  <div className="input-group">
                    <Mail className="input-icon" size={16} aria-hidden="true" />
                    <input
                      id="employee-email"
                      name="email"
                      type="email"
                      required
                      autoComplete="email"
                      value={formData.email}
                      onChange={handleChange}
                      className="input"
                      placeholder="juan.delacruz@company.com"
                    />
                  </div>
                </div>

                <div className="min-w-0">
                  <label htmlFor="employee-phone" className="label">
                    Phone number
                  </label>
                  <div className="input-group">
                    <Phone className="input-icon" size={16} aria-hidden="true" />
                    <input
                      id="employee-phone"
                      name="phone"
                      type="tel"
                      autoComplete="tel"
                      value={formData.phone}
                      onChange={handleChange}
                      className="input"
                      placeholder="+63 900 000 0000"
                    />
                  </div>
                  <p className="help-text">Optional.</p>
                </div>
              </div>
            </fieldset>

            <fieldset disabled={disabled} className="m-0 min-w-0 border-0 p-0">
              <legend className="eyebrow mb-3">Employment</legend>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div className="min-w-0">
                  <label htmlFor="employee-position" className="label label-required">
                    Position
                  </label>
                  <div className="input-group">
                    <Briefcase className="input-icon" size={16} aria-hidden="true" />
                    <input
                      id="employee-position"
                      name="position"
                      type="text"
                      required
                      value={formData.position}
                      onChange={handleChange}
                      className="input"
                      placeholder="Senior Developer"
                    />
                  </div>
                </div>

                <div className="min-w-0">
                  <label htmlFor="employee-department" className="label label-required">
                    Department
                  </label>
                  <div className="input-group">
                    <Building className="input-icon" size={16} aria-hidden="true" />
                    <select
                      id="employee-department"
                      name="department_id"
                      required
                      disabled={loadingDepartments}
                      value={formData.department_id}
                      onChange={handleChange}
                      className="select"
                    >
                      {loadingDepartments ? (
                        <option value="">Loading departments…</option>
                      ) : departments.length === 0 ? (
                        <option value="">No departments available</option>
                      ) : (
                        <>
                          <option value="">Select a department</option>
                          {departments.map((department) => (
                            <option key={department.id} value={department.id}>
                              {department.name}
                            </option>
                          ))}
                        </>
                      )}
                    </select>
                  </div>
                  {!loadingDepartments && departments.length > 0 && (
                    <p className="help-text">
                      {departments.length === 1
                        ? '1 department available'
                        : `${departments.length} departments available`}
                    </p>
                  )}
                </div>

                <div className="min-w-0">
                  <label htmlFor="employee-salary" className="label label-required">
                    Salary (monthly)
                  </label>
                  <div className="input-group">
                    <PhilippinePeso className="input-icon" size={16} aria-hidden="true" />
                    <input
                      id="employee-salary"
                      name="salary"
                      type="number"
                      required
                      min="0"
                      step="1000"
                      inputMode="numeric"
                      value={formData.salary}
                      onChange={handleChange}
                      className="input"
                      placeholder="85000"
                      aria-describedby="employee-salary-help"
                    />
                  </div>
                  {/* 24 working days a month is the divisor the payroll
                      calculator uses, so the daily rate shown here is the one
                      the payslip will apply. */}
                  <p id="employee-salary-help" className="help-text">
                    {Number.isFinite(dailyRate) && dailyRate > 0
                      ? `≈ ${formatCurrency(dailyRate / 24)} per day over 24 working days.`
                      : 'Monthly basic pay, before allowances and deductions.'}
                  </p>
                </div>

                <div className="min-w-0">
                  <label htmlFor="employee-hire-date" className="label label-required">
                    Hire date
                  </label>
                  <div className="input-group">
                    <Calendar className="input-icon" size={16} aria-hidden="true" />
                    <input
                      id="employee-hire-date"
                      name="hire_date"
                      type="date"
                      required
                      value={formData.hire_date}
                      onChange={handleChange}
                      className="input"
                    />
                  </div>
                  <p className="help-text">Defaults to today in Manila.</p>
                </div>

                <div className="min-w-0">
                  <label htmlFor="employee-status" className="label label-required">
                    Status
                  </label>
                  <select
                    id="employee-status"
                    name="status"
                    required
                    value={formData.status}
                    onChange={handleChange}
                    className="select"
                  >
                    <option value="Active">Active</option>
                    <option value="Inactive">Inactive</option>
                    <option value="On Leave">On Leave</option>
                  </select>
                </div>
              </div>
            </fieldset>
          </div>

          <div className="flex flex-wrap items-center justify-end gap-2 border-t border-[rgb(248_250_252/0.1)] px-5 py-4">
            <button
              type="button"
              onClick={onClose}
              disabled={loading}
              className="btn btn-outline"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={disabled || loadingDepartments}
              className="btn btn-primary"
            >
              {loading ? (
                <>
                  <Loader2 size={16} className="animate-spin" aria-hidden="true" />
                  Adding…
                </>
              ) : (
                <>
                  <Save size={16} aria-hidden="true" />
                  Add employee
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default AddEmployee;
