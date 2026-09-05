import React, { useEffect, useState } from 'react';
import { Outlet } from 'react-router-dom';
import Sidebar from './Sidebar';
import Header from './Header';
import { useUser } from '../../contexts/UserContext';

const Layout = ({ userInfo, onLogout }) => {
  const { updateUser } = useUser();
  // Sidebar state lives here rather than in Sidebar: the header's toggle and
  // the mobile overlay both need it. Previously `isOpen`/`toggleSidebar` were
  // declared by Sidebar but never passed, so the overlay could not close.
  const [sidebarOpen, setSidebarOpen] = useState(false);

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

  // Following a nav link closes the off-canvas drawer, so the next screen is
  // not hidden behind it. This used to be an effect on `location.pathname`,
  // which meant a second render pass on every navigation; the drawer is only
  // reachable from the links and the scrim, so closing it where the click
  // happens covers the same ground and closes on the tap rather than after the
  // route commits.
  const closeSidebar = () => setSidebarOpen(false);

  return (
    <div className="flex h-screen overflow-hidden">
      {/* First focusable element in the tree, so a keyboard user can jump the
          eight nav links. Off-screen until focused. */}
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:fixed focus:top-3 focus:left-3 focus:z-[100] focus:rounded-lg focus:bg-accent focus:px-4 focus:py-2 focus:text-sm focus:font-semibold focus:text-accent-foreground"
      >
        Skip to main content
      </a>
      <Sidebar
        isOpen={sidebarOpen}
        toggleSidebar={() => setSidebarOpen((open) => !open)}
        onNavigate={closeSidebar}
      />
      <div className="flex flex-1 flex-col overflow-hidden">
        <Header
          userInfo={userInfo}
          onLogout={onLogout}
          onToggleSidebar={() => setSidebarOpen((open) => !open)}
        />
        {/* `id` gives the skip link a target. */}
        <main id="main-content" className="flex-1 overflow-y-auto px-4 py-4">
          <Outlet />
        </main>
      </div>
    </div>
  );
};

export default Layout;
