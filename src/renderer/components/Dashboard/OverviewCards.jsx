import React from 'react';
import { Users, UserCheck, CalendarOff, PhilippinePeso } from 'lucide-react';

/**
 * The four headline figures.
 *
 * Every card used to carry a trend chip — `+12%`, `+5%`, `-2`, `+3.2%`, each
 * followed by "from last month". They were literals in the source: nothing here
 * compares against a previous period, and no table records history to compare
 * against. They are replaced by a second line derived from the same `stats`
 * object, so the supporting figure is at least true.
 */
const OverviewCards = ({ stats }) => {
  if (!stats) return null;

  const formatCurrency = (amount) =>
    new Intl.NumberFormat('en-PH', {
      style: 'currency',
      currency: 'PHP',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0
    }).format(amount || 0);

  const headcount = stats.totalEmployees || 0;
  const share = (count) => (headcount > 0 ? `${((count / headcount) * 100).toFixed(1)}%` : '0%');
  const departments = stats.totalDepartments || 0;

  const cards = [
    {
      title: 'Total Employees',
      value: headcount,
      detail: `Across ${departments} ${departments === 1 ? 'department' : 'departments'}`,
      icon: Users,
      iconClass: 'bg-[rgb(96_165_250/0.14)] text-info'
    },
    {
      title: 'Active',
      value: stats.activeEmployees || 0,
      detail: `${share(stats.activeEmployees || 0)} of headcount`,
      icon: UserCheck,
      iconClass: 'bg-[rgb(34_197_94/0.14)] text-accent'
    },
    {
      title: 'On Leave',
      value: stats.onLeaveEmployees || 0,
      detail: `${share(stats.onLeaveEmployees || 0)} of headcount`,
      icon: CalendarOff,
      iconClass: 'bg-[rgb(251_191_36/0.14)] text-warning'
    },
    {
      // `employees.salary` is the monthly basic rate — the payroll calculator
      // divides it by 24 for a daily rate. This card said "Annual".
      title: 'Avg. Monthly Salary',
      value: formatCurrency(stats.avgSalary),
      detail: 'Basic pay, before allowances',
      icon: PhilippinePeso,
      iconClass: 'bg-[rgb(148_163_184/0.14)] text-foreground'
    }
  ];

  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
      {cards.map((card, index) => {
        const Icon = card.icon;
        return (
          <div
            key={card.title}
            className="card stagger-card flex items-start justify-between gap-3 p-4"
            style={{ '--i': index }}
          >
            <div className="min-w-0">
              <p className="kpi-label truncate-1">{card.title}</p>
              <p className="kpi-value mt-1.5">{card.value}</p>
              <p className="mt-2 text-xs text-muted-foreground">{card.detail}</p>
            </div>
            <span className={`kpi-icon ${card.iconClass}`}>
              <Icon size={20} aria-hidden="true" />
            </span>
          </div>
        );
      })}
    </div>
  );
};

export default OverviewCards;
