import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { AlertTriangle, BarChart3, RefreshCw } from 'lucide-react';
import OverviewCards from '../components/Dashboard/OverviewCards';
import AttendanceChart from '../components/Attendance/AttendanceChart';
import PayrollSummary from '../components/Payroll/PayrollSummary';
import DashboardService from '../services/dashboardService';
import { manilaDateLabel } from '../utils/manila';

/** Peso, no centavos — these are headline figures, not payslip lines. */
const pesos = (amount) =>
  new Intl.NumberFormat('en-PH', {
    style: 'currency',
    currency: 'PHP',
    maximumFractionDigits: 0
  }).format(amount || 0);

const Dashboard = () => {
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    loadDashboardData();
  }, []);

  // `silent` keeps the rendered figures on screen while they are re-fetched,
  // so the refresh control does not blank the page it was pressed on.
  const loadDashboardData = async ({ silent = false } = {}) => {
    try {
      if (silent) setRefreshing(true);
      else setLoading(true);
      setError(null);

      const data = await DashboardService.getDashboardStats();
      setStats(data);
    } catch (err) {
      console.error(err);
      setError('Could not load the dashboard. The local database may be unavailable.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  if (loading) {
    return (
      <div className="flex h-96 items-center justify-center">
        <div className="flex flex-col items-center gap-4" role="status" aria-live="polite">
          <span className="spinner spinner-lg text-accent" aria-hidden="true" />
          <p className="text-sm text-muted-foreground">Loading dashboard…</p>
        </div>
      </div>
    );
  }
  if (error) {
    return (
      <div className="page">
        <div className="alert alert-danger" role="alert">
          <AlertTriangle size={18} className="mt-0.5 shrink-0" aria-hidden="true" />
          <div className="flex-1">
            <p className="font-medium">Dashboard unavailable</p>
            <p className="mt-1 text-muted-foreground">{error}</p>
            <button
              type="button"
              onClick={() => loadDashboardData()}
              className="btn btn-outline btn-sm mt-3"
            >
              <RefreshCw size={15} aria-hidden="true" />
              Retry
            </button>
          </div>
        </div>
      </div>
    );
  }

  const headcount = stats?.totalEmployees || 0;
  const pendingPayroll = stats?.payrollSummary?.pending || 0;
  const attendanceRate = stats?.attendancePercentage || 0;

  const quickStats = [
    { label: 'Departments', value: stats?.totalDepartments || 0 },
    {
      label: 'Present today',
      value: `${attendanceRate.toFixed(1)}%`,
      tone: attendanceRate >= 90 ? 'text-accent' : 'text-warning'
    },
    { label: 'Payroll this month', value: pesos(stats?.payrollSummary?.total) },
    {
      label: 'Payroll pending',
      value: pendingPayroll,
      tone: pendingPayroll > 0 ? 'text-warning' : 'text-accent'
    }
  ];

  const topDepartments = [...(stats?.departmentStats || [])]
    .sort((a, b) => (b.count || 0) - (a.count || 0))
    .slice(0, 4);

  return (
    <div className="page">
      {/* The page heading doubles as the greeting the old gradient banner
          carried. Its two buttons were empty functions; "Generate Report" had
          no report to generate and is gone, and "View Analytics" is now the
          route it named. */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <h2 className="page-title">Welcome back, Administrator</h2>
          <p className="page-subtitle mt-1">
            {manilaDateLabel()} ·{' '}
            {headcount === 1 ? '1 employee' : `${headcount} employees`} on record ·{' '}
            {pendingPayroll === 0
              ? 'no payroll waiting'
              : `${pendingPayroll} payroll ${pendingPayroll === 1 ? 'item' : 'items'} to review`}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <button
            type="button"
            onClick={() => loadDashboardData({ silent: true })}
            disabled={refreshing}
            className="btn btn-outline btn-sm"
          >
            <RefreshCw
              size={15}
              aria-hidden="true"
              className={refreshing ? 'animate-spin' : undefined}
            />
            {refreshing ? 'Refreshing…' : 'Refresh'}
          </button>
          <Link to="/analytics" className="btn btn-primary btn-sm">
            <BarChart3 size={15} aria-hidden="true" />
            View Analytics
          </Link>
        </div>
      </div>

      <OverviewCards stats={stats} />

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
        <div className="flex flex-col gap-4 xl:col-span-2">
          {/* Both of these own their queries, including their own refresh and
              error states, so neither takes data from `stats`. */}
          <AttendanceChart />
          <PayrollSummary />
        </div>

        <div className="flex flex-col gap-4">
          <section className="card p-5" aria-labelledby="quick-stats-heading">
            <h3 id="quick-stats-heading" className="section-title">
              Quick stats
            </h3>
            <dl className="mt-3 flex flex-col gap-2">
              {quickStats.map((stat) => (
                <div key={stat.label} className="surface flex items-center justify-between px-3 py-2.5">
                  <dt className="text-sm text-muted-foreground">{stat.label}</dt>
                  <dd
                    className={`font-display text-sm font-semibold tabular-nums ${
                      stat.tone || 'text-foreground'
                    }`}
                  >
                    {stat.value}
                  </dd>
                </div>
              ))}
            </dl>
          </section>

          <section className="card p-5" aria-labelledby="recent-activity-heading">
            <h3 id="recent-activity-heading" className="section-title">
              Recent activity
            </h3>
            {stats?.recentActivities?.length ? (
              <ul className="mt-3 flex flex-col gap-1">
                {stats.recentActivities.map((activity, index) => (
                  <li
                    key={`${activity.user}-${activity.time}-${index}`}
                    className="stagger-row flex items-start gap-3 rounded-control px-2 py-2 transition-colors duration-150 hover:bg-[rgb(248_250_252/0.05)]"
                    style={{ '--i': index }}
                  >
                    <span className="avatar h-8 w-8 text-xs">
                      {activity.initials || '—'}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block text-sm">
                        <span className="font-medium">{activity.user || 'Unknown user'}</span>{' '}
                        {activity.action || 'performed an action'}
                      </span>
                      <span className="mt-0.5 block text-xs text-muted-foreground">
                        {activity.time}
                      </span>
                    </span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="py-6 text-center text-sm text-muted-foreground">
                No activity recorded yet.
              </p>
            )}
          </section>

          <section className="card p-5" aria-labelledby="top-departments-heading">
            <h3 id="top-departments-heading" className="section-title">
              Top departments
            </h3>
            {topDepartments.length ? (
              <ul className="mt-3 flex flex-col gap-4">
                {topDepartments.map((dept) => {
                  const count = dept.count || 0;
                  const percentage = headcount > 0 ? (count / headcount) * 100 : 0;

                  return (
                    <li key={dept.name || 'unknown'}>
                      <div className="flex items-baseline justify-between gap-3">
                        <span className="truncate-1 text-sm font-medium">
                          {dept.name || 'Unassigned'}
                        </span>
                        <span className="shrink-0 font-display text-sm tabular-nums">
                          {count} {count === 1 ? 'employee' : 'employees'}
                        </span>
                      </div>
                      <div
                        className="progress mt-2"
                        role="progressbar"
                        aria-valuenow={Math.round(percentage)}
                        aria-valuemin={0}
                        aria-valuemax={100}
                        aria-label={`${dept.name || 'Unassigned'} share of headcount`}
                      >
                        <div
                          className="progress-bar"
                          style={{ width: `${Math.min(100, percentage)}%` }}
                        />
                      </div>
                      <div className="mt-1.5 flex items-baseline justify-between gap-3 text-xs text-muted-foreground">
                        {/* `departments::get_all` averages `employees.salary`,
                            which is the monthly basic rate. Both dashboard
                            labels used to read "Avg. Annual Salary". */}
                        <span>Avg. monthly {pesos(dept.avgSalary)}</span>
                        <span className="tabular-nums">{percentage.toFixed(1)}%</span>
                      </div>
                    </li>
                  );
                })}
              </ul>
            ) : (
              <p className="py-6 text-center text-sm text-muted-foreground">
                No departments yet.
              </p>
            )}
          </section>
        </div>
      </div>
    </div>
  );
};

export default Dashboard;
