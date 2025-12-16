import React, { useState, useEffect } from 'react';
import { PhilippinePeso, Download, Printer, Send, CheckCircle, Clock, Calendar } from 'lucide-react';

const PayrollSummary = () => {
  const [payrollData, setPayrollData] = useState({
    employees: [],
    total: 0,
    paid: 0,
    pending: 0
  });
  const [loading, setLoading] = useState(true);
  const [selectedMonth, setSelectedMonth] = useState(
    new Date().toISOString().split('T')[0].substring(0, 7) // YYYY-MM
  );

  useEffect(() => {
    loadPayrollData();
  }, [selectedMonth]);

  const loadPayrollData = async () => {
    try {
      setLoading(true);
      
      // Get current month payroll data
      const [year, month] = selectedMonth.split('-').map(Number);
      
      // Get all payroll records for the selected month
      const allPayroll = await window.electronAPI.getAllPayroll();
      
      // Filter for the selected month
      const currentMonthPayroll = allPayroll.filter(p => {
        const payrollDate = new Date(p.period_start);
        return payrollDate.getFullYear() === year && 
               (payrollDate.getMonth() + 1) === month;
      });
      
      // Transform data for the component
      const employees = currentMonthPayroll.map(payroll => ({
        id: payroll.id,
        employee: payroll.employee_name,
        position: payroll.position,
        salary: payroll.basic_salary,
        bonus: payroll.allowances || 0,
        deductions: payroll.deductions || 0,
        netPay: payroll.net_salary,
        status: payroll.status || 'Pending',
        payDate: payroll.payment_date ? 
          new Date(payroll.payment_date).toLocaleDateString('en-PH') : 
          'Not paid',
        cutoffType: payroll.cutoff_type || 'Full Month',
        periodStart: payroll.period_start,
        periodEnd: payroll.period_end
      }));
      
      // Calculate totals
      const total = employees.reduce((sum, emp) => sum + emp.netPay, 0);
      const paid = employees.filter(emp => emp.status === 'Paid').length;
      const pending = employees.filter(emp => emp.status === 'Pending').length;
      
      setPayrollData({
        employees,
        total,
        paid,
        pending
      });
      
    } catch (error) {
      console.error('Error loading payroll data:', error);
      setPayrollData({
        employees: [],
        total: 0,
        paid: 0,
        pending: 0
      });
    } finally {
      setLoading(false);
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

  const getStatusColor = (status) => {
    switch (status) {
      case 'Paid': return 'bg-green-100 text-green-800';
      case 'Pending': return 'bg-yellow-100 text-yellow-800';
      case 'Failed': return 'bg-red-100 text-red-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  };

  const getStatusIcon = (status) => {
    switch (status) {
      case 'Paid': return <CheckCircle size={14} className="mr-1" />;
      case 'Pending': return <Clock size={14} className="mr-1" />;
      default: return null;
    }
  };

  const handleExport = () => {
    if (payrollData.employees.length === 0) {
      alert('No data to export');
      return;
    }

    try {
      // Convert data to CSV
      const headers = ['Employee', 'Position', 'Basic Salary', 'Allowances', 'Deductions', 'Net Pay', 'Status', 'Pay Date', 'Cutoff Period'];
      const csvData = payrollData.employees.map(emp => [
        emp.employee,
        emp.position,
        emp.salary,
        emp.bonus,
        emp.deductions,
        emp.netPay,
        emp.status,
        emp.payDate,
        emp.cutoffType
      ]);
      
      const csvContent = [
        headers.join(','),
        ...csvData.map(row => row.join(','))
      ].join('\n');
      
      // Create download link
      const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `payroll-summary-${selectedMonth}.csv`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(url);
    } catch (error) {
      console.error('Error exporting CSV:', error);
      alert('Error exporting data: ' + error.message);
    }
  };

  const formatDate = (yearMonth) => {
    const [year, month] = yearMonth.split('-');
    const date = new Date(year, month - 1);
    return date.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
  };

  if (loading) {
    return (
      <div className="bg-white rounded-xl border border-gray-200 p-6">
        <div className="flex justify-between items-center mb-6">
          <div>
            <h3 className="text-lg font-semibold">Payroll Summary</h3>
            <p className="text-gray-600">Loading payroll data...</p>
          </div>
        </div>
        <div className="flex items-center justify-center p-12">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
        </div>
      </div>
    );
  }

  if (!payrollData.employees || payrollData.employees.length === 0) {
    return (
      <div className="bg-white rounded-xl border border-gray-200 p-6">
        <div className="flex justify-between items-center mb-6">
          <div>
            <h3 className="text-lg font-semibold">Payroll Summary</h3>
            <p className="text-gray-600">No payroll data available</p>
          </div>
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2">
              <Calendar size={18} className="text-gray-500" />
              <input
                type="month"
                value={selectedMonth}
                onChange={(e) => setSelectedMonth(e.target.value)}
                className="px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
                max={new Date().toISOString().split('T')[0].substring(0, 7)}
              />
            </div>
            <button
              onClick={loadPayrollData}
              className="flex items-center gap-2 px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50"
            >
              <Clock size={18} />
              Refresh
            </button>
          </div>
        </div>
        <div className="text-center py-8 text-gray-500">
          <PhilippinePeso className="h-12 w-12 mx-auto mb-4 text-gray-300" />
          <p>Payroll data will appear here once processed</p>
          <p className="text-sm text-gray-400 mt-2">
            Process payroll in the Payroll Management section
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-6">
      <div className="flex justify-between items-center mb-6">
        <div>
          <h3 className="text-lg font-semibold">Payroll Summary</h3>
          <p className="text-gray-600">
            {formatDate(selectedMonth)} Payroll
          </p>
          <div className="flex items-center gap-2 mt-1">
            <span className="text-xs px-2 py-1 bg-blue-100 text-blue-800 rounded">
              {payrollData.employees.length} records
            </span>
            <span className="text-xs text-gray-500">
              Last updated: {new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
            </span>
          </div>
        </div>
        <div className="flex gap-2">
          <div className="flex items-center gap-2">
            <Calendar size={18} className="text-gray-500" />
            <input
              type="month"
              value={selectedMonth}
              onChange={(e) => setSelectedMonth(e.target.value)}
              className="px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
              max={new Date().toISOString().split('T')[0].substring(0, 7)}
            />
          </div>
          <button
            onClick={handleExport}
            disabled={payrollData.employees.length === 0}
            className="flex items-center gap-2 px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors disabled:opacity-50"
          >
            <Download size={18} />
            Export
          </button>
          <button
            onClick={() => window.location.hash = '/payroll'}
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
          >
            <PhilippinePeso size={18} />
            Manage Payroll
          </button>
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full min-w-full">
          <thead className="bg-gray-50">
            <tr>
              <th className="py-3 px-4 text-left text-sm font-semibold text-gray-700">Employee</th>
              <th className="py-3 px-4 text-left text-sm font-semibold text-gray-700">Position</th>
              <th className="py-3 px-4 text-left text-sm font-semibold text-gray-700">Salary</th>
              <th className="py-3 px-4 text-left text-sm font-semibold text-gray-700">Allowances</th>
              <th className="py-3 px-4 text-left text-sm font-semibold text-gray-700">Deductions</th>
              <th className="py-3 px-4 text-left text-sm font-semibold text-gray-700">Net Pay</th>
              <th className="py-3 px-4 text-left text-sm font-semibold text-gray-700">Status</th>
              <th className="py-3 px-4 text-left text-sm font-semibold text-gray-700">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200">
            {payrollData.employees.slice(0, 5).map((payroll) => (
              <tr key={payroll.id} className="hover:bg-gray-50 transition-colors">
                <td className="py-4 px-4">
                  <div>
                    <p className="font-medium">{payroll.employee}</p>
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-gray-500">Pay Date: {payroll.payDate}</span>
                      <span className="text-xs px-1 py-0.5 bg-gray-100 text-gray-600 rounded">
                        {payroll.cutoffType}
                      </span>
                    </div>
                  </div>
                </td>
                <td className="py-4 px-4">
                  <p className="text-gray-700">{payroll.position}</p>
                </td>
                <td className="py-4 px-4">
                  <p className="font-semibold">{formatCurrency(payroll.salary)}</p>
                </td>
                <td className="py-4 px-4">
                  <p className="text-green-600 font-medium">+{formatCurrency(payroll.bonus)}</p>
                </td>
                <td className="py-4 px-4">
                  <p className="text-red-600 font-medium">-{formatCurrency(payroll.deductions)}</p>
                </td>
                <td className="py-4 px-4">
                  <p className="font-bold text-lg text-blue-600">{formatCurrency(payroll.netPay)}</p>
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
                      className="p-2 hover:bg-gray-100 rounded-lg transition-colors" 
                      title="Send Payslip"
                      onClick={() => {
                        // Send payslip functionality
                        alert(`Sending payslip to ${payroll.employee}`);
                      }}
                    >
                      <Send size={18} className="text-blue-600" />
                    </button>
                    <button 
                      className="p-2 hover:bg-gray-100 rounded-lg transition-colors" 
                      title="Print"
                      onClick={() => {
                        // Print functionality
                        alert(`Printing payslip for ${payroll.employee}`);
                      }}
                    >
                      <Printer size={18} className="text-gray-600" />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Total Summary */}
      <div className="mt-6 p-4 bg-gray-50 rounded-lg border border-gray-200">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div>
            <p className="text-sm text-gray-600">Total Payroll This Month</p>
            <p className="text-2xl font-bold">{formatCurrency(payrollData.total)}</p>
            <p className="text-xs text-gray-500 mt-1">
              Average: {formatCurrency(payrollData.employees.length > 0 ? payrollData.total / payrollData.employees.length : 0)}
            </p>
          </div>
          <div>
            <p className="text-sm text-gray-600">Employees to Pay</p>
            <div className="flex items-center gap-4">
              <p className="text-2xl font-bold">{payrollData.employees.length}</p>
              <div className="flex gap-2">
                <span className="px-2 py-1 bg-green-100 text-green-800 rounded-full text-xs">
                  {payrollData.paid} Paid
                </span>
                <span className="px-2 py-1 bg-yellow-100 text-yellow-800 rounded-full text-xs">
                  {payrollData.pending} Pending
                </span>
              </div>
            </div>
            <p className="text-xs text-gray-500 mt-1">
              Showing top 5 of {payrollData.employees.length} records
            </p>
          </div>
          <div className="text-right">
            <p className="text-sm text-gray-600">Payroll Status</p>
            <div className="flex items-center justify-end gap-2">
              <div className={`h-3 w-3 rounded-full ${payrollData.pending > 0 ? 'bg-yellow-500' : 'bg-green-500'}`}></div>
              <p className="text-lg font-bold">
                {payrollData.pending === 0 ? 'All Paid' : `${payrollData.pending} Pending`}
              </p>
            </div>
            <p className="text-xs text-gray-500 mt-1">
              {payrollData.employees.filter(e => e.cutoffType !== 'Full Month').length} bi-monthly records
            </p>
          </div>
        </div>
      </div>

      {/* View All Link */}
      {payrollData.employees.length > 5 && (
        <div className="mt-4 text-center">
          <button
            onClick={() => window.location.hash = '/payroll'}
            className="text-blue-600 hover:text-blue-800 text-sm font-medium"
          >
            View all {payrollData.employees.length} payroll records →
          </button>
        </div>
      )}
    </div>
  );
};

export default PayrollSummary;