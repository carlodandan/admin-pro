import React, { useState, useEffect } from 'react';
import { LogOut, Bell, User, ChevronDown, Building } from 'lucide-react';
import { useUser } from '../../contexts/UserContext';

const Header = ({ onLogout }) => {
  const [showUserMenu, setShowUserMenu] = useState(false);
  const [companyName, setCompanyName] = useState('');
  const [adminName, setAdminName] = useState('');
  const { user } = useUser();

  // Load company name from auth database
  useEffect(() => {
    loadCompanyName();
  }, []);

  const loadCompanyName = async () => {
    try {
      const regInfo = await window.electronAPI.getRegistrationInfo();
      if (regInfo && regInfo.success && regInfo.data) {
        setCompanyName(regInfo.data.company_name || 'Company Name');
        setAdminName(regInfo.data.admin_name || user.displayName || 'Admin');
      } else {
        setCompanyName('Company Name');
      }
    } catch (error) {
      console.error('Error loading company name:', error);
    }
  };

  const handleLogout = () => {
    if (onLogout) {
      onLogout();
    }
  };

  return (
    <header className="bg-white border-b border-gray-200 px-3 py-0.5">
      <div className="flex items-center justify-between">
        <div className="flex-1">
          <div className="flex items-center space-x-4">
            <div>
              <h1 className="text-2xl font-semibold text-gray-800">
                {companyName}
              </h1>
            </div>
          </div>
        </div>

        <div className="flex items-center space-x-4">
          <button className="p-2 hover:bg-gray-100 rounded-lg transition-colors">
            <Bell className="h-5 w-5 text-gray-600" />
          </button>

          {/* User Menu */}
          <div className="relative">
            <button
              onClick={() => setShowUserMenu(!showUserMenu)}
              className="flex items-center space-x-3 p-2 hover:bg-gray-100 rounded-lg transition-colors"
            >
              {/* Avatar display */}
              <div className="w-10 h-10 rounded-full overflow-hidden flex items-center justify-center border-2 border-gray-200">
                {user.avatar ? (
                  <img
                    src={user.avatar}
                    alt={user.displayName}
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <div className="w-full h-full bg-gradient-to-r from-blue-500 to-purple-600 flex items-center justify-center">
                    <User className="h-5 w-5 text-white" />
                  </div>
                )}
              </div>

              <div className="text-left">
                <p className="text-sm font-medium text-gray-700">
                  {adminName || user.displayName}
                </p>
                <p className="text-xs text-gray-500 capitalize">
                  {user.position}
                </p>
              </div>

              <ChevronDown className={`h-4 w-4 text-gray-400 transition-transform duration-200 ${showUserMenu ? 'transform rotate-180' : ''
                }`} />
            </button>

            {/* Dropdown Menu */}
            {showUserMenu && (
              <>
                <div
                  className="fixed inset-0 z-10"
                  onClick={() => setShowUserMenu(false)}
                />
                <div className="absolute right-0 mt-2 w-54 bg-white rounded-lg shadow-lg border border-gray-200 z-20">
                  <div className="p-4 border-b border-gray-100">
                    <p className="text-sm font-medium text-gray-900">
                      {adminName || user.displayName}
                    </p>
                    <p className="text-xs text-gray-500">{user.email}</p>
                    <div className="flex items-center mt-1">
                      <p className="text-xs text-gray-500 truncate">
                        {companyName}
                      </p>
                    </div>
                  </div>
                  <div className="p-2">
                    <a
                      href="#/settings"
                      onClick={() => setShowUserMenu(false)}
                      className="block px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 rounded-md transition-colors"
                    >
                      Profile Settings
                    </a>
                    <button
                      onClick={handleLogout}
                      className="w-full flex items-center space-x-2 px-4 py-2 text-sm text-red-600 hover:bg-red-50 rounded-md transition-colors"
                    >
                      <LogOut className="h-4 w-4" />
                      <span>Logout</span>
                    </button>
                  </div>
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    </header>
  );
};

export default Header;