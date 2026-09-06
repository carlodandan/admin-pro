import React, { useState, useEffect } from 'react';
import { HashRouter, Routes, Route, Navigate } from 'react-router-dom';
import Layout from './components/Layout/Layout';
import Dashboard from './pages/Dashboard';
import Employees from './pages/Employees';
import Departments from './pages/Departments';
import Attendance from './pages/Attendance';
import Payroll from './pages/Payroll';
import Analytics from './pages/Analytics';
import LoginPage from './pages/LoginPage';
import Settings from './pages/Settings';
import RegistrationPage from './pages/RegistrationPage';
import ForgotPasswordPage from './pages/ForgotPasswordPage';
import { UserProvider } from './contexts/UserContext';
import AttendanceKiosk from './pages/AttendanceKiosk';

const SESSION_DURATION_MS = 60 * 60 * 1000; // 1 hour

// Protected Route Component
const ProtectedRoute = ({ children, isAuthenticated }) => {
  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }
  return children;
};

// Public Route Component (for auth pages when already authenticated)
const PublicRoute = ({ children, isAuthenticated }) => {
  if (isAuthenticated) {
    return <Navigate to="/dashboard" replace />;
  }
  return children;
};

function App() {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isRegistered, setIsRegistered] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [userInfo, setUserInfo] = useState(null);

  // Check authentication and registration status on mount
  useEffect(() => {
    checkAuthStatus();
  }, []);

  const checkAuthStatus = async () => {
    try {
      // Force logout on fresh app launch (security: require re-login every time app opens)
      // sessionStorage persists during the browser session but is cleared when the window closes.
      // If the sentinel is missing, this is a fresh app launch → clear auth data.
      if (!sessionStorage.getItem('appSessionActive')) {
        localStorage.removeItem('authToken');
        localStorage.removeItem('userInfo');
        localStorage.removeItem('loginTimestamp');
        // The backend decides afresh, on the next sign-in, whether this device
        // is still inside its offline grace. Carrying the last answer over would
        // let the header advertise days that may already be gone.
        localStorage.removeItem('offlineGrace');
        sessionStorage.setItem('appSessionActive', '1');
      }

      // First check if system is registered
      const registrationCheck = await window.api.isSystemRegistered();

      if (registrationCheck.success) {
        setIsRegistered(registrationCheck.isRegistered);

        // If registered, check if we have a stored token
        const token = localStorage.getItem('authToken');
        if (token) {
          // Check if session has expired
          const loginTime = parseInt(localStorage.getItem('loginTimestamp'), 10);
          if (loginTime && (Date.now() - loginTime) > SESSION_DURATION_MS) {
            // Session expired — force logout
            localStorage.removeItem('authToken');
            localStorage.removeItem('userInfo');
            localStorage.removeItem('loginTimestamp');
            localStorage.removeItem('offlineGrace');
          } else {
            const savedUser = localStorage.getItem('userInfo');
            if (savedUser) {
              setUserInfo(JSON.parse(savedUser));
              setIsAuthenticated(true);
            }
          }
        }
      }
    } catch (error) {
      console.error('Error checking auth status:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleRegistration = async (registrationData) => {
    try {
      const result = await window.api.registerSystem(registrationData);

      if (result.success) {
        // `register_system` answers `{ success, data }`, and the key is inside
        // `data`. Reading it off the top level — as this did — always found
        // `undefined`, and the page then fell back to displaying a key it had
        // generated itself, which unwraps nothing. The key is the cloud's now:
        // it is generated during registration, sealed under the password and
        // under itself, and this is the only moment it is ever readable.
        return {
          success: true,
          recoveryKey: result.data?.recoveryKey ?? null,
          recoveryKeyIssued: result.data?.recoveryKeyIssued === true
        };
      }
      return { success: false, error: result.error || 'Registration failed' };
    } catch (error) {
      console.error('Registration error:', error);
      return { success: false, error: error.message };
    }
  };

  const handleLogin = async (email, password) => {
    try {
      const result = await window.api.loginUser(email, password);

      if (result.success) {
        // Store authentication data
        localStorage.setItem('authToken', 'authenticated');

        // Create user info object
        const userData = {
          email: email,
          name: result.user?.name || email.split('@')[0],
          company: result.user?.company || 'Company Name',
          role: result.user?.role || 'Admin',
          position: 'System Administrator',
          department: 'IT Department'
        };

        localStorage.setItem('userInfo', JSON.stringify(userData));
        localStorage.setItem('loginTimestamp', Date.now().toString());
        setUserInfo(userData);
        setIsAuthenticated(true);

        // Load the stored profile over the placeholder name. This called
        // `getUserSettings`, which only selects `theme_preference` and
        // `language`, and then read `displayName`/`position`/`department` off
        // it — all three undefined, so the header kept the email prefix no
        // matter what was saved. `getUserProfile` returns the real columns,
        // named as the database names them. There is no `department` column.
        try {
          const storedProfile = await window.api.getUserProfile(email);
          if (storedProfile) {
            const updatedUserData = {
              ...userData,
              name: storedProfile.display_name || userData.name,
              position: storedProfile.position || userData.position
            };
            localStorage.setItem('userInfo', JSON.stringify(updatedUserData));
            setUserInfo(updatedUserData);
          }
        } catch (dbError) {
          console.warn('Could not load the stored profile on login:', dbError);
        }

        // The grace fields travel with the result rather than into
        // `localStorage`: they describe the *backend's* cached unlock, which
        // expires on its own schedule, and a stale copy in storage would tell
        // the user they have days left after the cache has already gone.
        return {
          success: true,
          user: userData,
          offline: result.offline === true,
          graceDaysRemaining: result.graceDaysRemaining ?? null,
          graceExpiresAt: result.graceExpiresAt ?? null
        };
      }
      // `requiresConnection` separates "this device has never been online with
      // this account, or its grace has lapsed" from a wrong password. The two
      // need different words on screen, and only the backend can tell them apart.
      return {
        success: false,
        error: result.error,
        requiresConnection: result.requiresConnection === true
      };
    } catch (error) {
      console.error('Login error:', error);
      return { success: false, error: 'Login failed' };
    }
  };

  // Password reset. The second argument is the recovery key issued at
  // registration; `api.js` still calls it `superAdminPassword` because that is
  // the Tauri command's parameter name.
  //
  // The result is passed straight through, including its failure shapes: with no
  // live session — which is the normal state of the forgot-password screen — the
  // backend answers `success: false` with `recoveryKeyVerified: true` and
  // `emailSent`, meaning the key was accepted and the new password is chosen
  // through the emailed link. Collapsing that into a generic error here would
  // report a working path as a broken one.
  const handlePasswordReset = async (email, recoveryKey, newPassword) => {
    try {
      const result = await window.api.resetAdminPassword(
        email,
        recoveryKey,
        newPassword
      );
      return result;
    } catch (error) {
      console.error('Password reset error:', error);
      return { success: false, error: 'Password reset failed' };
    }
  };

  const handleLogout = async () => {
    // The backend goes first. It holds the data key and the cloud session, and
    // dropping the key is the half that actually re-protects the encrypted
    // columns — clearing localStorage only hides the UI. It answers immediately
    // and cannot fail for want of a connection, but a rejection still must not
    // strand the user on a signed-in screen, so the local clear is unconditional.
    try {
      await window.api.logoutUser();
    } catch (error) {
      console.error('Error signing out of the backend:', error);
    }

    localStorage.removeItem('authToken');
    localStorage.removeItem('userInfo');
    localStorage.removeItem('loginTimestamp');
    localStorage.removeItem('offlineGrace');
    setUserInfo(null);
    setIsAuthenticated(false);
  };

  // Session timeout — check every minute if 1 hour has elapsed
  useEffect(() => {
    if (!isAuthenticated) return;

    const checkSession = () => {
      const loginTime = parseInt(localStorage.getItem('loginTimestamp'), 10);
      if (!loginTime || (Date.now() - loginTime) > SESSION_DURATION_MS) {
        handleLogout();
      }
    };

    const intervalId = setInterval(checkSession, 60 * 1000); // check every 60s
    return () => clearInterval(intervalId);
  }, [isAuthenticated]);

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div
          className="flex flex-col items-center gap-4"
          role="status"
          aria-live="polite"
        >
          <span className="spinner spinner-lg text-accent" aria-hidden="true" />
          <p className="text-sm text-muted-foreground">Checking system registration…</p>
        </div>
      </div>
    );
  }

  return (
    <UserProvider> {/* Wrap everything with UserProvider */}
      <HashRouter>
        <Routes>
          {/* Authentication Routes */}
          <Route path="/login" element={
            <PublicRoute isAuthenticated={isAuthenticated}>
              {isRegistered ? (
                <LoginPage onLogin={handleLogin} />
              ) : (
                <Navigate to="/register" replace />
              )}
            </PublicRoute>
          } />

          <Route path="/register" element={
            <PublicRoute isAuthenticated={isAuthenticated}>
              {isRegistered ? (
                <Navigate to="/login" replace />
              ) : (
                <RegistrationPage
                  onRegister={handleRegistration}
                  onComplete={() => setIsRegistered(true)}
                />
              )}
            </PublicRoute>
          } />

          {/* Add Forgot Password Route */}
          <Route path="/forgot-password" element={
            <PublicRoute isAuthenticated={isAuthenticated}>
              {isRegistered ? (
                <ForgotPasswordPage onResetPassword={handlePasswordReset} />
              ) : (
                <Navigate to="/register" replace />
              )}
            </PublicRoute>
          } />

          {/* Protected Routes */}
          <Route path="/kiosk" element={
            <ProtectedRoute isAuthenticated={isAuthenticated}>
              <AttendanceKiosk />
            </ProtectedRoute>
          } />

          <Route path="/" element={
            <ProtectedRoute isAuthenticated={isAuthenticated}>
              <Layout userInfo={userInfo} onLogout={handleLogout} />
            </ProtectedRoute>
          }>
            <Route index element={<Navigate to="/dashboard" replace />} />
            <Route path="dashboard" element={<Dashboard />} />
            <Route path="employees" element={<Employees />} />
            <Route path="departments" element={<Departments />} />
            <Route path="attendance" element={<Attendance />} />
            <Route path="payroll" element={<Payroll />} />
            <Route path="analytics" element={<Analytics />} />
            <Route path="settings" element={<Settings />} />
          </Route>

          {/* Catch all - redirect based on auth status */}
          <Route path="*" element={
            isAuthenticated ?
              <Navigate to="/dashboard" replace /> :
              isRegistered ?
                <Navigate to="/login" replace /> :
                <Navigate to="/register" replace />
          } />
        </Routes>
      </HashRouter>
    </UserProvider>
  );
}

export default App;
