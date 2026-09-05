import React, { useEffect, useState } from 'react';
import {
  AlertCircle,
  AlertTriangle,
  Banknote,
  Calculator,
  CalendarDays,
  CheckCircle,
  ChevronDown,
  ChevronUp,
  Clock,
  Download,
  FileText,
  Loader2,
  PhilippinePeso,
  Receipt,
  X
} from 'lucide-react';
import PhilippinePayrollCalculator from '../utils/PhilippinePayrollCalculator';
import ConfirmDialog from '../components/ui/ConfirmDialog';
import { useDialog } from '../hooks/useDialog';
import { downloadCsv, toCsv } from '../utils/csv';
import { formatStoredDate, manilaMonth, manilaYear } from '../utils/manila';

/** Month names, for the period picker and every "September 2026" label. */
const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'
];

/** The three runs this page understands, and the days each one covers. */
const CUTOFFS = [
  { value: 'First Half', label: 'First half', detail: '1st – 10th', workingDays: 12 },
  { value: 'Second Half', label: 'Second half', detail: '11th – 25th', workingDays: 12 },
  { value: 'Full Month', label: 'Full month', detail: 'Whole month', workingDays: 24 }
];

const TABS = [
  { value: 'summary', label: 'Summary', Icon: FileText },
  { value: 'details', label: 'Payroll records', Icon: Receipt },
  { value: 'process', label: 'Process payroll', Icon: Calculator }
];

/**
 * Status → badge and icon, replacing `getStatusColor`/`getStatusIcon`. Both
 * returned light-theme Tailwind pairs; the icon stays because a status must
 * never rest on colour alone.
 */
const STATUS_STYLE = {
  Paid: { badge: 'badge-accent', Icon: CheckCircle },
  Pending: { badge: 'badge-warning', Icon: Clock },
  Processing: { badge: 'badge-info', Icon: Clock }
};
/** `₱12,345.00`. The `Number(…) || 0` keeps a null column out of `₱NaN`. */
const formatCurrency = (amount) =>
  new Intl.NumberFormat('en-PH', {
    style: 'currency',
    currency: 'PHP',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  }).format(Number(amount) || 0);

/** The same guard for the running totals: one `undefined` poisons a `reduce`. */
const num = (value) => Number(value) || 0;

/**
 * The `breakdown` column holds whatever JSON the run that wrote the row
 * produced. A malformed one used to throw from inside a `reduce` during render,
 * which takes the whole page down rather than one figure.
 *
 * The second `JSON.parse` is for rows written while the Rust insert re-encoded
 * the already-stringified breakdown, so the column held a quoted JSON string
 * rather than an object. New rows parse on the first pass.
 */
const parseBreakdown = (value) => {
  if (!value) return null;
  try {
    let parsed = typeof value === 'string' ? JSON.parse(value) : value;
    if (typeof parsed === 'string') parsed = JSON.parse(parsed);
    return parsed && typeof parsed === 'object' ? parsed : null;
  } catch {
    return null;
  }
};

/** One employee-side contribution out of a stored breakdown. */
const employeeShare = (breakdown, key) => num(breakdown?.deductions?.mandatory?.[key]?.employee);

const initials = (name) =>
  String(name || '')
    .trim()
    .split(/\s+/)
    .map((part) => part[0] ?? '')
    .join('')
    .slice(0, 2)
    .toUpperCase() || '—';

const pad = (value) => String(value).padStart(2, '0');

/** Last day of a 1-based month: day zero of the next one. */
const monthEndDay = (year, month) => new Date(year, month, 0).getDate();

const periodLabel = ({ year, month }) => `${MONTHS[month - 1]} ${year}`;

/** Two years back and two forward, as the original dropdown offered. */
const YEARS = Array.from({ length: 5 }, (_, index) => manilaYear() - 2 + index);

