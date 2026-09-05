import React, { useState, useEffect, useRef } from 'react';
import { LogOut, User, ChevronDown, Menu, UserCog } from 'lucide-react';
import { useUser } from '../../contexts/UserContext';
import { manilaDateLabel, manilaTime } from '../../utils/manila';

const Header = ({ onLogout, onToggleSidebar }) => {
  const [showUserMenu, setShowUserMenu] = useState(false);
  const [companyName, setCompanyName] = useState('');
  const [adminName, setAdminName] = useState('');
  const [clock, setClock] = useState(() => manilaTime());
  const menuButtonRef = useRef(null);
  const { user } = useUser();

  const loadCompanyName = async () => {
    try {
      const regInfo = await window.api.getRegistrationInfo();
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

  // Load company name from auth database. Declared above the effect that calls
  // it: the effect only runs after the whole body has, so either order works at
  // runtime, but reading a `const` that is initialised further down is what
  // `react-hooks/immutability` flags.
  useEffect(() => {
    loadCompanyName();
  }, []);

  // The whole app runs on Manila time, so the chrome shows it rather than
  // leaving the operator to trust the OS clock.
  useEffect(() => {
    const id = setInterval(() => setClock(manilaTime()), 1000);
    return () => clearInterval(id);
  }, []);

  const handleLogout = () => {
    if (onLogout) {
      onLogout();
    }
  };

  // Escape closes the menu and returns focus to the control that opened it.
  useEffect(() => {
    if (!showUserMenu) return;
    const onKeyDown = (event) => {
      if (event.key === 'Escape') {
        setShowUserMenu(false);
        menuButtonRef.current?.focus();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [showUserMenu]);

  const displayName = adminName || user.displayName || 'Admin';

  return (
    <header className="glass z-30 flex h-16 shrink-0 items-center gap-4 border-x-0 border-t-0 px-4">
      <button
        type="button"
        onClick={onToggleSidebar}
        className="btn btn-ghost btn-icon lg:hidden"
        aria-label="Toggle navigation menu"
      >
        <Menu size={20} aria-hidden="true" />
      </button>

      <h1 className="min-w-0 flex-1 truncate-1 font-display text-lg font-semibold" title={companyName}>
        {companyName}
      </h1>

      <div className="surface-muted hidden items-center gap-2 px-3 py-1.5 md:flex">
        <span className="text-xs text-muted-foreground">{manilaDateLabel()}</span>
        <span className="h-3 w-px bg-border" aria-hidden="true" />
        <span className="font-display text-sm tabular-nums">{clock}</span>
        <span className="text-[10px] font-semibold tracking-wide text-muted-foreground">PHT</span>
      </div>

      <div className="relative">
        <button
          ref={menuButtonRef}
          type="button"
          onClick={() => setShowUserMenu(!showUserMenu)}
          aria-haspopup="menu"
          aria-expanded={showUserMenu}
          className="flex h-11 items-center gap-3 rounded-control px-2 transition-colors duration-150 hover:bg-[rgb(248_250_252/0.06)]"
        >
          <span className="avatar h-9 w-9 text-sm">
            {user.avatar ? (
              <img src={user.avatar} alt="" />
            ) : (
              <User size={18} aria-hidden="true" />
            )}
          </span>

          <span className="hidden text-left sm:block">
            <span className="block max-w-[160px] truncate-1 text-sm font-medium">
              {displayName}
            </span>
            <span className="block max-w-[160px] truncate-1 text-xs text-muted-foreground">
              {user.position || 'Administrator'}
            </span>
          </span>

          <ChevronDown
            size={16}
            aria-hidden="true"
            className={`text-muted-foreground transition-transform duration-150 ${
              showUserMenu ? 'rotate-180' : ''
            }`}
          />
        </button>

        {showUserMenu && (
          <>
            <div
              className="fixed inset-0 z-10"
              onClick={() => setShowUserMenu(false)}
              aria-hidden="true"
            />
            <div role="menu" className="popover absolute right-0 z-20 mt-2 w-64 p-2">
              <div className="border-b border-[rgb(248_250_252/0.09)] px-3 pb-3 pt-2">
                <p className="text-sm font-semibold">{displayName}</p>
                <p className="wrap-anywhere text-xs text-muted-foreground">{user.email}</p>
                {companyName && (
                  <p className="mt-1 truncate-1 text-xs text-muted-foreground">{companyName}</p>
                )}
              </div>
              <div className="pt-2">
                <a
                  href="#/settings"
                  role="menuitem"
                  onClick={() => setShowUserMenu(false)}
                  className="menu-item"
                >
                  <UserCog size={16} aria-hidden="true" />
                  <span>Profile Settings</span>
                </a>
                <button
                  type="button"
                  role="menuitem"
                  onClick={handleLogout}
                  className="menu-item menu-item-danger"
                >
                  <LogOut size={16} aria-hidden="true" />
                  <span>Logout</span>
                </button>
              </div>
            </div>
          </>
        )}
      </div>
    </header>
  );
};

export default Header;
