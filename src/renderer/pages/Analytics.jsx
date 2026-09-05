import React, { useEffect, useState } from 'react';
import {
  AlertCircle,
  Briefcase,
  CalendarDays,
  PhilippinePeso,
  PieChart,
  RefreshCw,
  TrendingUp,
  Users
} from 'lucide-react';
import { manilaDate, manilaDateDaysAgo } from '../utils/manila';

/** The four presets the filter offers. */
const RANGES = [
  { label: 'All time', value: 'all' },
  { label: '30 days', value: '30' },
  { label: '60 days', value: '60' },
  { label: '90 days', value: '90' }
];

/**
 * Status → the dot in the legend and the arc in the ring.
 *
 * The ring used to take its colours from a positional array and the legend from
 * a separate map keyed by status, so the two disagreed as soon as a status was
 * missing from the data. One map now feeds both, and an unknown status falls
 * back to the muted tone rather than to "Inactive" red.
 */
const STATUS_TONE = {
  Active: { dot: 'bg-accent', stroke: 'var(--color-accent)' },
  'On Leave': { dot: 'bg-warning', stroke: 'var(--color-warning)' },
  Inactive: { dot: 'bg-destructive', stroke: 'var(--color-destructive)' },
  Terminated: { dot: 'bg-muted-foreground', stroke: 'var(--color-muted-foreground)' }
};

const FALLBACK_TONE = { dot: 'bg-info', stroke: 'var(--color-info)' };

const toneFor = (status) => STATUS_TONE[status] ?? FALLBACK_TONE;

const num = (value) => Number(value) || 0;

/** `₱42,500` — whole pesos, as the original did. */
const formatCurrency = (value) =>
  new Intl.NumberFormat('en-PH', {
    style: 'currency',
    currency: 'PHP',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0
  }).format(num(value));

/**
 * `₱1.2M` — the label that sits above a bar, where the full figure would be
 * wider than the column. The exact amount stays in the bar's own description.
 */
const compactCurrency = (value) => {
  const amount = num(value);
  if (Math.abs(amount) >= 1_000_000) return `₱${(amount / 1_000_000).toFixed(1)}M`;
  if (Math.abs(amount) >= 1_000) return `₱${Math.round(amount / 1_000)}K`;
  return `₱${Math.round(amount)}`;
};

/** `Sep 26` from the `YYYY-MM` that `strftime` returns. */
const formatMonth = (value) => {
  if (!value) return '';
  const [year, month] = String(value).split('-').map(Number);
  if (!year || !month) return String(value);
  return new Date(year, month - 1, 1).toLocaleDateString('en-US', {
    month: 'short',
    year: '2-digit'
  });
};

/**
 * One column chart.
 *
 * Each column carries its value as text as well as its height, because the
 * original showed the figure on hover alone — which a touch screen and a screen
 * reader both miss — and `title` is the only description a bare `div` has.
 */
const ColumnChart = ({ rows, label }) => (
  <div className="flex h-44 items-end gap-2" role="list" aria-label={label}>
    {rows.map((row) => (
      <div key={row.key} className="flex min-w-0 flex-1 flex-col items-center gap-1" role="listitem">
        <span className="tnum truncate text-[10px] text-muted-foreground">{row.valueLabel}</span>
        <div className="flex h-full w-full items-end">
          <div
            className={`w-full rounded-t-[6px] transition-[height] duration-300 ease-out ${row.tone}`}
            style={{ height: `${row.percent}%`, minHeight: row.percent > 0 ? '6px' : '2px' }}
            title={row.tip}
            role="img"
            aria-label={row.tip}
          />
        </div>
        <span className="truncate text-[11px] text-muted-foreground">{row.label}</span>
        {row.sub && <span className="truncate text-[10px] text-muted-foreground/70">{row.sub}</span>}
      </div>
    ))}
  </div>
);