const Payroll = () => {
  const [payrollData, setPayrollData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedPeriod, setSelectedPeriod] = useState({
    // Was `new Date().getFullYear()` and `getMonth() + 1` — the UTC year and
    // month. On the 1st, before 08:00 Manila, both still name the month that
    // ended, so the page opened on the previous cutoff.
    year: manilaYear(),
    month: manilaMonth(),
    cutoffType: 'First Half'
  });
  const [viewMode, setViewMode] = useState('summary');
  const [selectedPayroll, setSelectedPayroll] = useState(null);
  const [employees, setEmployees] = useState([]);
  const [processing, setProcessing] = useState(false);
  const [cutoffAttendance, setCutoffAttendance] = useState([]);
  const [showCutoffDetails, setShowCutoffDetails] = useState(false);
  const [confirmRun, setConfirmRun] = useState(false);
  // Four `alert()` calls used to report the outcome of a run. A dialog drawn by
  // the operating system blocks the webview and cannot say which cutoff it is
  // talking about.
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const detailRef = useDialog(Boolean(selectedPayroll), () => setSelectedPayroll(null));

  const flashError = (message) => {
    setError(message);
    setTimeout(() => setError(''), 5000);
  };

  const flashSuccess = (message) => {
    setSuccess(message);
    setTimeout(() => setSuccess(''), 3000);
  };

  useEffect(() => {
    loadEmployees();
    loadPayrollData();
    if (viewMode === 'process' && selectedPeriod.cutoffType !== 'Full Month') {
      loadCutoffAttendance();
    }
  }, [selectedPeriod, viewMode]);

  const loadEmployees = async () => {
    try {
      const data = await window.api.getAllEmployees();
      setEmployees(data || []);
    } catch (loadError) {
      console.error('Error loading employees:', loadError);
      flashError('Could not read the employee list.');
    }
  };

  const loadPayrollData = async () => {
    try {
      setLoading(true);
      let data;
      if (selectedPeriod.cutoffType === 'Full Month') {
        // The whole table, as before: a monthly run is filed against the
        // calendar month rather than one of the two cutoff windows, so there is
        // no cutoff to match it on.
        data = await window.api.getAllPayroll();
      } else {
        data = await window.api.getPayrollByCutoff(
          selectedPeriod.year,
          selectedPeriod.month,
          selectedPeriod.cutoffType
        );
      }
      setPayrollData(data || []);
    } catch (loadError) {
      console.error('Error loading payroll data:', loadError);
      setPayrollData([]);
      flashError('Could not read the payroll records for this period.');
    } finally {
      setLoading(false);
    }
  };

  const loadCutoffAttendance = async () => {
    try {
      const isFirstHalf = selectedPeriod.cutoffType === 'First Half';
      const data = await window.api.getCutoffAttendance(
        selectedPeriod.year,
        selectedPeriod.month,
        isFirstHalf
      );
      setCutoffAttendance(data || []);
    } catch (loadError) {
      console.error('Error loading cutoff attendance:', loadError);
      setCutoffAttendance([]);
      flashError('Could not read the attendance for this cutoff.');
    }
  };

  /**
   * The full-month figures for one employee. `employees.salary` is the monthly
   * basic, which is why the daily rate is that over 24 working days.
   *
   * `workingDays` and `dailyRate` are now part of the returned breakdown. The
   * daily rate was computed and thrown away, and the payslip modal reads both —
   * which is why a monthly payslip showed "₱NaN" against Daily Rate.
   */
  const calculateMonthlyPayrollForEmployee = (employee) => {
    const basicSalary = num(employee.salary);
    const allowances = 0;
    const otherDeductions = 0;

    const monthlyGross = basicSalary + allowances;
    const mandatory = PhilippinePayrollCalculator.calculateMandatoryDeductions(basicSalary, false);
    const incomeTax = PhilippinePayrollCalculator.calculateMonthlyIncomeTax(monthlyGross);
    const totalDeductions = mandatory.total + incomeTax + otherDeductions;

    return {
      workingDays: 24,
      dailyRate: basicSalary / 24,
      basicSalary,
      allowances,
      grossSalary: monthlyGross,
      deductions: {
        mandatory: {
          sss: {
            employee: mandatory.sss.employeeShare,
            employer: mandatory.sss.employerShare,
            total: mandatory.sss.employeeShare + mandatory.sss.employerShare
          },
          philhealth: {
            employee: mandatory.philhealth.employeeShare,
            employer: mandatory.philhealth.employerShare,
            total: mandatory.philhealth.total
          },
          pagibig: {
            employee: mandatory.pagibig.employeeShare,
            employer: mandatory.pagibig.employerShare,
            total: mandatory.pagibig.total
          },
          total: mandatory.total
        },
        incomeTax,
        otherDeductions,
        total: totalDeductions
      },
      employerContributions: {
        sss: mandatory.sss.employerShare,
        philhealth: mandatory.philhealth.employerShare,
        pagibig: mandatory.pagibig.employerShare,
        total:
          mandatory.sss.employerShare +
          mandatory.philhealth.employerShare +
          mandatory.pagibig.employerShare
      },
      netSalary: monthlyGross - totalDeductions
    };
  };

  /** One half of the month, pro-rated by days present. */
  const calculateBiMonthlyPayrollForEmployee = (employee, attendance) =>
    PhilippinePayrollCalculator.calculateHalfMonthPayroll(
      num(employee.salary),
      0, // Allowances
      0, // Other deductions
      12, // Half-month working days
      attendance?.days_present || 0,
      selectedPeriod.cutoffType === 'First Half'
    );

  const cutoff = CUTOFFS.find((entry) => entry.value === selectedPeriod.cutoffType) ?? CUTOFFS[0];
  const activeEmployees = employees.filter((employee) => employee.status === 'Active');

  /**
   * The rows the process view previews *and* the ones the run writes, so the
   * two can never disagree. A monthly run covers every active employee; a
   * half-month run covers whoever `getCutoffAttendance` returned, which is every
   * active employee with their day count for the window — a count of zero
   * included, exactly as before.
   */
  const previewRows =
    selectedPeriod.cutoffType === 'Full Month'
      ? activeEmployees.map((employee) => ({
          employee,
          attendance: null,
          breakdown: calculateMonthlyPayrollForEmployee(employee)
        }))
      : cutoffAttendance
          .map((row) => {
            const employee = employees.find((candidate) => candidate.id === row.employee_id);
            if (!employee) return null;
            return {
              employee,
              attendance: row,
              breakdown: calculateBiMonthlyPayrollForEmployee(employee, row)
            };
          })
          .filter(Boolean);

  /**
   * `calculateBiMonthlySummary` used to total the half-month preview by running
   * the calculator over every employee a second time, while the Full Month
   * column totalled `employees.salary` directly. Both arrive at the same three
   * figures the preview rows already hold — the monthly breakdown's
   * `basicSalary` *is* `employee.salary` — so they are summed here once.
   */
  const previewTotals = previewRows.reduce(
    (totals, row) => ({
      gross: totals.gross + num(row.breakdown.basicSalary),
      deductions: totals.deductions + num(row.breakdown.deductions.total),
      net: totals.net + num(row.breakdown.netSalary)
    }),
    { gross: 0, deductions: 0, net: 0 }
  );

  const runPayroll = async () => {
    setConfirmRun(false);
    if (selectedPeriod.cutoffType === 'Full Month') {
      await processMonthlyPayroll();
    } else {
      await processBiMonthlyPayroll();
    }
  };

  const filedMessage = (count) =>
    `${count} ${count === 1 ? 'record' : 'records'} filed as Pending.`;

  /**
   * `payroll` carries `UNIQUE(employee_id, cutoff_start, cutoff_end)` — it did
   * in the Electron schema too — so re-running a period an employee already has
   * a record for is rejected by SQLite, not silently duplicated. Awaiting the
   * inserts in a bare loop meant the first such employee aborted the batch and
   * put `UNIQUE constraint failed: payroll.employee_id, …` on screen.
   *
   * Each insert is attempted on its own now: employees already on file are
   * counted and reported, everyone else is filed, and any other error still
   * stops the run. That keeps adding a mid-period hire possible without
   * clearing the period first.
   */
  const isDuplicateRun = (error) =>
    /UNIQUE constraint failed/i.test(error?.message ?? String(error ?? ''));

  const fileRecords = async (rows, submit) => {
    let filed = 0;
    let skipped = 0;
    for (const row of rows) {
      try {
        await submit(row);
        filed += 1;
      } catch (insertError) {
        if (!isDuplicateRun(insertError)) throw insertError;
        skipped += 1;
      }
    }
    return { filed, skipped };
  };

  const runSummary = ({ filed, skipped }) => {
    const filedPart = filedMessage(filed);
    if (skipped === 0) return filedPart;
    return `${filedPart} ${skipped} ${
      skipped === 1 ? 'employee was' : 'employees were'
    } already on file for this period and left as ${skipped === 1 ? 'it is' : 'they are'}.`;
  };

  const processBiMonthlyPayroll = async () => {
    setProcessing(true);
    try {
      const { year, month, cutoffType } = selectedPeriod;
      const isFirstHalf = cutoffType === 'First Half';
      const cutoffStart = `${year}-${pad(month)}-${isFirstHalf ? '01' : '11'}`;
      const cutoffEnd = `${year}-${pad(month)}-${isFirstHalf ? '10' : '25'}`;

      const outcome = await fileRecords(
        previewRows,
        ({ employee, attendance, breakdown }) =>
          window.api.processBiMonthlyPayroll({
            employee_id: employee.id,
            cutoff_start: cutoffStart,
            cutoff_end: cutoffEnd,
            basic_salary: breakdown.basicSalary,
            allowances: 0,
            deductions: breakdown.deductions.total,
            net_salary: breakdown.netSalary,
            status: 'Pending',
            cutoff_type: cutoffType,
            working_days: 12,
            days_present: attendance?.days_present || 0,
            daily_rate: breakdown.dailyRate,
            breakdown: JSON.stringify(breakdown)
          })
      );

      await loadPayrollData();
      flashSuccess(
        `${cutoff.label} of ${periodLabel(selectedPeriod)} processed — ${runSummary(outcome)}`
      );
    } catch (runError) {
      console.error('Error processing payroll:', runError);
      flashError(`Error processing payroll: ${runError.message}`);
    } finally {
      setProcessing(false);
    }
  };

  const processMonthlyPayroll = async () => {
    setProcessing(true);
    try {
      const { year, month } = selectedPeriod;
      const cutoffStart = `${year}-${pad(month)}-01`;
      const cutoffEnd = `${year}-${pad(month)}-${pad(monthEndDay(year, month))}`;

      const outcome = await fileRecords(previewRows, ({ employee, breakdown }) =>
        window.api.processPayroll({
          employee_id: employee.id,
          cutoff_start: cutoffStart,
          cutoff_end: cutoffEnd,
          basic_salary: employee.salary,
          allowances: breakdown.allowances,
          deductions: breakdown.deductions.total,
          net_salary: breakdown.netSalary,
          status: 'Pending',
          breakdown: JSON.stringify(breakdown)
        })
      );

      await loadPayrollData();
      flashSuccess(`${periodLabel(selectedPeriod)} processed — ${runSummary(outcome)}`);
    } catch (runError) {
      console.error('Error processing payroll:', runError);
      flashError(`Error processing payroll: ${runError.message}`);
    } finally {
      setProcessing(false);
    }
  };

  const handleMarkPaid = async (payroll) => {
    try {
      // No date argument on purpose: `mark_payroll_as_paid` falls back to
      // Manila's today, which is what pressing this button means.
      await window.api.markPayrollAsPaid(payroll.id);
      await loadPayrollData();
      flashSuccess(`${payroll.employee_name} marked paid.`);
    } catch (payError) {
      console.error('Error marking payroll as paid:', payError);
      flashError(`Error marking as paid: ${payError.message}`);
    }
  };

  // The Export button was inert markup. It exports the records on screen, which
  // is the set the period controls above it select.
  const handleExport = () => {
    if (payrollData.length === 0) return;

    const slug = selectedPeriod.cutoffType.toLowerCase().replace(/\s+/g, '-');

    downloadCsv(
      `payroll-${selectedPeriod.year}-${pad(selectedPeriod.month)}-${slug}.csv`,
      toCsv(
        [
          'Payroll ID',
          'Employee',
          'Position',
          'Cutoff',
          'Cutoff start',
          'Cutoff end',
          'Days present',
          'Working days',
          'Daily rate',
          'Gross',
          'Deductions',
          'Net pay',
          'Status',
          'Payment date'
        ],
        payrollData.map((payroll) => [
          payroll.id,
          payroll.employee_name,
          payroll.position,
          payroll.cutoff_type || 'Full Month',
          payroll.cutoff_start,
          payroll.cutoff_end,
          payroll.days_present,
          payroll.working_days,
          payroll.daily_rate,
          num(payroll.basic_salary) + num(payroll.allowances),
          payroll.deductions,
          payroll.net_salary,
          payroll.status,
          payroll.payment_date || ''
        ])
      )
    );
  };

  // One pass instead of seven. The contribution figures each re-parsed every
  // row's `breakdown` JSON in their own `reduce`.
  const totals = payrollData.reduce(
    (sums, payroll) => {
      const breakdown = parseBreakdown(payroll.breakdown);
      return {
        net: sums.net + num(payroll.net_salary),
        deductions: sums.deductions + num(payroll.deductions),
        cost: sums.cost + num(payroll.net_salary) + num(payroll.deductions),
        gross: sums.gross + num(payroll.basic_salary) + num(payroll.allowances),
        sss: sums.sss + employeeShare(breakdown, 'sss'),
        philhealth: sums.philhealth + employeeShare(breakdown, 'philhealth'),
        pagibig: sums.pagibig + employeeShare(breakdown, 'pagibig'),
        tax: sums.tax + num(breakdown?.deductions?.incomeTax)
      };
    },
    { net: 0, deductions: 0, cost: 0, gross: 0, sss: 0, philhealth: 0, pagibig: 0, tax: 0 }
  );

  const paidCount = payrollData.filter((payroll) => payroll.status === 'Paid').length;
  const pendingCount = payrollData.filter((payroll) => payroll.status === 'Pending').length;
  const recordCount = payrollData.length;
  const showAttendanceColumns = showCutoffDetails && selectedPeriod.cutoffType !== 'Full Month';

  const tiles = [
    {
      label: 'Total net distribution',
      value: formatCurrency(totals.net),
      detail: `Across ${recordCount} ${recordCount === 1 ? 'record' : 'records'}`,
      icon: Banknote,
      iconClass: 'bg-[rgb(34_197_94/0.14)] text-accent'
    },
    {
      label: 'Total deductions',
      value: formatCurrency(totals.deductions),
      detail: 'Tax and mandatory contributions',
      icon: Receipt,
      iconClass: 'bg-[rgb(239_68_68/0.14)] text-destructive'
    },
    {
      label: 'Pending approval',
      value: pendingCount,
      detail: pendingCount === 0 ? 'Nothing waiting on you' : 'Requires your confirmation',
      icon: Clock,
      iconClass: 'bg-[rgb(251_191_36/0.14)] text-warning'
    },
    {
      label: 'Company liability',
      value: formatCurrency(totals.gross),
      detail: 'Gross total payroll',
      icon: PhilippinePeso,
      iconClass: 'bg-[rgb(96_165_250/0.14)] text-info'
    }
  ];

  return (
    <div className="page">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <h2 className="page-title">Payroll</h2>
          <p className="page-subtitle mt-1">
            {periodLabel(selectedPeriod)} · {cutoff.label} · {cutoff.workingDays} working days
          </p>
        </div>
        <button
          type="button"
          onClick={handleExport}
          disabled={recordCount === 0}
          className="btn btn-outline btn-sm shrink-0"
          title="Exports the records listed below"
        >
          <Download size={15} aria-hidden="true" />
          Export CSV
        </button>
      </div>

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

      <div className="card flex flex-wrap items-end gap-3 p-4">
        <div>
          <label htmlFor="payroll-month" className="label">
            Month
          </label>
          <div className="input-group">
            <CalendarDays className="input-icon" size={16} aria-hidden="true" />
            <select
              id="payroll-month"
              value={selectedPeriod.month}
              onChange={(event) =>
                setSelectedPeriod({ ...selectedPeriod, month: Number(event.target.value) })
              }
              className="select w-[168px]"
            >
              {MONTHS.map((month, index) => (
                <option key={month} value={index + 1}>
                  {month}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div>
          <label htmlFor="payroll-year" className="label">
            Year
          </label>
          <select
            id="payroll-year"
            value={selectedPeriod.year}
            onChange={(event) =>
              setSelectedPeriod({ ...selectedPeriod, year: Number(event.target.value) })
            }
            className="select w-[110px]"
          >
            {YEARS.map((year) => (
              <option key={year} value={year}>
                {year}
              </option>
            ))}
          </select>
        </div>

        <div>
          <span className="label">Cutoff</span>
          {/* Three radio-like buttons rather than a fourth dropdown: the cutoff
              decides which of the two runs the page is even talking about, so it
              should be readable without opening anything. */}
          <div className="segment" role="group" aria-label="Payroll cutoff">
            {CUTOFFS.map((entry) => (
              <button
                key={entry.value}
                type="button"
                onClick={() => setSelectedPeriod({ ...selectedPeriod, cutoffType: entry.value })}
                aria-pressed={selectedPeriod.cutoffType === entry.value}
                title={entry.detail}
                className={`segment-item ${
                  selectedPeriod.cutoffType === entry.value ? 'segment-item-active' : ''
                }`}
              >
                {entry.label}
              </button>
            ))}
          </div>
        </div>

        <p className="ml-auto max-w-[15rem] text-xs text-muted-foreground">
          {cutoff.value === 'Full Month'
            ? 'A monthly run covers the whole calendar month and is not pro-rated by attendance.'
            : `Covers the ${cutoff.detail}, pro-rated over ${cutoff.workingDays} working days.`}
        </p>
      </div>

      {loading ? (
        // The page used to return this spinner *instead of* itself, so every
        // change of month took the period controls off the screen with it.
        <div className="card flex items-center justify-center py-16" role="status" aria-live="polite">
          <span className="spinner spinner-lg text-accent" aria-hidden="true" />
          <span className="sr-only">Loading payroll…</span>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {tiles.map((tile, index) => (
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
                  <tile.icon size={20} aria-hidden="true" />
                </span>
              </div>
            ))}
          </div>

          <div
            className="flex flex-wrap gap-1 border-b border-[rgb(248_250_252/0.1)]"
            role="tablist"
            aria-label="Payroll views"
          >
            {TABS.map((tab) => (
              <button
                key={tab.value}
                type="button"
                role="tab"
                id={`payroll-tab-${tab.value}`}
                aria-selected={viewMode === tab.value}
                aria-controls="payroll-panel"
                onClick={() => setViewMode(tab.value)}
                className={`tab ${viewMode === tab.value ? 'tab-active' : ''}`}
              >
                <tab.Icon size={15} aria-hidden="true" />
                {tab.label}
              </button>
            ))}
          </div>

          <div
            role="tabpanel"
            id="payroll-panel"
            aria-labelledby={`payroll-tab-${viewMode}`}
            className="flex flex-col gap-4"
          >
            {viewMode === 'summary' && (
              <>
                <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
                  <div className="card p-5">
                    <h2 className="section-title">Payroll overview</h2>
                    <p className="page-subtitle mt-0.5">
                      {periodLabel(selectedPeriod)} · {cutoff.label}
                    </p>
                    <div className="mt-3 flex flex-col">
                      <div className="field-row">
                        <span className="field-key">Employees on this run</span>
                        <span className="field-value">{recordCount}</span>
                      </div>
                      <div className="field-row">
                        <span className="field-key">Total payroll cost</span>
                        <span className="field-value num">{formatCurrency(totals.cost)}</span>
                      </div>
                      <div className="field-row">
                        <span className="field-key">Total deductions</span>
                        <span className="field-value num">{formatCurrency(totals.deductions)}</span>
                      </div>
                      <div className="field-row">
                        <span className="field-key">Net distribution</span>
                        <span className="field-value num">{formatCurrency(totals.net)}</span>
                      </div>
                      <div className="field-row">
                        <span className="field-key">Status</span>
                        <span className="flex flex-wrap items-center justify-end gap-1.5">
                          <span className="badge badge-accent">
                            <CheckCircle size={12} aria-hidden="true" />
                            {paidCount} paid
                          </span>
                          <span className="badge badge-warning">
                            <Clock size={12} aria-hidden="true" />
                            {pendingCount} pending
                          </span>
                        </span>
                      </div>
                    </div>
                  </div>

                  <div className="card p-5">
                    <h2 className="section-title">Tax and contributions</h2>
                    <p className="page-subtitle mt-0.5">
                      Employee share, summed from the stored breakdowns
                    </p>
                    <div className="mt-3 flex flex-col">
                      <div className="field-row">
                        <span className="field-key">SSS</span>
                        <span className="field-value num">{formatCurrency(totals.sss)}</span>
                      </div>
                      <div className="field-row">
                        <span className="field-key">PhilHealth</span>
                        <span className="field-value num">{formatCurrency(totals.philhealth)}</span>
                      </div>
                      <div className="field-row">
                        <span className="field-key">Pag-IBIG</span>
                        <span className="field-value num">{formatCurrency(totals.pagibig)}</span>
                      </div>
                      <div className="field-row">
                        <span className="field-key">Withholding tax</span>
                        <span className="field-value num">{formatCurrency(totals.tax)}</span>
                      </div>
                      <div className="field-row">
                        <span className="field-key">Total remitted</span>
                        <span className="field-value num">
                          {formatCurrency(
                            totals.sss + totals.philhealth + totals.pagibig + totals.tax
                          )}
                        </span>
                      </div>
                    </div>
                    {selectedPeriod.cutoffType !== 'Full Month' && (
                      // Stated rather than left as a puzzle: the calculator
                      // returns `incomeTax: 0` for a half-month run and defers
                      // the whole month's tax to the monthly computation.
                      <p className="help-text mt-3">
                        <AlertCircle size={13} aria-hidden="true" />
                        Withholding tax is computed on the full month, so a half-month run
                        reports zero.
                      </p>
                    )}
                  </div>
                </div>

                <section className="flex flex-col gap-2" aria-labelledby="payroll-records-heading">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="min-w-0">
                      <h2 id="payroll-records-heading" className="section-title">
                        Employee payroll
                      </h2>
                      <p className="page-subtitle mt-0.5">
                        {recordCount} {recordCount === 1 ? 'record' : 'records'} for{' '}
                        {periodLabel(selectedPeriod)}
                      </p>
                    </div>
                    {/* The original showed this toggle on every cutoff, but the
                        columns it reveals are only filed by a half-month run. */}
                    {selectedPeriod.cutoffType !== 'Full Month' && recordCount > 0 && (
                      <button
                        type="button"
                        onClick={() => setShowCutoffDetails(!showCutoffDetails)}
                        className="btn btn-ghost btn-sm"
                        aria-expanded={showCutoffDetails}
                      >
                        {showCutoffDetails ? (
                          <ChevronUp size={15} aria-hidden="true" />
                        ) : (
                          <ChevronDown size={15} aria-hidden="true" />
                        )}
                        {showCutoffDetails ? 'Hide attendance' : 'Show attendance'}
                      </button>
                    )}
                  </div>

                  {recordCount === 0 ? (
                    <div className="empty-state card">
                      <span className="empty-state-icon">
                        <Receipt size={26} aria-hidden="true" />
                      </span>
                      <h3 className="section-title">No payroll for this period</h3>
                      <p className="page-subtitle max-w-md">
                        Nothing has been filed for {periodLabel(selectedPeriod)} ·{' '}
                        {cutoff.label}. Open Process payroll to run it.
                      </p>
                      <button
                        type="button"
                        onClick={() => setViewMode('process')}
                        className="btn btn-primary btn-sm mt-1"
                      >
                        <Calculator size={15} aria-hidden="true" />
                        Process payroll
                      </button>
                    </div>
                  ) : (
                    <div className="table-container max-h-[60vh]">
                      <table className="table">
                        <thead>
                          <tr>
                            <th scope="col">Employee</th>
                            <th scope="col">Cutoff</th>
                            {showAttendanceColumns && (
                              <>
                                <th scope="col">Days present</th>
                                <th scope="col" className="num">
                                  Daily rate
                                </th>
                              </>
                            )}
                            <th scope="col" className="num">
                              Gross
                            </th>
                            <th scope="col" className="num">
                              Deductions
                            </th>
                            <th scope="col" className="num">
                              Net pay
                            </th>
                            <th scope="col">Status</th>
                            <th scope="col">
                              <span className="sr-only">Actions</span>
                            </th>
                          </tr>
                        </thead>
                        <tbody>
                          {payrollData.map((payroll, index) => {
                            const status = STATUS_STYLE[payroll.status] ?? STATUS_STYLE.Pending;
                            const workingDays = num(payroll.working_days) || cutoff.workingDays;
                            const daysPresent = num(payroll.days_present);
                            const attendedPercent = workingDays
                              ? Math.min(100, Math.round((daysPresent / workingDays) * 100))
                              : 0;
                            return (
                              <tr key={payroll.id} className="stagger-row" style={{ '--i': index }}>
                                <td>
                                  <div className="flex items-center gap-2.5">
                                    <span className="avatar h-9 w-9 text-xs" aria-hidden="true">
                                      {initials(payroll.employee_name)}
                                    </span>
                                    <div className="min-w-0">
                                      <p className="truncate-1 font-medium">
                                        {payroll.employee_name || '—'}
                                      </p>
                                      <p className="truncate-1 text-xs text-muted-foreground">
                                        {payroll.position || '—'}
                                      </p>
                                    </div>
                                  </div>
                                </td>
                                <td>
                                  <span className="pill">{payroll.cutoff_type || cutoff.value}</span>
                                  <p className="mt-1 text-xs text-muted-foreground">
                                    {formatStoredDate(payroll.cutoff_start, {
                                      month: 'short',
                                      day: '2-digit'
                                    })}{' '}
                                    –{' '}
                                    {formatStoredDate(payroll.cutoff_end, {
                                      month: 'short',
                                      day: '2-digit'
                                    })}
                                  </p>
                                </td>
                                {showAttendanceColumns && (
                                  <>
                                    <td>
                                      <p className="text-sm tnum">
                                        {daysPresent} / {workingDays}
                                      </p>
                                      {/* Same shape as every other bar in the
                                          app: a `div` with `role="progressbar"`,
                                          because `.progress` sizes a block. */}
                                      <div
                                        className="progress mt-1.5"
                                        role="progressbar"
                                        aria-valuenow={attendedPercent}
                                        aria-valuemin={0}
                                        aria-valuemax={100}
                                        aria-label={`${daysPresent} of ${workingDays} days present`}
                                      >
                                        <div
                                          className="progress-bar"
                                          style={{ width: `${attendedPercent}%` }}
                                        />
                                      </div>
                                    </td>
                                    <td className="num">{formatCurrency(payroll.daily_rate)}</td>
                                  </>
                                )}
                                <td className="num">
                                  {formatCurrency(num(payroll.basic_salary) + num(payroll.allowances))}
                                </td>
                                <td className="num">{formatCurrency(payroll.deductions)}</td>
                                <td className="num font-semibold">
                                  {formatCurrency(payroll.net_salary)}
                                </td>
                                <td>
                                  <span className={`badge ${status.badge}`}>
                                    <status.Icon size={12} aria-hidden="true" />
                                    {payroll.status || 'Pending'}
                                  </span>
                                </td>
                                <td>
                                  <div className="flex items-center justify-end gap-1">
                                    <button
                                      type="button"
                                      onClick={() => setSelectedPayroll(payroll)}
                                      className="btn btn-ghost btn-sm"
                                      aria-label={`View the payslip for ${payroll.employee_name}`}
                                    >
                                      <FileText size={14} aria-hidden="true" />
                                      Payslip
                                    </button>
                                    {payroll.status !== 'Paid' && (
                                      <button
                                        type="button"
                                        onClick={() => handleMarkPaid(payroll)}
                                        className="btn btn-secondary btn-sm"
                                        aria-label={`Mark ${payroll.employee_name} as paid`}
                                      >
                                        <Banknote size={14} aria-hidden="true" />
                                        Mark paid
                                      </button>
                                    )}
                                  </div>
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  )}
                </section>
              </>
            )}

            {viewMode === 'details' && (
              <section className="flex flex-col gap-2" aria-labelledby="payroll-detail-heading">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="min-w-0">
                    <h2 id="payroll-detail-heading" className="section-title">
                      Payroll records
                    </h2>
                    <p className="page-subtitle mt-0.5">
                      Every row filed for {periodLabel(selectedPeriod)} · {cutoff.label}
                    </p>
                  </div>
                  {/* Export and Print sat here with no handlers. Export now
                      writes the rows on screen; Print is gone, because the app
                      carries no print stylesheet to print them with. */}
                  <button
                    type="button"
                    onClick={handleExport}
                    disabled={recordCount === 0}
                    className="btn btn-outline btn-sm"
                  >
                    <Download size={15} aria-hidden="true" />
                    Export CSV
                  </button>
                </div>

                {recordCount === 0 ? (
                  <div className="empty-state card">
                    <span className="empty-state-icon">
                      <Receipt size={26} aria-hidden="true" />
                    </span>
                    <h3 className="section-title">Nothing filed yet</h3>
                    <p className="page-subtitle max-w-md">
                      No payroll records exist for {periodLabel(selectedPeriod)} ·{' '}
                      {cutoff.label}.
                    </p>
                  </div>
                ) : (
                  <div className="table-container max-h-[60vh]">
                    <table className="table">
                      <thead>
                        <tr>
                          <th scope="col">Payroll ID</th>
                          <th scope="col">Employee</th>
                          <th scope="col">Period</th>
                          <th scope="col">Cutoff</th>
                          <th scope="col" className="num">
                            Gross
                          </th>
                          <th scope="col" className="num">
                            Deductions
                          </th>
                          <th scope="col" className="num">
                            Net pay
                          </th>
                          <th scope="col">Status</th>
                          <th scope="col">Payment date</th>
                          <th scope="col">
                            <span className="sr-only">Actions</span>
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        {payrollData.map((payroll, index) => {
                          const status = STATUS_STYLE[payroll.status] ?? STATUS_STYLE.Pending;
                          return (
                            <tr key={payroll.id} className="stagger-row" style={{ '--i': index }}>
                              <td className="font-mono text-xs">PR-{pad(payroll.id)}</td>
                              <td>
                                <p className="truncate-1 font-medium">
                                  {payroll.employee_name || '—'}
                                </p>
                                <p className="truncate-1 text-xs text-muted-foreground">
                                  {payroll.position || '—'}
                                </p>
                              </td>
                              <td>
                                {/* `new Date('2026-09-01')` is UTC midnight, so
                                    this column named August in any zone behind
                                    UTC. Stored dates go through the parser. */}
                                {formatStoredDate(payroll.cutoff_start, {
                                  month: 'short',
                                  year: 'numeric'
                                })}
                              </td>
                              <td>
                                <span className="pill">{payroll.cutoff_type || cutoff.value}</span>
                              </td>
                              <td className="num">
                                {formatCurrency(num(payroll.basic_salary) + num(payroll.allowances))}
                              </td>
                              <td className="num">{formatCurrency(payroll.deductions)}</td>
                              <td className="num font-semibold">
                                {formatCurrency(payroll.net_salary)}
                              </td>
                              <td>
                                <span className={`badge ${status.badge}`}>
                                  <status.Icon size={12} aria-hidden="true" />
                                  {payroll.status || 'Pending'}
                                </span>
                              </td>
                              <td>
                                {payroll.payment_date ? (
                                  formatStoredDate(payroll.payment_date)
                                ) : (
                                  <span className="text-muted-foreground">—</span>
                                )}
                              </td>
                              <td>
                                <div className="flex items-center justify-end gap-1">
                                  <button
                                    type="button"
                                    onClick={() => setSelectedPayroll(payroll)}
                                    className="btn btn-ghost btn-sm"
                                    aria-label={`View the payslip for ${payroll.employee_name}`}
                                  >
                                    <FileText size={14} aria-hidden="true" />
                                    Payslip
                                  </button>
                                  {payroll.status !== 'Paid' && (
                                    <button
                                      type="button"
                                      onClick={() => handleMarkPaid(payroll)}
                                      className="btn btn-secondary btn-sm"
                                      aria-label={`Mark ${payroll.employee_name} as paid`}
                                    >
                                      <Banknote size={14} aria-hidden="true" />
                                      Mark paid
                                    </button>
                                  )}
                                </div>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </section>
            )}

            {viewMode === 'process' && (
              <section className="flex flex-col gap-3" aria-labelledby="payroll-process-heading">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="min-w-0">
                    <h2 id="payroll-process-heading" className="section-title">
                      Process {cutoff.label.toLowerCase()} payroll
                    </h2>
                    <p className="page-subtitle mt-0.5">
                      {periodLabel(selectedPeriod)} · {cutoff.detail} · {cutoff.workingDays} working
                      days
                    </p>
                  </div>
                  {/* One button, not two. The original paired a guarded
                      "Process" with an unguarded "Confirm & Finalize" that
                      called the same function, so a second click while the
                      first run was in flight filed the whole cutoff twice. */}
                  <button
                    type="button"
                    onClick={() => setConfirmRun(true)}
                    disabled={processing || previewRows.length === 0}
                    className="btn btn-primary"
                  >
                    {processing ? (
                      <>
                        <Loader2 size={16} className="animate-spin" aria-hidden="true" />
                        Processing…
                      </>
                    ) : (
                      <>
                        <Calculator size={16} aria-hidden="true" />
                        Process {previewRows.length}{' '}
                        {previewRows.length === 1 ? 'employee' : 'employees'}
                      </>
                    )}
                  </button>
                </div>

                <div className="alert alert-info" role="note">
                  <AlertCircle size={16} aria-hidden="true" />
                  <div>
                    <p className="font-medium">This is a preview.</p>
                    <p className="mt-0.5">
                      {selectedPeriod.cutoffType === 'Full Month'
                        ? 'A monthly run covers every active employee over 24 working days and computes withholding tax.'
                        : 'A half-month run pro-rates 12 working days by the days present in this cutoff. Withholding tax is deferred to the monthly computation.'}{' '}
                      Records are filed as Pending until you mark them paid.
                    </p>
                  </div>
                </div>

                {previewRows.length === 0 ? (
                  <div className="empty-state card">
                    <span className="empty-state-icon">
                      <Calculator size={26} aria-hidden="true" />
                    </span>
                    <h3 className="section-title">Nothing to process</h3>
                    <p className="page-subtitle max-w-md">
                      {selectedPeriod.cutoffType === 'Full Month'
                        ? 'No active employees were found.'
                        : `No attendance was recorded for ${cutoff.detail} of ${periodLabel(selectedPeriod)}.`}
                    </p>
                  </div>
                ) : (
                  <>
                    <div className="table-container max-h-[52vh]">
                      <table className="table">
                        <thead>
                          <tr>
                            <th scope="col">Employee</th>
                            {selectedPeriod.cutoffType !== 'Full Month' && (
                              <th scope="col">Days present</th>
                            )}
                            <th scope="col" className="num">
                              Daily rate
                            </th>
                            <th scope="col" className="num">
                              Gross
                            </th>
                            <th scope="col" className="num">
                              Deductions
                            </th>
                            <th scope="col" className="num">
                              Net pay
                            </th>
                          </tr>
                        </thead>
                        <tbody>
                          {previewRows.map(({ employee, attendance, breakdown }, index) => (
                            <tr key={employee.id} className="stagger-row" style={{ '--i': index }}>
                              <td>
                                <div className="flex items-center gap-2.5">
                                  <span className="avatar h-9 w-9 text-xs" aria-hidden="true">
                                    {initials(`${employee.first_name} ${employee.last_name}`)}
                                  </span>
                                  <div className="min-w-0">
                                    <p className="truncate-1 font-medium">
                                      {employee.first_name} {employee.last_name}
                                    </p>
                                    <p className="truncate-1 text-xs text-muted-foreground">
                                      {employee.position || '—'}
                                    </p>
                                  </div>
                                </div>
                              </td>
                              {selectedPeriod.cutoffType !== 'Full Month' && (
                                <td>
                                  {/* `getCutoffAttendance` left-joins every
                                      active employee, so a zero here is real and
                                      is carried into the run exactly as before —
                                      it just says so now, because the resulting
                                      net is negative by the mandatory shares. */}
                                  {num(attendance?.days_present) === 0 ? (
                                    <span className="badge badge-danger">
                                      <AlertTriangle size={12} aria-hidden="true" />
                                      0 of 12 days
                                    </span>
                                  ) : (
                                    <span className="text-sm tnum">
                                      {num(attendance?.days_present)} / 12
                                    </span>
                                  )}
                                </td>
                              )}
                              <td className="num">{formatCurrency(breakdown.dailyRate)}</td>
                              <td className="num">{formatCurrency(breakdown.basicSalary)}</td>
                              <td className="num">
                                {formatCurrency(breakdown.deductions.total)}
                              </td>
                              <td
                                className={`num font-semibold ${
                                  num(breakdown.netSalary) < 0 ? 'text-destructive' : ''
                                }`}
                              >
                                {formatCurrency(breakdown.netSalary)}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>

                    <div className="surface grid grid-cols-1 gap-4 p-4 sm:grid-cols-2 lg:grid-cols-4">
                      <div>
                        <p className="kpi-label">Employees</p>
                        <p className="kpi-value mt-1">{previewRows.length}</p>
                      </div>
                      <div>
                        <p className="kpi-label">Gross</p>
                        <p className="kpi-value mt-1">{formatCurrency(previewTotals.gross)}</p>
                      </div>
                      <div>
                        <p className="kpi-label">Deductions</p>
                        <p className="kpi-value mt-1">{formatCurrency(previewTotals.deductions)}</p>
                      </div>
                      <div>
                        <p className="kpi-label">Net payout</p>
                        <p className="kpi-value mt-1 text-accent">
                          {formatCurrency(previewTotals.net)}
                        </p>
                      </div>
                    </div>
                  </>
                )}
              </section>
            )}
          </div>
        </>
      )}

      {/* No portal: this backdrop is a direct child of `.page`, which sets no
          `backdrop-filter`, so it is not a containing block for `position:
          fixed`. Dialogs opened from inside a `.card` do need one. */}
      {selectedPayroll && (
        <div
          className="modal-backdrop"
          onClick={(event) => {
            if (event.target === event.currentTarget) setSelectedPayroll(null);
          }}
        >
          <div
            ref={detailRef}
            tabIndex={-1}
            role="dialog"
            aria-modal="true"
            aria-labelledby="payslip-title"
            className="modal-panel max-w-4xl"
          >
            <div className="flex items-start justify-between gap-3 border-b border-[rgb(248_250_252/0.1)] px-5 py-4">
              <div className="flex min-w-0 items-center gap-3">
                <span className="avatar h-10 w-10 text-sm" aria-hidden="true">
                  {initials(selectedPayroll.employee_name)}
                </span>
                <div className="min-w-0">
                  <h2 id="payslip-title" className="section-title truncate-1">
                    {selectedPayroll.employee_name || 'Payslip'}
                  </h2>
                  <p className="page-subtitle mt-0.5 truncate-1">
                    {selectedPayroll.cutoff_type || cutoff.value} ·{' '}
                    {formatStoredDate(selectedPayroll.cutoff_start, {
                      month: 'short',
                      day: '2-digit'
                    })}{' '}
                    –{' '}
                    {formatStoredDate(selectedPayroll.cutoff_end, {
                      month: 'short',
                      day: '2-digit',
                      year: 'numeric'
                    })}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setSelectedPayroll(null)}
                className="btn btn-ghost btn-icon"
                aria-label="Close the payslip"
                data-autofocus
              >
                <X size={18} aria-hidden="true" />
              </button>
            </div>

            <div className="px-5 py-4">
              {(() => {
                const breakdown = parseBreakdown(selectedPayroll.breakdown);
                if (!breakdown) {
                  // A row filed before the breakdown column was populated, or
                  // one holding malformed JSON. The four `reduce`s that used to
                  // parse this inline took the page down with them.
                  return (
                    <div className="empty-state">
                      <span className="empty-state-icon">
                        <FileText size={26} aria-hidden="true" />
                      </span>
                      <h3 className="section-title">No breakdown stored</h3>
                      <p className="page-subtitle max-w-md">
                        This record holds no readable computation. The figures below come
                        straight from the payroll row.
                      </p>
                      <div className="mt-2 flex w-full max-w-sm flex-col">
                        <div className="field-row">
                          <span className="field-key">Gross</span>
                          <span className="field-value num">
                            {formatCurrency(
                              num(selectedPayroll.basic_salary) + num(selectedPayroll.allowances)
                            )}
                          </span>
                        </div>
                        <div className="field-row">
                          <span className="field-key">Deductions</span>
                          <span className="field-value num">
                            {formatCurrency(selectedPayroll.deductions)}
                          </span>
                        </div>
                        <div className="field-row">
                          <span className="field-key">Net pay</span>
                          <span className="field-value num">
                            {formatCurrency(selectedPayroll.net_salary)}
                          </span>
                        </div>
                      </div>
                    </div>
                  );
                }
                return <PayrollBreakdownView breakdown={breakdown} payroll={selectedPayroll} />;
              })()}
            </div>

            {/* The footer used to carry Print and Send payslip. Neither did
                anything: there is no print stylesheet and no mail transport in
                the app. Mark paid is the one action a payslip can perform. */}
            <div className="flex flex-wrap items-center justify-end gap-2 border-t border-[rgb(248_250_252/0.1)] px-5 py-4">
              {selectedPayroll.status !== 'Paid' && (
                <button
                  type="button"
                  onClick={async () => {
                    const target = selectedPayroll;
                    setSelectedPayroll(null);
                    await handleMarkPaid(target);
                  }}
                  className="btn btn-secondary"
                >
                  <Banknote size={16} aria-hidden="true" />
                  Mark paid
                </button>
              )}
              <button
                type="button"
                onClick={() => setSelectedPayroll(null)}
                className="btn btn-outline"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      <ConfirmDialog
        isOpen={confirmRun}
        title={`Process ${cutoff.label.toLowerCase()} payroll?`}
        body={
          <>
            This files {previewRows.length}{' '}
            {previewRows.length === 1 ? 'record' : 'records'} for {periodLabel(selectedPeriod)} ·{' '}
            {cutoff.detail}, each as Pending, totalling{' '}
            <span className="font-semibold">{formatCurrency(previewTotals.net)}</span> in net pay.
            {recordCount > 0 && (
              <>
                {' '}
                This period already holds {recordCount}{' '}
                {recordCount === 1 ? 'record' : 'records'}. Those employees are skipped and
                their filed figures stand; only employees without a record for the period are
                added.
              </>
            )}
          </>
        }
        confirmLabel="Process payroll"
        busyLabel="Processing…"
        variant="primary"
        icon={Calculator}
        busy={processing}
        onConfirm={runPayroll}
        onCancel={() => setConfirmRun(false)}
      />
    </div>
  );
};

/**
 * The payslip body, drawn from the JSON the run stored on the row.
 *
 * Three things it used to get wrong. "Est. Annual Taxable Income" multiplied
 * `breakdown.halfMonthSalary` by 24 — a key `calculateHalfMonthPayroll` has
 * never returned, so every bi-monthly payslip read `₱NaN`; it now annualises
 * `grossSalary` the way the calculator itself does, by 24 halves or 12 months.
 * The daily rate and working days were read off monthly breakdowns that never
 * carried them, which is where the second `₱NaN` and the "0 / 24 Days" came
 * from; both keys are written now, and a row stored before that shows `—`
 * rather than a figure it does not have. And the employer grid indexed
 * `employerContributions` unguarded, so an older row threw during render.
 */
const PayrollBreakdownView = ({ breakdown, payroll }) => {
  const halfMonth = Boolean(breakdown.cutoffType);
  const mandatory = breakdown.deductions?.mandatory ?? {};
  const employer = breakdown.employerContributions ?? {};
  const workingDays = num(breakdown.workingDays) || (halfMonth ? 12 : 24);
  const annualIncome = num(breakdown.grossSalary) * (halfMonth ? 24 : 12);
  const dailyRate = breakdown.dailyRate ?? payroll?.daily_rate;

  const earnings = [
    { label: halfMonth ? 'Basic pay (pro-rated)' : 'Basic salary', value: breakdown.basicSalary },
    { label: 'Allowances', value: breakdown.allowances }
  ];

  const deductions = [
    { label: 'SSS', value: mandatory.sss?.employee },
    { label: 'PhilHealth', value: mandatory.philhealth?.employee },
    { label: 'Pag-IBIG', value: mandatory.pagibig?.employee },
    { label: 'Withholding tax', value: breakdown.deductions?.incomeTax },
    { label: 'Other deductions', value: breakdown.deductions?.otherDeductions }
  ];

  const employerShares = [
    { label: 'SSS', value: employer.sss },
    { label: 'PhilHealth', value: employer.philhealth },
    { label: 'Pag-IBIG', value: employer.pagibig },
    { label: 'Total', value: employer.total }
  ].filter((row) => row.value !== undefined && row.value !== null);

  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <div className="surface p-3">
          <p className="kpi-label">Cutoff</p>
          <p className="mt-1 text-sm font-medium">
            {breakdown.cutoffType || payroll?.cutoff_type || 'Full Month'}
          </p>
        </div>
        <div className="surface p-3">
          <p className="kpi-label">Attendance</p>
          <p className="mt-1 text-sm font-medium tnum">
            {halfMonth
              ? `${num(breakdown.daysPresent)} / ${workingDays} days present`
              : `${workingDays} working days`}
          </p>
        </div>
        <div className="surface p-3">
          <p className="kpi-label">Daily rate</p>
          <p className="mt-1 text-sm font-medium tnum">
            {/* `—`, not `₱NaN`: a row filed before the monthly breakdown
                carried this key genuinely does not have it. */}
            {dailyRate === undefined || dailyRate === null ? '—' : formatCurrency(dailyRate)}
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
        <div className="surface p-4">
          <h3 className="eyebrow">Earnings</h3>
          <div className="mt-2 flex flex-col">
            {earnings.map((row) => (
              <div key={row.label} className="field-row">
                <span className="field-key">{row.label}</span>
                <span className="field-value num">{formatCurrency(row.value)}</span>
              </div>
            ))}
            <div className="field-row">
              <span className="field-key font-semibold">Gross pay</span>
              <span className="field-value num font-semibold">
                {formatCurrency(breakdown.grossSalary)}
              </span>
            </div>
          </div>
        </div>

        <div className="surface p-4">
          <h3 className="eyebrow">Deductions</h3>
          <div className="mt-2 flex flex-col">
            {deductions.map((row) => (
              <div key={row.label} className="field-row">
                <span className="field-key">{row.label}</span>
                <span className="field-value num">{formatCurrency(row.value)}</span>
              </div>
            ))}
            <div className="field-row">
              <span className="field-key font-semibold">Total deductions</span>
              <span className="field-value num font-semibold">
                {formatCurrency(breakdown.deductions?.total)}
              </span>
            </div>
          </div>
        </div>
      </div>

      <div className="surface flex flex-wrap items-center justify-between gap-3 p-4">
        <div>
          <p className="kpi-label">Net pay</p>
          <p
            className={`kpi-value mt-1 ${
              num(breakdown.netSalary) < 0 ? 'text-destructive' : 'text-accent'
            }`}
          >
            {formatCurrency(breakdown.netSalary)}
          </p>
        </div>
        <div className="text-right">
          <p className="kpi-label">Est. annual taxable income</p>
          <p className="mt-1 text-base font-semibold tnum">{formatCurrency(annualIncome)}</p>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Gross × {halfMonth ? '24 half-months' : '12 months'}
          </p>
        </div>
      </div>

      {employerShares.length > 0 && (
        <div>
          <h3 className="eyebrow">Employer share</h3>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Paid by the company on top of the net above. It is not part of the payroll totals,
            which count the employee&rsquo;s share only.
          </p>
          <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-4">
            {employerShares.map((row) => (
              <div key={row.label} className="surface-muted p-3">
                <p className="kpi-label">{row.label}</p>
                <p className="mt-1 text-sm font-medium tnum">{formatCurrency(row.value)}</p>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

export default Payroll;

