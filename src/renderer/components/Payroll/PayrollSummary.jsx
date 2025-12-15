import React from 'react';
import { DollarSign, Download, Printer, Send, CheckCircle, Clock } from 'lucide-react';

const PayrollSummary = ({ payrollData }) => {
  if (!payrollData || !payrollData.employees || payrollData.employees.length === 0) {
    return (
      <div className="bg-white rounded-xl border border-gray-200 p-6">
        <div className="flex justify-between items-center mb-6">
          <div>
            <h3 className="text-lg font-semibold">Payroll Summary</h3>
            <p className="text-gray-600">No payroll data available</p>
          </div>
          <div className="flex gap-2">
            <button className="flex items-center gap-2 px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50">
              <Download size={18} />
              Export
            </button>
            <button className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700">
              <DollarSign size={18} />
              Process Payroll
            </button>
          </div>
        </div>
        <div className="text-center py-8 text-gray-500">
          <DollarSign className="h-12 w-12 mx-auto mb-4 text-gray-300" />
          <p>Payroll data will appear here once processed</p>
        </div>
      </div>
    );
  }

  const formatCurrency = (amount) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0
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

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-6">
      <div className="flex justify-between items-center mb-6">
        <div>
          <h3 className="text-lg font-semibold">Payroll Summary</h3>
          <p className="text-gray-600">
            {new Date().toLocaleDateString('en-US', { month: 'long', year: 'numeric' })} Payroll
          </p>
        </div>
        <div className="flex gap-2">
          <button className="flex items-center gap-2 px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors">
            <Download size={18} />
            Export
          </button>
          <button className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors">
            <DollarSign size={18} />
            Process Payroll
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
              <th className="py-3 px-4 text-left text-sm font-semibold text-gray-700">Bonus</th>
              <th className="py-3 px-4 text-left text-sm font-semibold text-gray-700">Deductions</th>
              <th className="py-3 px-4 text-left text-sm font-semibold text-gray-700">Net Pay</th>
              <th className="py-3 px-4 text-left text-sm font-semibold text-gray-700">Status</th>
              <th className="py-3 px-4 text-left text-sm font-semibold text-gray-700">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200">
            {payrollData.employees.map((payroll) => {
              const netPay = payroll.salary + payroll.bonus - payroll.deductions;
              return (
                <tr key={payroll.id} className="hover:bg-gray-50 transition-colors">
                  <td className="py-4 px-4">
                    <div>
                      <p className="font-medium">{payroll.employee}</p>
                      <p className="text-sm text-gray-500">Pay Date: {payroll.payDate}</p>
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
                    <p className="font-bold text-lg text-blue-600">{formatCurrency(netPay)}</p>
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
                      >
                        <Send size={18} className="text-blue-600" />
                      </button>
                      <button 
                        className="p-2 hover:bg-gray-100 rounded-lg transition-colors" 
                        title="Print"
                      >
                        <Printer size={18} className="text-gray-600" />
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Total Summary */}
      <div className="mt-6 p-4 bg-gray-50 rounded-lg border border-gray-200">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div>
            <p className="text-sm text-gray-600">Total Payroll This Month</p>
            <p className="text-2xl font-bold">{formatCurrency(payrollData.total)}</p>
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
          </div>
          <div className="text-right">
            <p className="text-sm text-gray-600">Avg. Net Pay</p>
            <p className="text-2xl font-bold">
              {formatCurrency(payrollData.total / payrollData.employees.length)}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default PayrollSummary;