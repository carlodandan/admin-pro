import React, { useEffect, useState } from 'react';
import {
  AlertCircle,
  Calendar,
  CheckCircle,
  Clock,
  Download,
  Percent,
  RefreshCw,
  Users,
  XCircle
} from 'lucide-react';
import { downloadCsv, toCsv } from '../../utils/csv';
import { manilaDate } from '../../utils/manila';

/**
 * 24 working days a month — 26 calendar days less two rest days — which is the
 * divisor the payroll calculator uses. It was reached through a
 * `getWorkingDaysInMonth(year, month)` that ignored both arguments and returned
 * the constant, alongside a `calculateWorkingDays()` that counted distinct dates
 * and was never called at all.
 */
const WORKING_DAYS_PER_MONTH = 24;

/** Thresholds the legend at the foot of the table explains. */
const rateTone = (rate) => {
  if (rate >= 90) return { bar: 'bg-accent', text: 'text-accent' };
  if (rate >= 75) return { bar: 'bg-warning', text: 'text-warning' };
  return { bar: 'bg-destructive', text: 'text-destructive' };
};

/** `2026-09` → `September 2026`. */
const monthLabel = (yearMonth) => {
  const [year, month] = String(yearMonth).split('-').map(Number);
  if (!year || !month) return yearMonth;
  return new Date(year, month - 1, 1).toLocaleDateString('en-US', {
    month: 'long',
    year: 'numeric'
  });
};