/** A labelled horizontal bar, the shape the rest of the app uses for shares. */
const BarRow = ({ title, value, percent, tone, footLeft, footRight, description }) => (
  <div>
    <div className="flex items-baseline justify-between gap-3">
      <span className="truncate-1 text-sm font-medium">{title}</span>
      <span className="tnum text-sm font-semibold">{value}</span>
    </div>
    <div
      className="progress mt-1.5"
      role="progressbar"
      aria-valuenow={Math.round(percent)}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-label={description}
    >
      <div className={`progress-bar ${tone}`} style={{ width: `${Math.min(100, percent)}%` }} />
    </div>
    {(footLeft || footRight) && (
      <div className="mt-1.5 flex items-baseline justify-between gap-3 text-xs text-muted-foreground">
        <span className="truncate-1">{footLeft}</span>
        <span className="tnum shrink-0">{footRight}</span>
      </div>
    )}
  </div>
);

/** An empty chart slot, so a section with no rows keeps the card's height. */
const NoData = ({ message }) => (
  <div className="flex h-44 items-center justify-center">
    <p className="text-sm text-muted-foreground">{message}</p>
  </div>
);

const Analytics = () => {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [dateRange, setDateRange] = useState('all');

  useEffect(() => {
    loadAnalytics();
  }, [dateRange]);

  /**
   * The window the filter names, as Manila calendar dates.
   *
   * This was `new Date()` stepped back by `setDate` and read out with
   * `toISOString()` — the UTC date, so between midnight and 08:00 Manila both
   * ends of the range named the day before. `attendance.date` and
   * `payroll.cutoff_start` are Manila dates, so the comparison has to be too.
   */
  const dateFilters = () => {
    if (dateRange === 'all') return {};
    return { startDate: manilaDateDaysAgo(Number(dateRange)), endDate: manilaDate() };
  };

  const loadAnalytics = async () => {
    try {
      setLoading(true);
      setError('');
      const result = await window.api.getAnalyticsData(dateFilters());
      setData(result);
    } catch (loadError) {
      console.error('Error loading analytics:', loadError);
      setError('Could not read the analytics data.');
    } finally {
      setLoading(false);
    }
  };

  const {
    employeeGrowth = [],
    attendanceTrends = [],
    payrollCostTrends = [],
    departmentComparison = [],
    employeeStatusBreakdown = [],
    salaryDistribution = []
  } = data || {};

  // `Math.max(...[])` is `-Infinity`, which turns every height into `NaN%`; the
  // trailing 1 is the original's guard and is kept.
  const maxGrowth = Math.max(...employeeGrowth.map((row) => num(row.count)), 1);
  const maxPayroll = Math.max(...payrollCostTrends.map((row) => num(row.total_net)), 1);
  const maxHeadcount = Math.max(...departmentComparison.map((row) => num(row.headcount)), 1);
  const maxSalaryCount = Math.max(...salaryDistribution.map((row) => num(row.count)), 1);

  const totalEmployees = employeeStatusBreakdown.reduce((sum, row) => sum + num(row.count), 0);
  const totalHires = employeeGrowth.reduce((sum, row) => sum + num(row.count), 0);
  const totalPayroll = payrollCostTrends.reduce((sum, row) => sum + num(row.total_net), 0);
  const paidCount = payrollCostTrends.reduce((sum, row) => sum + num(row.paid_count), 0);
  const pendingCount = payrollCostTrends.reduce((sum, row) => sum + num(row.pending_count), 0);
  const latestRate = num(attendanceTrends[attendanceTrends.length - 1]?.attendance_rate);

  const growthRows = employeeGrowth.map((row, index) => ({
    key: row.month ?? index,
    label: formatMonth(row.month),
    valueLabel: num(row.count),
    percent: (num(row.count) / maxGrowth) * 100,
    tone: 'bg-info',
    tip: `${num(row.count)} hired in ${formatMonth(row.month)}, ${num(row.active_count)} still active`
  }));

  const attendanceRows = attendanceTrends.map((row, index) => {
    const rate = num(row.attendance_rate);
    return {
      key: row.month ?? index,
      label: formatMonth(row.month),
      valueLabel: `${rate}%`,
      percent: rate,
      tone: rate >= 90 ? 'bg-accent' : rate >= 70 ? 'bg-warning' : 'bg-destructive',
      tip: `${rate}% present in ${formatMonth(row.month)} — ${num(row.present)} of ${num(row.total_records)} records`
    };
  });

  const payrollRows = payrollCostTrends.map((row, index) => ({
    key: row.month ?? index,
    label: formatMonth(row.month),
    sub: `${num(row.employee_count)} emp`,
    valueLabel: compactCurrency(row.total_net),
    percent: (num(row.total_net) / maxPayroll) * 100,
    tone: 'bg-accent',
    tip: `${formatMonth(row.month)} — net ${formatCurrency(row.total_net)}, basic ${formatCurrency(
      row.total_basic
    )}, deductions ${formatCurrency(row.total_deductions)}`
  }));

  return (
    <div className="page">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0">
          <h1 className="page-title">Analytics</h1>
          <p className="page-subtitle mt-1">
            Historical trends across headcount, attendance and payroll.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {/* The same segmented control the payroll cutoff uses. It was a row of
              pill buttons with no grouping semantics and no pressed state. */}
          <div className="segment" role="group" aria-label="Date range">
            {RANGES.map((range) => (
              <button
                key={range.value}
                type="button"
                onClick={() => setDateRange(range.value)}
                aria-pressed={dateRange === range.value}
                className={`segment-item ${dateRange === range.value ? 'segment-item-active' : ''}`}
              >
                {range.label}
              </button>
            ))}
          </div>
          <button
            type="button"
            onClick={loadAnalytics}
            disabled={loading}
            className="btn btn-outline btn-sm"
          >
            <RefreshCw size={15} className={loading ? 'animate-spin' : ''} aria-hidden="true" />
            Refresh
          </button>
        </div>
      </div>

      {/* The caveat behind this line: `employees.created_at` is SQLite's UTC
          `CURRENT_TIMESTAMP`, while the range is built from Manila dates, so a
          hire recorded in the last eight hours of a Manila day can land on the
          next day of the growth chart. Attendance and payroll both store Manila
          dates and line up exactly. */}
      {dateRange !== 'all' && (
        <p className="help-text">
          <CalendarDays size={13} aria-hidden="true" />
          {dateFilters().startDate} to {dateFilters().endDate}
        </p>
      )}

      {/* Loading and errors used to replace the page, filter bar and all, so
          changing the range took the control you had just used off the screen. */}
      {loading ? (
        <div className="card flex items-center justify-center py-16" role="status" aria-live="polite">
          <span className="spinner spinner-lg text-accent" aria-hidden="true" />
          <span className="sr-only">Loading analytics…</span>
        </div>
      ) : error ? (
        <div className="card empty-state" role="alert">
          <span className="empty-state-icon text-destructive">
            <AlertCircle size={26} aria-hidden="true" />
          </span>
          <h2 className="section-title">{error}</h2>
          <p className="page-subtitle max-w-md">
            The database may be busy or the range may be unreadable. Try again.
          </p>
          <button type="button" onClick={loadAnalytics} className="btn btn-primary btn-sm mt-1">
            <RefreshCw size={15} aria-hidden="true" />
            Retry
          </button>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-1 gap-3 xl:grid-cols-2">
            <section className="card p-5" aria-labelledby="growth-heading">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <h2 id="growth-heading" className="section-title flex items-center gap-2">
                    <Users size={17} className="text-info" aria-hidden="true" />
                    Employee growth
                  </h2>
                  <p className="page-subtitle mt-0.5">New hires per month</p>
                </div>
                <div className="text-right">
                  <p className="kpi-value">{totalHires}</p>
                  <p className="text-xs text-muted-foreground">in range</p>
                </div>
              </div>
              <div className="mt-4">
                {growthRows.length > 0 ? (
                  <ColumnChart rows={growthRows} label="New hires per month" />
                ) : (
                  <NoData message="No hires recorded in this range." />
                )}
              </div>
            </section>

            <section className="card p-5" aria-labelledby="attendance-heading">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <h2 id="attendance-heading" className="section-title flex items-center gap-2">
                    <CalendarDays size={17} className="text-accent" aria-hidden="true" />
                    Attendance rate
                  </h2>
                  <p className="page-subtitle mt-0.5">Share of records marked Present</p>
                </div>
                {attendanceRows.length > 0 && (
                  <div className="text-right">
                    <p className="kpi-value">{latestRate}%</p>
                    <p className="text-xs text-muted-foreground">latest month</p>
                  </div>
                )}
              </div>
              <div className="mt-4">
                {attendanceRows.length > 0 ? (
                  <>
                    <ColumnChart rows={attendanceRows} label="Attendance rate per month" />
                    {/* The bands are colour *and* a number on every bar, so the
                        reading never rests on hue alone. */}
                    <div className="mt-3 flex flex-wrap items-center gap-4 text-xs text-muted-foreground">
                      <span className="flex items-center gap-1.5">
                        <span className="h-2.5 w-2.5 rounded-full bg-accent" aria-hidden="true" />
                        90% and above
                      </span>
                      <span className="flex items-center gap-1.5">
                        <span className="h-2.5 w-2.5 rounded-full bg-warning" aria-hidden="true" />
                        70–89%
                      </span>
                      <span className="flex items-center gap-1.5">
                        <span
                          className="h-2.5 w-2.5 rounded-full bg-destructive"
                          aria-hidden="true"
                        />
                        Below 70%
                      </span>
                    </div>
                  </>
                ) : (
                  <NoData message="No attendance recorded in this range." />
                )}
              </div>
            </section>
          </div>

          <section className="card p-5" aria-labelledby="payroll-cost-heading">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0">
                <h2 id="payroll-cost-heading" className="section-title flex items-center gap-2">
                  <PhilippinePeso size={17} className="text-accent" aria-hidden="true" />
                  Payroll cost
                </h2>
                <p className="page-subtitle mt-0.5">Net paid out per month</p>
              </div>
              {payrollRows.length > 0 && (
                <div className="text-right">
                  <p className="kpi-value">{formatCurrency(totalPayroll)}</p>
                  <p className="text-xs text-muted-foreground">total across the range</p>
                </div>
              )}
            </div>
            <div className="mt-4">
              {payrollRows.length > 0 ? (
                <>
                  <ColumnChart rows={payrollRows} label="Net payroll per month" />
                  <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
                    <div className="surface p-3">
                      <p className="kpi-label">Average month</p>
                      <p className="mt-1 text-base font-semibold tnum">
                        {formatCurrency(totalPayroll / payrollRows.length)}
                      </p>
                    </div>
                    <div className="surface p-3">
                      <p className="kpi-label">Records paid</p>
                      <p className="mt-1 text-base font-semibold tnum text-accent">{paidCount}</p>
                    </div>
                    <div className="surface p-3">
                      <p className="kpi-label">Records pending</p>
                      <p className="mt-1 text-base font-semibold tnum text-warning">
                        {pendingCount}
                      </p>
                    </div>
                  </div>
                </>
              ) : (
                <NoData message="No payroll filed in this range." />
              )}
            </div>
          </section>

          <div className="grid grid-cols-1 gap-3 lg:grid-cols-2 xl:grid-cols-3">
            <section className="card p-5" aria-labelledby="departments-heading">
              <h2 id="departments-heading" className="section-title flex items-center gap-2">
                <Briefcase size={17} className="text-warning" aria-hidden="true" />
                Departments
              </h2>
              <p className="page-subtitle mt-0.5">Active headcount and salary cost</p>
              <div className="mt-4 flex flex-col gap-3.5">
                {departmentComparison.length > 0 ? (
                  departmentComparison.map((department) => (
                    <BarRow
                      key={department.id ?? department.name}
                      title={department.name || 'Unnamed'}
                      value={num(department.headcount)}
                      percent={(num(department.headcount) / maxHeadcount) * 100}
                      tone="bg-warning"
                      footLeft={`Avg ${formatCurrency(department.avg_salary)}`}
                      footRight={formatCurrency(department.total_salary_cost)}
                      description={`${department.name || 'Unnamed'} share of the largest department's headcount`}
                    />
                  ))
                ) : (
                  <NoData message="No departments found." />
                )}
              </div>
            </section>

            <section className="card p-5" aria-labelledby="status-heading">
              <h2 id="status-heading" className="section-title flex items-center gap-2">
                <PieChart size={17} className="text-info" aria-hidden="true" />
                Employee status
              </h2>
              <p className="page-subtitle mt-0.5">Every employee on file</p>
              {employeeStatusBreakdown.length > 0 ? (
                <div className="mt-4 flex flex-col items-center gap-4">
                  <div className="relative h-40 w-40">
                    {/* r = 15.9155 makes the circumference exactly 100, so a
                        percentage can be written straight into the dash array.
                        The arcs are one accumulating offset, as before. */}
                    <svg viewBox="0 0 36 36" className="h-full w-full -rotate-90" aria-hidden="true">
                      {(() => {
                        let offset = 0;
                        return employeeStatusBreakdown.map((row) => {
                          const percent =
                            totalEmployees > 0 ? (num(row.count) / totalEmployees) * 100 : 0;
                          const arc = (
                            <circle
                              key={row.status}
                              cx="18"
                              cy="18"
                              r="15.9155"
                              fill="none"
                              stroke={toneFor(row.status).stroke}
                              strokeWidth="3.4"
                              strokeDasharray={`${percent} ${100 - percent}`}
                              strokeDashoffset={`${-offset}`}
                            />
                          );
                          offset += percent;
                          return arc;
                        });
                      })()}
                    </svg>
                    <div className="absolute inset-0 flex flex-col items-center justify-center">
                      <span className="kpi-value">{totalEmployees}</span>
                      <span className="text-xs text-muted-foreground">total</span>
                    </div>
                  </div>
                  {/* The ring itself is aria-hidden: this list is its text
                      alternative, and it carries the counts the colours stand
                      for so the chart never depends on hue alone. */}
                  <ul className="flex w-full flex-col gap-2">
                    {employeeStatusBreakdown.map((row) => {
                      const percent =
                        totalEmployees > 0
                          ? Math.round((num(row.count) / totalEmployees) * 100)
                          : 0;
                      return (
                        <li
                          key={row.status}
                          className="flex items-center justify-between gap-2 text-sm"
                        >
                          <span className="flex min-w-0 items-center gap-2">
                            <span
                              className={`h-2.5 w-2.5 shrink-0 rounded-full ${toneFor(row.status).dot}`}
                              aria-hidden="true"
                            />
                            <span className="truncate">{row.status || 'Unspecified'}</span>
                          </span>
                          <span className="tnum shrink-0 text-muted-foreground">
                            {num(row.count)} · {percent}%
                          </span>
                        </li>
                      );
                    })}
                  </ul>
                </div>
              ) : (
                <NoData message="No employees on file yet." />
              )}
            </section>

            <section className="card p-5" aria-labelledby="salary-heading">
              <h2 id="salary-heading" className="section-title flex items-center gap-2">
                <TrendingUp size={17} className="text-accent" aria-hidden="true" />
                Salary distribution
              </h2>
              {/* The query counts `status = 'Active'` only, so the bands do not
                  add up to the ring's total above. */}
              <p className="page-subtitle mt-0.5">Monthly basic of active staff</p>
              <div className="mt-4 flex flex-col gap-3.5">
                {salaryDistribution.length > 0 ? (
                  salaryDistribution.map((band) => (
                    <BarRow
                      key={band.salary_range}
                      title={band.salary_range}
                      value={num(band.count)}
                      percent={(num(band.count) / maxSalaryCount) * 100}
                      tone="bg-accent"
                      footLeft={`Avg ${formatCurrency(band.avg_in_range)}`}
                      description={`${band.salary_range}: ${num(band.count)} active employees`}
                    />
                  ))
                ) : (
                  <NoData message="No salary data yet." />
                )}
              </div>
            </section>
          </div>
        </>
      )}
    </div>
  );
};

export default Analytics;

