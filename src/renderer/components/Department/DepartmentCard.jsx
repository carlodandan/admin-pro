import React from 'react';
import { PhilippinePeso, Users } from 'lucide-react';
import DeleteDepartment from './DeleteDepartment';
import { formatUtcStoredDate } from '../../utils/manila';

const formatCurrency = (amount) =>
  new Intl.NumberFormat('en-PH', {
    style: 'currency',
    currency: 'PHP',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0
  }).format(amount || 0);

/**
 * One department.
 *
 * The Edit button beside Delete is gone. It called an `onEdit` handler whose
 * whole body set the page's *error* banner to "Edit functionality for X would go
 * here", and there is no update command behind it to call.
 */
const DepartmentCard = ({ department, share = 0, index = 0, onDeleteSuccess, onDeleteError }) => {
  const headcount = department.employee_count || 0;
  // `budget` went to `Intl.NumberFormat` unguarded, so a row with a null budget
  // printed "₱NaN".
  const budget = Number(department.budget) || 0;

  return (
    <li className="card stagger-card flex flex-col gap-4 p-5" style={{ '--i': index }}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="section-title truncate-2">{department.name}</h3>
          <p className="page-subtitle mt-0.5">
            {headcount === 1 ? '1 active employee' : `${headcount} active employees`}
          </p>
        </div>
        <DeleteDepartment
          departmentId={department.id}
          departmentName={department.name}
          onDeleteSuccess={onDeleteSuccess}
          onDeleteError={onDeleteError}
        />
      </div>

      <div>
        <p className="kpi-label">Annual budget</p>
        <p className="kpi-value mt-1">{formatCurrency(budget)}</p>
        {/* Share of the combined budget across all departments — the comparison
            the old three-row grid of figures left the reader to do. */}
        <div className="mt-2.5">
          <div
            className="progress"
            role="progressbar"
            aria-valuenow={Math.round(share)}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-label={`${department.name} share of the combined annual budget`}
          >
            <div className="progress-bar" style={{ width: `${Math.min(100, share)}%` }} />
          </div>
          <p className="help-text mt-1.5">{share.toFixed(1)}% of the combined budget</p>
        </div>
      </div>

      <dl className="mt-auto flex flex-col">
        <div className="field-row">
          <dt className="field-key flex items-center gap-2">
            <Users size={14} className="text-info" aria-hidden="true" />
            Active employees
          </dt>
          <dd className="field-value">{headcount}</dd>
        </div>
        <div className="field-row">
          <dt className="field-key flex items-center gap-2">
            <PhilippinePeso size={14} className="text-accent" aria-hidden="true" />
            {/* `AVG(e.salary)` over a column the payroll calculator divides by
                24 to get a daily rate: this is a monthly figure, and "Avg.
                Salary" left that to the reader. */}
            Avg. monthly salary
          </dt>
          <dd className="field-value">{formatCurrency(department.avg_salary)}</dd>
        </div>
        <div className="field-row">
          <dt className="field-key">Created</dt>
          <dd className="field-value">{formatUtcStoredDate(department.created_at)}</dd>
        </div>
      </dl>
    </li>
  );
};

export default DepartmentCard;
