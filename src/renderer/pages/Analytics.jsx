import React, { useState, useEffect } from 'react';
import {
    BarChart, TrendingUp, Users, DollarSign, Briefcase,
    Calendar, Loader2, RefreshCw, Filter, PieChart
} from 'lucide-react';

const Analytics = () => {
    const [data, setData] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [dateRange, setDateRange] = useState('all'); // 'all', '30', '60', '90', 'custom'
    const [customStart, setCustomStart] = useState('');
    const [customEnd, setCustomEnd] = useState('');

    useEffect(() => {
        loadAnalytics();
    }, [dateRange]);

    const getDateFilters = () => {
        if (dateRange === 'all') return {};
        if (dateRange === 'custom' && customStart && customEnd) {
            return { startDate: customStart, endDate: customEnd };
        }
        const now = new Date();
        const start = new Date(now);
        start.setDate(now.getDate() - parseInt(dateRange));
        return { startDate: start.toISOString().split('T')[0], endDate: now.toISOString().split('T')[0] };
    };

    const loadAnalytics = async () => {
        try {
            setLoading(true);
            setError(null);
            const filters = getDateFilters();
            const result = await window.electronAPI.getAnalyticsData(filters);
            setData(result);
        } catch (err) {
            console.error('Error loading analytics:', err);
            setError('Failed to load analytics data.');
        } finally {
            setLoading(false);
        }
    };

    const formatCurrency = (value) => {
        return new Intl.NumberFormat('en-PH', {
            style: 'currency', currency: 'PHP', minimumFractionDigits: 0
        }).format(value || 0);
    };

    const formatMonth = (monthStr) => {
        if (!monthStr) return '';
        const [year, month] = monthStr.split('-');
        const date = new Date(year, parseInt(month) - 1);
        return date.toLocaleDateString('en-US', { month: 'short', year: '2-digit' });
    };

    if (loading) {
        return (
            <div className="flex items-center justify-center h-96">
                <div className="text-center">
                    <Loader2 className="h-8 w-8 animate-spin text-blue-500 mx-auto mb-4" />
                    <p className="text-gray-600">Loading analytics data...</p>
                </div>
            </div>
        );
    }

    if (error) {
        return (
            <div className="flex items-center justify-center h-96">
                <div className="text-center">
                    <div className="text-red-500 mb-4 text-4xl">⚠️</div>
                    <p className="text-gray-600 mb-4">{error}</p>
                    <button onClick={loadAnalytics} className="bg-blue-500 text-white px-4 py-2 rounded-lg hover:bg-blue-600">
                        Retry
                    </button>
                </div>
            </div>
        );
    }

    const {
        employeeGrowth = [],
        attendanceTrends = [],
        payrollCostTrends = [],
        departmentComparison = [],
        employeeStatusBreakdown = [],
        salaryDistribution = []
    } = data || {};

    // Status colors
    const statusColors = {
        'Active': { bg: 'bg-green-500', light: 'bg-green-100', text: 'text-green-700' },
        'On Leave': { bg: 'bg-yellow-500', light: 'bg-yellow-100', text: 'text-yellow-700' },
        'Inactive': { bg: 'bg-red-500', light: 'bg-red-100', text: 'text-red-700' },
        'Terminated': { bg: 'bg-gray-500', light: 'bg-gray-100', text: 'text-gray-700' },
    };

    const totalEmployees = employeeStatusBreakdown.reduce((sum, s) => sum + s.count, 0);
    const maxGrowth = Math.max(...employeeGrowth.map(d => d.count), 1);
    const maxAttendanceRecords = Math.max(...attendanceTrends.map(d => d.total_records), 1);
    const maxPayroll = Math.max(...payrollCostTrends.map(d => d.total_net), 1);
    const maxDeptHeadcount = Math.max(...departmentComparison.map(d => d.headcount), 1);
    const maxSalaryCount = Math.max(...salaryDistribution.map(d => d.count), 1);

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                    <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
                        <BarChart className="text-blue-500" size={28} />
                        Analytics
                    </h1>
                    <p className="text-sm text-gray-500 mt-1">
                        Historical trends and insights across your workforce data.
                    </p>
                </div>
                <div className="flex items-center gap-3 flex-wrap">
                    {/* Date range filter */}
                    <div className="flex items-center gap-2 bg-white border border-gray-200 rounded-xl p-1">
                        <Filter size={16} className="text-gray-400 ml-2" />
                        {[
                            { label: 'All Time', value: 'all' },
                            { label: '30 Days', value: '30' },
                            { label: '60 Days', value: '60' },
                            { label: '90 Days', value: '90' },
                        ].map(opt => (
                            <button
                                key={opt.value}
                                onClick={() => setDateRange(opt.value)}
                                className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${dateRange === opt.value
                                        ? 'bg-blue-500 text-white shadow-sm'
                                        : 'text-gray-600 hover:bg-gray-100'
                                    }`}
                            >
                                {opt.label}
                            </button>
                        ))}
                    </div>
                    <button
                        onClick={loadAnalytics}
                        className="flex items-center gap-2 px-4 py-2 bg-gray-100 text-gray-700 rounded-xl hover:bg-gray-200 transition-colors"
                    >
                        <RefreshCw size={16} />
                        Refresh
                    </button>
                </div>
            </div>

            {/* Row 1: Employee Growth + Attendance Trends */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* Employee Growth Trend */}
                <div className="bg-white rounded-xl border border-gray-200 p-6">
                    <div className="flex items-center justify-between mb-4">
                        <div>
                            <h3 className="font-bold text-lg flex items-center gap-2">
                                <Users size={20} className="text-blue-500" />
                                Employee Growth
                            </h3>
                            <p className="text-sm text-gray-500">Monthly new hires over time</p>
                        </div>
                        <span className="text-2xl font-bold text-blue-600">
                            {employeeGrowth.reduce((s, d) => s + d.count, 0)}
                        </span>
                    </div>
                    {employeeGrowth.length > 0 ? (
                        <div className="h-48 flex items-end gap-2 px-2">
                            {employeeGrowth.map((item, i) => (
                                <div key={i} className="flex-1 flex flex-col items-center group">
                                    <div className="relative w-full flex flex-col justify-end h-40">
                                        <div
                                            className="w-full bg-blue-500 rounded-t-md hover:bg-blue-600 transition-all duration-300 cursor-pointer relative"
                                            style={{ height: `${(item.count / maxGrowth) * 100}%`, minHeight: item.count > 0 ? '8px' : '0' }}
                                            title={`${item.count} new employee(s) in ${formatMonth(item.month)}`}
                                        >
                                            <span className="absolute -top-5 left-1/2 -translate-x-1/2 text-xs font-semibold text-gray-700 opacity-0 group-hover:opacity-100 transition-opacity">
                                                {item.count}
                                            </span>
                                        </div>
                                    </div>
                                    <span className="mt-2 text-xs text-gray-500 font-medium">{formatMonth(item.month)}</span>
                                </div>
                            ))}
                        </div>
                    ) : (
                        <div className="h-48 flex items-center justify-center text-gray-400">
                            <p>No employee data available for this period</p>
                        </div>
                    )}
                </div>

                {/* Attendance Rate Trends */}
                <div className="bg-white rounded-xl border border-gray-200 p-6">
                    <div className="flex items-center justify-between mb-4">
                        <div>
                            <h3 className="font-bold text-lg flex items-center gap-2">
                                <Calendar size={20} className="text-green-500" />
                                Attendance Trends
                            </h3>
                            <p className="text-sm text-gray-500">Monthly attendance rate (%)</p>
                        </div>
                        {attendanceTrends.length > 0 && (
                            <span className="text-2xl font-bold text-green-600">
                                {attendanceTrends[attendanceTrends.length - 1]?.attendance_rate || 0}%
                            </span>
                        )}
                    </div>
                    {attendanceTrends.length > 0 ? (
                        <>
                            <div className="h-40 flex items-end gap-2 px-2">
                                {attendanceTrends.map((item, i) => {
                                    const rate = item.attendance_rate || 0;
                                    const color = rate >= 90 ? 'bg-green-500 hover:bg-green-600' :
                                        rate >= 70 ? 'bg-yellow-500 hover:bg-yellow-600' :
                                            'bg-red-500 hover:bg-red-600';
                                    return (
                                        <div key={i} className="flex-1 flex flex-col items-center group">
                                            <div className="relative w-full flex flex-col justify-end h-32">
                                                <div
                                                    className={`w-full ${color} rounded-t-md transition-all duration-300 cursor-pointer relative`}
                                                    style={{ height: `${rate}%`, minHeight: rate > 0 ? '8px' : '0' }}
                                                    title={`${rate}% attendance in ${formatMonth(item.month)} (${item.present} present / ${item.total_records} total)`}
                                                >
                                                    <span className="absolute -top-5 left-1/2 -translate-x-1/2 text-xs font-semibold text-gray-700 opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap">
                                                        {rate}%
                                                    </span>
                                                </div>
                                            </div>
                                            <span className="mt-2 text-xs text-gray-500 font-medium">{formatMonth(item.month)}</span>
                                        </div>
                                    );
                                })}
                            </div>
                            {/* Legend */}
                            <div className="flex items-center gap-4 mt-4 text-xs text-gray-500">
                                <div className="flex items-center gap-1"><div className="w-3 h-3 bg-green-500 rounded-full"></div> ≥90%</div>
                                <div className="flex items-center gap-1"><div className="w-3 h-3 bg-yellow-500 rounded-full"></div> 70-89%</div>
                                <div className="flex items-center gap-1"><div className="w-3 h-3 bg-red-500 rounded-full"></div> &lt;70%</div>
                            </div>
                        </>
                    ) : (
                        <div className="h-48 flex items-center justify-center text-gray-400">
                            <p>No attendance data available for this period</p>
                        </div>
                    )}
                </div>
            </div>

            {/* Row 2: Payroll Cost Trends (full width) */}
            <div className="bg-white rounded-xl border border-gray-200 p-6">
                <div className="flex items-center justify-between mb-4">
                    <div>
                        <h3 className="font-bold text-lg flex items-center gap-2">
                            <DollarSign size={20} className="text-indigo-500" />
                            Payroll Cost Trends
                        </h3>
                        <p className="text-sm text-gray-500">Monthly payroll expenses</p>
                    </div>
                    {payrollCostTrends.length > 0 && (
                        <div className="text-right">
                            <span className="text-2xl font-bold text-indigo-600">
                                {formatCurrency(payrollCostTrends.reduce((s, d) => s + d.total_net, 0))}
                            </span>
                            <p className="text-xs text-gray-500">Total across all months</p>
                        </div>
                    )}
                </div>
                {payrollCostTrends.length > 0 ? (
                    <>
                        <div className="h-48 flex items-end gap-3 px-2">
                            {payrollCostTrends.map((item, i) => (
                                <div key={i} className="flex-1 flex flex-col items-center group">
                                    <div className="relative w-full flex flex-col justify-end h-40">
                                        {/* Stacked: net (indigo) + deductions (red/orange) */}
                                        <div
                                            className="w-full bg-indigo-500 rounded-t-md hover:bg-indigo-600 transition-all duration-300 cursor-pointer relative"
                                            style={{ height: `${(item.total_net / maxPayroll) * 100}%`, minHeight: item.total_net > 0 ? '8px' : '0' }}
                                            title={`Net: ${formatCurrency(item.total_net)} | Basic: ${formatCurrency(item.total_basic)} | Deductions: ${formatCurrency(item.total_deductions)} — ${formatMonth(item.month)}`}
                                        >
                                            <span className="absolute -top-6 left-1/2 -translate-x-1/2 text-xs font-semibold text-gray-700 opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap">
                                                {formatCurrency(item.total_net)}
                                            </span>
                                        </div>
                                    </div>
                                    <span className="mt-2 text-xs text-gray-500 font-medium">{formatMonth(item.month)}</span>
                                    <span className="text-[10px] text-gray-400">{item.employee_count} emp</span>
                                </div>
                            ))}
                        </div>
                        {/* Stats row */}
                        <div className="grid grid-cols-3 gap-4 mt-4">
                            <div className="bg-indigo-50 rounded-lg p-3 text-center">
                                <p className="text-xs text-gray-500">Avg. Monthly</p>
                                <p className="font-bold text-indigo-600">
                                    {formatCurrency(payrollCostTrends.reduce((s, d) => s + d.total_net, 0) / payrollCostTrends.length)}
                                </p>
                            </div>
                            <div className="bg-green-50 rounded-lg p-3 text-center">
                                <p className="text-xs text-gray-500">Total Paid</p>
                                <p className="font-bold text-green-600">
                                    {payrollCostTrends.reduce((s, d) => s + d.paid_count, 0)}
                                </p>
                            </div>
                            <div className="bg-yellow-50 rounded-lg p-3 text-center">
                                <p className="text-xs text-gray-500">Total Pending</p>
                                <p className="font-bold text-yellow-600">
                                    {payrollCostTrends.reduce((s, d) => s + d.pending_count, 0)}
                                </p>
                            </div>
                        </div>
                    </>
                ) : (
                    <div className="h-48 flex items-center justify-center text-gray-400">
                        <p>No payroll data available for this period</p>
                    </div>
                )}
            </div>

            {/* Row 3: Department Comparison + Employee Status Breakdown + Salary Distribution */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                {/* Department Comparison */}
                <div className="bg-white rounded-xl border border-gray-200 p-6">
                    <h3 className="font-bold text-lg flex items-center gap-2 mb-4">
                        <Briefcase size={20} className="text-orange-500" />
                        Department Comparison
                    </h3>
                    {departmentComparison.length > 0 ? (
                        <div className="space-y-4">
                            {departmentComparison.map((dept, i) => (
                                <div key={i}>
                                    <div className="flex justify-between items-center mb-1">
                                        <span className="text-sm font-medium text-gray-700 truncate">{dept.name}</span>
                                        <span className="text-sm font-bold text-gray-900">{dept.headcount}</span>
                                    </div>
                                    <div className="w-full bg-gray-100 rounded-full h-2.5">
                                        <div
                                            className="h-2.5 rounded-full bg-orange-500 transition-all duration-500"
                                            style={{ width: `${(dept.headcount / maxDeptHeadcount) * 100}%` }}
                                        ></div>
                                    </div>
                                    <div className="flex justify-between mt-1">
                                        <span className="text-[11px] text-gray-400">Avg: {formatCurrency(dept.avg_salary)}</span>
                                        <span className="text-[11px] text-gray-400">Cost: {formatCurrency(dept.total_salary_cost)}</span>
                                    </div>
                                </div>
                            ))}
                        </div>
                    ) : (
                        <div className="h-48 flex items-center justify-center text-gray-400">
                            <p>No departments found</p>
                        </div>
                    )}
                </div>

                {/* Employee Status Breakdown - Donut style */}
                <div className="bg-white rounded-xl border border-gray-200 p-6">
                    <h3 className="font-bold text-lg flex items-center gap-2 mb-4">
                        <PieChart size={20} className="text-purple-500" />
                        Employee Status
                    </h3>
                    {employeeStatusBreakdown.length > 0 ? (
                        <div className="flex flex-col items-center">
                            {/* Visual ring */}
                            <div className="relative w-40 h-40 mb-4">
                                <svg viewBox="0 0 36 36" className="w-full h-full -rotate-90">
                                    {(() => {
                                        let offset = 0;
                                        const colors = ['#22c55e', '#eab308', '#ef4444', '#6b7280', '#3b82f6'];
                                        return employeeStatusBreakdown.map((item, i) => {
                                            const pct = totalEmployees > 0 ? (item.count / totalEmployees) * 100 : 0;
                                            const el = (
                                                <circle
                                                    key={i}
                                                    cx="18" cy="18" r="15.9155"
                                                    fill="none"
                                                    stroke={colors[i % colors.length]}
                                                    strokeWidth="3"
                                                    strokeDasharray={`${pct} ${100 - pct}`}
                                                    strokeDashoffset={`${-offset}`}
                                                    className="transition-all duration-700"
                                                />
                                            );
                                            offset += pct;
                                            return el;
                                        });
                                    })()}
                                </svg>
                                <div className="absolute inset-0 flex flex-col items-center justify-center">
                                    <span className="text-2xl font-bold text-gray-900">{totalEmployees}</span>
                                    <span className="text-xs text-gray-500">Total</span>
                                </div>
                            </div>
                            {/* Legend */}
                            <div className="w-full space-y-2">
                                {employeeStatusBreakdown.map((item, i) => {
                                    const colors = statusColors[item.status] || statusColors['Inactive'];
                                    const pct = totalEmployees > 0 ? ((item.count / totalEmployees) * 100).toFixed(1) : 0;
                                    return (
                                        <div key={i} className="flex items-center justify-between">
                                            <div className="flex items-center gap-2">
                                                <div className={`w-3 h-3 rounded-full ${colors.bg}`}></div>
                                                <span className="text-sm text-gray-600">{item.status}</span>
                                            </div>
                                            <div className="flex items-center gap-2">
                                                <span className="text-sm font-bold">{item.count}</span>
                                                <span className="text-xs text-gray-400">({pct}%)</span>
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                    ) : (
                        <div className="h-48 flex items-center justify-center text-gray-400">
                            <p>No employee data</p>
                        </div>
                    )}
                </div>

                {/* Salary Distribution */}
                <div className="bg-white rounded-xl border border-gray-200 p-6">
                    <h3 className="font-bold text-lg flex items-center gap-2 mb-4">
                        <TrendingUp size={20} className="text-emerald-500" />
                        Salary Distribution
                    </h3>
                    {salaryDistribution.length > 0 ? (
                        <div className="space-y-3">
                            {salaryDistribution.map((range, i) => (
                                <div key={i}>
                                    <div className="flex justify-between items-center mb-1">
                                        <span className="text-sm font-medium text-gray-700">{range.salary_range}</span>
                                        <span className="text-sm font-bold text-gray-900">{range.count} emp</span>
                                    </div>
                                    <div className="w-full bg-gray-100 rounded-full h-2.5">
                                        <div
                                            className="h-2.5 rounded-full bg-emerald-500 transition-all duration-500"
                                            style={{ width: `${(range.count / maxSalaryCount) * 100}%` }}
                                        ></div>
                                    </div>
                                    <span className="text-[11px] text-gray-400">Avg: {formatCurrency(range.avg_in_range)}</span>
                                </div>
                            ))}
                        </div>
                    ) : (
                        <div className="h-48 flex items-center justify-center text-gray-400">
                            <p>No salary data available</p>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};

export default Analytics;
