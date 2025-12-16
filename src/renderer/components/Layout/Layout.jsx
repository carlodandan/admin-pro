import React, { useState } from 'react';
import { Outlet } from 'react-router-dom';
import Sidebar from './Sidebar';
import Header from './Header';

const Layout = ({ userInfo, onLogout }) => {
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);

  const toggleSidebar = () => {
    setIsSidebarOpen(!isSidebarOpen);
  };

  const toggleCollapse = () => {
    setIsSidebarCollapsed(!isSidebarCollapsed);
  };

  return (
    <div className="flex h-screen bg-gray-50">
      <Sidebar 
        isOpen={isSidebarOpen}
        toggleSidebar={toggleSidebar}
        isCollapsed={isSidebarCollapsed}
        toggleCollapse={toggleCollapse}
      />
      
      <div className={`flex-1 flex flex-col overflow-hidden transition-all duration-300 ${
        isSidebarCollapsed ? 'lg:ml-0' : 'lg:ml-0'
      }`}>
        <Header 
          userInfo={userInfo} 
          onLogout={onLogout}
          toggleSidebar={toggleSidebar}
        />
        <main className="flex-1 overflow-y-auto p-6">
          <Outlet />
        </main>
      </div>
    </div>
  );
};

export default Layout;