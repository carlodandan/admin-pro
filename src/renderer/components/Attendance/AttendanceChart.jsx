import React, { useState, useEffect } from 'react';
import {
  AlertCircle,
  Calendar,
  CalendarOff,
  CheckCircle,
  Clock,
  RefreshCw,
  TrendingUp,
  XCircle
} from 'lucide-react';
import { parseStoredDate } from '../../utils/manila';

/** The four statuses the attendance table records, in stacking order. */
const SERIES = [
  { key: 'present', label: 'Present', bar: 'bg-accent', dot: 'bg-accent' },
  { key: 'late', label: 'Late', bar: 'bg-warning', dot: 'bg-warning' },
  { key: 'leave', label: 'On leave', bar: 'bg-info', dot: 'bg-info' },
  { key: 'absent', label: 'Absent', bar: 'bg-destructive', dot: 'bg-destructive' }
];

const AttendanceChart = () => {
  const [weeklyData, setWeeklyData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [summary, setSummary] = useState({
    presentToday: 0,
    absentToday: 0,
    lateToday: 0,
    leaveToday: 0,
    attendanceRate: '0%'
  });
  const [error, setError] = useState(null);

  useEffect(() => {
    loadWeeklyData();
  }, []);

  const loadWeeklyData = async () => {
    try {
      setLoading(true);
      setError(null);

      const [weeklyResponse, summaryResponse] = await Promise.all([
        window.api.getWeeklyAttendance(),
        window.api.getTodayAttendanceSummary()
      ]);

      setWeeklyData(Array.isArray(weeklyResponse) ? weeklyResponse : []);
      if (summaryResponse) setSummary(summaryResponse);
    } catch (err) {
      console.error('Error loading weekly data:', err);
      setError('Failed to load attendance data. Please try again.');
      setWeeklyData([]);
    } finally {
      setLoading(false);
    }
  };
  const header = (
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div>
        <h3 className="section-title">Weekly attendance trend</h3>
        <p className="page-subtitle mt-0.5">Last 7 days, Asia/Manila</p>
      </div>
      <div className="flex items-center gap-3">
        <ul className="hidden flex-wrap items-center gap-3 sm:flex">
          {SERIES.map((series) => (
            <li key={series.key} className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <span className={`h-2.5 w-2.5 rounded-full ${series.dot}`} aria-hidden="true" />
              {series.label}
            </li>
          ))}
        </ul>
        <button
          type="button"
          onClick={loadWeeklyData}
          disabled={loading}
          className="btn btn-ghost btn-icon"
          aria-label="Refresh attendance data"
          title="Refresh"
        >
          <RefreshCw
            size={16}
            aria-hidden="true"
            className={loading ? 'animate-spin' : undefined}
          />
        </button>
      </div>
    </div>
  );

  if (loading) {
    return (
      <section className="card p-5">
        {header}
        <div
          className="flex items-center justify-center py-14"
          role="status"
          aria-live="polite"
        >
          <span className="spinner spinner-lg text-accent" aria-hidden="true" />
          <span className="sr-only">Loading attendance data…</span>
        </div>
      </section>
    );
  }
  if (error) {
    return (
      <section className="card p-5">
        {header}
        <div className="empty-state">
          <span className="empty-state-icon text-destructive" aria-hidden="true">
            <AlertCircle size={26} />
          </span>
          <p className="text-sm text-destructive" role="alert">
            {error}
          </p>
          <button type="button" onClick={loadWeeklyData} className="btn btn-outline btn-sm mt-1">
            <RefreshCw size={15} aria-hidden="true" />
            Retry
          </button>
        </div>
      </section>
    );
  }

  // Every day in the window is present in the response, so an empty array means
  // the query itself returned nothing rather than "a quiet week".
  if (weeklyData.length === 0) {
    return (
      <section className="card p-5">
        {header}
        <div className="empty-state">
          <span className="empty-state-icon" aria-hidden="true">
            <Calendar size={26} />
          </span>
          <p className="text-sm">No attendance recorded in the last 7 days.</p>
          <p className="text-xs">Punches from the kiosk appear here.</p>
        </div>
      </section>
    );
  }

  const dayTotal = (day) =>
    (day.present || 0) + (day.absent || 0) + (day.late || 0) + (day.leave || 0);
  // Scale to the busiest day so a light day is not stretched to full height.
  const scale = Math.max(...weeklyData.map(dayTotal), 1);

  const tiles = [
    { label: 'Present today', value: summary.presentToday || 0, icon: CheckCircle, tone: 'text-accent' },
    { label: 'Absent today', value: summary.absentToday || 0, icon: XCircle, tone: 'text-destructive' },
    { label: 'Late today', value: summary.lateToday || 0, icon: Clock, tone: 'text-warning' },
    { label: 'On leave today', value: summary.leaveToday || 0, icon: CalendarOff, tone: 'text-info' }
  ];

  return (
    <section className="card p-5">
      {header}

      {/* The bars are decoration for anyone who cannot see them; the same seven
          days are published as a table below, off-screen. */}
      <div className="mt-5 flex h-44 items-end gap-2 px-1" aria-hidden="true">
        {weeklyData.map((day) => {
          const total = dayTotal(day);
          return (
            <div key={day.date} className="flex min-w-0 flex-1 flex-col items-center gap-2">
              <div className="flex w-full flex-1 flex-col justify-end gap-px">
                {SERIES.map((series) => {
                  const value = day[series.key] || 0;
                  if (value === 0) return null;
                  return (
                    <div
                      key={series.key}
                      className={`w-full rounded-[3px] ${series.bar} transition-[height] duration-500`}
                      style={{ height: `${(value / scale) * 100}%` }}
                      title={`${series.label}: ${value}`}
                    />
                  );
                })}
                {total === 0 && (
                  <div className="h-0.5 w-full rounded-full bg-[rgb(148_163_184/0.25)]" />
                )}
              </div>
              <span className="text-xs font-medium text-muted-foreground">{day.day}</span>
              <span className="text-[11px] tabular-nums text-muted-foreground/70">
                {parseStoredDate(day.date)?.getDate() ?? ''}
              </span>
            </div>
          );
        })}
      </div>

      <table className="sr-only">
        <caption>Attendance for the last seven days</caption>
        <thead>
          <tr>
            <th scope="col">Day</th>
            {SERIES.map((series) => (
              <th key={series.key} scope="col">
                {series.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {weeklyData.map((day) => (
            <tr key={day.date}>
              <th scope="row">{day.date}</th>
              {SERIES.map((series) => (
                <td key={series.key}>{day[series.key] || 0}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>

      <div className="mt-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
        {tiles.map((tile) => {
          const Icon = tile.icon;
          return (
            <div key={tile.label} className="surface flex items-center justify-between gap-2 px-3 py-3">
              <div className="min-w-0">
                <p className="truncate-1 text-xs text-muted-foreground">{tile.label}</p>
                <p className="mt-0.5 font-display text-xl font-semibold tabular-nums">
                  {tile.value}
                </p>
              </div>
              <Icon size={20} className={`shrink-0 ${tile.tone}`} aria-hidden="true" />
            </div>
          );
        })}
      </div>

      <div className="surface-muted mt-3 flex items-center gap-2 px-3 py-2">
        <TrendingUp size={15} className="shrink-0 text-accent" aria-hidden="true" />
        <p className="text-xs text-muted-foreground">
          Attendance rate today:{' '}
          <span className="font-display font-semibold text-foreground tabular-nums">
            {summary.attendanceRate}
          </span>{' '}
          of employees with a record for today.
        </p>
      </div>
    </section>
  );
};

export default AttendanceChart;
