import React from 'react';
import { Search, Bell, User, Menu, HelpCircle, Download, Filter } from 'lucide-react';

const Header = ({ toggleSidebar }) => {
  return (
    <header className="sticky top-0 z-40 bg-white/95 backdrop-blur-md border-b border-gray-200">
      <div className="flex items-center justify-between px-6 py-4">
        <div className="flex items-center gap-4">
          <button
            onClick={toggleSidebar}
            className="lg:hidden p-2 rounded-lg hover:bg-gray-100 transition-colors"
            aria-label="Toggle menu"
          >
            <Menu size={24} />
          </button>
          
          {/* Page Title */}
          <div className="hidden md:block">
            <h2 className="text-xl font-bold text-gray-900">Dashboard Overview</h2>
            <p className="text-sm text-gray-600">Welcome to your admin panel</p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          {/* Search Bar */}
          <div className="relative hidden md:block">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" size={20} />
            <input
              type="text"
              placeholder="Search employees, reports, settings..."
              className="pl-10 pr-4 py-2.5 w-80 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-gray-50"
            />
          </div>

          {/* Action Buttons */}
          <div className="flex items-center gap-2">
            <button className="p-2.5 rounded-lg hover:bg-gray-100 transition-colors" title="Export Data">
              <Download size={20} className="text-gray-600" />
            </button>
            <button className="p-2.5 rounded-lg hover:bg-gray-100 transition-colors" title="Filter">
              <Filter size={20} className="text-gray-600" />
            </button>
            <button className="p-2.5 rounded-lg hover:bg-gray-100 transition-colors" title="Help">
              <HelpCircle size={20} className="text-gray-600" />
            </button>
          </div>

          {/* Notifications */}
          <div className="relative">
            <button className="relative p-2.5 rounded-lg hover:bg-gray-100 transition-colors group">
              <Bell size={22} className="text-gray-600 group-hover:text-gray-900" />
              <span className="absolute top-1.5 right-1.5 w-2.5 h-2.5 bg-red-500 rounded-full border-2 border-white"></span>
            </button>
          </div>

          {/* User Profile */}
          <div className="flex items-center gap-3 pl-3 border-l border-gray-200">
            <div className="text-right hidden md:block">
              <p className="font-semibold text-gray-900">Administrator</p>
              <p className="text-sm text-gray-500">admin@company.com</p>
            </div>
            <div className="relative group">
              <div className="w-10 h-10 rounded-xl bg-linear-to-br from-blue-500 to-purple-600 flex items-center justify-center text-white cursor-pointer">
                <User size={20} />
              </div>
              <div className="absolute right-0 top-full mt-2 w-48 bg-white rounded-xl shadow-lg border border-gray-200 opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all duration-200">
                <div className="p-3 border-b border-gray-100">
                  <p className="font-semibold">Admin Account</p>
                  <p className="text-sm text-gray-500">Super Admin</p>
                </div>
                <div className="p-2">
                  <a href="#" className="block px-3 py-2 rounded-lg hover:bg-gray-50 text-gray-700">Profile Settings</a>
                  <a href="#" className="block px-3 py-2 rounded-lg hover:bg-gray-50 text-gray-700">Account Settings</a>
                  <a href="#" className="block px-3 py-2 rounded-lg hover:bg-gray-50 text-red-600">Logout</a>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Breadcrumb */}
      <div className="px-6 pb-3">
        <div className="flex items-center gap-2 text-sm">
          <span className="text-gray-500">Home</span>
          <span className="text-gray-400">/</span>
          <span className="text-gray-500">Dashboard</span>
          <span className="text-gray-400">/</span>
          <span className="text-blue-600 font-medium">Overview</span>
        </div>
      </div>
    </header>
  );
};

export default Header;