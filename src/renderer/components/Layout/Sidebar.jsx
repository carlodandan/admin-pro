// src/components/Sidebar.jsx
import React from 'react';
import { Link, useLocation } from 'react-router-dom';
import {
  Users,
  Calendar,
  CreditCard,
  BarChart,
  Settings,
  Home,
  Briefcase,
  Shield
} from 'lucide-react';
import adminProLogo from '../../../../icons/adminpro.png';

const Sidebar = ({ isOpen, toggleSidebar, onNavigate }) => {
  const location = useLocation();
  const currentPath = location.pathname;

  const navItems = [
    { icon: Home, label: 'Dashboard', path: '/dashboard' },
    { icon: Users, label: 'Employees', path: '/employees' },
    { icon: Briefcase, label: 'Departments', path: '/departments' },
    { icon: Calendar, label: 'Attendance', path: '/attendance' },
    { icon: CreditCard, label: 'Payroll', path: '/payroll' },
    { icon: BarChart, label: 'Analytics', path: '/analytics' },
    { icon: Settings, label: 'Settings', path: '/settings' },
    // Declared with `path: '#'` from the start and never implemented. Rendered
    // as an unavailable item instead of a link, so it stops silently bouncing
    // to the dashboard through the catch-all route.
    { icon: Shield, label: 'Admin', path: '#', disabled: true }
  ];

  return (
    <>
      {/* Off-canvas scrim. Only reachable below the lg breakpoint. */}
      {isOpen && (
        <div
          className="fixed inset-0 z-40 bg-[rgb(2_6_23/0.6)] backdrop-blur-[2px] lg:hidden"
          onClick={toggleSidebar}
          aria-hidden="true"
        />
      )}

      <aside
        className={`glass fixed inset-y-0 left-0 z-50 flex w-[232px] flex-col border-y-0 border-l-0 transition-transform duration-200 ease-out lg:relative lg:translate-x-0 ${
          isOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        <div className="flex items-center gap-3 border-b border-[rgb(248_250_252/0.09)] px-4 py-4">
          <div className="flex h-9 w-9 items-center justify-center overflow-hidden rounded-lg border border-[rgb(248_250_252/0.18)] bg-primary">
            <img src={adminProLogo} alt="" className="h-full w-full object-contain" />
          </div>
          <h1 className="font-display text-lg font-semibold tracking-tight">
            Admin<span className="text-accent">Pro</span>
          </h1>
        </div>

        <nav aria-label="Main" className="flex-1 overflow-y-auto px-3 py-4">
          <p className="eyebrow mb-3 px-2">Main Menu</p>
          <ul className="space-y-1">
            {navItems.map((item) => {
              const Icon = item.icon;
              const isActive =
                !item.disabled &&
                (currentPath === item.path ||
                  (item.path === '/dashboard' && currentPath === '/') ||
                  currentPath.startsWith(item.path + '/'));

              if (item.disabled) {
                return (
                  <li key={item.label}>
                    <span
                      className="nav-item cursor-not-allowed opacity-45"
                      aria-disabled="true"
                    >
                      <Icon size={18} className="nav-icon" aria-hidden="true" />
                      <span className="flex-1">{item.label}</span>
                      <span className="pill">Soon</span>
                    </span>
                  </li>
                );
              }

              return (
                <li key={item.label}>
                  <Link
                    to={item.path}
                    // Below `lg` the drawer sits over the content, so following
                    // a link has to close it or the next screen is hidden
                    // behind it.
                    onClick={onNavigate}
                    aria-current={isActive ? 'page' : undefined}
                    className={`nav-item ${isActive ? 'nav-item-active' : ''}`}
                  >
                    <Icon size={18} className="nav-icon" aria-hidden="true" />
                    <span>{item.label}</span>
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>
      </aside>
    </>
  );
};

export default Sidebar;
