import React, { useState, useEffect } from 'react';
import { 
  PhilippinePeso, Download, Printer, Send, CheckCircle, Clock, 
  Users, FileText, Calculator, Calendar, Banknote, Receipt,
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
    const incomeTax = PhilippinePayrollCalculator.calculateMonthlyIncomeTax(basicSalary);
    
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
      
      const period_start = `${year}-${month.toString().padStart(2, '0')}-${startDay}`;
      const period_end = `${year}-${month.toString().padStart(2, '0')}-${endDay}`;
      
      // Process each employee with attendance
      for (const emp of cutoffAttendance) {
        const employee = employees.find(e => e.id === emp.employee_id);
        if (!employee) continue;

        const breakdown = calculateBiMonthlyPayrollForEmployee(employee, emp);
        
        const payrollData = {
          employee_id: emp.employee_id,
          period_start,
          period_end,
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
          period_start: `${selectedPeriod.year}-${selectedPeriod.month.toString().padStart(2, '0')}-01`,
          period_end: `${selectedPeriod.year}-${selectedPeriod.month.toString().padStart(2, '0')}-${new Date(selectedPeriod.year, selectedPeriod.month, 0).getDate()}`,
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
          <h1 className="text-2xl font-bold text-gray-900">Payroll Management</h1>
          <p className="text-gray-600 mt-1">
            {selectedPeriod.cutoffType === 'Full Month' 
              ? 'Monthly payroll processing (24 working days)' 
              : `${selectedPeriod.cutoffType} payroll (12 working days, cutoff on ${selectedPeriod.cutoffType === 'First Half' ? '10th' : '25th'})`}
          </p>
        </div>
        <div className="flex gap-3">
          <div className="flex gap-2">
            <select
              value={selectedPeriod.month}
              onChange={(e) => setSelectedPeriod({...selectedPeriod, month: parseInt(e.target.value)})}
              className="px-3 py-2 border border-gray-300 rounded-lg bg-white"
            >
              {months.map((month, index) => (
                <option key={index} value={index + 1}>{month}</option>
              ))}
            </select>
            <select
              value={selectedPeriod.year}
              onChange={(e) => setSelectedPeriod({...selectedPeriod, year: parseInt(e.target.value)})}
              className="px-3 py-2 border border-gray-300 rounded-lg bg-white"
            >
              {years.map(year => (
                <option key={year} value={year}>{year}</option>
              ))}
            </select>
            <select
              value={selectedPeriod.cutoffType}
              onChange={(e) => setSelectedPeriod({...selectedPeriod, cutoffType: e.target.value})}
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
        <div className="bg-white rounded-xl border border-gray-200 p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-600">Total Payroll</p>
              <p className="text-2xl font-bold">
                {formatCurrency(payrollData.reduce((sum, p) => sum + p.net_salary, 0))}
              </p>
            </div>
            <Banknote className="text-blue-500" size={24} />
          </div>
          <div className="mt-2 text-sm text-gray-500">
            {payrollData.filter(p => p.status === 'Paid').length} paid • {selectedPeriod.cutoffType}
          </div>
        </div>

        <div className="bg-white rounded-xl border border-gray-200 p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-600">Active Employees</p>
              <p className="text-2xl font-bold">
                {employees.filter(e => e.status === 'Active').length}
              </p>
            </div>
            <Users className="text-green-500" size={24} />
          </div>
          <div className="mt-2 text-sm text-gray-500">
            Total: {employees.length}
          </div>
        </div>

        <div className="bg-white rounded-xl border border-gray-200 p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-600">Pending Payments</p>
              <p className="text-2xl font-bold">
                {payrollData.filter(p => p.status === 'Pending').length}
              </p>
            </div>
            <Clock className="text-yellow-500" size={24} />
          </div>
          <div className="mt-2 text-sm text-gray-500">
            Require processing
          </div>
        </div>

        <div className="bg-white rounded-xl border border-gray-200 p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-600">Avg. Net Pay</p>
              <p className="text-2xl font-bold">
                {formatCurrency(
                  payrollData.length > 0 
                    ? payrollData.reduce((sum, p) => sum + p.net_salary, 0) / payrollData.length
                    : 0
                )}
              </p>
            </div>
            <PhilippinePeso className="text-purple-500" size={24} />
          </div>
          <div className="mt-2 text-sm text-gray-500">
            Average take-home pay
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="border-b border-gray-200">
        <nav className="-mb-px flex space-x-8">
          <button
            onClick={() => setViewMode('summary')}
            className={`py-4 px-1 border-b-2 font-medium text-sm ${
              viewMode === 'summary'
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
            className={`py-4 px-1 border-b-2 font-medium text-sm ${
              viewMode === 'details'
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
            className={`py-4 px-1 border-b-2 font-medium text-sm ${
              viewMode === 'process'
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
                  <p className="text-gray-600 text-sm">
                    {selectedPeriod.cutoffType} • {getMonthName(selectedPeriod.year, selectedPeriod.month)}
                  </p>
                </div>
                <button
                  onClick={() => setShowCutoffDetails(!showCutoffDetails)}
                  className="flex items-center gap-2 px-3 py-1 text-sm bg-gray-100 rounded-lg hover:bg-gray-200"
                >
                  {showCutoffDetails ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                  {showCutoffDetails ? 'Hide Details' : 'Show Details'}
                </button>
              </div>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="py-3 px-4 text-left text-sm font-semibold text-gray-700">Employee</th>
                    {showCutoffDetails && selectedPeriod.cutoffType !== 'Full Month' && (
                      <>
                        <th className="py-3 px-4 text-left text-sm font-semibold text-gray-700">Days Present</th>
                        <th className="py-3 px-4 text-left text-sm font-semibold text-gray-700">Daily Rate</th>
                      </>
                    )}
                    <th className="py-3 px-4 text-left text-sm font-semibold text-gray-700">Basic Salary</th>
                    <th className="py-3 px-4 text-left text-sm font-semibold text-gray-700">Deductions</th>
                    <th className="py-3 px-4 text-left text-sm font-semibold text-gray-700">Net Pay</th>
                    <th className="py-3 px-4 text-left text-sm font-semibold text-gray-700">Status</th>
                    <th className="py-3 px-4 text-left text-sm font-semibold text-gray-700">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200">
                  {payrollData.slice(0, 5).map((payroll) => (
                    <tr key={payroll.id} className="hover:bg-gray-50">
                      <td className="py-4 px-4">
                        <p className="font-medium">{payroll.employee_name}</p>
                        <p className="text-sm text-gray-500">{payroll.position}</p>
                      </td>
                      {showCutoffDetails && selectedPeriod.cutoffType !== 'Full Month' && (
                        <>
                          <td className="py-4 px-4">
                            <div className="flex items-center">
                              <span className="font-medium">{payroll.days_present || 0}</span>
                              <span className="text-sm text-gray-500 ml-2">/ {payroll.working_days || 12} days</span>
                            </div>
                          </td>
                          <td className="py-4 px-4">
                            {formatCurrency(payroll.daily_rate || 0)}
                          </td>
                        </>
                      )}
                      <td className="py-4 px-4 font-semibold">
                        {formatCurrency(payroll.basic_salary)}
                      </td>
                      <td className="py-4 px-4 text-red-600 font-medium">
                        -{formatCurrency(payroll.deductions)}
                      </td>
                      <td className="py-4 px-4">
                        <p className="font-bold text-lg text-green-600">
                          {formatCurrency(payroll.net_salary)}
                        </p>
                      </td>
                      <td className="py-4 px-4">
                        <span className={`inline-flex items-center px-3 py-1 rounded-full text-sm font-medium ${getStatusColor(payroll.status)}`}>
                          {getStatusIcon(payroll.status)}
                          {payroll.status}
                        </span>
                      </td>
                      <td className="py-4 px-4">
                        <div className="flex gap-2">
                          <button 
                            onClick={() => setSelectedPayroll(payroll)}
                            className="px-3 py-1 text-sm bg-blue-100 text-blue-700 rounded-lg hover:bg-blue-200"
                          >
                            View
                          </button>
                          {payroll.status === 'Pending' && (
                            <button 
                              onClick={async () => {
                                try {
                                  await window.electronAPI.markPayrollAsPaid(payroll.id);
                                  loadPayrollData();
                                  alert('Payroll marked as paid!');
                                } catch (error) {
                                  alert('Error marking as paid: ' + error.message);
                                }
                              }}
                              className="px-3 py-1 text-sm bg-green-100 text-green-700 rounded-lg hover:bg-green-200"
                            >
                              Mark Paid
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
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
              <p className="text-gray-600 text-sm">Complete payroll history</p>
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
                  <th className="py-3 px-4 text-left text-sm font-semibold text-gray-700">ID</th>
                  <th className="py-3 px-4 text-left text-sm font-semibold text-gray-700">Employee</th>
                  <th className="py-3 px-4 text-left text-sm font-semibold text-gray-700">Period</th>
                  <th className="py-3 px-4 text-left text-sm font-semibold text-gray-700">Cutoff</th>
                  <th className="py-3 px-4 text-left text-sm font-semibold text-gray-700">Gross Salary</th>
                  <th className="py-3 px-4 text-left text-sm font-semibold text-gray-700">Deductions</th>
                  <th className="py-3 px-4 text-left text-sm font-semibold text-gray-700">Net Salary</th>
                  <th className="py-3 px-4 text-left text-sm font-semibold text-gray-700">Status</th>
                  <th className="py-3 px-4 text-left text-sm font-semibold text-gray-700">Payment Date</th>
                  <th className="py-3 px-4 text-left text-sm font-semibold text-gray-700">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {payrollData.map((payroll) => (
                  <tr key={payroll.id} className="hover:bg-gray-50">
                    <td className="py-4 px-4 font-mono text-sm text-gray-500">
                      #{payroll.id.toString().padStart(4, '0')}
                    </td>
                    <td className="py-4 px-4">
                      <p className="font-medium">{payroll.employee_name}</p>
                      <p className="text-sm text-gray-500">{payroll.position}</p>
                    </td>
                    <td className="py-4 px-4">
                      {new Date(payroll.period_start).toLocaleDateString('en-PH', { month: 'short', year: 'numeric' })}
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
                      <span className={`inline-flex items-center px-3 py-1 rounded-full text-sm font-medium ${getStatusColor(payroll.status)}`}>
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
                          className="px-3 py-1 text-sm bg-blue-100 text-blue-700 rounded-lg hover:bg-blue-200"
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

          {/* Payroll Preview */}
          <div className="mb-6">
            <h4 className="font-medium text-gray-700 mb-4">Payroll Preview</h4>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="py-3 px-4 text-left text-sm font-semibold text-gray-700">Employee</th>
                    <th className="py-3 px-4 text-left text-sm font-semibold text-gray-700">Position</th>
                    {selectedPeriod.cutoffType !== 'Full Month' && (
                      <>
                        <th className="py-3 px-4 text-left text-sm font-semibold text-gray-700">Monthly Salary</th>
                        <th className="py-3 px-4 text-left text-sm font-semibold text-gray-700">Days Present</th>
                        <th className="py-3 px-4 text-left text-sm font-semibold text-gray-700">Daily Rate</th>
                      </>
                    )}
                    <th className="py-3 px-4 text-left text-sm font-semibold text-gray-700">Basic Salary</th>
                    <th className="py-3 px-4 text-left text-sm font-semibold text-gray-700">SSS</th>
                    <th className="py-3 px-4 text-left text-sm font-semibold text-gray-700">PhilHealth</th>
                    <th className="py-3 px-4 text-left text-sm font-semibold text-gray-700">Pag-IBIG</th>
                    <th className="py-3 px-4 text-left text-sm font-semibold text-gray-700">Income Tax</th>
                    <th className="py-3 px-4 text-left text-sm font-semibold text-gray-700">Net Pay</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200">
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
                      <tr key={employee.id} className="hover:bg-gray-50">
                        <td className="py-4 px-4">
                          <p className="font-medium">{employee.first_name} {employee.last_name}</p>
                          <p className="text-sm text-gray-500">{employee.company_id}</p>
                        </td>
                        <td className="py-4 px-4">{employee.position}</td>
                        {selectedPeriod.cutoffType !== 'Full Month' && (
                          <>
                            <td className="py-4 px-4 font-semibold">
                              {formatCurrency(employee.salary)}
                            </td>
                            <td className="py-4 px-4">
                              <div className="flex items-center">
                                <span className="font-medium">{employee.attendance?.days_present || 0}</span>
                                <span className="text-sm text-gray-500 ml-2">/ 12 days</span>
                              </div>
                            </td>
                            <td className="py-4 px-4">
                              {formatCurrency(breakdown.dailyRate)}
                            </td>
                          </>
                        )}
                        <td className="py-4 px-4 font-semibold">
                          {formatCurrency(breakdown.basicSalary)}
                        </td>
                        <td className="py-4 px-4 text-red-600">
                          -{formatCurrency(breakdown.deductions.mandatory.sss.employee)}
                        </td>
                        <td className="py-4 px-4 text-red-600">
                          -{formatCurrency(breakdown.deductions.mandatory.philhealth.employee)}
                        </td>
                        <td className="py-4 px-4 text-red-600">
                          -{formatCurrency(breakdown.deductions.mandatory.pagibig.employee)}
                        </td>
                        <td className="py-4 px-4 text-red-600 font-medium">
                          -{formatCurrency(breakdown.deductions.incomeTax)}
                        </td>
                        <td className="py-4 px-4">
                          <p className="font-bold text-green-600">
                            {formatCurrency(breakdown.netSalary)}
                          </p>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {/* Summary */}
          <div className="p-4 bg-gray-50 rounded-lg border border-gray-200">
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              <div>
                <p className="text-sm text-gray-600">Total Employees</p>
                <p className="text-2xl font-bold">
                  {selectedPeriod.cutoffType === 'Full Month' 
                    ? employees.filter(e => e.status === 'Active').length
                    : calculateBiMonthlySummary().totalEmployees}
                </p>
              </div>
              <div>
                <p className="text-sm text-gray-600">Total Gross Salary</p>
                <p className="text-2xl font-bold">
                  {formatCurrency(
                    selectedPeriod.cutoffType === 'Full Month' 
                      ? employees.filter(e => e.status === 'Active').reduce((sum, e) => sum + (e.salary || 0), 0)
                      : calculateBiMonthlySummary().totalGrossPay
                  )}
                </p>
              </div>
              <div>
                <p className="text-sm text-gray-600">Total Deductions</p>
                <p className="text-2xl font-bold text-red-600">
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
                <p className="text-sm text-gray-600">Total Net Pay</p>
                <p className="text-2xl font-bold text-green-600">
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
                  <h3 className="text-xl font-bold">Payroll Details</h3>
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

  return (
    <div className="space-y-6">
      {/* Cutoff Information */}
      {breakdown.cutoffType && (
        <div className="bg-blue-50 p-4 rounded-lg border border-blue-100">
          <div className="flex items-center gap-3">
            <CalendarDays className="text-blue-500" />
            <div>
              <h4 className="font-semibold text-gray-700">{breakdown.cutoffType}</h4>
              <p className="text-sm text-gray-600">
                {breakdown.workingDays} working days • {breakdown.daysPresent || 12} days present
              </p>
              <p className="text-sm text-gray-600">
                Daily Rate: {formatCurrency(breakdown.dailyRate)}
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Earnings */}
      <div>
        <h4 className="font-semibold text-gray-700 mb-3">Earnings</h4>
        <div className="space-y-2">
          <div className="flex justify-between">
            <span>Basic Salary:</span>
            <span className="font-semibold">{formatCurrency(breakdown.basicSalary)}</span>
          </div>
          {breakdown.allowances > 0 && (
            <div className="flex justify-between">
              <span>Allowances:</span>
              <span className="font-semibold text-green-600">+{formatCurrency(breakdown.allowances)}</span>
            </div>
          )}
          <div className="flex justify-between border-t border-gray-200 pt-2">
            <span className="font-medium">Gross Salary:</span>
            <span className="font-bold">{formatCurrency(breakdown.grossSalary)}</span>
          </div>
        </div>
      </div>

      {/* Deductions */}
      <div>
        <h4 className="font-semibold text-gray-700 mb-3">Deductions</h4>
        <div className="space-y-4">
          <div>
            <h5 className="text-sm font-medium text-gray-600 mb-2">Mandatory Contributions</h5>
            <div className="space-y-2 ml-4">
              <div className="flex justify-between">
                <span>SSS:</span>
                <span className="text-red-600">-{formatCurrency(breakdown.deductions.mandatory.sss.employee)}</span>
              </div>
              <div className="flex justify-between">
                <span>PhilHealth:</span>
                <span className="text-red-600">-{formatCurrency(breakdown.deductions.mandatory.philhealth.employee)}</span>
              </div>
              <div className="flex justify-between">
                <span>Pag-IBIG:</span>
                <span className="text-red-600">-{formatCurrency(breakdown.deductions.mandatory.pagibig.employee)}</span>
              </div>
            </div>
          </div>
          
          <div className="flex justify-between border-t border-gray-200 pt-2">
            <span>Income Tax:</span>
            <span className="text-red-600 font-medium">-{formatCurrency(breakdown.deductions.incomeTax)}</span>
          </div>
          
          {breakdown.deductions.otherDeductions > 0 && (
            <div className="flex justify-between">
              <span>Other Deductions:</span>
              <span className="text-red-600">-{formatCurrency(breakdown.deductions.otherDeductions)}</span>
            </div>
          )}
          
          <div className="flex justify-between border-t border-gray-200 pt-2">
            <span className="font-medium">Total Deductions:</span>
            <span className="font-bold text-red-600">-{formatCurrency(breakdown.deductions.total)}</span>
          </div>
        </div>
      </div>

      {/* Employer Contributions */}
      <div>
        <h4 className="font-semibold text-gray-700 mb-3">Employer Contributions</h4>
        <div className="space-y-2 ml-4">
          <div className="flex justify-between">
            <span>SSS:</span>
            <span>{formatCurrency(breakdown.employerContributions.sss)}</span>
          </div>
          <div className="flex justify-between">
            <span>PhilHealth:</span>
            <span>{formatCurrency(breakdown.employerContributions.philhealth)}</span>
          </div>
          <div className="flex justify-between">
            <span>Pag-IBIG:</span>
            <span>{formatCurrency(breakdown.employerContributions.pagibig)}</span>
          </div>
          <div className="flex justify-between border-t border-gray-200 pt-2">
            <span className="font-medium">Total Employer Cost:</span>
            <span className="font-bold">{formatCurrency(breakdown.employerContributions.total)}</span>
          </div>
        </div>
      </div>

      {/* Summary */}
      <div className="bg-green-50 p-4 rounded-lg border border-green-100">
        <div className="flex justify-between items-center">
          <div>
            <p className="text-sm text-gray-600">Net Salary (Take Home Pay)</p>
            <p className="text-3xl font-bold text-green-600">{formatCurrency(breakdown.netSalary)}</p>
          </div>
          <div className="text-right">
            <p className="text-sm text-gray-600">Total Employment Cost</p>
            <p className="text-xl font-bold">
              {formatCurrency(breakdown.grossSalary + breakdown.employerContributions.total)}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Payroll;