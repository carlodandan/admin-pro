import React, { useEffect, useState } from 'react';
import {
  AlertCircle,
  Building2,
  CheckCircle,
  Download,
  PhilippinePeso,
  Plus,
  Users
} from 'lucide-react';
import AddDepartment from '../components/Department/AddDepartment';
import DepartmentCard from '../components/Department/DepartmentCard';
import { downloadCsv, toCsv } from '../utils/csv';
import { formatUtcStoredDate, manilaDate } from '../utils/manila';

const formatCurrency = (amount) =>
  new Intl.NumberFormat('en-PH', {
    style: 'currency',
    currency: 'PHP',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0
  }).format(amount || 0);

const Departments = () => {
  const [departments, setDepartments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showAddModal, setShowAddModal] = useState(false);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState('');

  useEffect(() => {
    loadDepartments();
  }, []);

  const loadDepartments = async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await window.api.getAllDepartments();
      setDepartments(Array.isArray(data) ? data : []);
    } catch (err) {
      console.error('Error loading departments:', err);
      setError('Failed to load departments. The local database may be unavailable.');
      setDepartments([]);
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteSuccess = (message) => {
    setSuccess(message);
    loadDepartments();
    setTimeout(() => setSuccess(''), 3000);
  };

  const handleDeleteError = (errorMessage) => {
    setError(errorMessage);
    setTimeout(() => setError(''), 5000);
  };

  // Derived from the rows on screen rather than held in state, so the totals and
  // the cards can never disagree.
  const totalBudget = departments.reduce((sum, dept) => sum + (Number(dept.budget) || 0), 0);
  const assigned = departments.reduce((sum, dept) => sum + (dept.employee_count || 0), 0);
  const largest = departments.reduce(
    (best, dept) => ((dept.employee_count || 0) > (best?.employee_count || 0) ? dept : best),
    null
  );

  const handleExport = () => {
    if (departments.length === 0) return;

    downloadCsv(
      `departments-${manilaDate()}.csv`,
      toCsv(
        ['Department', 'Annual budget', 'Active employees', 'Avg. monthly salary', 'Created'],
        departments.map((dept) => [
          dept.name,
          Number(dept.budget) || 0,
          dept.employee_count || 0,
          Math.round(dept.avg_salary || 0),
          formatUtcStoredDate(dept.created_at)
        ])
      )
    );
  };

  const tiles = [
    {
      label: 'Departments',
      value: departments.length,
      detail:
        departments.length === 0
          ? 'None created yet'
          : `${assigned} active ${assigned === 1 ? 'employee' : 'employees'} assigned`,
      icon: Building2,
      tone: 'text-info',
      wash: 'bg-[rgb(96_165_250/0.14)]'
    },
    {
      label: 'Combined annual budget',
      value: formatCurrency(totalBudget),
      detail:
        departments.length > 0
          ? `${formatCurrency(totalBudget / departments.length)} average per department`
          : 'Set when you add a department',
      icon: PhilippinePeso,
      tone: 'text-accent',
      wash: 'bg-[rgb(34_197_94/0.14)]'
    },
    {
      label: 'Largest department',
      value: largest && largest.employee_count > 0 ? largest.name : '—',
      detail:
        largest && largest.employee_count > 0
          ? `${largest.employee_count} of ${assigned} active employees`
          : 'No employees assigned yet',
      icon: Users,
      tone: 'text-foreground',
      wash: 'bg-[rgb(148_163_184/0.14)]'
    }
  ];

  return (
    <div className="page">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0">
          <h1 className="page-title">Departments</h1>
          <p className="page-subtitle mt-1">
            {loading
              ? 'Loading…'
              : `${departments.length} ${departments.length === 1 ? 'department' : 'departments'} · ${formatCurrency(totalBudget)} combined budget`}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={handleExport}
            disabled={departments.length === 0}
            className="btn btn-outline"
          >
            <Download size={16} aria-hidden="true" />
            Export CSV
          </button>
          <button type="button" onClick={() => setShowAddModal(true)} className="btn btn-primary">
            <Plus size={16} aria-hidden="true" />
            Add department
          </button>
        </div>
      </div>

      {success && (
        <div className="alert alert-success" role="status">
          <CheckCircle size={16} className="mt-0.5 shrink-0" aria-hidden="true" />
          <p className="flex-1">{success}</p>
        </div>
      )}

      {error && (
        <div className="alert alert-danger" role="alert">
          <AlertCircle size={16} className="mt-0.5 shrink-0" aria-hidden="true" />
          <p className="flex-1">{error}</p>
        </div>
      )}

      {!loading && departments.length > 0 && (
        <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
          {tiles.map((tile, index) => (
            <div
              key={tile.label}
              className="card stagger-card flex items-start justify-between gap-3 p-4"
              style={{ '--i': index }}
            >
              <div className="min-w-0">
                <p className="kpi-label">{tile.label}</p>
                <p className="kpi-value mt-1.5 truncate-1">{tile.value}</p>
                <p className="mt-1.5 text-xs text-muted-foreground">{tile.detail}</p>
              </div>
              <span className={`kpi-icon ${tile.wash} ${tile.tone}`}>
                <tile.icon size={20} aria-hidden="true" />
              </span>
            </div>
          ))}
        </div>
      )}

      {loading ? (
        <div className="card flex items-center justify-center py-16" role="status" aria-live="polite">
          <span className="spinner spinner-lg text-accent" aria-hidden="true" />
          <span className="sr-only">Loading departments…</span>
        </div>
      ) : departments.length === 0 ? (
        <div className="card">
          <div className="empty-state">
            <span className="empty-state-icon" aria-hidden="true">
              <Building2 size={26} />
            </span>
            <p className="text-base font-medium text-foreground">No departments yet</p>
            <p className="max-w-sm text-sm">
              Every employee is assigned to a department, so this is the first thing to set up.
            </p>
            <button
              type="button"
              onClick={() => setShowAddModal(true)}
              className="btn btn-primary mt-1"
            >
              <Plus size={16} aria-hidden="true" />
              Add department
            </button>
          </div>
        </div>
      ) : (
        <ul className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
          {departments.map((dept, index) => (
            <DepartmentCard
              key={dept.id}
              department={dept}
              // Share of the combined budget. Zero when nothing is budgeted, so
              // an all-zero roster shows empty bars rather than NaN-width ones.
              share={totalBudget > 0 ? ((Number(dept.budget) || 0) / totalBudget) * 100 : 0}
              index={index}
              onDeleteSuccess={handleDeleteSuccess}
              onDeleteError={handleDeleteError}
            />
          ))}
        </ul>
      )}

      <AddDepartment
        showModal={showAddModal}
        setShowModal={setShowAddModal}
        onDepartmentAdded={loadDepartments}
      />
    </div>
  );
};

export default Departments;
