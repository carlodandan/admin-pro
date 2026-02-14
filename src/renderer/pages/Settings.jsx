import React, { useState, useEffect } from 'react';
import {
  User, Camera, Save, Lock, Bell, Palette, Database, Shield,
  Moon, Sun, Globe, CreditCard, FileText, Download, Key,
  Mail, Phone, Building, MapPin, Calendar, AlertCircle,
  CheckCircle, XCircle
} from 'lucide-react';

const Settings = () => {
  const [activeTab, setActiveTab] = useState('profile');
  const [loading, setLoading] = useState(false);
  const [saveStatus, setSaveStatus] = useState(null);
  const [currentUserEmail, setCurrentUserEmail] = useState('adminpro@company.com');
  const [companyInfo, setCompanyInfo] = useState(null);

  // User Profile State - REMOVED department and hireDate
  const [profile, setProfile] = useState({
    email: 'adminpro@company.com',
    displayName: 'Admin Pro',
    phone: '+63(900)000-0000',
    position: 'System Administrator',
    avatar: '',
    bio: 'System administrator with full access to all features.'
  });

  // Security State
  const [security, setSecurity] = useState({
    currentPassword: '',
    newPassword: '',
    confirmPassword: '',
    twoFactorEnabled: false,
    sessionTimeout: 30
  });

  // Appearance State
  const [appearance, setAppearance] = useState({
    theme: 'light',
    language: 'en',
    fontSize: 'medium',
    compactMode: false,
    showNotifications: true,
    emailNotifications: true,
    soundEnabled: true
  });

  // Company State - INITIALLY EMPTY, WILL LOAD FROM AUTH DATABASE
  const [company, setCompany] = useState({
    name: '',
    email: '',
    phone: '',
    taxId: '123-456-789-000',
    address: '',
    currency: 'PHP',
    timezone: 'Asia/Manila',
    workDays: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'],
    workHours: '9:00 AM - 6:00 PM',
    cutoffDays: [15, 30]
  });

  // Load user profile from database on component mount
  useEffect(() => {
    loadUserProfile();
    loadCompanyInfo(); // Load company info from auth database
  }, []);

  // Load company information from auth database
  const loadCompanyInfo = async () => {
    try {
      const regInfo = await window.electronAPI.getRegistrationInfo();
      if (regInfo && regInfo.success && regInfo.data) {
        const companyData = regInfo.data;
        setCompanyInfo(companyData);

        // Update company state with data from auth database
        setCompany(prev => ({
          ...prev,
          name: companyData.company_name || '',
          email: companyData.company_email || '',
          phone: companyData.company_phone || '',
          address: companyData.company_address || ''
        }));

        // Always use admin_name and admin_email from registration_credentials
        if (companyData.admin_name) {
          setProfile(prev => ({ ...prev, displayName: companyData.admin_name }));
        }
        if (companyData.admin_email) {
          setProfile(prev => ({ ...prev, email: companyData.admin_email }));
          setCurrentUserEmail(companyData.admin_email);
        }
      }
    } catch (error) {
      console.error('Error loading company info:', error);
    }
  };

  const loadUserProfile = async () => {
    try {
      const userData = await window.electronAPI.getUserSettings(currentUserEmail);
      if (userData) {
        setProfile({
          email: userData.email || 'adminpro@company.com',
          displayName: userData.displayName || 'Admin Pro',
          phone: userData.phone || '+63(900)000-0000',
          position: userData.position || 'System Administrator',
          avatar: userData.avatar || '',
          bio: userData.bio || 'System administrator with full access to all features.'
        });

        // Also update appearance if saved
        if (userData.themePreference || userData.language) {
          setAppearance(prev => ({
            ...prev,
            theme: userData.themePreference || 'light',
            language: userData.language || 'en'
          }));
        }
      }
    } catch (error) {
      console.error('Error loading user profile:', error);
    }
  };

  // Handle profile changes
  const handleProfileChange = (field, value) => {
    setProfile(prev => ({
      ...prev,
      [field]: value
    }));
  };

  // Handle security changes
  const handleSecurityChange = (field, value) => {
    setSecurity(prev => ({
      ...prev,
      [field]: value
    }));
  };

  // Handle appearance changes
  const handleAppearanceChange = (field, value) => {
    setAppearance(prev => ({
      ...prev,
      [field]: value
    }));
  };

  // Handle company changes
  const handleCompanyChange = (field, value) => {
    setCompany(prev => ({
      ...prev,
      [field]: value
    }));
  };

  // Save company info to auth database
  const saveCompanyInfo = async () => {
    try {
      // This would require a new IPC handler to update company info
      // For now, we'll just save to local storage
      localStorage.setItem('companyInfo', JSON.stringify(company));

      setSaveStatus({
        type: 'success',
        message: 'Company information saved!'
      });

      setTimeout(() => setSaveStatus(null), 3000);
    } catch (error) {
      console.error('Error saving company info:', error);
      setSaveStatus({
        type: 'error',
        message: 'Failed to save company information'
      });
    }
  };

  // Handle avatar upload
  const handleAvatarUpload = async (event) => {
    const file = event.target.files[0];
    if (!file) return;

    // Check file size (limit to 2MB)
    if (file.size > 2 * 1024 * 1024) {
      setSaveStatus({
        type: 'error',
        message: 'Image size must be less than 2MB'
      });
      return;
    }

    const reader = new FileReader();
    reader.onloadend = async () => {
      const base64Data = reader.result;

      try {
        // Save to database
        await window.electronAPI.updateUserAvatar(currentUserEmail, base64Data);

        // Update local state
        handleProfileChange('avatar', base64Data);

        // Broadcast avatar change to other components (like header)
        window.dispatchEvent(new CustomEvent('avatarUpdated', {
          detail: { avatar: base64Data }
        }));

        setSaveStatus({
          type: 'success',
          message: 'Profile picture updated successfully!'
        });

        setTimeout(() => setSaveStatus(null), 3000);
      } catch (error) {
        console.error('Error saving avatar:', error);
        setSaveStatus({
          type: 'error',
          message: 'Failed to update profile picture'
        });
      }
    };
    reader.readAsDataURL(file);
  };

  // Save settings to database
  const saveSettings = async () => {
    setLoading(true);
    setSaveStatus(null);

    try {
      // Prepare user data for database - REMOVED department and hireDate
      const userData = {
        email: profile.email,
        displayName: profile.displayName,
        avatar: profile.avatar,
        phone: profile.phone,
        position: profile.position,
        bio: profile.bio,
        themePreference: appearance.theme,
        language: appearance.language
      };

      // Save to database - using the NEW email
      await window.electronAPI.saveUserProfile(userData);

      // Update currentUserEmail state with the new email
      setCurrentUserEmail(profile.email);

      // Update UserContext with the new email
      window.dispatchEvent(new CustomEvent('profileUpdated', {
        detail: {
          displayName: profile.displayName,
          avatar: profile.avatar,
          email: profile.email,
          position: profile.position
        }
      }));

    } catch (error) {
      console.error('Error saving settings:', error);
      setSaveStatus({
        type: 'error',
        message: 'Failed to save settings. Please try again.'
      });
    } finally {
      setLoading(false);
    }
  };

  // Tabs configuration
  const tabs = [
    { id: 'profile', label: 'Profile', icon: <User size={18} /> },
    { id: 'security', label: 'Security', icon: <Lock size={18} /> },
    { id: 'appearance', label: 'Appearance', icon: <Palette size={18} /> },
    { id: 'company', label: 'Company', icon: <Building size={18} /> },
    { id: 'notifications', label: 'Notifications', icon: <Bell size={18} /> },
    { id: 'billing', label: 'Billing', icon: <CreditCard size={18} /> },
    { id: 'backup', label: 'Backup', icon: <Database size={18} /> },
    { id: 'admin', label: 'Admin', icon: <Shield size={18} /> }
  ];

  return (
    <div className="min-h-screen bg-gray-50 p-6">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-2xl font-bold text-gray-900">Settings</h1>
          <p className="text-gray-600 mt-2">Manage your account settings and preferences</p>
        </div>

        {/* Save Status */}
        {saveStatus && (
          <div className={`mb-6 p-4 rounded-lg ${saveStatus.type === 'success' ? 'bg-green-50 border border-green-200' : 'bg-red-50 border border-red-200'}`}>
            <div className="flex items-center gap-3">
              {saveStatus.type === 'success' ? (
                <CheckCircle className="text-green-500" size={20} />
              ) : (
                <XCircle className="text-red-500" size={20} />
              )}
              <span className={saveStatus.type === 'success' ? 'text-green-700' : 'text-red-700'}>
                {saveStatus.message}
              </span>
            </div>
          </div>
        )}

        <div className="flex flex-col lg:flex-row gap-6">
          {/* Sidebar Tabs */}
          <div className="lg:w-64">
            <div className="bg-white rounded-xl border border-gray-200 p-4">
              <nav className="space-y-1">
                {tabs.map((tab) => (
                  <button
                    key={tab.id}
                    onClick={() => setActiveTab(tab.id)}
                    className={`flex items-center gap-3 w-full px-4 py-3 rounded-lg text-left transition-colors ${activeTab === tab.id
                        ? 'bg-blue-50 text-blue-600 border border-blue-100'
                        : 'text-gray-700 hover:bg-gray-50'
                      }`}
                  >
                    <div className={`${activeTab === tab.id ? 'text-blue-500' : 'text-gray-400'}`}>
                      {tab.icon}
                    </div>
                    <span className="font-medium">{tab.label}</span>
                  </button>
                ))}
              </nav>

              {/* Save Button */}
              <div className="mt-6 pt-6 border-t border-gray-200">
                <button
                  onClick={activeTab === 'company' ? saveCompanyInfo : saveSettings}
                  disabled={loading}
                  className="flex items-center justify-center gap-2 w-full px-4 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  {loading ? (
                    <>
                      <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                      Saving...
                    </>
                  ) : (
                    <>
                      <Save size={18} />
                      Save Changes
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>

          {/* Main Content */}
          <div className="flex-1">
            <div className="bg-white rounded-xl border border-gray-200 p-6">
              {/* Profile Tab */}
              {activeTab === 'profile' && (
                <div className="space-y-6">
                  <div>
                    <h2 className="text-l font-semibold text-gray-900">Profile Settings</h2>
                    <p className="text-gray-600 mt-1">Manage your personal information</p>
                  </div>

                  {/* Avatar Section */}
                  <div className="flex items-center gap-6">
                    <div className="relative">
                      <div className="w-24 h-24 rounded-full bg-gray-100 border-4 border-white shadow-lg overflow-hidden">
                        {profile.avatar ? (
                          <img
                            src={profile.avatar}
                            alt="Profile"
                            className="w-full h-full object-cover"
                            onError={(e) => {
                              // Fallback if image fails to load
                              e.target.style.display = 'none';
                            }}
                          />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-blue-500 to-purple-600">
                            <User size={40} className="text-white" />
                          </div>
                        )}
                      </div>
                      <label className="absolute bottom-0 right-0 bg-blue-600 text-white p-2 rounded-full cursor-pointer hover:bg-blue-700 transition-colors">
                        <Camera size={16} />
                        <input
                          type="file"
                          accept="image/*"
                          className="hidden"
                          onChange={handleAvatarUpload}
                        />
                      </label>
                    </div>
                    <div>
                      <h3 className="font-medium text-gray-900">{profile.displayName}</h3>
                      <p className="text-gray-600 text-sm">{profile.position}</p>
                    </div>
                  </div>

                  {/* Profile Form - REMOVED Department and Hire Date fields */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        Display Name
                      </label>
                      <input
                        type="text"
                        value={profile.displayName}
                        onChange={(e) => handleProfileChange('displayName', e.target.value)}
                        className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                      />
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        Email Address
                      </label>
                      <div className="flex items-center gap-2">
                        <Mail size={18} className="text-gray-400" />
                        <input
                          type="email"
                          value={profile.email}
                          onChange={(e) => handleProfileChange('email', e.target.value)}
                          className="flex-1 px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                        />
                      </div>
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        Phone Number
                      </label>
                      <div className="flex items-center gap-2">
                        <Phone size={18} className="text-gray-400" />
                        <input
                          type="tel"
                          value={profile.phone}
                          onChange={(e) => handleProfileChange('phone', e.target.value)}
                          className="flex-1 px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                        />
                      </div>
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        Position
                      </label>
                      <input
                        type="text"
                        value={profile.position}
                        onChange={(e) => handleProfileChange('position', e.target.value)}
                        className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                      />
                    </div>

                    <div className="md:col-span-2">
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        Bio / Description
                      </label>
                      <textarea
                        value={profile.bio}
                        onChange={(e) => handleProfileChange('bio', e.target.value)}
                        rows={3}
                        className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                      />
                    </div>
                  </div>
                </div>
              )}

              {/* Security Tab */}
              {activeTab === 'security' && (
                <div className="space-y-6">
                  <div>
                    <h2 className="text-l font-semibold text-gray-900">Security Settings</h2>
                    <p className="text-gray-600 mt-1">Manage your password and security preferences</p>
                  </div>

                  <div className="space-y-6">
                    {/* Change Password */}
                    <div className="bg-gray-50 p-6 rounded-lg border border-gray-200">
                      <h3 className="text-lg font-medium text-gray-900 mb-4">Change Password</h3>
                      <div className="space-y-4">
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-2">
                            Current Password
                          </label>
                          <div className="flex items-center gap-2">
                            <Key size={18} className="text-gray-400" />
                            <input
                              type="password"
                              value={security.currentPassword}
                              onChange={(e) => handleSecurityChange('currentPassword', e.target.value)}
                              className="flex-1 px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                              placeholder="Enter current password"
                            />
                          </div>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                          <div>
                            <label className="block text-sm font-medium text-gray-700 mb-2">
                              New Password
                            </label>
                            <input
                              type="password"
                              value={security.newPassword}
                              onChange={(e) => handleSecurityChange('newPassword', e.target.value)}
                              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                              placeholder="Enter new password"
                            />
                          </div>

                          <div>
                            <label className="block text-sm font-medium text-gray-700 mb-2">
                              Confirm New Password
                            </label>
                            <input
                              type="password"
                              value={security.confirmPassword}
                              onChange={(e) => handleSecurityChange('confirmPassword', e.target.value)}
                              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                              placeholder="Confirm new password"
                            />
                          </div>
                        </div>

                        <button className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors">
                          Update Password
                        </button>
                      </div>
                    </div>

                    {/* Security Preferences */}
                    <div className="bg-gray-50 p-6 rounded-lg border border-gray-200">
                      <h3 className="text-lg font-medium text-gray-900 mb-4">Security Preferences</h3>
                      <div className="space-y-4">
                        <div className="flex items-center justify-between">
                          <div>
                            <h4 className="font-medium text-gray-900">Two-Factor Authentication</h4>
                            <p className="text-sm text-gray-600">Add an extra layer of security to your account</p>
                          </div>
                          <label className="relative inline-flex items-center cursor-pointer">
                            <input
                              type="checkbox"
                              checked={security.twoFactorEnabled}
                              onChange={(e) => handleSecurityChange('twoFactorEnabled', e.target.checked)}
                              className="sr-only peer"
                            />
                            <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-blue-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600"></div>
                          </label>
                        </div>

                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-2">
                            Session Timeout (minutes)
                          </label>
                          <select
                            value={security.sessionTimeout}
                            onChange={(e) => handleSecurityChange('sessionTimeout', parseInt(e.target.value))}
                            className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                          >
                            <option value={15}>15 minutes</option>
                            <option value={30}>30 minutes</option>
                            <option value={60}>60 minutes</option>
                            <option value={120}>2 hours</option>
                            <option value={0}>Never (not recommended)</option>
                          </select>
                        </div>
                      </div>
                    </div>

                    {/* Active Sessions */}
                    <div className="bg-gray-50 p-6 rounded-lg border border-gray-200">
                      <h3 className="text-lg font-medium text-gray-900 mb-4">Active Sessions</h3>
                      <div className="space-y-3">
                        <div className="flex items-center justify-between p-3 bg-white rounded-lg border border-gray-200">
                          <div>
                            <p className="font-medium text-gray-900">Chrome on Windows</p>
                            <p className="text-sm text-gray-600">Last active: 5 minutes ago</p>
                          </div>
                          <button className="px-3 py-1 text-sm text-red-600 bg-red-50 rounded-lg hover:bg-red-100">
                            Logout
                          </button>
                        </div>
                        <div className="flex items-center justify-between p-3 bg-white rounded-lg border border-gray-200">
                          <div>
                            <p className="font-medium text-gray-900">Safari on iPhone</p>
                            <p className="text-sm text-gray-600">Last active: 2 hours ago</p>
                          </div>
                          <button className="px-3 py-1 text-sm text-red-600 bg-red-50 rounded-lg hover:bg-red-100">
                            Logout
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* Appearance Tab */}
              {activeTab === 'appearance' && (
                <div className="space-y-6">
                  <div>
                    <h2 className="text-l font-semibold text-gray-900">Appearance Settings</h2>
                    <p className="text-gray-600 mt-1">Customize how the application looks</p>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    {/* Theme */}
                    <div className="bg-gray-50 p-6 rounded-lg border border-gray-200">
                      <h3 className="text-lg font-medium text-gray-900 mb-4">Theme</h3>
                      <div className="grid grid-cols-2 gap-4">
                        <button
                          onClick={() => handleAppearanceChange('theme', 'light')}
                          className={`p-4 rounded-lg border-2 transition-all ${appearance.theme === 'light' ? 'border-blue-500 bg-blue-50' : 'border-gray-200 hover:border-gray-300'}`}
                        >
                          <div className="flex flex-col items-center gap-2">
                            <Sun size={24} className="text-yellow-500" />
                            <span className="font-medium">Light</span>
                          </div>
                        </button>
                        <button
                          onClick={() => handleAppearanceChange('theme', 'dark')}
                          className={`p-4 rounded-lg border-2 transition-all ${appearance.theme === 'dark' ? 'border-blue-500 bg-blue-50' : 'border-gray-200 hover:border-gray-300'}`}
                        >
                          <div className="flex flex-col items-center gap-2">
                            <Moon size={24} className="text-gray-700" />
                            <span className="font-medium">Dark</span>
                          </div>
                        </button>
                      </div>
                    </div>

                    {/* Language */}
                    <div className="bg-gray-50 p-6 rounded-lg border border-gray-200">
                      <h3 className="text-lg font-medium text-gray-900 mb-4">Language</h3>
                      <div className="flex items-center gap-2">
                        <Globe size={18} className="text-gray-400" />
                        <select
                          value={appearance.language}
                          onChange={(e) => handleAppearanceChange('language', e.target.value)}
                          className="flex-1 px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                        >
                          <option value="en">English</option>
                          <option value="es">Spanish</option>
                          <option value="fr">French</option>
                          <option value="de">German</option>
                          <option value="ja">Japanese</option>
                        </select>
                      </div>
                    </div>

                    {/* Font Size */}
                    <div className="bg-gray-50 p-6 rounded-lg border border-gray-200">
                      <h3 className="text-lg font-medium text-gray-900 mb-4">Font Size</h3>
                      <div className="space-y-2">
                        {['small', 'medium', 'large'].map((size) => (
                          <label key={size} className="flex items-center gap-3 cursor-pointer">
                            <input
                              type="radio"
                              name="fontSize"
                              value={size}
                              checked={appearance.fontSize === size}
                              onChange={(e) => handleAppearanceChange('fontSize', e.target.value)}
                              className="text-blue-600 focus:ring-blue-500"
                            />
                            <span className="capitalize">{size}</span>
                          </label>
                        ))}
                      </div>
                    </div>

                    {/* Display Mode */}
                    <div className="bg-gray-50 p-6 rounded-lg border border-gray-200">
                      <h3 className="text-lg font-medium text-gray-900 mb-4">Display Mode</h3>
                      <div className="space-y-2">
                        <label className="flex items-center justify-between cursor-pointer">
                          <div>
                            <span className="font-medium text-gray-900">Compact Mode</span>
                            <p className="text-sm text-gray-600">Reduce spacing between elements</p>
                          </div>
                          <label className="relative inline-flex items-center cursor-pointer">
                            <input
                              type="checkbox"
                              checked={appearance.compactMode}
                              onChange={(e) => handleAppearanceChange('compactMode', e.target.checked)}
                              className="sr-only peer"
                            />
                            <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-blue-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600"></div>
                          </label>
                        </label>
                      </div>
                    </div>

                    {/* Notifications */}
                    <div className="md:col-span-2 bg-gray-50 p-6 rounded-lg border border-gray-200">
                      <h3 className="text-lg font-medium text-gray-900 mb-4">Notifications</h3>
                      <div className="space-y-4">
                        <label className="flex items-center justify-between cursor-pointer">
                          <div>
                            <span className="font-medium text-gray-900">Show Notifications</span>
                            <p className="text-sm text-gray-600">Display desktop notifications</p>
                          </div>
                          <label className="relative inline-flex items-center cursor-pointer">
                            <input
                              type="checkbox"
                              checked={appearance.showNotifications}
                              onChange={(e) => handleAppearanceChange('showNotifications', e.target.checked)}
                              className="sr-only peer"
                            />
                            <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-blue-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600"></div>
                          </label>
                        </label>

                        <label className="flex items-center justify-between cursor-pointer">
                          <div>
                            <span className="font-medium text-gray-900">Email Notifications</span>
                            <p className="text-sm text-gray-600">Receive notifications via email</p>
                          </div>
                          <label className="relative inline-flex items-center cursor-pointer">
                            <input
                              type="checkbox"
                              checked={appearance.emailNotifications}
                              onChange={(e) => handleAppearanceChange('emailNotifications', e.target.checked)}
                              className="sr-only peer"
                            />
                            <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-blue-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600"></div>
                          </label>
                        </label>

                        <label className="flex items-center justify-between cursor-pointer">
                          <div>
                            <span className="font-medium text-gray-900">Sound Effects</span>
                            <p className="text-sm text-gray-600">Play sounds for notifications</p>
                          </div>
                          <label className="relative inline-flex items-center cursor-pointer">
                            <input
                              type="checkbox"
                              checked={appearance.soundEnabled}
                              onChange={(e) => handleAppearanceChange('soundEnabled', e.target.checked)}
                              className="sr-only peer"
                            />
                            <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-blue-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600"></div>
                          </label>
                        </label>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* Company Tab - UPDATED TO USE AUTH DATABASE */}
              {activeTab === 'company' && (
                <div className="space-y-6">
                  <div>
                    <h2 className="text-l font-semibold text-gray-900">Company Settings</h2>
                    <p className="text-gray-600 mt-1">
                      {companyInfo ? 'Configure your company information' : 'Loading company information...'}
                    </p>
                  </div>

                  {companyInfo && (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-2">
                          Company Name
                        </label>
                        <div className="flex items-center gap-2">
                          <Building size={18} className="text-gray-400" />
                          <input
                            type="text"
                            value={company.name}
                            onChange={(e) => handleCompanyChange('name', e.target.value)}
                            className="flex-1 px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                            disabled // Make read-only since it comes from auth database
                          />
                        </div>
                        <p className="text-sm text-gray-500 mt-1">
                          From registration database
                        </p>
                      </div>

                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-2">
                          Company Email
                        </label>
                        <div className="flex items-center gap-2">
                          <Mail size={18} className="text-gray-400" />
                          <input
                            type="email"
                            value={company.email}
                            onChange={(e) => handleCompanyChange('email', e.target.value)}
                            className="flex-1 px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                            disabled // Make read-only since it comes from auth database
                          />
                        </div>
                        <p className="text-sm text-gray-500 mt-1">
                          From registration database
                        </p>
                      </div>

                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-2">
                          Company Phone
                        </label>
                        <div className="flex items-center gap-2">
                          <Phone size={18} className="text-gray-400" />
                          <input
                            type="tel"
                            value={company.phone}
                            onChange={(e) => handleCompanyChange('phone', e.target.value)}
                            className="flex-1 px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                            disabled // Make read-only since it comes from auth database
                          />
                        </div>
                        <p className="text-sm text-gray-500 mt-1">
                          From registration database
                        </p>
                      </div>

                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-2">
                          Tax ID
                        </label>
                        <input
                          type="text"
                          value={company.taxId}
                          onChange={(e) => handleCompanyChange('taxId', e.target.value)}
                          className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                        />
                      </div>

                      <div className="md:col-span-2">
                        <label className="block text-sm font-medium text-gray-700 mb-2">
                          Company Address
                        </label>
                        <div className="flex items-start gap-2">
                          <MapPin size={18} className="text-gray-400 mt-2" />
                          <textarea
                            value={company.address}
                            onChange={(e) => handleCompanyChange('address', e.target.value)}
                            rows={2}
                            className="flex-1 px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                            disabled // Make read-only since it comes from auth database
                          />
                        </div>
                        <p className="text-sm text-gray-500 mt-1">
                          From registration database
                        </p>
                      </div>

                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-2">
                          Currency
                        </label>
                        <select
                          value={company.currency}
                          onChange={(e) => handleCompanyChange('currency', e.target.value)}
                          className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                        >
                          <option value="PHP">Philippine Peso (₱)</option>
                          <option value="USD">US Dollar ($)</option>
                          <option value="EUR">Euro (€)</option>
                          <option value="GBP">British Pound (£)</option>
                          <option value="JPY">Japanese Yen (¥)</option>
                        </select>
                      </div>

                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-2">
                          Timezone
                        </label>
                        <select
                          value={company.timezone}
                          onChange={(e) => handleCompanyChange('timezone', e.target.value)}
                          className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                        >
                          <option value="Asia/Manila">Philippine Time (GMT+8)</option>
                          <option value="America/New_York">Eastern Time (GMT-5)</option>
                          <option value="Europe/London">London Time (GMT+0)</option>
                          <option value="Asia/Tokyo">Japan Time (GMT+9)</option>
                          <option value="Australia/Sydney">Sydney Time (GMT+11)</option>
                        </select>
                      </div>

                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-2">
                          Work Days
                        </label>
                        <div className="flex flex-wrap gap-2">
                          {['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'].map((day) => (
                            <label key={day} className="flex items-center gap-2">
                              <input
                                type="checkbox"
                                checked={company.workDays.includes(day)}
                                onChange={(e) => {
                                  const newWorkDays = e.target.checked
                                    ? [...company.workDays, day]
                                    : company.workDays.filter(d => d !== day);
                                  handleCompanyChange('workDays', newWorkDays);
                                }}
                                className="rounded text-blue-600 focus:ring-blue-500"
                              />
                              <span className="text-sm">{day.substring(0, 3)}</span>
                            </label>
                          ))}
                        </div>
                      </div>

                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-2">
                          Work Hours
                        </label>
                        <input
                          type="text"
                          value={company.workHours}
                          onChange={(e) => handleCompanyChange('workHours', e.target.value)}
                          className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                          placeholder="e.g., 9:00 AM - 6:00 PM"
                        />
                      </div>

                      <div className="md:col-span-2">
                        <label className="block text-sm font-medium text-gray-700 mb-2">
                          Payroll Cutoff Days
                        </label>
                        <div className="flex items-center gap-4">
                          <div className="flex items-center gap-2">
                            <span className="text-sm">1st Cutoff:</span>
                            <input
                              type="number"
                              min="1"
                              max="31"
                              value={company.cutoffDays[0]}
                              onChange={(e) => {
                                const newCutoffDays = [...company.cutoffDays];
                                newCutoffDays[0] = parseInt(e.target.value);
                                handleCompanyChange('cutoffDays', newCutoffDays);
                              }}
                              className="w-20 px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                            />
                          </div>
                          <div className="flex items-center gap-2">
                            <span className="text-sm">2nd Cutoff:</span>
                            <input
                              type="number"
                              min="1"
                              max="31"
                              value={company.cutoffDays[1]}
                              onChange={(e) => {
                                const newCutoffDays = [...company.cutoffDays];
                                newCutoffDays[1] = parseInt(e.target.value);
                                handleCompanyChange('cutoffDays', newCutoffDays);
                              }}
                              className="w-20 px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                            />
                          </div>
                        </div>
                        <p className="text-sm text-gray-500 mt-2">
                          Note: First cutoff is paid on the 10th, second cutoff on the 25th
                        </p>
                      </div>
                    </div>
                  )}

                  {!companyInfo && (
                    <div className="text-center py-12">
                      <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500 mx-auto mb-4"></div>
                      <p className="text-gray-600">Loading company information from registration...</p>
                    </div>
                  )}
                </div>
              )}

              {/* Other Tabs Placeholder */}
              {activeTab === 'notifications' && (
                <div className="text-center py-12">
                  <Bell size={48} className="mx-auto text-gray-400 mb-4" />
                  <h3 className="text-l font-semibold text-gray-900">Notifications Settings</h3>
                  <p className="text-gray-600 mt-2">Configure your notification preferences</p>
                  <p className="text-sm text-gray-500 mt-4">Coming soon...</p>
                </div>
              )}

              {activeTab === 'billing' && (
                <div className="text-center py-12">
                  <CreditCard size={48} className="mx-auto text-gray-400 mb-4" />
                  <h3 className="text-l font-semibold text-gray-900">Billing Settings</h3>
                  <p className="text-gray-600 mt-2">Manage your subscription and billing</p>
                  <p className="text-sm text-gray-500 mt-4">Coming soon...</p>
                </div>
              )}

              {activeTab === 'backup' && (
                <div className="text-center py-12">
                  <Database size={48} className="mx-auto text-gray-400 mb-4" />
                  <h3 className="text-l font-semibold text-gray-900">Backup & Restore</h3>
                  <p className="text-gray-600 mt-2">Backup your data or restore from backup</p>
                  <div className="mt-6 flex justify-center gap-4">
                    <button className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700">
                      <Download size={18} />
                      Backup Data
                    </button>
                    <button className="flex items-center gap-2 px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50">
                      <FileText size={18} />
                      Restore
                    </button>
                  </div>
                </div>
              )}

              {activeTab === 'admin' && (
                <div className="text-center py-12">
                  <Shield size={48} className="mx-auto text-gray-400 mb-4" />
                  <h3 className="text-l font-semibold text-gray-900">Admin Settings</h3>
                  <p className="text-gray-600 mt-2">Advanced system configuration</p>
                  <div className="mt-6 max-w-md mx-auto bg-yellow-50 border border-yellow-200 rounded-lg p-4">
                    <div className="flex items-center gap-3">
                      <AlertCircle className="text-yellow-500" />
                      <p className="text-sm text-yellow-700">
                        These settings are restricted to system administrators only.
                      </p>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Settings;