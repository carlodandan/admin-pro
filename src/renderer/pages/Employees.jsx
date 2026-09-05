import React, { useEffect, useState } from 'react';
import {
  AlertTriangle,
  Building2,
  CalendarOff,
  CheckCircle,
  Download,
  Mail,
  PhilippinePeso,
  Phone,
  Search,
  UserPlus,
  Users,
  X
} from 'lucide-react';
import AddEmployee from '../components/Employees/AddEmployee';
import DeleteEmployee from '../components/Employees/DeleteEmployee';
import { downloadCsv, toCsv } from '../utils/csv';
import { formatStoredDate, manilaDate } from '../utils/manila';

const STATUSES = ['All', 'Active', 'Inactive', 'On Leave'];

/** Status is the one thing here colour carries — and it carries a word too. */
const STATUS_BADGE = {
  Active: 'badge-accent',
  Inactive: 'badge-danger',
  'On Leave': 'badge-warning'
};

const formatCurrency = (amount) =>
  new Intl.NumberFormat('en-PH', {
    style: 'currency',
    currency: 'PHP',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0
  }).format(amount || 0);

/**
 * A database row as the table wants it.
 *
 * The department colour map that used to live here gave seven hard-coded
 * department names a `bg-blue-100`-through-`bg-pink-100` fill — light-theme
 * tints on a dark surface, and nothing at all for an eighth department. The
 * chip is one neutral token now: a department is a category, not a state, so
 * that colour was not carrying meaning.
 */
const toRow = (employee) => {
  if (!employee) return null;

  const firstName = employee.first_name || '';
  const lastName = employee.last_name || '';
  const salary = Number.parseFloat(employee.salary) || 0;

  return {
    id: employee.id,
    name: `${firstName} ${lastName}`.trim() || 'Unnamed employee',
    initials: `${firstName[0] || ''}${lastName[0] || ''}` || '??',
    position: employee.position || '—',
    department: employee.department_name || 'Unassigned',
    email: employee.email || '—',
    phone: employee.phone || '—',
    // `new Date('2026-09-05').toLocaleDateString()` reads the stored string as
    // UTC midnight, so it printed the 4th in any negative-offset zone.
    hireDate: employee.hire_date ? formatStoredDate(employee.hire_date) : '—',
    status: employee.status || 'Unknown',
    companyId: employee.company_id || '—',
    salary,
    // The fallback here was `'$0'` — a dollar sign, in a peso payroll.
    salaryLabel: formatCurrency(salary)
  };
};

