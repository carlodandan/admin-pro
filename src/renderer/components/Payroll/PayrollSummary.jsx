import React, { useState, useEffect } from 'react';
import { Calendar, CheckCircle, Clock, Download, PhilippinePeso, RefreshCw } from 'lucide-react';
import { Link } from 'react-router-dom';
import { downloadCsv, toCsv } from '../../utils/csv';
import { formatStoredDate, manilaDate } from '../../utils/manila';

const STATUS_BADGE = {
  Paid: 'badge-accent',
  Pending: 'badge-warning',
  Failed: 'badge-danger'
};

const formatCurrency = (amount) =>
  new Intl.NumberFormat('en-PH', {
    style: 'currency',
    currency: 'PHP',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  }).format(amount || 0);

/** `2026-09` → `September 2026`. */
const monthLabel = (yearMonth) => {
  const [year, month] = String(yearMonth).split('-').map(Number);
  if (!year || !month) return yearMonth;
  return new Date(year, month - 1, 1).toLocaleDateString('en-US', {
    month: 'long',
    year: 'numeric'
  });
};

const PayrollSummary = () => {
  const [payrollData, setPayrollData] = useState({
    employees: [],
    total: 0,
    paid: 0,
    pending: 0
  });
  const [loading, setLoading] = useState(true);
  // The month picker starts on the current *Manila* month; it used to start on
  // the UTC one, which is the previous month for the first eight hours of the
  // 1st. `max` pins it for the same reason.
  const currentMonth = manilaDate().slice(0, 7);
  const [selectedMonth, setSelectedMonth] = useState(currentMonth);

  useEffect(() => {
    loadPayrollData();
  }, [selectedMonth]);

  const loadPayrollData = async () => {
    try {
      setLoading(true);
      const [year, month] = selectedMonth.split('-').map(Number);

      // `payroll::summary` filters the cutoff range in SQL. The original pulled
      // every payroll row and filtered in JS with `new Date(cutoff_start)`,
      // which parses `YYYY-MM-DD` as UTC midnight and so reported the previous
      // month for a cutoff starting on the 1st in any negative-offset zone.
      const records = await window.api.getPayrollSummary(year, month);

      const employees = (Array.isArray(records) ? records : []).map((payroll) => ({
        id: payroll.id,
        employee: payroll.employee_name || 'Unnamed employee',
        position: payroll.position || '—',
        salary: payroll.basic_salary || 0,
        bonus: payroll.allowances || 0,
        deductions: payroll.deductions || 0,
        netPay: payroll.net_salary || 0,
        status: payroll.status || 'Pending',
        payDate: payroll.payment_date ? formatStoredDate(payroll.payment_date) : 'Not paid',
        cutoffType: payroll.cutoff_type || 'Full Month',
        periodStart: payroll.cutoff_start,
        periodEnd: payroll.cutoff_end
      }));

      setPayrollData({
        employees,
        total: employees.reduce((sum, emp) => sum + emp.netPay, 0),
        paid: employees.filter((emp) => emp.status === 'Paid').length,
        pending: employees.filter((emp) => emp.status === 'Pending').length
      });
    } catch (error) {
      console.error('Error loading payroll data:', error);
      setPayrollData({ employees: [], total: 0, paid: 0, pending: 0 });
    } finally {
      setLoading(false);
    }
  };

  const handleExport = () => {
    if (payrollData.employees.length === 0) return;

    const csv = toCsv(
      [
        'Employee',
        'Position',
        'Basic Salary',
        'Allowances',
        'Deductions',
        'Net Pay',
        'Status',
        'Pay Date',
        'Cutoff Period'
      ],
      payrollData.employees.map((emp) => [
        emp.employee,
        emp.position,
        emp.salary,
        emp.bonus,
        emp.deductions,
        emp.netPay,
        emp.status,
        emp.payDate,
        emp.cutoffType
      ])
    );

    downloadCsv(`payroll-summary-${selectedMonth}.csv`, csv);
  };

  const header = (
    <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
      <div className="min-w-0">
        <h3 className="section-title">Payroll summary</h3>
        <p className="page-subtitle mt-0.5">{monthLabel(selectedMonth)}</p>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <div className="input-group">
          <Calendar className="input-icon" size={16} aria-hidden="true" />
          <input
            type="month"
            aria-label="Payroll month"
            value={selectedMonth}
            max={currentMonth}
            onChange={(event) => setSelectedMonth(event.target.value || currentMonth)}
            className="input w-[168px]"
          />
        </div>
        <button
          type="button"
          onClick={loadPayrollData}
          disabled={loading}
          className="btn btn-ghost btn-icon"
          aria-label="Refresh payroll data"
          title="Refresh"
        >
          <RefreshCw
            size={16}
            aria-hidden="true"
            className={loading ? 'animate-spin' : undefined}
          />
        </button>
        <button
          type="button"
          onClick={handleExport}
          disabled={payrollData.employees.length === 0}
          className="btn btn-outline btn-sm"
        >
          <Download size={15} aria-hidden="true" />
          CSV
        </button>
        <Link to="/payroll" className="btn btn-secondary btn-sm">
          Manage
        </Link>
      </div>
    </div>
  );

  if (loading) {
    return (
      <section className="card p-5">
        {header}
        <div className="flex items-center justify-center py-14" role="status" aria-live="polite">
          <span className="spinner spinner-lg text-accent" aria-hidden="true" />
          <span className="sr-only">Loading payroll data…</span>
        </div>
      </section>
    );
  }

  if (payrollData.employees.length === 0) {
    return (
      <section className="card p-5">
        {header}
        <div className="empty-state">
          <span className="empty-state-icon" aria-hidden="true">
            <PhilippinePeso size={26} />
          </span>
          <p className="text-sm">No payroll filed for {monthLabel(selectedMonth)}.</p>
          <p className="text-xs">Run a cutoff from Payroll to populate this month.</p>
        </div>
      </section>
    );
  }

  const averagePayout = payrollData.total / payrollData.employees.length;

  return (
    <section className="card p-5">
      {header}

      <div className="mt-5 grid grid-cols-1 gap-3 md:grid-cols-3">
        <div className="surface px-4 py-3">
          <p className="kpi-label">Total net pay</p>
          <p className="kpi-value mt-1">{formatCurrency(payrollData.total)}</p>
          <p className="mt-2 flex items-center gap-1.5 text-xs text-muted-foreground">
            <CheckCircle size={14} className="text-accent" aria-hidden="true" />
            {payrollData.paid} of {payrollData.employees.length} released
          </p>
        </div>

        <div className="surface px-4 py-3">
          <p className="kpi-label">Pending</p>
          <p className="kpi-value mt-1">{payrollData.pending}</p>
          <p className="mt-2 flex items-center gap-1.5 text-xs text-muted-foreground">
            <Clock
              size={14}
              className={payrollData.pending > 0 ? 'text-warning' : 'text-accent'}
              aria-hidden="true"
            />
            {payrollData.pending > 0 ? 'Awaiting release' : 'All released'}
          </p>
        </div>

        <div className="surface px-4 py-3">
          <p className="kpi-label">Average payout</p>
          <p className="kpi-value mt-1">{formatCurrency(averagePayout)}</p>
          <p className="mt-2 text-xs text-muted-foreground">
            Per record this month, not per employee
          </p>
        </div>
      </div>

      <div className="mt-5">
        <div className="mb-2 flex items-baseline justify-between gap-3">
          <p className="eyebrow">Latest records</p>
          {payrollData.employees.length > 5 && (
            <Link to="/payroll" className="link text-xs">
              View all {payrollData.employees.length}
            </Link>
          )}
        </div>

        <div className="table-container">
          <table className="table">
            <thead>
              <tr>
                <th scope="col">Employee</th>
                <th scope="col" className="num">
                  Net pay
                </th>
                <th scope="col">Status</th>
                <th scope="col">Pay date</th>
              </tr>
            </thead>
            <tbody>
              {payrollData.employees.slice(0, 5).map((payroll, index) => (
                <tr key={payroll.id} className="stagger-row" style={{ '--i': index }}>
                  <td>
                    <div className="flex items-center gap-3">
                      <span className="avatar h-8 w-8 text-[11px]">
                        {payroll.employee
                          .split(' ')
                          .filter(Boolean)
                          .slice(0, 2)
                          .map((part) => part[0])
                          .join('')}
                      </span>
                      <span className="min-w-0">
                        <span className="block truncate-1 text-sm font-medium">
                          {payroll.employee}
                        </span>
                        <span className="block truncate-1 text-xs text-muted-foreground">
                          {payroll.position} · {payroll.cutoffType}
                        </span>
                      </span>
                    </div>
                  </td>
                  <td className="num font-display font-medium">
                    {formatCurrency(payroll.netPay)}
                  </td>
                  <td>
                    <span className={`badge ${STATUS_BADGE[payroll.status] || 'badge-muted'}`}>
                      {payroll.status}
                    </span>
                  </td>
                  <td className="text-sm text-muted-foreground">{payroll.payDate}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
};

export default PayrollSummary;
