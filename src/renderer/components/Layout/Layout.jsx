import React, { useEffect } from 'react';
import { Outlet } from 'react-router-dom';
import Sidebar from './Sidebar';
import Header from './Header';
import { useUser } from '../../contexts/UserContext';

const Layout = ({ userInfo, onLogout }) => {
  const { updateUser } = useUser();

  // Sync UserContext with App state
  useEffect(() => {
    if (userInfo) {
      updateUser({
        email: userInfo.email,
        displayName: userInfo.name,
        position: userInfo.position,
        department: userInfo.department,
        role: userInfo.role,
        company: userInfo.company
      });
    }
  }, [userInfo]);
  return (
    <div className="flex h-screen bg-gray-50">
      <Sidebar userInfo={userInfo} />
      <div className="flex-1 flex flex-col overflow-hidden">
        <Header userInfo={userInfo} onLogout={onLogout} />
        <main className="flex-1 overflow-y-auto p-3">
          <Outlet />
        </main>
      </div>
    </div>
  );
};

export default Layout;