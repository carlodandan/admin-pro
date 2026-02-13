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
    <div className="bg-white rounded-3xl border border-gray-100 p-8 shadow-sm">
      {/* Header Section */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-6 mb-8">
        <div>
          <div className="flex items-center gap-3 mb-2">
            <div className="bg-blue-600 p-2 rounded-xl text-white shadow-lg shadow-blue-200">
              <PhilippinePeso size={20} />
            </div>
            <h3 className="text-2xl font-black text-gray-900 tracking-tight">Financial Summary</h3>
          </div>
          <p className="text-gray-500 font-medium">
            Overview for {formatDate(selectedMonth)}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3 w-full md:w-auto">
          <div className="relative flex-1 md:flex-none">
            <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={16} />
            <input
              type="month"
              value={selectedMonth}
              onChange={(e) => setSelectedMonth(e.target.value)}
              className="pl-10 pr-4 py-2.5 bg-gray-50 border border-gray-100 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500/20 text-sm font-bold text-gray-700 w-full"
              max={new Date().toISOString().split('T')[0].substring(0, 7)}
            />
          </div>
          <button
            onClick={handleExport}
            disabled={payrollData.employees.length === 0}
            className="flex items-center justify-center gap-2 px-5 py-2.5 border border-gray-100 rounded-xl hover:bg-gray-50 transition-all disabled:opacity-50 text-sm font-bold text-gray-700 md:flex-1"
          >
            <Download size={18} />
            CSV
          </button>
          <button
            onClick={() => window.location.hash = '/payroll'}
            className="flex items-center justify-center gap-2 px-6 py-2.5 bg-gray-950 text-white rounded-xl hover:bg-gray-800 transition-all shadow-lg shadow-gray-200 text-sm font-bold md:flex-1"
          >
            Manage
          </button>
        </div>
      </div>

      {/* Stats Quick Grid */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
        <div className="bg-gradient-to-br from-blue-600 to-blue-700 rounded-3xl p-6 text-white shadow-xl shadow-blue-100">
          <p className="text-blue-100 text-xs font-black uppercase tracking-widest mb-1">Total Distribution</p>
          <h4 className="text-3xl font-black mb-4">{formatCurrency(payrollData.total)}</h4>
          <div className="flex items-center gap-2 text-xs font-bold bg-white/10 w-fit px-3 py-1.5 rounded-full">
            <CheckCircle size={14} />
            {payrollData.paid} Records Cleared
          </div>
        </div>

        <div className="bg-gray-50 rounded-3xl p-6 border border-gray-100">
          <p className="text-gray-400 text-[10px] font-black uppercase tracking-widest mb-1">Pending Processing</p>
          <h4 className="text-3xl font-black text-gray-900 mb-4">{payrollData.pending}</h4>
          <div className={`flex items-center gap-2 text-xs font-bold w-fit px-3 py-1.5 rounded-full ${payrollData.pending > 0 ? 'bg-orange-100 text-orange-600' : 'bg-green-100 text-green-600'}`}>
            <Clock size={14} />
            {payrollData.pending > 0 ? 'Awaiting Action' : 'All Processed'}
          </div>
        </div>

        <div className="bg-gray-50 rounded-3xl p-6 border border-gray-100">
          <p className="text-gray-400 text-[10px] font-black uppercase tracking-widest mb-1">Average Payout</p>
          <h4 className="text-3xl font-black text-gray-900 mb-4">
            {formatCurrency(payrollData.employees.length > 0 ? payrollData.total / payrollData.employees.length : 0)}
          </h4>
          <p className="text-xs text-gray-500 font-medium">Monthly baseline estimation</p>
        </div>
      </div>

      <div className="space-y-4">
        <div className="flex justify-between items-center px-2">
          <h4 className="text-xs font-black text-gray-400 uppercase tracking-widest">Recent Activity</h4>
          <p className="text-[10px] font-bold text-blue-600 cursor-pointer hover:underline" onClick={() => window.location.hash = '/payroll'}>View Archive</p>
        </div>

        <div className="overflow-hidden rounded-2xl border border-gray-100">
          <table className="w-full">
            <thead className="bg-gray-50/50 border-b border-gray-100">
              <tr>
                <th className="py-4 px-6 text-left text-[10px] font-black text-gray-400 uppercase tracking-widest">Staff Member</th>
                <th className="py-4 px-6 text-left text-[10px] font-black text-gray-400 uppercase tracking-widest">Net Pay</th>
                <th className="py-4 px-6 text-left text-[10px] font-black text-gray-400 uppercase tracking-widest">Status</th>
                <th className="py-4 px-6 text-right text-[10px] font-black text-gray-400 uppercase tracking-widest">Dispatch</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {payrollData.employees.slice(0, 5).map((payroll) => (
                <tr key={payroll.id} className="group hover:bg-gray-50/50 transition-all">
                  <td className="py-4 px-6">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-lg bg-gray-100 flex items-center justify-center text-[10px] font-black text-gray-500 uppercase">
                        {payroll.employee.split(' ').map(n => n[0]).join('')}
                      </div>
                      <div>
                        <p className="text-sm font-bold text-gray-900 leading-tight">{payroll.employee}</p>
                        <p className="text-[10px] text-gray-400 font-medium">{payroll.position}</p>
                      </div>
                    </div>
                  </td>
                  <td className="py-4 px-6">
                    <p className="text-sm font-black text-gray-900">{formatCurrency(payroll.netPay)}</p>
                  </td>
                  <td className="py-4 px-6">
                    <span className={`inline-flex items-center px-2.5 py-1 rounded-lg text-[10px] font-black uppercase tracking-widest ${getStatusColor(payroll.status)}`}>
                      {payroll.status}
                    </span>
                  </td>
                  <td className="py-4 px-6 text-right">
                    <div className="flex justify-end gap-1 opacity-0 group-hover:opacity-100 transition-all">
                      <button
                        className="p-2 hover:bg-blue-50 rounded-lg text-blue-600"
                        onClick={() => alert(`Sending payslip to ${payroll.employee}`)}
                      >
                        <Send size={16} />
                      </button>
                      <button
                        className="p-2 hover:bg-gray-100 rounded-lg text-gray-500"
                        onClick={() => alert(`Printing payslip for ${payroll.employee}`)}
                      >
                        <Printer size={16} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

export default PayrollSummary;