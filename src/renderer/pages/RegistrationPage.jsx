import React, { useState } from 'react';
import { 
  Building2, User, Mail, Lock, Phone, MapPin, 
  Eye, EyeOff, AlertCircle, CheckCircle2, Briefcase,
  Key, Copy, Check, Shield
} from 'lucide-react';

const RegistrationPage = ({ onRegister }) => {
  const [formData, setFormData] = useState({
    company_name: '',
    company_address: '',
    company_phone: '',
    company_email: '',
    admin_name: '',
    admin_email: '',
    admin_password: '',
    confirm_password: ''
  });
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [formErrors, setFormErrors] = useState({});
  const [superAdminPassword, setSuperAdminPassword] = useState('');
  const [showSuperAdminPassword, setShowSuperAdminPassword] = useState(false);
  const [copied, setCopied] = useState(false);
  const [registrationComplete, setRegistrationComplete] = useState(false);

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: value
    }));
    
    // Clear error for this field
    if (formErrors[name]) {
      setFormErrors(prev => ({
        ...prev,
        [name]: ''
      }));
    }
    if (error) setError('');
  };

  const generateSuperAdminPassword = () => {
    const length = 16;
    const charset = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!@#$%^&*";
    let password = "";
    for (let i = 0; i < length; i++) {
      password += charset.charAt(Math.floor(Math.random() * charset.length));
    }
    return password;
  };

  const copyToClipboard = async () => {
    try {
      await navigator.clipboard.writeText(superAdminPassword);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      setError('Failed to copy password');
    }
  };

  const validateForm = () => {
    const errors = {};
    
    // Required fields validation
    if (!formData.company_name.trim()) {
      errors.company_name = 'Company name is required';
    }
    
    if (!formData.company_email.trim()) {
      errors.company_email = 'Company email is required';
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.company_email)) {
      errors.company_email = 'Invalid email format';
    }
    
    if (!formData.admin_name.trim()) {
      errors.admin_name = 'Admin name is required';
    }
    
    if (!formData.admin_email.trim()) {
      errors.admin_email = 'Admin email is required';
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.admin_email)) {
      errors.admin_email = 'Invalid email format';
    }
    
    // Password validation
    if (!formData.admin_password) {
      errors.admin_password = 'Password is required';
    } else if (formData.admin_password.length < 8) {
      errors.admin_password = 'Password must be at least 8 characters';
    }
    
    if (!formData.confirm_password) {
      errors.confirm_password = 'Please confirm your password';
    } else if (formData.admin_password !== formData.confirm_password) {
      errors.confirm_password = 'Passwords do not match';
    }
    
    setFormErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const handleSubmit = async (e) => {
  e.preventDefault();
  
  if (!validateForm()) {
    return;
  }

  setIsLoading(true);
  setError('');
  setSuccess('');

  try {
    // Generate super admin password in frontend
    const generatedPassword = generateSuperAdminPassword();
    setSuperAdminPassword(generatedPassword); // Store for display

    const registrationData = {
      company_name: formData.company_name,
      company_address: formData.company_address || '',
      company_phone: formData.company_phone || '',
      company_email: formData.company_email,
      admin_name: formData.admin_name,
      admin_email: formData.admin_email,
      admin_password: formData.admin_password,
      super_admin_password: generatedPassword // Send to backend
    };

    const result = await onRegister(registrationData);
    
    if (result.success) {
      setRegistrationComplete(true);
      setSuccess('Registration successful! Super Admin Password has been generated.');
    } else {
      setError(result.error || 'Registration failed');
    }
  } catch (err) {
    setError('An unexpected error occurred');
    console.error('Registration error:', err);
  } finally {
    setIsLoading(false);
  }
};

  return (
    <div className="min-h-screen flex items-center justify-center bg-linear-to-br from-gray-100 to-gray-300 p-3 overflow-y-auto">
      <div className="w-full max-w-lg">
        {/* Header - More Compact */}
        <div className="text-center mb-4">
          <h1 className="text-xl font-bold text-black mb-1">Admin System Setup</h1>
        </div>

        {/* Registration Card - Smaller */}
        <div className="bg-white backdrop-blur-lg rounded-xl border border-gray-700/50 p-4 shadow-xl max-h-[90vh] overflow-y-auto">
          
          {!registrationComplete ? (
            <form onSubmit={handleSubmit} className="space-y-4">
              {/* Company Information */}
              <div className="space-y-3">
                <div className="flex items-center space-x-2">
                  <h2 className="text-base font-semibold text-black">Company Account Details</h2>
                </div>
                
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {/* Company Name */}
                  <div className="space-y-1">
                    <label htmlFor="company_name" className="block text-xs font-medium text-gray-800">
                      Company Name *
                    </label>
                    <input
                      id="company_name"
                      name="company_name"
                      type="text"
                      value={formData.company_name}
                      onChange={handleInputChange}
                      className={`w-full py-2 px-3 bg-gray-50 border ${
                        formErrors.company_name ? 'border-red-500' : 'border-gray-700'
                      } rounded-lg text-black placeholder-gray-400 focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-transparent text-xs transition-all duration-200`}
                      placeholder="Enter company name"
                    />
                    {formErrors.company_name && (
                      <p className="text-xs text-red-400 flex items-center mt-1">
                        <AlertCircle className="h-3 w-3 mr-1" />
                        {formErrors.company_name}
                      </p>
                    )}
                  </div>

                  {/* Company Email */}
                  <div className="space-y-1">
                    <label htmlFor="company_email" className="block text-xs font-medium text-gray-800">
                      Company Email *
                    </label>
                    <div className="relative">
                      <Mail className="absolute left-3 top-1/2 transform -translate-y-1/2 h-3 w-3 text-gray-700" />
                      <input
                        id="company_email"
                        name="company_email"
                        type="email"
                        value={formData.company_email}
                        onChange={handleInputChange}
                        className={`pl-8 w-full py-2 bg-gray-50 border ${
                          formErrors.company_email ? 'border-red-500' : 'border-gray-700'
                        } rounded-lg text-black placeholder-gray-400 focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-transparent text-xs transition-all duration-200`}
                        placeholder="company@example.com"
                      />
                    </div>
                    {formErrors.company_email && (
                      <p className="text-xs text-red-400 flex items-center mt-1">
                        <AlertCircle className="h-3 w-3 mr-1" />
                        {formErrors.company_email}
                      </p>
                    )}
                  </div>

                  {/* Company Address */}
                  <div className="space-y-1">
                    <label htmlFor="company_address" className="block text-xs font-medium text-gray-800">
                      Company Address
                    </label>
                    <div className="relative">
                      <MapPin className="absolute left-3 top-1/2 transform -translate-y-1/2 h-3 w-3 text-gray-700" />
                      <input
                        id="company_address"
                        name="company_address"
                        type="text"
                        value={formData.company_address}
                        onChange={handleInputChange}
                        className="pl-8 w-full py-2 bg-gray-50 border border-gray-700 rounded-lg text-black placeholder-gray-400 focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-transparent text-xs transition-all duration-200"
                        placeholder="Street, City, Country"
                      />
                    </div>
                  </div>

                  {/* Company Phone */}
                  <div className="space-y-1">
                    <label htmlFor="company_phone" className="block text-xs font-medium text-gray-800">
                      Company Phone
                    </label>
                    <div className="relative">
                      <Phone className="absolute left-3 top-1/2 transform -translate-y-1/2 h-3 w-3 text-gray-700" />
                      <input
                        id="company_phone"
                        name="company_phone"
                        type="tel"
                        value={formData.company_phone}
                        onChange={handleInputChange}
                        className="pl-8 w-full py-2 bg-gray-50 border border-gray-700 rounded-lg text-black placeholder-gray-400 focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-transparent text-xs transition-all duration-200"
                        placeholder="+639123456789"
                      />
                    </div>
                  </div>
                </div>
              </div>

              {/* Admin Information */}
              <div className="space-y-3">
                <div className="flex items-center space-x-2">
                  <h2 className="text-base font-semibold text-black">Admin Account Details</h2>
                </div>
                
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {/* Admin Name */}
                  <div className="space-y-1">
                    <label htmlFor="admin_name" className="block text-xs font-medium text-gray-800">
                      Full Name *
                    </label>
                    <div className="relative">
                      <User className="absolute left-3 top-1/2 transform -translate-y-1/2 h-3 w-3 text-gray-700" />
                      <input
                        id="admin_name"
                        name="admin_name"
                        type="text"
                        value={formData.admin_name}
                        onChange={handleInputChange}
                        className={`pl-8 w-full py-2 bg-gray-50 border ${
                          formErrors.admin_name ? 'border-red-500' : 'border-gray-700'
                        } rounded-lg text-black placeholder-gray-400 focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-transparent text-xs transition-all duration-200`}
                        placeholder="John Doe"
                      />
                    </div>
                    {formErrors.admin_name && (
                      <p className="text-xs text-red-400 flex items-center mt-1">
                        <AlertCircle className="h-3 w-3 mr-1" />
                        {formErrors.admin_name}
                      </p>
                    )}
                  </div>

                  {/* Admin Email */}
                  <div className="space-y-1">
                    <label htmlFor="admin_email" className="block text-xs font-medium text-gray-800">
                      Email Address *
                    </label>
                    <div className="relative">
                      <Mail className="absolute left-3 top-1/2 transform -translate-y-1/2 h-3 w-3 text-gray-700" />
                      <input
                        id="admin_email"
                        name="admin_email"
                        type="email"
                        value={formData.admin_email}
                        onChange={handleInputChange}
                        className={`pl-8 w-full py-2 bg-gray-50 border ${
                          formErrors.admin_email ? 'border-red-500' : 'border-gray-700'
                        } rounded-lg text-black placeholder-gray-400 focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-transparent text-xs transition-all duration-200`}
                        placeholder="admin@example.com"
                      />
                    </div>
                    {formErrors.admin_email && (
                      <p className="text-xs text-red-400 flex items-center mt-1">
                        <AlertCircle className="h-3 w-3 mr-1" />
                        {formErrors.admin_email}
                      </p>
                    )}
                  </div>

                  {/* Password */}
                  <div className="space-y-1">
                    <label htmlFor="admin_password" className="block text-xs font-medium text-gray-800">
                      Password *
                    </label>
                    <div className="relative">
                      <Lock className="absolute left-3 top-1/2 transform -translate-y-1/2 h-3 w-3 text-gray-700" />
                      <input
                        id="admin_password"
                        name="admin_password"
                        type={showPassword ? "text" : "password"}
                        value={formData.admin_password}
                        onChange={handleInputChange}
                        className={`pl-8 pr-8 w-full py-2 bg-gray-50 border ${
                          formErrors.admin_password ? 'border-red-500' : 'border-gray-700'
                        } rounded-lg text-black placeholder-gray-400 focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-transparent text-xs transition-all duration-200`}
                        placeholder="Create password"
                      />
                      <button
                        type="button"
                        onClick={() => setShowPassword(!showPassword)}
                        className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-700 hover:text-gray-800"
                      >
                        {showPassword ? <EyeOff className="h-3 w-3" /> : <Eye className="h-3 w-3" />}
                      </button>
                    </div>
                    {formErrors.admin_password && (
                      <p className="text-xs text-red-400 flex items-center mt-1">
                        <AlertCircle className="h-3 w-3 mr-1" />
                        {formErrors.admin_password}
                      </p>
                    )}
                    {formData.admin_password && (
                      <div className="text-xs text-gray-700 mt-1">
                        {formData.admin_password.length >= 8 ? '✓ Strong password' : '⚠ Password too short'}
                      </div>
                    )}
                  </div>

                  {/* Confirm Password */}
                  <div className="space-y-1">
                    <label htmlFor="confirm_password" className="block text-xs font-medium text-gray-800">
                      Confirm Password *
                    </label>
                    <div className="relative">
                      <Lock className="absolute left-3 top-1/2 transform -translate-y-1/2 h-3 w-3 text-gray-700" />
                      <input
                        id="confirm_password"
                        name="confirm_password"
                        type={showConfirmPassword ? "text" : "password"}
                        value={formData.confirm_password}
                        onChange={handleInputChange}
                        className={`pl-8 pr-8 w-full py-2 bg-gray-50 border ${
                          formErrors.confirm_password ? 'border-red-500' : 'border-gray-700'
                        } rounded-lg text-black placeholder-gray-400 focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-transparent text-xs transition-all duration-200`}
                        placeholder="Confirm password"
                      />
                      <button
                        type="button"
                        onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                        className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-700 hover:text-gray-800"
                      >
                        {showConfirmPassword ? <EyeOff className="h-3 w-3" /> : <Eye className="h-3 w-3" />}
                      </button>
                    </div>
                    {formErrors.confirm_password && (
                      <p className="text-xs text-red-400 flex items-center mt-1">
                        <AlertCircle className="h-3 w-3 mr-1" />
                        {formErrors.confirm_password}
                      </p>
                    )}
                  </div>
                </div>
              </div>

              {/* Super Admin Password Notice */}
              <div className="p-2 bg-amber-900/20 border border-amber-800/50 rounded-lg">
                <div className="flex items-start space-x-2">
                  <Key className="h-3 w-3 text-amber-400 shrink-0 mt-0.5" />
                  <div>
                    <h3 className="text-xs font-medium text-black mb-0.5">Super Admin Password</h3>
                    <p className="text-xs text-gray-700 italic">
                      A secure Super Admin Password will be generated. You MUST save it!
                    </p>
                  </div>
                </div>
              </div>

              {/* Important Notice */}
              <div className="p-2 bg-blue-100 border border-blue-800 rounded-lg">
                <div className="flex items-start space-x-2">
                  <AlertCircle className="h-3 w-3 text-blue-400 shrink-0 mt-0.5" />
                  <div>
                    <h3 className="text-xs font-medium text-black mb-0.5">Important</h3>
                    <p className="text-xs text-gray-700 italic">
                      One-time registration. Keep all credentials secure.
                    </p>
                  </div>
                </div>
              </div>

              {/* Error & Success Messages */}
              {error && (
                <div className="p-2 bg-red-900/20 border border-red-800/50 rounded-lg">
                  <p className="text-red-400 text-xs flex items-center">
                    <AlertCircle className="h-3 w-3 mr-1" />
                    {error}
                  </p>
                </div>
              )}

              {/* Submit Button */}
              <button
                type="submit"
                disabled={isLoading}
                className="w-full flex justify-center items-center py-2.5 px-4 border border-transparent rounded-lg font-medium text-white bg-linear-to-r from-blue-500 to-purple-600 hover:from-blue-600 hover:to-purple-700 focus:outline-none focus:ring-1 focus:ring-blue-500 focus:ring-offset-1 focus:ring-offset-gray-800 disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200 text-xs"
              >
                {isLoading ? (
                  <>
                    <div className="h-3 w-3 border-2 border-white border-t-transparent rounded-full animate-spin mr-2"></div>
                    Generating Super Admin Password...
                  </>
                ) : (
                  'Generate Super Admin Password & Complete Registration'
                )}
              </button>
            </form>
          ) : (
            /* Super Admin Password Display Section */
            <div className="space-y-4">
              {/* Success Message */}
              <div className="p-2 bg-green-50 border border-green-800 rounded-lg">
                <div className="flex items-center">
                  <CheckCircle2 className="h-3 w-3 text-green-400 mr-2" />
                  <div className="flex-1">
                    <p className="text-gray-900 text-xs font-medium">{success}</p>
                    <div className="h-1 w-full bg-green-900/30 rounded-full mt-1 overflow-hidden">
                      <div className="h-full bg-green-500 animate-pulse" style={{ animationDuration: '2s' }}></div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Super Admin Password Display */}
              <div className="space-y-3">
                <div className="flex items-center space-x-2">
                  <div className="p-1 bg-red-500/20 rounded">
                    <Shield className="h-4 w-4 text-red-400" />
                  </div>
                  <h2 className="text-base font-semibold text-black">SUPER ADMIN PASSWORD</h2>
                </div>

                <div className="p-3 bg-red-50 border border-red-800 rounded-lg">
                  <div className="space-y-3">
                    {/* Critical Warning */}
                    <div className="p-2 bg-red-100 rounded">
                      <div className="flex items-start space-x-2">
                        <AlertCircle className="h-3 w-3 text-red-400 shrink-0 mt-0.5" />
                        <div>
                          <h3 className="text-xs font-medium text-black mb-0.5">CRITICAL WARNING</h3>
                          <p className="text-xs text-gray-800 italic">
                            This password will only be shown ONCE. You MUST save it in a secure location. 
                            It is REQUIRED for password resets.
                          </p>
                        </div>
                      </div>
                    </div>

                    {/* Password Display */}
                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <label className="text-xs font-medium text-gray-800">Super Admin Password:</label>
                        <button
                          onClick={() => setShowSuperAdminPassword(!showSuperAdminPassword)}
                          className="text-xs text-gray-700 hover:text-gray-800"
                        >
                          {showSuperAdminPassword ? 'Hide' : 'Show'}
                        </button>
                      </div>
                      <div className="relative">
                        <input
                          type={showSuperAdminPassword ? "text" : "password"}
                          value={superAdminPassword}
                          readOnly
                          className="w-full py-2 px-3 bg-gray-50 border border-red-700 rounded-lg text-black text-sm font-mono tracking-wider"
                        />
                        <button
                          onClick={copyToClipboard}
                          className="absolute right-2 top-1/2 transform -translate-y-1/2 p-1 bg-gray-200 rounded hover:bg-gray-300"
                        >
                          {copied ? (
                            <Check className="h-3 w-3 text-green-800" />
                          ) : (
                            <Copy className="h-3 w-3 text-gray-700" />
                          )}
                        </button>
                      </div>
                      {copied && (
                        <p className="text-xs text-black">✓ Copied to clipboard</p>
                      )}
                    </div>
                  </div>
                </div>

                {/* Instructions */}
                <div className="p-2 bg-blue-900/20 border border-blue-800/50 rounded-lg">
                  <div className="space-y-1">
                    <h3 className="text-xs font-medium text-black">📋 Backup Instructions:</h3>
                    <ul className="text-xs text-gray-800 italic space-y-1 pl-1">
                      <li className="flex items-start">
                        <span className="text-red-400 mr-1">•</span>
                        <span>Copy and save to password manager</span>
                      </li>
                      <li className="flex items-start">
                        <span className="text-red-400 mr-1">•</span>
                        <span>Print and store in secure location</span>
                      </li>
                      <li className="flex items-start">
                        <span className="text-red-400 mr-1">•</span>
                        <span>Store encrypted backup</span>
                      </li>
                    </ul>
                  </div>
                </div>

                {/* Completion Button */}
                <div className="space-y-2">
                  <div className="p-2 bg-gray-50 border border-gray-700 rounded-lg">
                    <p className="text-xs text-gray-700 italic text-center">
                      After saving the Super Admin Password, proceed to launch your dashboard.
                    </p>
                  </div>
                  <button
                    onClick={() => window.location.href = '/dashboard'}
                    className="w-full flex justify-center items-center py-2.5 px-4 border border-transparent rounded-lg font-medium text-white bg-linear-to-r from-green-500 to-blue-600 hover:from-green-600 hover:to-blue-700 focus:outline-none focus:ring-1 focus:ring-green-500 focus:ring-offset-1 focus:ring-offset-gray-800 transition-all duration-200 text-xs"
                  >
                    <CheckCircle2 className="h-3 w-3 mr-2" />
                    I have saved the password - Launch Dashboard
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Footer Note - More Compact */}
          {!registrationComplete && (
            <div className="text-center pt-3 border-t border-gray-700/50 mt-4">
              <p className="text-xs text-gray-500">
                By registering, you agree to our Terms of Service and Privacy Policy.
              </p>
            </div>
          )}
        </div>

        {/* Footer - More Compact */}
        <div className="mt-4 text-center">
          <p className="text-xs text-gray-500">
            Company Administration System • © {new Date().getFullYear()}
          </p>
        </div>
      </div>
    </div>
  );
};

export default RegistrationPage;