const Employees = () => {
  const [employees, setEmployees] = useState([]);
  const [departments, setDepartments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedDepartment, setSelectedDepartment] = useState('All');
  const [selectedStatus, setSelectedStatus] = useState('All');
  const [showAddModal, setShowAddModal] = useState(false);

  useEffect(() => {
    loadEmployees();
    loadDepartments();
  }, []);

  const loadEmployees = async () => {
    try {
      setLoading(true);
      setError('');
      const data = await window.api.getAllEmployees();
      setEmployees(Array.isArray(data) ? data : []);
    } catch (err) {
      console.error('Error loading employees:', err);
      setError('Failed to load employees. The local database may be unavailable.');
      setEmployees([]);
    } finally {
      setLoading(false);
    }
  };

  const loadDepartments = async () => {
    try {
      const data = await window.api.getAllDepartments();
      setDepartments(Array.isArray(data) ? data : []);
    } catch (err) {
      console.error('Error loading departments:', err);
      setDepartments([]);
    }
  };

  const handleDeleteSuccess = (message) => {
    setSuccess(message);
    loadEmployees();
    setTimeout(() => setSuccess(''), 3000);
  };

  const handleDeleteError = (message) => {
    setError(message);
    setTimeout(() => setError(''), 5000);
  };

  const rows = employees.map(toRow).filter(Boolean);

  // Derived from the rows the table renders instead of held in a second piece
  // of state, which could only ever be a copy waiting to go stale.
  const headcount = rows.length;
  const active = rows.filter((row) => row.status === 'Active').length;
  const onLeave = rows.filter((row) => row.status === 'On Leave').length;
  const avgSalary =
    headcount > 0 ? Math.round(rows.reduce((sum, row) => sum + row.salary, 0) / headcount) : 0;

  const term = searchTerm.trim().toLowerCase();
  const filtered = rows.filter((row) => {
    const matchesSearch =
      !term ||
      row.name.toLowerCase().includes(term) ||
      row.email.toLowerCase().includes(term) ||
      row.companyId.toLowerCase().includes(term);
    const matchesDepartment =
      selectedDepartment === 'All' || row.department === selectedDepartment;
    const matchesStatus = selectedStatus === 'All' || row.status === selectedStatus;
    return matchesSearch && matchesDepartment && matchesStatus;
  });

  // Taken from the roster rather than the department table, so the list only
  // offers filters that can match something.
  const departmentOptions = [
    'All',
    ...[...new Set(rows.map((row) => row.department))].sort((a, b) => a.localeCompare(b))
  ];
  const filtersActive =
    Boolean(term) || selectedDepartment !== 'All' || selectedStatus !== 'All';

  const clearFilters = () => {
    setSearchTerm('');
    setSelectedDepartment('All');
    setSelectedStatus('All');
  };

  // Exports the rows on screen, filters included. The button that used to sit
  // here logged `'Export functionality'` to a console no user opens.
  const handleExport = () => {
    if (filtered.length === 0) return;

    downloadCsv(
      `employees-${manilaDate()}.csv`,
      toCsv(
        [
          'Employee',
          'Company ID',
          'Position',
          'Department',
          'Email',
          'Phone',
          'Status',
          'Hire date',
          'Monthly salary'
        ],
        filtered.map((row) => [
          row.name,
          row.companyId,
          row.position,
          row.department,
          row.email,
          row.phone,
          row.status,
          row.hireDate,
          row.salary
        ])
      )
    );
  };

  const share = (count) =>
    headcount > 0 ? `${((count / headcount) * 100).toFixed(1)}% of headcount` : 'No records yet';

  const tiles = [
    {
      label: 'Total employees',
      value: headcount,
      detail: `Across ${departments.length} ${departments.length === 1 ? 'department' : 'departments'}`,
      icon: Users,
      iconClass: 'bg-[rgb(96_165_250/0.14)] text-info'
    },
    {
      label: 'Active',
      value: active,
      detail: share(active),
      icon: CheckCircle,
      iconClass: 'bg-[rgb(34_197_94/0.14)] text-accent'
    },
    {
      label: 'On leave',
      value: onLeave,
      detail: share(onLeave),
      icon: CalendarOff,
      iconClass: 'bg-[rgb(251_191_36/0.14)] text-warning'
    },
    {
      // The card read "Avg. Annual Salary" over a column the payroll calculator
      // divides by 24 to get a daily rate.
      label: 'Avg. monthly salary',
      value: formatCurrency(avgSalary),
      detail: 'Basic pay, before allowances',
      icon: PhilippinePeso,
      iconClass: 'bg-[rgb(148_163_184/0.14)] text-foreground'
    }
  ];

  const departmentBars = [...departments]
    .map((department) => ({
      name: department.name || 'Unassigned',
      count: rows.filter((row) => row.department === department.name).length
    }))
    .sort((a, b) => b.count - a.count);

  return (
    <div className="page">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <h2 className="page-title">Employees</h2>
          <p className="page-subtitle mt-1">
            {headcount === 1 ? '1 record' : `${headcount} records`} · {active} active ·{' '}
            {onLeave} on leave
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <button
            type="button"
            onClick={handleExport}
            disabled={filtered.length === 0}
            className="btn btn-outline btn-sm"
            title="Exports the rows listed below"
          >
            <Download size={15} aria-hidden="true" />
            Export CSV
          </button>
          <button
            type="button"
            onClick={() => setShowAddModal(true)}
            className="btn btn-primary btn-sm"
          >
            <UserPlus size={15} aria-hidden="true" />
            Add employee
          </button>
        </div>
      </div>

      {/* Both messages clear themselves on a timer; each is announced, the
          error assertively. */}
      {success && (
        <div className="alert alert-success" role="status">
          <CheckCircle size={16} className="mt-0.5 shrink-0" aria-hidden="true" />
          <p className="flex-1">{success}</p>
        </div>
      )}
      {error && (
        <div className="alert alert-danger" role="alert">
          <AlertTriangle size={16} className="mt-0.5 shrink-0" aria-hidden="true" />
          <p className="flex-1">{error}</p>
        </div>
      )}

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {tiles.map((tile, index) => {
          const Icon = tile.icon;
          return (
            <div
              key={tile.label}
              className="card stagger-card flex items-start justify-between gap-3 p-4"
              style={{ '--i': index }}
            >
              <div className="min-w-0">
                <p className="kpi-label truncate-1">{tile.label}</p>
                <p className="kpi-value mt-1.5">{tile.value}</p>
                <p className="mt-2 text-xs text-muted-foreground">{tile.detail}</p>
              </div>
              <span className={`kpi-icon ${tile.iconClass}`}>
                <Icon size={20} aria-hidden="true" />
              </span>
            </div>
          );
        })}
      </div>

      <div className="card grid grid-cols-1 gap-3 p-4 md:grid-cols-[minmax(0,1fr)_190px_170px_auto]">
        <div className="min-w-0">
          <label htmlFor="employee-search" className="label">
            Search
          </label>
          <div className="input-group">
            <Search className="input-icon" size={16} aria-hidden="true" />
            <input
              id="employee-search"
              type="search"
              className="input"
              placeholder="Name, email or company ID"
              value={searchTerm}
              onChange={(event) => setSearchTerm(event.target.value)}
            />
          </div>
        </div>

        <div className="min-w-0">
          <label htmlFor="employee-department" className="label">
            Department
          </label>
          <select
            id="employee-department"
            className="select"
            value={selectedDepartment}
            onChange={(event) => setSelectedDepartment(event.target.value)}
          >
            {departmentOptions.map((option) => (
              <option key={option} value={option}>
                {option === 'All' ? 'All departments' : option}
              </option>
            ))}
          </select>
        </div>

        <div className="min-w-0">
          <label htmlFor="employee-status" className="label">
            Status
          </label>
          <select
            id="employee-status"
            className="select"
            value={selectedStatus}
            onChange={(event) => setSelectedStatus(event.target.value)}
          >
            {STATUSES.map((status) => (
              <option key={status} value={status}>
                {status === 'All' ? 'All statuses' : status}
              </option>
            ))}
          </select>
        </div>

        {/* Replaces a "More Filters" button that logged to the console. This one
            clears the three filters that actually exist. */}
        <div className="flex items-end">
          <button
            type="button"
            onClick={clearFilters}
            disabled={!filtersActive}
            className="btn btn-ghost w-full md:w-auto"
          >
            <X size={15} aria-hidden="true" />
            Clear
          </button>
        </div>
      </div>

      <section className="flex flex-col gap-2" aria-labelledby="roster-heading">
        <div className="flex flex-wrap items-baseline justify-between gap-3">
          <h3 id="roster-heading" className="section-title">
            Roster
          </h3>
          {/* What the "Showing 1 to N of N employees" line said, without the
              Previous/1/Next controls that sat beside it: both were disabled
              unconditionally, and nothing on this page pages. */}
          <p className="text-xs tabular-nums text-muted-foreground">
            {filtered.length === headcount
              ? `${headcount} ${headcount === 1 ? 'employee' : 'employees'}`
              : `${filtered.length} of ${headcount} shown`}
          </p>
        </div>

        {loading ? (
          <div
            className="card flex items-center justify-center py-16"
            role="status"
            aria-live="polite"
          >
            <span className="spinner spinner-lg text-accent" aria-hidden="true" />
            <span className="sr-only">Loading employees…</span>
          </div>
        ) : filtered.length === 0 ? (
          <div className="card">
            <div className="empty-state">
              <span className="empty-state-icon" aria-hidden="true">
                <Users size={26} />
              </span>
              {headcount === 0 ? (
                <>
                  <p className="text-sm">No employees on record.</p>
                  <p className="text-xs">Add the first one with the button above.</p>
                </>
              ) : (
                <>
                  <p className="text-sm">No employees match these filters.</p>
                  <button
                    type="button"
                    onClick={clearFilters}
                    className="btn btn-outline btn-sm mt-1"
                  >
                    <X size={15} aria-hidden="true" />
                    Clear filters
                  </button>
                </>
              )}
            </div>
          </div>
        ) : (
          // Bounded so the sticky header earns its keep: the roster is the one
          // table here with no upper row count.
          <div className="table-container max-h-[62vh]">
            <table className="table">
              <thead>
                <tr>
                  <th scope="col">Employee</th>
                  <th scope="col">Position</th>
                  <th scope="col">Department</th>
                  <th scope="col">Contact</th>
                  <th scope="col">Status</th>
                  <th scope="col" className="text-right">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((row, index) => (
                  <tr key={row.id} className="stagger-row" style={{ '--i': index }}>
                    <td>
                      <div className="flex items-center gap-3">
                        <span className="avatar h-9 w-9 text-xs">{row.initials}</span>
                        <span className="min-w-0">
                          <span className="block truncate-1 font-medium" title={row.name}>
                            {row.name}
                          </span>
                          <span className="block text-xs text-muted-foreground">
                            {row.companyId} · hired {row.hireDate}
                          </span>
                        </span>
                      </div>
                    </td>
                    <td>
                      <span className="block truncate-1" title={row.position}>
                        {row.position}
                      </span>
                      <span className="block text-xs text-muted-foreground">
                        {row.salaryLabel} / month
                      </span>
                    </td>
                    <td>
                      <span className="badge badge-muted">{row.department}</span>
                    </td>
                    <td>
                      <span className="flex items-center gap-2 text-xs">
                        <Mail
                          size={13}
                          className="shrink-0 text-muted-foreground"
                          aria-hidden="true"
                        />
                        <span className="wrap-anywhere">{row.email}</span>
                      </span>
                      <span className="mt-1 flex items-center gap-2 text-xs">
                        <Phone
                          size={13}
                          className="shrink-0 text-muted-foreground"
                          aria-hidden="true"
                        />
                        <span>{row.phone}</span>
                      </span>
                    </td>
                    <td>
                      <span className={`badge ${STATUS_BADGE[row.status] || 'badge-muted'}`}>
                        {row.status}
                      </span>
                    </td>
                    {/* View and Edit sat here as empty functions, and a
                        MoreVertical button logged 'More options'. Delete is the
                        one action this page can carry out. */}
                    <td className="text-right">
                      <DeleteEmployee
                        employeeId={row.id}
                        employeeName={row.name}
                        onDeleteSuccess={handleDeleteSuccess}
                        onDeleteError={handleDeleteError}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="card p-5" aria-labelledby="distribution-heading">
        <div className="flex flex-wrap items-baseline justify-between gap-3">
          <h3 id="distribution-heading" className="section-title">
            Department distribution
          </h3>
          {/* The grid was sliced to the first four departments by insertion
              order, with nothing to say the rest existed. All of them are here,
              busiest first. */}
          <p className="text-xs text-muted-foreground">
            Share of the {headcount === 1 ? '1 record' : `${headcount} records`} on file
          </p>
        </div>

        {departmentBars.length === 0 ? (
          <div className="empty-state">
            <span className="empty-state-icon" aria-hidden="true">
              <Building2 size={26} />
            </span>
            <p className="text-sm">No departments yet.</p>
            <p className="text-xs">Create one from Departments before adding employees.</p>
          </div>
        ) : (
          <ul className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {departmentBars.map((bar) => {
              const percentage = headcount > 0 ? (bar.count / headcount) * 100 : 0;
              return (
                <li key={bar.name} className="surface px-3 py-3">
                  <div className="flex items-baseline justify-between gap-2">
                    <span className="truncate-1 text-sm font-medium" title={bar.name}>
                      {bar.name}
                    </span>
                    <span className="shrink-0 font-display text-sm font-semibold tabular-nums">
                      {bar.count}
                    </span>
                  </div>
                  <div
                    className="progress mt-2"
                    role="progressbar"
                    aria-valuenow={Math.round(percentage)}
                    aria-valuemin={0}
                    aria-valuemax={100}
                    aria-label={`${bar.name} share of headcount`}
                  >
                    <div
                      className="progress-bar"
                      style={{ width: `${Math.min(100, percentage)}%` }}
                    />
                  </div>
                  <p className="mt-1.5 text-xs tabular-nums text-muted-foreground">
                    {percentage.toFixed(1)}% ·{' '}
                    {bar.count === 1 ? '1 employee' : `${bar.count} employees`}
                  </p>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <AddEmployee
        isOpen={showAddModal}
        onClose={() => setShowAddModal(false)}
        onEmployeeAdded={loadEmployees}
      />
    </div>
  );
};

export default Employees;
