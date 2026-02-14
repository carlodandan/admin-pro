import React, { useState, useEffect } from 'react';
import {
  PhilippinePeso, Download, Printer, Send, CheckCircle, Clock,
  TrendingUp, FileText, Calculator, Banknote, Receipt, AlertCircle,
  CalendarDays, ChevronDown, ChevronUp
} from 'lucide-react';
import PhilippinePayrollCalculator from '../utils/PhilippinePayrollCalculator';

const Payroll = () => {
  const [payrollData, setPayrollData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedPeriod, setSelectedPeriod] = useState({
    year: new Date().getFullYear(),
    month: new Date().getMonth() + 1,
    cutoffType: 'First Half' // 'First Half', 'Second Half', or 'Full Month'
  });
  const [viewMode, setViewMode] = useState('summary'); // 'summary', 'details', 'process'
  const [selectedPayroll, setSelectedPayroll] = useState(null);
  const [employees, setEmployees] = useState([]);
  const [processing, setProcessing] = useState(false);
  const [cutoffAttendance, setCutoffAttendance] = useState([]);
  const [showCutoffDetails, setShowCutoffDetails] = useState(false);

  useEffect(() => {
    loadEmployees();
    loadPayrollData();
    if (viewMode === 'process' && selectedPeriod.cutoffType !== 'Full Month') {
      loadCutoffAttendance();
    }
  }, [selectedPeriod, viewMode]);

  const loadEmployees = async () => {
    try {
      const data = await window.electronAPI.getAllEmployees();
      setEmployees(data || []);
    } catch (error) {
      console.error('Error loading employees:', error);
    }
  };

  const loadPayrollData = async () => {
    try {
      setLoading(true);
      let data;
      if (selectedPeriod.cutoffType === 'Full Month') {
        data = await window.electronAPI.getAllPayroll();
      } else {
        data = await window.electronAPI.getPayrollByCutoff(
          selectedPeriod.year,
          selectedPeriod.month,
          selectedPeriod.cutoffType
        );
      }
      setPayrollData(data || []);
    } catch (error) {
      console.error('Error loading payroll data:', error);
    } finally {
      setLoading(false);
    }
  };

  const loadCutoffAttendance = async () => {
    try {
      const isFirstHalf = selectedPeriod.cutoffType === 'First Half';
      const data = await window.electronAPI.getCutoffAttendance(
        selectedPeriod.year,
        selectedPeriod.month,
        isFirstHalf
      );
      setCutoffAttendance(data || []);
    } catch (error) {
      console.error('Error loading cutoff attendance:', error);
      setCutoffAttendance([]);
    }
  };

  const formatCurrency = (amount) => {
    return new Intl.NumberFormat('en-PH', {
      style: 'currency',
      currency: 'PHP',
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    }).format(amount);
  };

  // Calculate full month payroll using available methods
  const calculateMonthlyPayrollForEmployee = (employee) => {
    const basicSalary = employee.salary || 0;
    const allowances = 0;
    const otherDeductions = 0;

    // Calculate monthly payroll breakdown using available methods
    const dailyRate = basicSalary / 24; // 24 working days per month
    const monthlyGross = basicSalary + allowances;

    // Calculate mandatory deductions (monthly)
    const mandatoryDeductions = PhilippinePayrollCalculator.calculateMandatoryDeductions(basicSalary, false); // false = full month

    // Calculate income tax (monthly)
    const incomeTax = PhilippinePayrollCalculator.calculateMonthlyIncomeTax(monthlyGross);

    const totalDeductions = mandatoryDeductions.total + incomeTax + otherDeductions;
    const netSalary = monthlyGross - totalDeductions;

    return {
      basicSalary,
      allowances,
      grossSalary: monthlyGross,
      deductions: {
        mandatory: {
          sss: {
            employee: mandatoryDeductions.sss.employeeShare,
            employer: mandatoryDeductions.sss.employerShare,
            total: mandatoryDeductions.sss.employeeShare + mandatoryDeductions.sss.employerShare
          },
          philhealth: {
            employee: mandatoryDeductions.philhealth.employeeShare,
            employer: mandatoryDeductions.philhealth.employerShare,
            total: mandatoryDeductions.philhealth.total
          },
          pagibig: {
            employee: mandatoryDeductions.pagibig.employeeShare,
            employer: mandatoryDeductions.pagibig.employerShare,
            total: mandatoryDeductions.pagibig.total
          },
          total: mandatoryDeductions.total
        },
        incomeTax: incomeTax,
        otherDeductions: otherDeductions,
        total: totalDeductions
      },
      employerContributions: {
        sss: mandatoryDeductions.sss.employerShare,
        philhealth: mandatoryDeductions.philhealth.employerShare,
        pagibig: mandatoryDeductions.pagibig.employerShare,
        total: mandatoryDeductions.sss.employerShare + mandatoryDeductions.philhealth.employerShare + mandatoryDeductions.pagibig.employerShare
      },
      netSalary: netSalary
    };
  };

  // Calculate bi-monthly payroll
  const calculateBiMonthlyPayrollForEmployee = (employee, attendance) => {
    const monthlySalary = employee.salary || 0;
    const daysPresent = attendance?.days_present || 0;
    const workingDays = 12; // Half-month working days
    const isFirstHalf = selectedPeriod.cutoffType === 'First Half';

    return PhilippinePayrollCalculator.calculateHalfMonthPayroll(
      monthlySalary,
      0, // Allowances
      0, // Other deductions
      workingDays,
      daysPresent,
      isFirstHalf
    );
  };

  const processBiMonthlyPayroll = async () => {
    setProcessing(true);
    try {
      const [year, month] = [selectedPeriod.year, selectedPeriod.month];
      const isFirstHalf = selectedPeriod.cutoffType === 'First Half';
      const startDay = isFirstHalf ? '01' : '11';
      const endDay = isFirstHalf ? '10' : '25';

      const cutoff_start = `${year}-${month.toString().padStart(2, '0')}-${startDay}`;
      const cutoff_end = `${year}-${month.toString().padStart(2, '0')}-${endDay}`;

      // Process each employee with attendance
      for (const emp of cutoffAttendance) {
        const employee = employees.find(e => e.id === emp.employee_id);
        if (!employee) continue;

        const breakdown = calculateBiMonthlyPayrollForEmployee(employee, emp);

        const payrollData = {
          employee_id: emp.employee_id,
          cutoff_start,
          cutoff_end,
          basic_salary: breakdown.basicSalary,
          allowances: 0,
          deductions: breakdown.deductions.total,
          net_salary: breakdown.netSalary,
          status: 'Pending',
          cutoff_type: selectedPeriod.cutoffType,
          working_days: 12,
          days_present: emp.days_present || 0,
          daily_rate: breakdown.dailyRate,
          breakdown: JSON.stringify(breakdown)
        };

        await window.electronAPI.processBiMonthlyPayroll(payrollData);
      }

      await loadPayrollData();
      alert(`${selectedPeriod.cutoffType} payroll processed successfully!`);

    } catch (error) {
      console.error('Error processing payroll:', error);
      alert('Error processing payroll: ' + error.message);
    } finally {
      setProcessing(false);
    }
  };

  const processMonthlyPayroll = async () => {
    setProcessing(true);
    try {
      const activeEmployees = employees.filter(emp => emp.status === 'Active');

      const payrollRecords = activeEmployees.map(employee => {
        const breakdown = calculateMonthlyPayrollForEmployee(employee);

        return {
          employee_id: employee.id,
          cutoff_start: `${selectedPeriod.year}-${selectedPeriod.month.toString().padStart(2, '0')}-01`,
          cutoff_end: `${selectedPeriod.year}-${selectedPeriod.month.toString().padStart(2, '0')}-${new Date(selectedPeriod.year, selectedPeriod.month, 0).getDate()}`,
          basic_salary: employee.salary,
          allowances: breakdown.allowances,
          deductions: breakdown.deductions.total,
          net_salary: breakdown.netSalary,
          status: 'Pending',
          breakdown: JSON.stringify(breakdown)
        };
      });

      // Save to database
      for (const record of payrollRecords) {
        await window.electronAPI.processPayroll(record);
      }

      await loadPayrollData();
      alert('Monthly payroll processed successfully!');

    } catch (error) {
      console.error('Error processing payroll:', error);
      alert('Error processing payroll: ' + error.message);
    } finally {
      setProcessing(false);
    }
  };

  const getStatusColor = (status) => {
    switch (status) {
      case 'Paid': return 'bg-green-100 text-green-800';
      case 'Pending': return 'bg-yellow-100 text-yellow-800';
      case 'Processing': return 'bg-blue-100 text-blue-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  };

  const getStatusIcon = (status) => {
    switch (status) {
      case 'Paid': return <CheckCircle size={14} />;
      case 'Pending': return <Clock size={14} />;
      case 'Processing': return <Clock size={14} />;
      default: return null;
    }
  };

  // Get months for dropdown
  const months = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December'
  ];

  // Get years for dropdown
  const currentYear = new Date().getFullYear();
  const years = Array.from({ length: 5 }, (_, i) => currentYear - 2 + i);

  // Calculate summary for bi-monthly payroll preview
  const calculateBiMonthlySummary = () => {
    let totalEmployees = 0;
    let totalNetPay = 0;
    let totalDeductions = 0;
    let totalGrossPay = 0;

    cutoffAttendance.forEach(emp => {
      const employee = employees.find(e => e.id === emp.employee_id);
      if (employee) {
        const breakdown = calculateBiMonthlyPayrollForEmployee(employee, emp);
        totalEmployees++;
        totalNetPay += breakdown.netSalary;
        totalDeductions += breakdown.deductions.total;
        totalGrossPay += breakdown.basicSalary;
      }
    });

    return {
      totalEmployees,
      totalNetPay,
      totalDeductions,
      totalGrossPay
    };
  };

  const getMonthName = (year, month) => {
    const date = new Date(year, month - 1);
    return date.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
  };

  if (loading) {
    return (
      <div className="p-6">
        <div className="flex justify-center items-center h-64">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-black text-gray-900 tracking-tight">Payroll Management</h1>
          <p className="text-gray-500 mt-1 font-medium">
            {selectedPeriod.cutoffType === 'Full Month'
              ? `Monthly Cycle • 24 Working Days • ${months[selectedPeriod.month - 1]} ${selectedPeriod.year}`
              : `${selectedPeriod.cutoffType} Cutoff • 12 Working Days • ${months[selectedPeriod.month - 1]} ${selectedPeriod.year}`}
          </p>
        </div>
        <div className="flex gap-3">
          <div className="flex gap-2">
            <select
              value={selectedPeriod.month}
              onChange={(e) => setSelectedPeriod({ ...selectedPeriod, month: parseInt(e.target.value) })}
              className="px-3 py-2 border border-gray-300 rounded-lg bg-white"
            >
              {months.map((month, index) => (
                <option key={index} value={index + 1}>{month}</option>
              ))}
            </select>
            <select
              value={selectedPeriod.year}
              onChange={(e) => setSelectedPeriod({ ...selectedPeriod, year: parseInt(e.target.value) })}
              className="px-3 py-2 border border-gray-300 rounded-lg bg-white"
            >
              {years.map(year => (
                <option key={year} value={year}>{year}</option>
              ))}
            </select>
            <select
              value={selectedPeriod.cutoffType}
              onChange={(e) => setSelectedPeriod({ ...selectedPeriod, cutoffType: e.target.value })}
              className="px-3 py-2 border border-gray-300 rounded-lg bg-white"
            >
              <option value="First Half">First Half (1st-10th)</option>
              <option value="Second Half">Second Half (11th-25th)</option>
              <option value="Full Month">Full Month</option>
            </select>
          </div>
          <button
            onClick={() => setViewMode('process')}
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
          >
            <Calculator size={18} />
            {selectedPeriod.cutoffType === 'Full Month' ? 'Calculate Monthly' : 'Calculate Bi-Monthly'}
          </button>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="bg-gradient-to-br from-blue-500 to-blue-600 rounded-2xl p-5 text-white shadow-lg shadow-blue-100/50">
          <div className="flex justify-between items-start">
            <div>
              <p className="text-blue-100 text-sm font-medium">Total Net Distribution</p>
              <h3 className="text-2xl font-bold mt-1">
                {formatCurrency(payrollData.reduce((sum, p) => sum + p.net_salary, 0))}
              </h3>
            </div>
            <div className="bg-white/20 p-2 rounded-xl">
              <Banknote size={24} />
            </div>
          </div>
          <p className="mt-4 text-xs text-blue-100 font-medium">
            Across {payrollData.length} active records
          </p>
        </div>

        <div className="bg-white rounded-2xl border border-gray-100 p-5 shadow-sm">
          <div className="flex justify-between items-start">
            <div>
              <p className="text-gray-500 text-sm font-medium">Total Deductions</p>
              <h3 className="text-2xl font-bold mt-1 text-red-600">
                {formatCurrency(payrollData.reduce((sum, p) => sum + p.deductions, 0))}
              </h3>
            </div>
            <div className="bg-red-50 p-2 rounded-xl text-red-500">
              <Receipt size={24} />
            </div>
          </div>
          <p className="mt-4 text-xs text-gray-400 font-medium">
            Tax & Mandatory Contributions
          </p>
        </div>

        <div className="bg-white rounded-2xl border border-gray-100 p-5 shadow-sm">
          <div className="flex justify-between items-start">
            <div>
              <p className="text-gray-500 text-sm font-medium">Pending Approval</p>
              <h3 className="text-2xl font-bold mt-1 text-orange-600">
                {payrollData.filter(p => p.status === 'Pending').length}
              </h3>
            </div>
            <div className="bg-orange-50 p-2 rounded-xl text-orange-500">
              <Clock size={24} />
            </div>
          </div>
          <p className="mt-4 text-xs text-gray-400 font-medium">
            Requires your confirmation
          </p>
        </div>

        <div className="bg-white rounded-2xl border border-gray-100 p-5 shadow-sm">
          <div className="flex justify-between items-start">
            <div>
              <p className="text-gray-500 text-sm font-medium">Company Liability</p>
              <h3 className="text-2xl font-bold mt-1 text-purple-600">
                {formatCurrency(payrollData.reduce((sum, p) => sum + p.basic_salary + (p.allowances || 0), 0))}
              </h3>
            </div>
            <div className="bg-purple-50 p-2 rounded-xl text-purple-500">
              <PhilippinePeso size={24} />
            </div>
          </div>
          <p className="mt-4 text-xs text-gray-400 font-medium">
            Gross Total Payroll
          </p>
        </div>
      </div>

      {/* Tabs */}
      <div className="border-b border-gray-200">
        <nav className="-mb-px flex space-x-8">
          <button
            onClick={() => setViewMode('summary')}
            className={`py-4 px-1 border-b-2 font-medium font-xs ${viewMode === 'summary'
              ? 'border-blue-500 text-blue-600'
              : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              }`}
          >
            <div className="flex items-center gap-2">
              <FileText size={18} />
              Summary
            </div>
          </button>
          <button
            onClick={() => setViewMode('details')}
            className={`py-4 px-1 border-b-2 font-medium font-xs ${viewMode === 'details'
              ? 'border-blue-500 text-blue-600'
              : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              }`}
          >
            <div className="flex items-center gap-2">
              <Receipt size={18} />
              All Payroll Records
            </div>
          </button>
          <button
            onClick={() => setViewMode('process')}
            className={`py-4 px-1 border-b-2 font-medium font-xs ${viewMode === 'process'
              ? 'border-blue-500 text-blue-600'
              : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              }`}
          >
            <div className="flex items-center gap-2">
              <Calculator size={18} />
              Process Payroll
            </div>
          </button>
        </nav>
      </div>

      {/* Content based on view mode */}
      {viewMode === 'summary' && (
        <div className="space-y-6">
          {/* Quick Stats */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="bg-white rounded-xl border border-gray-200 p-6">
              <h3 className="text-lg font-semibold mb-4">Payroll Overview</h3>
              <div className="space-y-4">
                <div className="flex justify-between items-center">
                  <span className="text-gray-600">Total Payroll Cost:</span>
                  <span className="font-bold">
                    {formatCurrency(payrollData.reduce((sum, p) => sum + (p.net_salary + p.deductions), 0))}
                  </span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-gray-600">Total Deductions:</span>
                  <span className="font-bold text-red-600">
                    {formatCurrency(payrollData.reduce((sum, p) => sum + p.deductions, 0))}
                  </span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-gray-600">Total Net Pay:</span>
                  <span className="font-bold text-green-600">
                    {formatCurrency(payrollData.reduce((sum, p) => sum + p.net_salary, 0))}
                  </span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-gray-600">Status Distribution:</span>
                  <div className="flex gap-2">
                    <span className="px-2 py-1 bg-green-100 text-green-800 rounded-full text-xs">
                      {payrollData.filter(p => p.status === 'Paid').length} Paid
                    </span>
                    <span className="px-2 py-1 bg-yellow-100 text-yellow-800 rounded-full text-xs">
                      {payrollData.filter(p => p.status === 'Pending').length} Pending
                    </span>
                  </div>
                </div>
              </div>
            </div>

            <div className="bg-white rounded-xl border border-gray-200 p-6">
              <h3 className="text-lg font-semibold mb-4">Tax & Contributions</h3>
              <div className="space-y-4">
                <div className="flex justify-between items-center">
                  <span className="text-gray-600">SSS Total:</span>
                  <span className="font-bold">
                    {formatCurrency(payrollData.reduce((sum, p) => {
                      const breakdown = p.breakdown ? JSON.parse(p.breakdown) : {};
                      return sum + (breakdown.deductions?.mandatory?.sss?.employee || 0);
                    }, 0))}
                  </span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-gray-600">PhilHealth Total:</span>
                  <span className="font-bold">
                    {formatCurrency(payrollData.reduce((sum, p) => {
                      const breakdown = p.breakdown ? JSON.parse(p.breakdown) : {};
                      return sum + (breakdown.deductions?.mandatory?.philhealth?.employee || 0);
                    }, 0))}
                  </span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-gray-600">Pag-IBIG Total:</span>
                  <span className="font-bold">
                    {formatCurrency(payrollData.reduce((sum, p) => {
                      const breakdown = p.breakdown ? JSON.parse(p.breakdown) : {};
                      return sum + (breakdown.deductions?.mandatory?.pagibig?.employee || 0);
                    }, 0))}
                  </span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-gray-600">Income Tax Total:</span>
                  <span className="font-bold text-red-600">
                    {formatCurrency(payrollData.reduce((sum, p) => {
                      const breakdown = p.breakdown ? JSON.parse(p.breakdown) : {};
                      return sum + (breakdown.deductions?.incomeTax || 0);
                    }, 0))}
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* Recent Payroll Records */}
          <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
            <div className="p-6 border-b border-gray-200">
              <div className="flex justify-between items-center">
                <div>
                  <h3 className="text-lg font-semibold">Recent Payroll Records</h3>
                  <p className="text-gray-600 font-xs">
                    {selectedPeriod.cutoffType} • {getMonthName(selectedPeriod.year, selectedPeriod.month)}
                  </p>
                </div>
                <button
                  onClick={() => setShowCutoffDetails(!showCutoffDetails)}
                  className="flex items-center gap-2 px-3 py-1 font-xs bg-gray-100 rounded-lg hover:bg-gray-200"
                >
                  {showCutoffDetails ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                  {showCutoffDetails ? 'Hide Details' : 'Show Details'}
                </button>
              </div>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-gray-50 border-b border-gray-200">
                  <tr>
                    <th className="py-4 px-6 text-left text-[10px] font-black text-gray-400 uppercase tracking-widest">Employee Information</th>
                    {showCutoffDetails && selectedPeriod.cutoffType !== 'Full Month' && (
                      <>
                        <th className="py-4 px-6 text-left text-[10px] font-black text-gray-400 uppercase tracking-widest">Attendance</th>
                        <th className="py-4 px-6 text-left text-[10px] font-black text-gray-400 uppercase tracking-widest">Daily Rate</th>
                      </>
                    )}
                    <th className="py-4 px-6 text-left text-[10px] font-black text-gray-400 uppercase tracking-widest">Gross Earnings</th>
                    <th className="py-4 px-6 text-left text-[10px] font-black text-gray-400 uppercase tracking-widest">Deductions</th>
                    <th className="py-4 px-6 text-left text-[10px] font-black text-gray-400 uppercase tracking-widest">Net Payable</th>
                    <th className="py-4 px-6 text-left text-[10px] font-black text-gray-400 uppercase tracking-widest">Status</th>
                    <th className="py-4 px-6 text-center text-[10px] font-black text-gray-400 uppercase tracking-widest">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {payrollData.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="py-12 text-center text-gray-400">
                        <div className="flex flex-col items-center gap-2">
                          <Banknote size={40} className="text-gray-200" />
                          <p>No records found for this period</p>
                        </div>
                      </td>
                    </tr>
                  ) : (
                    payrollData.map((payroll) => (
                      <tr key={payroll.id} className="hover:bg-blue-50/30 transition-colors group">
                        <td className="py-4 px-6">
                          <div className="flex items-center gap-3">
                            <div className="h-10 w-10 bg-blue-100 rounded-xl flex items-center justify-center text-blue-600 font-bold uppercase">
                              {payroll.employee_name.split(' ').map(n => n[0]).join('')}
                            </div>
                            <div>
                              <p className="font-bold text-gray-900 leading-none mb-1">{payroll.employee_name}</p>
                              <p className="text-xs text-gray-500 font-medium">{payroll.position}</p>
                            </div>
                          </div>
                        </td>
                        {showCutoffDetails && selectedPeriod.cutoffType !== 'Full Month' && (
                          <>
                            <td className="py-4 px-6">
                              <div className="flex flex-col">
                                <span className="text-sm font-bold text-gray-700">{payroll.days_present || 0} / {payroll.working_days || 12}</span>
                                <div className="w-16 h-1.5 bg-gray-100 rounded-full mt-1 overflow-hidden">
                                  <div
                                    className="h-full bg-blue-500 rounded-full"
                                    style={{ width: `${Math.min(((payroll.days_present || 0) / (payroll.working_days || 12)) * 100, 100)}%` }}
                                  />
                                </div>
                              </div>
                            </td>
                            <td className="py-4 px-6 text-sm font-medium text-gray-600">
                              {formatCurrency(payroll.daily_rate || 0)}
                            </td>
                          </>
                        )}
                        <td className="py-4 px-6">
                          <p className="text-sm font-bold text-gray-900">{formatCurrency(payroll.basic_salary)}</p>
                        </td>
                        <td className="py-4 px-6">
                          <p className="text-sm font-bold text-red-500">-{formatCurrency(payroll.deductions)}</p>
                        </td>
                        <td className="py-4 px-6">
                          <p className="text-base font-black text-blue-600">
                            {formatCurrency(payroll.net_salary)}
                          </p>
                        </td>
                        <td className="py-4 px-6">
                          <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-widest ${getStatusColor(payroll.status)} shadow-sm`}>
                            {getStatusIcon(payroll.status)}
                            {payroll.status}
                          </span>
                        </td>
                        <td className="py-4 px-6">
                          <div className="flex justify-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                            <button
                              onClick={() => setSelectedPayroll(payroll)}
                              className="px-3 py-1.5 text-xs font-bold bg-white border border-gray-200 text-gray-700 rounded-lg hover:bg-gray-50 shadow-sm transition-all"
                            >
                              Details
                            </button>
                            {payroll.status === 'Pending' && (
                              <button
                                onClick={async () => {
                                  try {
                                    await window.electronAPI.markPayrollAsPaid(payroll.id);
                                    loadPayrollData();
                                  } catch (error) {
                                    alert('Error marking as paid: ' + error.message);
                                  }
                                }}
                                className="px-3 py-1.5 text-xs font-bold bg-green-600 text-white rounded-lg hover:bg-green-700 shadow-md shadow-green-100 transition-all"
                              >
                                Mark Paid
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {viewMode === 'details' && (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <div className="p-6 border-b border-gray-200 flex justify-between items-center">
            <div>
              <h3 className="text-lg font-semibold">All Payroll Records</h3>
              <p className="text-gray-600 font-xs">Complete payroll history</p>
            </div>
            <div className="flex gap-2">
              <button className="flex items-center gap-2 px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50">
                <Download size={18} />
                Export
              </button>
              <button className="flex items-center gap-2 px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50">
                <Printer size={18} />
                Print
              </button>
            </div>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50">
                <tr>
                  <th className="py-3 px-4 text-left font-xs font-semibold text-gray-700">ID</th>
                  <th className="py-3 px-4 text-left font-xs font-semibold text-gray-700">Employee</th>
                  <th className="py-3 px-4 text-left font-xs font-semibold text-gray-700">Period</th>
                  <th className="py-3 px-4 text-left font-xs font-semibold text-gray-700">Cutoff</th>
                  <th className="py-3 px-4 text-left font-xs font-semibold text-gray-700">Gross Salary</th>
                  <th className="py-3 px-4 text-left font-xs font-semibold text-gray-700">Deductions</th>
                  <th className="py-3 px-4 text-left font-xs font-semibold text-gray-700">Net Salary</th>
                  <th className="py-3 px-4 text-left font-xs font-semibold text-gray-700">Status</th>
                  <th className="py-3 px-4 text-left font-xs font-semibold text-gray-700">Payment Date</th>
                  <th className="py-3 px-4 text-left font-xs font-semibold text-gray-700">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {payrollData.map((payroll) => (
                  <tr key={payroll.id} className="hover:bg-gray-50">
                    <td className="py-4 px-4 font-mono font-xs text-gray-500">
                      #{payroll.id.toString().padStart(4, '0')}
                    </td>
                    <td className="py-4 px-4">
                      <p className="font-medium">{payroll.employee_name}</p>
                      <p className="font-xs text-gray-500">{payroll.position}</p>
                    </td>
                    <td className="py-4 px-4">
                      {new Date(payroll.cutoff_start).toLocaleDateString('en-PH', { month: 'short', year: 'numeric' })}
                    </td>
                    <td className="py-4 px-4">
                      <span className="px-2 py-1 bg-blue-100 text-blue-800 rounded text-xs">
                        {payroll.cutoff_type || 'Full Month'}
                      </span>
                    </td>
                    <td className="py-4 px-4 font-semibold">
                      {formatCurrency(payroll.basic_salary + (payroll.allowances || 0))}
                    </td>
                    <td className="py-4 px-4">
                      <div className="text-red-600 font-medium">-{formatCurrency(payroll.deductions)}</div>
                      <div className="text-xs text-gray-500 mt-1">Includes tax & contributions</div>
                    </td>
                    <td className="py-4 px-4">
                      <p className="font-bold text-lg text-green-600">
                        {formatCurrency(payroll.net_salary)}
                      </p>
                    </td>
                    <td className="py-4 px-4">
                      <span className={`inline-flex items-center px-3 py-1 rounded-full font-xs font-medium ${getStatusColor(payroll.status)}`}>
                        {getStatusIcon(payroll.status)}
                        {payroll.status}
                      </span>
                    </td>
                    <td className="py-4 px-4">
                      {payroll.payment_date ? (
                        new Date(payroll.payment_date).toLocaleDateString('en-PH')
                      ) : (
                        <span className="text-gray-400">Not paid</span>
                      )}
                    </td>
                    <td className="py-4 px-4">
                      <div className="flex gap-2">
                        <button
                          onClick={() => setSelectedPayroll(payroll)}
                          className="px-3 py-1 font-xs bg-blue-100 text-blue-700 rounded-lg hover:bg-blue-200"
                        >
                          Details
                        </button>
                        <button
                          className="p-2 hover:bg-gray-100 rounded-lg"
                          title="Send Payslip"
                        >
                          <Send size={16} className="text-blue-600" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {viewMode === 'process' && (
        <div className="bg-white rounded-xl border border-gray-200 p-6">
          <div className="flex justify-between items-center mb-6">
            <div>
              <h3 className="text-lg font-semibold">
                {selectedPeriod.cutoffType === 'Full Month' ? 'Process Monthly Payroll' : `Process ${selectedPeriod.cutoffType} Payroll`}
              </h3>
              <p className="text-gray-600">
                {selectedPeriod.cutoffType === 'Full Month'
                  ? `${months[selectedPeriod.month - 1]} ${selectedPeriod.year} • 24 working days`
                  : `${selectedPeriod.cutoffType} of ${months[selectedPeriod.month - 1]} ${selectedPeriod.year} • 12 working days`}
              </p>
            </div>
            <button
              onClick={selectedPeriod.cutoffType === 'Full Month' ? processMonthlyPayroll : processBiMonthlyPayroll}
              disabled={processing || (selectedPeriod.cutoffType !== 'Full Month' && cutoffAttendance.length === 0)}
              className="flex items-center gap-2 px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {processing ? (
                <>
                  <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                  Processing...
                </>
              ) : (
                <>
                  <Calculator size={18} />
                  {selectedPeriod.cutoffType === 'Full Month' ? 'Process Monthly Payroll' : `Process ${selectedPeriod.cutoffType}`}
                </>
              )}
            </button>
          </div>

          <div className="bg-white rounded-3xl border border-gray-100 p-8 shadow-sm">
            <div className="flex justify-between items-center mb-8 pb-4 border-b border-gray-50">
              <div>
                <h3 className="text-xl font-black text-gray-900 tracking-tight">Generate Payroll</h3>
                <p className="text-gray-500 font-medium">Step 2: Review calculation breakdown for {selectedPeriod.cutoffType}</p>
              </div>
              <button
                onClick={() => {
                  if (selectedPeriod.cutoffType === 'Full Month') {
                    processMonthlyPayroll();
                  } else {
                    processBiMonthlyPayroll();
                  }
                }}
                className="px-8 py-3 bg-blue-600 text-white font-black rounded-2xl hover:bg-blue-700 transition-all shadow-lg shadow-blue-100 flex items-center gap-2 group"
              >
                Confirm & Finalize
                <TrendingUp size={18} className="group-hover:translate-x-1 transition-transform" />
              </button>
            </div>

            {/* Payroll Preview Header */}
            <div className="mb-6 px-4 py-3 bg-blue-50/50 rounded-2xl border border-blue-100/50 flex items-center gap-3">
              <AlertCircle size={18} className="text-blue-500" />
              <p className="text-sm font-bold text-blue-700">Previewing {selectedPeriod.cutoffType === 'Full Month' ? employees.length : cutoffAttendance.length} records. Please verify totals before finalizing.</p>
            </div>

            <div className="overflow-hidden rounded-2xl border border-gray-100 mb-8">
              <table className="w-full">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="py-4 px-6 text-left text-[10px] font-black text-gray-400 uppercase tracking-widest">Employee</th>
                    {selectedPeriod.cutoffType !== 'Full Month' && (
                      <>
                        <th className="py-4 px-6 text-left text-[10px] font-black text-gray-400 uppercase tracking-widest">Attendance</th>
                        <th className="py-4 px-6 text-left text-[10px] font-black text-gray-400 uppercase tracking-widest">Daily Rate</th>
                      </>
                    )}
                    <th className="py-4 px-6 text-left text-[10px] font-black text-gray-400 uppercase tracking-widest">Gross</th>
                    <th className="py-4 px-6 text-left text-[10px] font-black text-gray-400 uppercase tracking-widest">SSS/PH/PIG</th>
                    <th className="py-4 px-6 text-left text-[10px] font-black text-gray-400 uppercase tracking-widest">Tax (2025)</th>
                    <th className="py-4 px-6 text-right text-[10px] font-black text-gray-400 uppercase tracking-widest">Net Payable</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {(selectedPeriod.cutoffType === 'Full Month'
                    ? employees.filter(e => e.status === 'Active')
                    : cutoffAttendance.map(emp => {
                      const employee = employees.find(e => e.id === emp.employee_id);
                      return employee ? { ...employee, attendance: emp } : null;
                    }).filter(Boolean)
                  ).map((employee) => {
                    const breakdown = selectedPeriod.cutoffType === 'Full Month'
                      ? calculateMonthlyPayrollForEmployee(employee)
                      : calculateBiMonthlyPayrollForEmployee(employee, employee.attendance);

                    return (
                      <tr key={employee.id} className="hover:bg-gray-50/50 transition-colors">
                        <td className="py-4 px-6">
                          <p className="text-sm font-bold text-gray-900 leading-tight">{employee.first_name} {employee.last_name}</p>
                          <p className="text-[10px] text-gray-400 font-medium uppercase tracking-wider">{employee.position}</p>
                        </td>
                        {selectedPeriod.cutoffType !== 'Full Month' && (
                          <>
                            <td className="py-4 px-6">
                              <span className="text-xs font-black text-gray-700">{employee.attendance?.days_present || 0}d</span>
                            </td>
                            <td className="py-4 px-6 text-xs font-bold text-gray-500">
                              {formatCurrency(breakdown.dailyRate)}
                            </td>
                          </>
                        )}
                        <td className="py-4 px-6">
                          <span className="text-xs font-bold text-gray-700">{formatCurrency(breakdown.basicSalary)}</span>
                        </td>
                        <td className="py-4 px-6">
                          <span className="text-xs font-bold text-red-400">-{formatCurrency(breakdown.deductions.mandatory.sss.employee + breakdown.deductions.mandatory.philhealth.employee + breakdown.deductions.mandatory.pagibig.employee)}</span>
                        </td>
                        <td className="py-4 px-6">
                          <span className="text-xs font-bold text-red-500">-{formatCurrency(breakdown.deductions.incomeTax)}</span>
                        </td>
                        <td className="py-4 px-6 text-right">
                          <p className="text-sm font-black text-blue-600">
                            {formatCurrency(breakdown.netSalary)}
                          </p>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Process Summary Section */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-6 p-6 bg-gray-50 rounded-3xl border border-gray-100">
              <div>
                <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1">Batch Count</p>
                <p className="text-2xl font-black text-gray-900">
                  {selectedPeriod.cutoffType === 'Full Month'
                    ? employees.filter(e => e.status === 'Active').length
                    : calculateBiMonthlySummary().totalEmployees}
                </p>
              </div>
              <div>
                <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1">Total Liability</p>
                <p className="text-2xl font-black text-gray-900">
                  {formatCurrency(
                    selectedPeriod.cutoffType === 'Full Month'
                      ? employees.filter(e => e.status === 'Active').reduce((sum, e) => sum + (e.salary || 0), 0)
                      : calculateBiMonthlySummary().totalGrossPay
                  )}
                </p>
              </div>
              <div>
                <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1">Mandatory Deductions</p>
                <p className="text-2xl font-black text-red-500">
                  {formatCurrency(
                    selectedPeriod.cutoffType === 'Full Month'
                      ? employees.filter(e => e.status === 'Active').reduce((sum, employee) => {
                        const breakdown = calculateMonthlyPayrollForEmployee(employee);
                        return sum + breakdown.deductions.total;
                      }, 0)
                      : calculateBiMonthlySummary().totalDeductions
                  )}
                </p>
              </div>
              <div>
                <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1">Net Distribution</p>
                <p className="text-2xl font-black text-green-600">
                  {formatCurrency(
                    selectedPeriod.cutoffType === 'Full Month'
                      ? employees.filter(e => e.status === 'Active').reduce((sum, employee) => {
                        const breakdown = calculateMonthlyPayrollForEmployee(employee);
                        return sum + breakdown.netSalary;
                      }, 0)
                      : calculateBiMonthlySummary().totalNetPay
                  )}
                </p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Payroll Detail Modal */}
      {selectedPayroll && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-xl max-w-4xl w-full max-h-[90vh] overflow-y-auto">
            <div className="p-6 border-b border-gray-200">
              <div className="flex justify-between items-center">
                <div>
                  <h3 className="text-l font-bold">Payroll Details</h3>
                  <p className="text-gray-600">
                    #{selectedPayroll.id.toString().padStart(4, '0')} • {selectedPayroll.employee_name}
                    {selectedPayroll.cutoff_type && ` • ${selectedPayroll.cutoff_type}`}
                  </p>
                </div>
                <button
                  onClick={() => setSelectedPayroll(null)}
                  className="text-gray-400 hover:text-gray-600"
                >
                  ✕
                </button>
              </div>
            </div>

            <div className="p-6">
              {selectedPayroll.breakdown ? (
                <div className="space-y-6">
                  <PayrollBreakdownView breakdown={JSON.parse(selectedPayroll.breakdown)} />
                </div>
              ) : (
                <div className="text-center py-8 text-gray-500">
                  No detailed breakdown available
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

// Payroll Breakdown Component
const PayrollBreakdownView = ({ breakdown }) => {
  const formatCurrency = (amount) => {
    return new Intl.NumberFormat('en-PH', {
      style: 'currency',
      currency: 'PHP',
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    }).format(amount);
  };

  const annualIncome = breakdown.cutoffType ? breakdown.halfMonthSalary * 24 : breakdown.basicSalary * 12;

  return (
    <div className="space-y-8">
      {/* Cutoff & Basic Info */}
      <div className="flex flex-col md:flex-row gap-6">
        <div className="flex-1 bg-gradient-to-br from-gray-50 to-white p-5 rounded-2xl border border-gray-100 shadow-sm">
          <div className="flex items-center gap-4 mb-4">
            <div className="bg-blue-100 p-3 rounded-xl text-blue-600">
              <CalendarDays size={20} />
            </div>
            <div>
              <h4 className="text-sm font-bold text-gray-900">Cutoff Details</h4>
              <p className="text-xs text-gray-500">{breakdown.cutoffType || 'Full Month Report'}</p>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <p className="text-[10px] uppercase tracking-wider text-gray-400 font-bold">Attendance</p>
              <p className="text-sm font-semibold text-gray-700">{breakdown.daysPresent || 0} / {breakdown.workingDays || 24} Days</p>
            </div>
            <div>
              <p className="text-[10px] uppercase tracking-wider text-gray-400 font-bold">Daily Rate</p>
              <p className="text-sm font-semibold text-gray-700">{formatCurrency(breakdown.dailyRate)}</p>
            </div>
          </div>
        </div>

        <div className="flex-1 bg-gradient-to-br from-gray-50 to-white p-5 rounded-2xl border border-gray-100 shadow-sm">
          <div className="flex items-center gap-4 mb-4">
            <div className="bg-purple-100 p-3 rounded-xl text-purple-600">
              <TrendingUp size={20} />
            </div>
            <div>
              <h4 className="text-sm font-bold text-gray-900">Annual Projection</h4>
              <p className="text-xs text-gray-500">For Tax Computation</p>
            </div>
          </div>
          <div className="grid grid-cols-1 gap-4">
            <div>
              <p className="text-[10px] uppercase tracking-wider text-gray-400 font-bold">Est. Annual Taxable Income</p>
              <p className="text-lg font-black text-purple-600">{formatCurrency(annualIncome)}</p>
            </div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
        {/* Earnings */}
        <div className="space-y-4">
          <div className="flex items-center gap-2 border-b border-gray-100 pb-2">
            <Banknote size={18} className="text-green-600" />
            <h4 className="font-bold text-gray-900">Earnings</h4>
          </div>
          <div className="space-y-3">
            <div className="flex justify-between text-sm">
              <span className="text-gray-600 font-medium">Basic Pay (Adjusted)</span>
              <span className="font-bold text-gray-900">{formatCurrency(breakdown.basicSalary)}</span>
            </div>
            {breakdown.allowances > 0 && (
              <div className="flex justify-between text-sm">
                <span className="text-gray-600 font-medium">Fixed Allowances</span>
                <span className="font-bold text-green-600">+{formatCurrency(breakdown.allowances)}</span>
              </div>
            )}
            <div className="flex justify-between text-base border-t border-dashed border-gray-200 pt-3">
              <span className="font-black text-gray-900">Gross Earnings</span>
              <span className="font-black text-gray-900">{formatCurrency(breakdown.grossSalary)}</span>
            </div>
          </div>
        </div>

        {/* Deductions */}
        <div className="space-y-4">
          <div className="flex items-center gap-2 border-b border-gray-100 pb-2">
            <Receipt size={18} className="text-red-600" />
            <h4 className="font-bold text-gray-900">Deductions</h4>
          </div>
          <div className="space-y-3">
            <div className="p-3 bg-red-50/50 rounded-xl space-y-2">
              <div className="flex justify-between text-xs">
                <span className="text-gray-500 font-medium">SSS Premium</span>
                <span className="font-bold text-red-600">-{formatCurrency(breakdown.deductions.mandatory.sss.employee)}</span>
              </div>
              <div className="flex justify-between text-xs">
                <span className="text-gray-500 font-medium">PhilHealth</span>
                <span className="font-bold text-red-600">-{formatCurrency(breakdown.deductions.mandatory.philhealth.employee)}</span>
              </div>
              <div className="flex justify-between text-xs">
                <span className="text-gray-500 font-medium">Pag-IBIG</span>
                <span className="font-bold text-red-600">-{formatCurrency(breakdown.deductions.mandatory.pagibig.employee)}</span>
              </div>
            </div>

            <div className="flex justify-between text-sm items-center">
              <div className="group relative">
                <span className="text-gray-600 font-medium border-b border-dotted border-gray-400 cursor-help">Income Tax (TRAIN 2025)</span>
                <div className="opacity-0 group-hover:opacity-100 transition-opacity absolute bottom-full left-0 mb-2 w-64 p-3 bg-gray-900 text-white text-[10px] rounded-lg pointer-events-none z-10 shadow-xl">
                  Computed by annualizing current earnings to find the correct tax bracket for this month. 2025 rates applied.
                </div>
              </div>
              <span className="font-bold text-red-600">-{formatCurrency(breakdown.deductions.incomeTax)}</span>
            </div>

            {breakdown.deductions.otherDeductions > 0 && (
              <div className="flex justify-between text-sm">
                <span className="text-gray-600 font-medium">Other Deductions</span>
                <span className="font-bold text-red-600">-{formatCurrency(breakdown.deductions.otherDeductions)}</span>
              </div>
            )}

            <div className="flex justify-between text-base border-t border-dashed border-gray-200 pt-3">
              <span className="font-black text-gray-900">Total Deductions</span>
              <span className="font-black text-red-600">-{formatCurrency(breakdown.deductions.total)}</span>
            </div>
          </div>
        </div>
      </div>

      {/* Net Pay Highlight */}
      <div className="bg-gradient-to-r from-blue-600 to-blue-700 p-6 rounded-2xl text-white shadow-lg shadow-blue-200">
        <div className="flex justify-between items-end">
          <div>
            <p className="text-blue-100 text-sm font-medium mb-1 uppercase tracking-widest">Net Take-Home Pay</p>
            <h3 className="text-4xl font-black">{formatCurrency(breakdown.netSalary)}</h3>
          </div>
          <div className="text-right">
            <p className="text-blue-100 text-[10px] font-bold uppercase mb-1">Total Liability to Employer</p>
            <p className="text-xl font-bold bg-white/20 px-3 py-1 rounded-lg inline-block">
              {formatCurrency(breakdown.grossSalary + (breakdown.employerContributions?.total || 0))}
            </p>
          </div>
        </div>
      </div>

      {/* Employer Section */}
      <div className="bg-gray-50 rounded-2xl p-5 border border-gray-200">
        <h5 className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-4">Employer Share (Non-deductible)</h5>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div>
            <p className="text-xs text-gray-500 mb-1">SSS ER</p>
            <p className="font-bold text-gray-700">{formatCurrency(breakdown.employerContributions.sss)}</p>
          </div>
          <div>
            <p className="text-xs text-gray-500 mb-1">PhilHealth ER</p>
            <p className="font-bold text-gray-700">{formatCurrency(breakdown.employerContributions.philhealth)}</p>
          </div>
          <div>
            <p className="text-xs text-gray-500 mb-1">Pag-IBIG ER</p>
            <p className="font-bold text-gray-700">{formatCurrency(breakdown.employerContributions.pagibig)}</p>
          </div>
          <div>
            <p className="text-xs text-gray-500 mb-1">Total ER Share</p>
            <p className="font-black text-blue-600">{formatCurrency(breakdown.employerContributions.total)}</p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Payroll;