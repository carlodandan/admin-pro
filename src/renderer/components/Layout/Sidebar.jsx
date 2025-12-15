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

const Sidebar = ({ isOpen, toggleSidebar }) => {
  const location = useLocation();
  const currentPath = location.pathname;

  const navItems = [
    { icon: <Home size={20} />, label: 'Dashboard', path: '/dashboard' },
    { icon: <Users size={20} />, label: 'Employees', path: '/employees' },
    { icon: <Briefcase size={20} />, label: 'Departments', path: '/departments' },
    { icon: <Calendar size={20} />, label: 'Attendance', path: '/attendance' },
    { icon: <CreditCard size={20} />, label: 'Payroll', path: '/payroll' },
    { icon: <BarChart size={20} />, label: 'Analytics', path: '#' },
    { icon: <Settings size={20} />, label: 'Settings', path: '#' },
    { icon: <Shield size={20} />, label: 'Admin', path: '#' },
  ];

  return (
    <>
      {/* Mobile overlay */}
      {isOpen && (
        <div 
          className="fixed inset-0 z-40 lg:hidden"
          onClick={toggleSidebar}
        />
      )}

      {/* Sidebar */}
      <aside className={`
        fixed lg:relative lg:flex flex-col
        inset-y-0 left-0 z-50
        w-64 bg-linear-to-b from-gray-900 to-gray-800 text-white
        transform transition-transform duration-200 ease-in-out
        ${isOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'}
      `}>
        <div className="flex flex-col h-full">
          {/* Logo */}
          <div className="p-6 border-b border-gray-700">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-linear-to-br from-blue-500 to-purple-600 flex items-center justify-center">
                <Briefcase size={22} />
              </div>
              <div>
                <h1 className="text-xl font-bold">Admin<span className="text-blue-400">Pro</span></h1>
                <p className="text-gray-400 text-xs mt-1">Company Admin System</p>
              </div>
            </div>
          </div>

          {/* Navigation */}
          <nav className="flex-1 p-1.5">
            <p className="text-xs uppercase text-gray-400 font-semibold mb-4 px-1">Main Menu</p>
            <ul className="space-y-1">
              {navItems.map((item, index) => {
                const isActive = currentPath === item.path || 
                                (item.path === '/dashboard' && currentPath === '/') ||
                                currentPath.startsWith(item.path + '/');
                
                return (
                  <li key={index}>
                    <Link
                      to={item.path}
                      className={`flex items-center gap-3 p-3 rounded-lg transition-all duration-200 ${
                        isActive 
                          ? 'bg-gray-800 text-white shadow-lg' 
                          : 'hover:bg-gray-800/50 text-gray-300 hover:text-white'
                      }`}
                      onClick={() => window.innerWidth < 1024 && toggleSidebar()}
                    >
                      <div className={`p-1 rounded-md ${isActive ? 'bg-blue-500' : 'bg-gray-700'}`}>
                        {item.icon}
                      </div>
                      <span className="font-sm">{item.label}</span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          </nav>
        </div>
      </aside>
    </>
  );
};

export default Sidebar;