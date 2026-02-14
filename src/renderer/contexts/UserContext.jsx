import React, { createContext, useState, useContext, useEffect } from 'react';

const UserContext = createContext();

export const UserProvider = ({ children }) => {
  const [user, setUser] = useState({
    email: '',
    displayName: '',
    avatar: '',
    position: '',
    department: '',
    role: '',
    loading: true
  });

  useEffect(() => {
    loadUserProfile();

    // Listen for profile updates from Settings page
    const handleProfileUpdate = (event) => {
      if (event.detail) {
        setUser(prev => ({
          ...prev,
          displayName: event.detail.displayName || prev.displayName,
          avatar: event.detail.avatar || prev.avatar,
          email: event.detail.email || prev.email,
          position: event.detail.position || prev.position,
          department: event.detail.department || prev.department
        }));
      }
    };

    // Listen for avatar updates
    const handleAvatarUpdate = (event) => {
      if (event.detail?.avatar) {
        setUser(prev => ({
          ...prev,
          avatar: event.detail.avatar
        }));
      }
    };

    window.addEventListener('profileUpdated', handleProfileUpdate);
    window.addEventListener('avatarUpdated', handleAvatarUpdate);

    return () => {
      window.removeEventListener('profileUpdated', handleProfileUpdate);
      window.removeEventListener('avatarUpdated', handleAvatarUpdate);
    };
  }, []);

  const loadUserProfile = async () => {
    try {
      const currentUserEmail = getCurrentUserEmail();

      if (!currentUserEmail) {
        console.warn('No current user email found, using default');
        setUser(prev => ({
          ...prev,
          email: 'adminpro@company.com',
          displayName: 'Administrator',
          loading: false
        }));
        return;
      }

      const userData = await window.electronAPI.getUserSettings(currentUserEmail);

      if (userData) {
        setUser({
          email: userData.email || currentUserEmail,
          displayName: userData.displayName || 'Administrator',
          avatar: userData.avatar || '',
          position: userData.position || 'System Administrator',
          role: 'Admin',
          loading: false
        });
      } else {
        setUser({
          email: currentUserEmail,
          displayName: currentUserEmail.split('@')[0],
          avatar: '',
          position: 'System Administrator',
          role: 'Admin',
          loading: false
        });
      }
    } catch (error) {
      console.error('Error loading user profile from database:', error);
      setUser({
        email: 'adminpro@company.com',
        displayName: 'Administrator',
        avatar: '',
        position: 'System Administrator',
        role: 'Admin',
        loading: false
      });
    }
  };

  // Helper function to get current user email
  // You'll need to implement this based on your auth system
  const getCurrentUserEmail = () => {
    try {
      // Get from userInfo in localStorage
      const userInfoStr = localStorage.getItem('userInfo');
      if (userInfoStr) {
        const userInfo = JSON.parse(userInfoStr);
        if (userInfo && userInfo.email) {
          return userInfo.email;
        }
      }
      return null;
    } catch (e) {
      console.error('Error reading user info from storage:', e);
      return null;
    }
  };

  const updateUser = (updates) => {
    setUser(prev => ({ ...prev, ...updates }));
  };

  return (
    <UserContext.Provider value={{ user, updateUser }}>
      {children}
    </UserContext.Provider>
  );
};

export const useUser = () => {
  const context = useContext(UserContext);
  if (!context) {
    throw new Error('useUser must be used within a UserProvider');
  }
  return context;
};