const MonthlyAttendanceReport = () => {
  // Manila's month, not the UTC one: `new Date().toISOString()` names the
  // previous month for the first eight hours of every 1st.
  const currentMonth = manilaDate().slice(0, 7);
  const [selectedMonth, setSelectedMonth] = useState(currentMonth);
  const [reportData, setReportData] = useState([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    generateReport();
  }, [selectedMonth]);

  const generateReport = async () => {
    setLoading(true);
    try {
      const [year, month] = selectedMonth.split('-').map(Number);
      const data = await window.api.getMonthlyAttendanceReport(year, month);
      setReportData(Array.isArray(data) ? data : []);
    } catch (error) {
      console.error('Error generating report:', error);
      setReportData([]);
    } finally {
      setLoading(false);
    }
  };

  // Derived from the rows on screen instead of a second `summary` state that
  // had to be recomputed and re-set beside them.
  const total = (key) => reportData.reduce((sum, row) => sum + (row[key] || 0), 0);
  const presentDays = total('present_days');
  const possibleDays = reportData.length * WORKING_DAYS_PER_MONTH;
  const averageAttendance =
    possibleDays > 0 ? `${((presentDays / possibleDays) * 100).toFixed(1)}%` : '0%';

  const handleExport = () => {
    // The button is disabled with nothing to export, so the `alert('No data to
    // export')` that used to guard this could never fire.
    if (reportData.length === 0) return;

    downloadCsv(
      `attendance-report-${selectedMonth}.csv`,
      toCsv(
        [
          'Employee ID',
          'Employee Name',
          'Department',
          'Present Days',
          'Absent Days',
          'Late Days',
          'Leave Days',
          'Total Recorded Days',
          'Working Days Required',
          'Attendance Rate'
        ],
        reportData.map((row) => [
          row.employee_id,
          row.employee_name,
          row.department_name || 'Unassigned',
          row.present_days || 0,
          row.absent_days || 0,
          row.late_days || 0,
          row.leave_days || 0,
          row.total_recorded_days || 0,
          WORKING_DAYS_PER_MONTH,
          row.total_recorded_days > 0
            ? `${(((row.present_days || 0) / row.total_recorded_days) * 100).toFixed(1)}%`
            : '0%'
        ])
      )
    );
  };

  const tiles = [
    { label: 'Employees', value: reportData.length, icon: Users, tone: 'text-info' },
    { label: 'Present', value: presentDays, icon: CheckCircle, tone: 'text-accent' },
    { label: 'Absent', value: total('absent_days'), icon: XCircle, tone: 'text-destructive' },
    { label: 'Late', value: total('late_days'), icon: Clock, tone: 'text-warning' },
    { label: 'On leave', value: total('leave_days'), icon: AlertCircle, tone: 'text-info' },
    {
      label: 'Avg. attendance',
      value: averageAttendance,
      detail: `of ${WORKING_DAYS_PER_MONTH} working days`,
      icon: Percent,
      tone: 'text-foreground'
    }
  ];

  const header = (
    <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
      <div className="min-w-0">
        <h3 className="section-title">Monthly attendance report</h3>
        <p className="page-subtitle mt-0.5">
          {monthLabel(selectedMonth)} · {WORKING_DAYS_PER_MONTH} working days in a 26-day month
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <div className="input-group">
          <Calendar className="input-icon" size={16} aria-hidden="true" />
          <input
            type="month"
            aria-label="Report month"
            value={selectedMonth}
            max={currentMonth}
            onChange={(event) => setSelectedMonth(event.target.value || currentMonth)}
            className="input w-[168px]"
          />
        </div>
        <button
          type="button"
          onClick={generateReport}
          disabled={loading}
          className="btn btn-ghost btn-icon"
          aria-label="Refresh report"
          title="Refresh"
        >
          <RefreshCw size={16} aria-hidden="true" className={loading ? 'animate-spin' : undefined} />
        </button>
        <button
          type="button"
          onClick={handleExport}
          disabled={reportData.length === 0}
          className="btn btn-outline btn-sm"
        >
          <Download size={15} aria-hidden="true" />
          Export CSV
        </button>
      </div>
    </div>
  );
  return (
    <section className="card p-5" aria-labelledby="monthly-report-heading">
      <h2 id="monthly-report-heading" className="sr-only">
        Monthly attendance report
      </h2>
      {header}

      <div className="mt-5 grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        {tiles.map((tile) => (
          <div key={tile.label} className="surface px-3 py-2.5">
            <div className="flex items-center justify-between gap-2">
              <p className="kpi-label truncate-1">{tile.label}</p>
              <tile.icon size={15} className={`shrink-0 ${tile.tone}`} aria-hidden="true" />
            </div>
            <p className="mt-1 font-display text-xl font-semibold tabular-nums">{tile.value}</p>
            {tile.detail && <p className="help-text">{tile.detail}</p>}
          </div>
        ))}
      </div>

      {loading ? (
        <div className="flex flex-col items-center justify-center py-14" role="status" aria-live="polite">
          <span className="spinner spinner-lg text-accent" aria-hidden="true" />
          <p className="mt-3 text-sm text-muted-foreground">
            Reading attendance for {monthLabel(selectedMonth)}…
          </p>
        </div>
      ) : reportData.length === 0 ? (
        <div className="empty-state">
          <span className="empty-state-icon" aria-hidden="true">
            <Users size={26} />
          </span>
          <p className="text-base font-medium text-foreground">
            Nothing recorded for {monthLabel(selectedMonth)}
          </p>
          <p className="max-w-md text-sm">
            The report lists every active employee, so an empty table means there are no active
            employees yet. Time in or mark absences on the day view above to fill it in.
          </p>
        </div>
      ) : (
        <>
          <div className="mt-5 mb-2 flex flex-wrap items-baseline justify-between gap-3">
            <p className="eyebrow">Per employee</p>
            <p className="text-xs text-muted-foreground">
              {reportData.length === 1 ? '1 active employee' : `${reportData.length} active employees`}
            </p>
          </div>

          <div className="table-container max-h-[58vh]">
            <table className="table">
              <thead>
                <tr>
                  <th scope="col">Employee</th>
                  <th scope="col">Department</th>
                  <th scope="col" className="num">
                    Present
                  </th>
                  <th scope="col" className="num">
                    Absent
                  </th>
                  <th scope="col" className="num">
                    Late
                  </th>
                  <th scope="col" className="num">
                    Leave
                  </th>
                  <th scope="col" className="num">
                    Recorded
                  </th>
                  <th scope="col" className="w-[210px]">
                    Attendance rate
                  </th>
                </tr>
              </thead>
              <tbody>
                {reportData.map((row, index) => {
                  const recorded = row.total_recorded_days || 0;
                  const present = row.present_days || 0;
                  // Two different rates, as before: one over the days actually
                  // recorded, one over the 24 the payroll month assumes.
                  const rate = recorded > 0 ? (present / recorded) * 100 : 0;
                  const workingRate = (present / WORKING_DAYS_PER_MONTH) * 100;
                  const tone = rateTone(rate);

                  return (
                    <tr key={row.employee_id} className="stagger-row" style={{ '--i': index }}>
                      <td>
                        <span className="block truncate-1 text-sm font-medium">
                          {row.employee_name || 'Unnamed employee'}
                        </span>
                        <span className="block text-xs text-muted-foreground">
                          ID {row.employee_id}
                        </span>
                      </td>
                      <td>
                        <span className="badge badge-muted">
                          {row.department_name || 'Unassigned'}
                        </span>
                      </td>
                      <td className="num text-accent">{present}</td>
                      <td className="num text-destructive">{row.absent_days || 0}</td>
                      <td className="num text-warning">{row.late_days || 0}</td>
                      <td className="num text-info">{row.leave_days || 0}</td>
                      <td className="num text-muted-foreground">{recorded}</td>
                      <td>
                        <div className="flex items-center gap-2.5">
                          <div
                            className="progress flex-1"
                            role="progressbar"
                            aria-valuenow={Math.round(rate)}
                            aria-valuemin={0}
                            aria-valuemax={100}
                            aria-label={`${row.employee_name} attendance rate over recorded days`}
                          >
                            <div
                              className={`progress-bar ${tone.bar}`}
                              style={{ width: `${Math.min(100, rate)}%` }}
                            />
                          </div>
                          <span className={`text-xs font-semibold tabular-nums ${tone.text}`}>
                            {rate.toFixed(1)}%
                          </span>
                        </div>
                        <p className="help-text mt-1">
                          {present} of {WORKING_DAYS_PER_MONTH} working days ·{' '}
                          {workingRate.toFixed(1)}%
                        </p>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* The rate colour is a shortcut, not the message: every bar carries
              its own number beside it, and this says what the colours mean. */}
          <ul className="mt-4 flex flex-wrap items-center gap-x-5 gap-y-2 border-t border-[rgb(248_250_252/0.09)] pt-3 text-xs text-muted-foreground">
            <li className="flex items-center gap-2">
              <span className="h-2.5 w-2.5 rounded-full bg-accent" aria-hidden="true" />
              90% and above — on track
            </li>
            <li className="flex items-center gap-2">
              <span className="h-2.5 w-2.5 rounded-full bg-warning" aria-hidden="true" />
              75–89% — watch
            </li>
            <li className="flex items-center gap-2">
              <span className="h-2.5 w-2.5 rounded-full bg-destructive" aria-hidden="true" />
              Below 75% — needs attention
            </li>
          </ul>
        </>
      )}
    </section>
  );
};

export default MonthlyAttendanceReport;
