import React, { useEffect, useState } from 'react';
import {
  AlertCircle,
  Calendar,
  CheckCircle,
  ChevronLeft,
  ChevronRight,
  Clock,
  Loader2,
  Lock,
  LogIn,
  LogOut,
  Percent,
  RefreshCw,
  Search,
  Trash2,
  UserCheck,
  Users,
  X,
  XCircle
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import AttendanceChart from '../components/Attendance/AttendanceChart';
import MonthlyAttendanceReport from '../components/Attendance/MonthlyAttendanceReport';
import ConfirmDialog from '../components/ui/ConfirmDialog';
import { useDialog } from '../hooks/useDialog';
import { useUser } from '../contexts/UserContext';
import { formatStoredDate, manilaDate, manilaTime, shiftStoredDate } from '../utils/manila';

const STATUS_BADGE = {
  Present: 'badge-accent',
  Absent: 'badge-danger',
  Late: 'badge-warning',
  'On Leave': 'badge-info'
};

/** `HH:MM:SS` → `HH:MM`, 24-hour, as the shift columns showed it before. */
const formatTime = (time) => (time ? String(time).slice(0, 5) : '--:--');

const initials = (employee) =>
  `${employee.first_name?.[0] ?? ''}${employee.last_name?.[0] ?? ''}`.toUpperCase() || '—';

const Attendance = () => {
  const [attendanceData, setAttendanceData] = useState([]);
  const [employees, setEmployees] = useState([]);
  const [departments, setDepartments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [isRecording, setIsRecording] = useState(false);
  // Today in Manila, not in UTC: before 08:00 the two are different days and the
  // punch would have been filed against yesterday.
  const [selectedDate, setSelectedDate] = useState(manilaDate());
  const [searchTerm, setSearchTerm] = useState('');
  const [filterDepartment, setFilterDepartment] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [bulkConfirm, setBulkConfirm] = useState(false);
  const [removeTarget, setRemoveTarget] = useState(null);

  const { user } = useUser();
  const navigate = useNavigate();
  const [showKioskModal, setShowKioskModal] = useState(false);
  const [adminPassword, setAdminPassword] = useState('');
  const [kioskError, setKioskError] = useState('');
  const [isVerifying, setIsVerifying] = useState(false);

  const closeKiosk = () => {
    if (isVerifying) return;
    setShowKioskModal(false);
    setAdminPassword('');
    setKioskError('');
  };

  const kioskRef = useDialog(showKioskModal, closeKiosk);

  useEffect(() => {
    loadAttendanceData(selectedDate);
    loadEmployees();
    loadDepartments();
  }, [selectedDate]);

  // The `alert()` calls these replace stopped the whole webview to report a
  // failed write.
  const flashError = (message) => {
    setError(message);
    setTimeout(() => setError(''), 5000);
  };

  const flashSuccess = (message) => {
    setSuccess(message);
    setTimeout(() => setSuccess(''), 3000);
  };
  const loadAttendanceData = async (date = null) => {
    try {
      setLoading(true);
      const targetDate = date || selectedDate;
      // Was a raw `SELECT * FROM attendance WHERE date = ?` through the generic
      // `query` passthrough. That passthrough is gone: this is the command that
      // replaced it, and it returns the same rows joined to the employee, as
      // `get_today_attendance` already did for today.
      const data = await window.api.getAttendanceByDate(targetDate);
      setAttendanceData(data || []);
    } catch (err) {
      console.error('Error loading attendance:', err);
      setAttendanceData([]);
      // The old version cleared the table and said nothing, so a failed read
      // and a day with no punches looked identical.
      flashError('Could not read the attendance for this date.');
    } finally {
      setLoading(false);
    }
  };

  const loadEmployees = async () => {
    try {
      const data = await window.api.getAllEmployees();
      setEmployees(data || []);
    } catch (err) {
      console.error('Error loading employees:', err);
      setEmployees([]);
    }
  };

  const loadDepartments = async () => {
    try {
      const data = await window.api.getAllDepartments();
      setDepartments(data || []);
    } catch (err) {
      console.error('Error loading departments:', err);
      setDepartments([]);
    }
  };
  const handleTimeIn = async (employeeId) => {
    try {
      setIsRecording(true);
      const currentTime = manilaTime();

      await window.api.recordAttendance({
        employee_id: employeeId,
        date: selectedDate,
        status: 'Present',
        check_in: currentTime,
        notes: `Timed in at ${currentTime} (Manila Time)`
      });
      await loadAttendanceData(selectedDate);
    } catch (err) {
      console.error('Error recording time in:', err);
      flashError(`Could not record the time in: ${err.message}`);
    } finally {
      setIsRecording(false);
    }
  };

  const handleTimeOut = async (employeeId) => {
    try {
      setIsRecording(true);
      const currentTime = manilaTime();

      await window.api.recordAttendance({
        employee_id: employeeId,
        date: selectedDate,
        // The command upserts with `COALESCE(excluded.check_in, …)`, so the
        // morning punch survives this write; `status` is restated for the row
        // that was created as anything other than Present.
        status: 'Present',
        check_out: currentTime,
        notes: `Timed out at ${currentTime} (Manila Time)`
      });
      await loadAttendanceData(selectedDate);
    } catch (err) {
      console.error('Error recording time out:', err);
      flashError(`Could not record the time out: ${err.message}`);
    } finally {
      setIsRecording(false);
    }
  };
  const handleMarkAbsent = async (employeeId) => {
    try {
      setIsRecording(true);

      await window.api.recordAttendance({
        employee_id: employeeId,
        date: selectedDate,
        status: 'Absent',
        check_in: null,
        check_out: null,
        notes: 'Marked as Absent'
      });
      await loadAttendanceData(selectedDate);
    } catch (err) {
      console.error('Error marking absent:', err);
      flashError(`Could not mark absent: ${err.message}`);
    } finally {
      setIsRecording(false);
    }
  };

  const handleMarkAllPresent = async () => {
    try {
      setIsRecording(true);
      const currentTime = manilaTime();
      let written = 0;

      // Sequential, as before: each iteration is an upsert on the same table,
      // and employees who already have a row for the day are left alone rather
      // than having their real punch overwritten with this one.
      for (const employee of filteredEmployees) {
        const existing = attendanceData.find(
          (record) => record.employee_id === employee.id && record.date === selectedDate
        );
        if (existing) continue;

        await window.api.recordAttendance({
          employee_id: employee.id,
          date: selectedDate,
          status: 'Present',
          check_in: currentTime,
          notes: 'Bulk marked present (timed in)'
        });
        written += 1;
      }

      await loadAttendanceData(selectedDate);
      flashSuccess(
        written === 0
          ? 'Every employee shown already had a record for this date.'
          : `Timed in ${written} ${written === 1 ? 'employee' : 'employees'} at ${currentTime}.`
      );
    } catch (err) {
      console.error('Error bulk marking attendance:', err);
      flashError(`Could not finish marking everyone present: ${err.message}`);
    } finally {
      setIsRecording(false);
      setBulkConfirm(false);
    }
  };
  const handleRemoveRecord = async () => {
    if (!removeTarget) return;
    const name = `${removeTarget.first_name} ${removeTarget.last_name}`.trim();

    try {
      setIsRecording(true);
      // `recordAttendance` only ever upserts, so removing a punch needs its own
      // command; this was the second and last statement sent through the raw
      // SQL passthrough.
      await window.api.deleteAttendance(removeTarget.id, selectedDate);
      await loadAttendanceData(selectedDate);
      flashSuccess(`Removed the attendance record for ${name}.`);
    } catch (err) {
      // This failure used to go to the console only: the row stayed on screen
      // with no explanation for why the click did nothing.
      console.error('Error deleting record:', err);
      flashError(`Could not remove the record: ${err.message}`);
    } finally {
      setIsRecording(false);
      setRemoveTarget(null);
    }
  };

  const handleLaunchKiosk = async (event) => {
    event.preventDefault();
    setIsVerifying(true);
    setKioskError('');

    try {
      if (!adminPassword) {
        throw new Error('Password is required');
      }

      const result = await window.api.loginUser(user.email, adminPassword);
      if (!result.success) {
        throw new Error(result.error || 'Invalid password');
      }

      // `window.open('#/kiosk', '_self')` reloaded the whole webview — and with
      // it the database handle and every context — to reach a route the router
      // already owns.
      navigate('/kiosk');
    } catch (err) {
      console.error('Kiosk launch error:', err);
      setKioskError(err.message);
    } finally {
      setIsVerifying(false);
    }
  };
  const filteredEmployees = employees.filter((employee) => {
    if (
      searchTerm &&
      !`${employee.first_name} ${employee.last_name}`
        .toLowerCase()
        .includes(searchTerm.toLowerCase())
    ) {
      return false;
    }
    // Loose comparison kept deliberately: the select's value is a string and
    // `department_id` comes back from SQLite as a number.
    if (filterDepartment && employee.department_id != filterDepartment) {
      return false;
    }
    return true;
  });

  const recordFor = (employeeId) =>
    attendanceData.find((record) => record.employee_id === employeeId);

  const presentCount = attendanceData.filter((record) => record.status === 'Present').length;
  const absentCount = attendanceData.filter((record) => record.status === 'Absent').length;
  const totalEmployees = employees.length;
  // Present over the whole roster rather than over the filtered rows — the same
  // arithmetic the tile did before, and the reason the rate drops when a filter
  // narrows the table but the tile does not move.
  const attendanceRate = totalEmployees > 0 ? (presentCount / totalEmployees) * 100 : 0;
  const unrecorded = filteredEmployees.filter((employee) => !recordFor(employee.id)).length;

  const isToday = selectedDate === manilaDate();
  const filtersActive = Boolean(searchTerm || filterDepartment);

  const clearFilters = () => {
    setSearchTerm('');
    setFilterDepartment('');
  };

  const dayLabel = formatStoredDate(selectedDate, {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric'
  });
  const tiles = [
    {
      label: 'Total employees',
      value: totalEmployees,
      detail:
        filteredEmployees.length === totalEmployees
          ? 'The whole roster'
          : `${filteredEmployees.length} shown by the filters`,
      icon: Users,
      iconClass: 'bg-[rgb(96_165_250/0.14)] text-info'
    },
    {
      label: 'Present',
      value: presentCount,
      detail: `${unrecorded} of the rows below have no record yet`,
      icon: CheckCircle,
      iconClass: 'bg-[rgb(34_197_94/0.14)] text-accent'
    },
    {
      label: 'Absent',
      value: absentCount,
      detail: 'Marked absent for this date',
      icon: XCircle,
      iconClass: 'bg-[rgb(239_68_68/0.14)] text-destructive'
    },
    {
      label: 'Attendance rate',
      value: `${attendanceRate.toFixed(1)}%`,
      detail: `${presentCount} present of ${totalEmployees} on the roster`,
      icon: Percent,
      iconClass: 'bg-[rgb(251_191_36/0.14)] text-warning'
    }
  ];
  return (
    <div className="page">
      <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
        <div className="min-w-0">
          <h2 className="page-title">Attendance</h2>
          <p className="page-subtitle mt-1">
            {dayLabel}
            {isToday ? ' · today' : ''}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {/* Stepping by whole calendar days through `shiftStoredDate`, not by
              24 hours through a `Date`. */}
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => setSelectedDate(shiftStoredDate(selectedDate, -1))}
              className="btn btn-ghost btn-icon"
              aria-label="Previous day"
              title="Previous day"
            >
              <ChevronLeft size={18} aria-hidden="true" />
            </button>
            <div className="input-group">
              <Calendar className="input-icon" size={16} aria-hidden="true" />
              <input
                id="attendance-date"
                type="date"
                className="input w-[170px]"
                value={selectedDate}
                onChange={(event) => setSelectedDate(event.target.value)}
                aria-label="Attendance date"
              />
            </div>
            <button
              type="button"
              onClick={() => setSelectedDate(shiftStoredDate(selectedDate, 1))}
              className="btn btn-ghost btn-icon"
              aria-label="Next day"
              title="Next day"
            >
              <ChevronRight size={18} aria-hidden="true" />
            </button>
          </div>
          {!isToday && (
            <button
              type="button"
              onClick={() => setSelectedDate(manilaDate())}
              className="btn btn-ghost btn-sm"
            >
              Today
            </button>
          )}
          <button
            type="button"
            // The old Refresh handed React's click event to `loadAttendanceData`
            // as its `date` argument, which is truthy, so the query ran against
            // an event object instead of the selected day.
            onClick={() => loadAttendanceData(selectedDate)}
            disabled={loading}
            className="btn btn-outline btn-sm"
          >
            <RefreshCw size={15} className={loading ? 'animate-spin' : ''} aria-hidden="true" />
            Refresh
          </button>
          <button
            type="button"
            onClick={() => setShowKioskModal(true)}
            className="btn btn-secondary btn-sm"
            title="Launch the self-service kiosk"
          >
            <Clock size={15} aria-hidden="true" />
            Kiosk mode
          </button>
        </div>
      </div>
      {/* Four `alert()` calls used to report these, one dialog at a time. */}
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
      <div className="card grid grid-cols-1 gap-3 p-4 md:grid-cols-[minmax(0,1fr)_200px_auto_auto]">
        <div className="min-w-0">
          <label htmlFor="attendance-search" className="label">
            Search
          </label>
          <div className="input-group">
            <Search className="input-icon" size={16} aria-hidden="true" />
            <input
              id="attendance-search"
              type="search"
              className="input"
              placeholder="Employee name"
              value={searchTerm}
              onChange={(event) => setSearchTerm(event.target.value)}
            />
          </div>
        </div>

        <div className="min-w-0">
          <label htmlFor="attendance-department" className="label">
            Department
          </label>
          <select
            id="attendance-department"
            className="select"
            value={filterDepartment}
            onChange={(event) => setFilterDepartment(event.target.value)}
          >
            <option value="">All departments</option>
            {departments.map((department) => (
              <option key={department.id} value={department.id}>
                {department.name}
              </option>
            ))}
          </select>
        </div>

        <div className="flex items-end">
          <button
            type="button"
            onClick={() => setBulkConfirm(true)}
            disabled={isRecording || filteredEmployees.length === 0}
            className="btn btn-primary w-full md:w-auto"
          >
            <UserCheck size={15} aria-hidden="true" />
            Mark all present
          </button>
        </div>

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
      <section className="flex flex-col gap-2" aria-labelledby="attendance-heading">
        <div className="flex flex-wrap items-baseline justify-between gap-3">
          <h3 id="attendance-heading" className="section-title">
            Employee attendance
          </h3>
          <p className="text-xs tabular-nums text-muted-foreground">
            {filteredEmployees.length === totalEmployees
              ? `${totalEmployees} ${totalEmployees === 1 ? 'employee' : 'employees'}`
              : `${filteredEmployees.length} of ${totalEmployees} shown`}
          </p>
        </div>

        {loading ? (
          <div
            className="card flex items-center justify-center py-16"
            role="status"
            aria-live="polite"
          >
            <span className="spinner spinner-lg text-accent" aria-hidden="true" />
            <span className="sr-only">Loading attendance…</span>
          </div>
        ) : filteredEmployees.length === 0 ? (
          <div className="card">
            <div className="empty-state">
              <span className="empty-state-icon" aria-hidden="true">
                <Users size={26} />
              </span>
              {totalEmployees === 0 ? (
                <p className="text-sm">No employees on record to take attendance for.</p>
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
          <div className="table-container max-h-[60vh]">            <table className="table">
              <thead>
                <tr>
                  <th scope="col">Employee</th>
                  <th scope="col">Department</th>
                  <th scope="col">Position</th>
                  <th scope="col">Check in</th>
                  <th scope="col">Check out</th>
                  <th scope="col">Status</th>
                  <th scope="col" className="text-right">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody>
                {filteredEmployees.map((employee, index) => {
                  const record = recordFor(employee.id);
                  return (
                    <tr key={employee.id} className="stagger-row" style={{ '--i': index }}>
                      <td>
                        <div className="flex items-center gap-3">
                          <span className="avatar h-9 w-9 text-xs">{initials(employee)}</span>
                          <span className="min-w-0">
                            <span
                              className="block truncate-1 font-medium"
                              title={`${employee.first_name} ${employee.last_name}`}
                            >
                              {employee.first_name} {employee.last_name}
                            </span>
                            <span className="block text-xs text-muted-foreground">
                              {employee.company_id}
                            </span>
                          </span>
                        </div>
                      </td>
                      <td>
                        {/* Null here means no department, which the old copy
                            called "No Department" — the roster elsewhere calls
                            it Unassigned. */}
                        <span className="badge badge-muted">
                          {employee.department_name || 'Unassigned'}
                        </span>
                      </td>
                      <td>
                        <span className="block truncate-1" title={employee.position}>
                          {employee.position}
                        </span>
                      </td>
                      <td>
                        <span
                          className={`font-mono ${record?.check_in ? '' : 'text-muted-foreground'}`}
                        >
                          {formatTime(record?.check_in)}
                        </span>
                      </td>
                      <td>
                        <span
                          className={`font-mono ${
                            record?.check_out ? '' : 'text-muted-foreground'
                          }`}
                        >
                          {formatTime(record?.check_out)}
                        </span>
                      </td>
                      <td>
                        <span
                          className={`badge ${
                            record ? STATUS_BADGE[record.status] || 'badge-muted' : 'badge-muted'
                          }`}
                        >
                          {record ? record.status : 'Not recorded'}
                        </span>
                      </td>
                      <td>
                        <div className="flex flex-wrap items-center justify-end gap-1.5">
                          {/* The three punch buttons appear under exactly the
                              conditions they did before: Time in until there is
                              a check_in, Time out only between the two punches,
                              Absent only while the day is still blank. */}
                          {!record?.check_in && (
                            <button
                              type="button"
                              onClick={() => handleTimeIn(employee.id)}
                              disabled={isRecording || record?.status === 'Absent'}
                              className="btn btn-outline btn-sm"
                              title={
                                record?.status === 'Absent'
                                  ? 'Remove the absence first'
                                  : `Time ${employee.first_name} in`
                              }
                            >
                              <LogIn size={14} aria-hidden="true" />
                              Time in
                            </button>
                          )}

                          {record?.check_in && !record?.check_out && (
                            <button
                              type="button"
                              onClick={() => handleTimeOut(employee.id)}
                              disabled={isRecording}
                              className="btn btn-outline btn-sm"
                              title={`Time ${employee.first_name} out`}
                            >
                              <LogOut size={14} aria-hidden="true" />
                              Time out
                            </button>
                          )}

                          {record?.status !== 'Absent' && !record?.check_in && (
                            <button
                              type="button"
                              onClick={() => handleMarkAbsent(employee.id)}
                              disabled={isRecording}
                              className="btn btn-ghost btn-sm"
                            >
                              <XCircle size={14} aria-hidden="true" />
                              Absent
                            </button>
                          )}

                          {record && (
                            <button
                              type="button"
                              onClick={() => setRemoveTarget(employee)}
                              disabled={isRecording}
                              className="btn btn-danger-ghost btn-icon btn-sm"
                              aria-label={`Remove the attendance record for ${employee.first_name} ${employee.last_name}`}
                              title="Remove this record"
                            >
                              <Trash2 size={14} aria-hidden="true" />
                            </button>
                          )}

                        </div>
                      </td>
                    </tr>
                  );
                })}
</tbody>
            </table></div>
        )}
      </section>
      <AttendanceChart />
      <MonthlyAttendanceReport />

      {/* Rewritten because the old list described a "Present" button that does
          not exist on this screen, and promised an export this page never had —
          the monthly report above it is the thing that exports. */}
      <div className="alert alert-info" role="note">
        <AlertCircle size={16} className="mt-0.5 shrink-0" aria-hidden="true" />
        <div className="flex-1">
          <p className="font-medium">Working this screen</p>
          <ul className="mt-2 space-y-1 text-xs">
            <li>
              Pick a date with the arrows or the field above; times are recorded
              against the Manila clock, not this machine's.
            </li>
            <li>
              Time in and Time out punch one employee. Absent files the day with no
              times, and can be undone by removing the record.
            </li>
            <li>
              Mark all present times in everyone currently listed who has no record
              yet, leaving existing punches untouched.
            </li>
            <li>Kiosk mode asks for your password, then hands the screen to staff.</li>
          </ul>
        </div>
      </div>
      {showKioskModal && (
        <div
          className="modal-backdrop"
          onClick={(event) => {
            if (event.target === event.currentTarget) closeKiosk();
          }}
        >
          <div
            ref={kioskRef}
            tabIndex={-1}
            role="dialog"
            aria-modal="true"
            aria-labelledby="kiosk-title"
            className="modal-panel max-w-md"
          >
            <div className="flex items-start gap-3 border-b border-[rgb(248_250_252/0.1)] px-5 py-4">
              <span className="kpi-icon bg-[rgb(96_165_250/0.14)] text-info">
                <Lock size={20} aria-hidden="true" />
              </span>
              <div className="min-w-0">
                <h2 id="kiosk-title" className="section-title">
                  Admin access required
                </h2>
                <p className="page-subtitle mt-0.5">
                  Kiosk mode leaves this screen unattended
                </p>
              </div>
            </div>
            <form onSubmit={handleLaunchKiosk}>
              <div className="px-5 py-4">
                <label htmlFor="kiosk-password" className="label label-required">
                  Your password
                </label>
                <input
                  id="kiosk-password"
                  type="password"
                  value={adminPassword}
                  onChange={(event) => setAdminPassword(event.target.value)}
                  className={`input ${kioskError ? 'input-invalid' : ''}`}
                  placeholder="Password for this account"
                  autoComplete="current-password"
                  data-autofocus
                  aria-invalid={kioskError ? 'true' : undefined}
                  aria-describedby={kioskError ? 'kiosk-error' : 'kiosk-help'}
                />
                {kioskError ? (
                  <p id="kiosk-error" className="error-text" role="alert">
                    <AlertCircle size={13} aria-hidden="true" />
                    {kioskError}
                  </p>
                ) : (
                  <p id="kiosk-help" className="help-text">
                    Verified against {user?.email || 'the signed-in account'}.
                  </p>
                )}
              </div>
              <div className="flex flex-wrap items-center justify-end gap-2 border-t border-[rgb(248_250_252/0.1)] px-5 py-4">
                <button
                  type="button"
                  onClick={closeKiosk}
                  disabled={isVerifying}
                  className="btn btn-outline"
                >
                  Cancel
                </button>
                <button type="submit" disabled={isVerifying} className="btn btn-primary">
                  {isVerifying ? (
                    <>
                      <Loader2 size={16} className="animate-spin" aria-hidden="true" />
                      Verifying…
                    </>
                  ) : (
                    <>
                      <Lock size={16} aria-hidden="true" />
                      Launch kiosk
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
      {/* Both of these were `window.confirm`. The bulk one is a write worth a
          second look rather than a destruction, so it is not dressed in red. */}
      <ConfirmDialog
        isOpen={bulkConfirm}
        title="Mark everyone present?"
        body={`${
          filteredEmployees.length === totalEmployees
            ? `All ${totalEmployees} employees`
            : `The ${filteredEmployees.length} employees currently listed`
        } will be timed in for ${dayLabel}. Anyone who already has a record for that day keeps it.`}
        confirmLabel="Mark all present"
        busyLabel="Marking…"
        variant="primary"
        icon={UserCheck}
        busy={isRecording}
        onConfirm={handleMarkAllPresent}
        onCancel={() => setBulkConfirm(false)}
      />

      <ConfirmDialog
        isOpen={Boolean(removeTarget)}
        title="Remove this record?"
        body={`The attendance row for ${removeTarget?.first_name ?? ''} ${
          removeTarget?.last_name ?? ''
        } on ${dayLabel} will be deleted, leaving the day unrecorded. Their punches for other dates are untouched.`}
        confirmLabel="Remove record"
        busyLabel="Removing…"
        busy={isRecording}
        onConfirm={handleRemoveRecord}
        onCancel={() => setRemoveTarget(null)}
      />
    </div>
  );
};

export default Attendance;
