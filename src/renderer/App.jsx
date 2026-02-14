import React, { useState, useEffect } from 'react';
import { HashRouter, Routes, Route, Navigate } from 'react-router-dom';
import Layout from './components/Layout/Layout';
import Dashboard from './pages/Dashboard';
import Employees from './pages/Employees';
import Departments from './pages/Departments';
import Attendance from './pages/Attendance';
import Payroll from './pages/Payroll';
import LoginPage from './pages/LoginPage';
import Settings from './pages/Settings';
import RegistrationPage from './pages/RegistrationPage';
import ForgotPasswordPage from './pages/ForgotPasswordPage';
import { UserProvider } from './contexts/UserContext';
import AttendanceKiosk from './pages/AttendanceKiosk';

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
      // First check if system is registered
      const registrationCheck = await window.electronAPI.isSystemRegistered();

      if (registrationCheck.success) {
        setIsRegistered(registrationCheck.isRegistered);

        // If registered, check if we have a stored token
        const token = localStorage.getItem('authToken');
        if (token) {
          // In a real app, you would validate the token here
          // For now, we'll just check if we have user info in localStorage
          const savedUser = localStorage.getItem('userInfo');
          if (savedUser) {
            setUserInfo(JSON.parse(savedUser));
            setIsAuthenticated(true);
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

      const result = await window.electronAPI.registerSystem(registrationData);



      if (result.success) {
        // Return the success result with the super admin password
        return {
          success: true,
          superAdminPassword: result.superAdminPassword // Make sure backend returns this
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
      const result = await window.electronAPI.loginUser(email, password);

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
        setUserInfo(userData);
        setIsAuthenticated(true);

        // Load user profile from database
        try {
          const userSettings = await window.electronAPI.getUserSettings(email);
          if (userSettings) {
            const updatedUserData = {
              ...userData,
              name: userSettings.displayName || userData.name,
              position: userSettings.position || userData.position,
              department: userSettings.department || userData.department
            };
            localStorage.setItem('userInfo', JSON.stringify(updatedUserData));
            setUserInfo(updatedUserData);
          }
        } catch (dbError) {
          console.warn('Could not load user settings on login:', dbError);
        }

        return { success: true, user: userData };
      }
      return { success: false, error: result.error };
    } catch (error) {
      console.error('Login error:', error);
      return { success: false, error: 'Login failed' };
    }
  };

  // Function for password reset
  const handlePasswordReset = async (email, superAdminPassword, newPassword) => {
    try {
      const result = await window.electronAPI.resetAdminPassword(
        email,
        superAdminPassword,
        newPassword
      );
      return result;
    } catch (error) {
      console.error('Password reset error:', error);
      return { success: false, error: 'Password reset failed' };
    }
  };

  const handleLogout = () => {
    localStorage.removeItem('authToken');
    localStorage.removeItem('userInfo');
    setUserInfo(null);
    setIsAuthenticated(false);
  };

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-900">
        <div className="flex flex-col items-center">
          <div className="h-12 w-12 border-4 border-blue-500 border-t-transparent rounded-full animate-spin mb-4"></div>
          <p className="text-gray-400">Checking system registration...</p>
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
                <RegistrationPage onRegister={handleRegistration} />
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