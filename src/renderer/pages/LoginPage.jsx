import React, { useState, useEffect } from 'react';
import { Mail, Lock, Eye, EyeOff, AlertCircle, CheckCircle2 } from 'lucide-react';
import { Link } from 'react-router-dom';

const LoginPage = ({ onLogin }) => {
  const [credentials, setCredentials] = useState({
    email: '',
    password: ''
  });
  const [showPassword, setShowPassword] = useState(false);
  const [rememberMe, setRememberMe] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [companyInfo, setCompanyInfo] = useState(null);

  // Load saved email from localStorage if rememberMe was checked
  useEffect(() => {
    const savedEmail = localStorage.getItem('rememberedEmail');
    if (savedEmail) {
      setCredentials(prev => ({ ...prev, email: savedEmail }));
      setRememberMe(true);
    }
  }, []);

  // Load company info on mount
  useEffect(() => {
    loadCompanyInfo();
  }, []);

  const loadCompanyInfo = async () => {
    try {
      const result = await window.electronAPI.getRegistrationInfo();
      if (result.success && result.data) {
        setCompanyInfo(result.data);
      }
    } catch (error) {
      console.error('Error loading company info:', error);
    }
  };

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setCredentials(prev => ({
      ...prev,
      [name]: value
    }));
    if (error) setError('');
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    
    if (!credentials.email || !credentials.password) {
      setError('Please enter both email and password');
      return;
    }

    setIsLoading(true);
    setError('');
    setSuccess('');

    try {
      // Save email to localStorage if rememberMe is checked
      if (rememberMe) {
        localStorage.setItem('rememberedEmail', credentials.email);
      } else {
        localStorage.removeItem('rememberedEmail');
      }

      const result = await onLogin(credentials.email, credentials.password);
      
      if (result.success) {
        setSuccess('Login successful! Redirecting...');
      } else {
        setError(result.error || 'Invalid email or password');
      }
    } catch (err) {
      setError('An unexpected error occurred');
      console.error('Login error:', err);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-linear-to-br from-gray-100 to-gray-300 py-8 px-4">
      <div className="container mx-auto max-w-md">
        {/* Header with Company Info */}
        <div className="text-center mb-3">
          {companyInfo && (
            <div className="mb-4 p-6 bg-gray-50 rounded-2xl border border-gray-700">
              <h1 className="text-3xl font-bold text-black mb-2">{companyInfo.company_name}</h1>
              <p className="text-black text-md">Company Administration System</p>
              <p className="text-gray-900 text-sm mt-2">Registered on {new Date(companyInfo.registered_at).toLocaleDateString()}</p>
            </div>
          )}
          
          <p className="text-gray-900 text-xl my-6">Sign in to your administrator account</p>
        </div>

        {/* Login Card */}
        <div className="bg-white backdrop-blur-lg rounded-3xl border border-gray-700 p-4 shadow-2xl">
          <form onSubmit={handleSubmit} className="space-y-6">
            {/* Email Input */}
            <div className="space-y-2">
              <label htmlFor="email" className="block text-lg font-medium text-gray-900">
                Email Address
              </label>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 transform -translate-y-1/2 h-5 w-5 text-gray-900" />
                <input
                  id="email"
                  name="email"
                  type="email"
                  autoComplete="email"
                  required
                  value={credentials.email}
                  onChange={handleInputChange}
                  className="pl-10 w-full py-3 bg-gray-50 border border-gray-700 rounded-xl text-black placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all duration-200"
                  placeholder="admin@example.com"
                />
              </div>
            </div>

            {/* Password Input */}
            <div className="space-y-2">
              <div className="flex justify-between items-center">
                <label htmlFor="password" className="block text-lg font-medium text-gray-900">
                  Password
                </label>
                <Link
                  to="/forgot-password"
                  className="text-md text-blue-600 hover:text-blue-300 transition-colors duration-200"
                >
                  Forgot password?
                </Link>
              </div>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 transform -translate-y-1/2 h-5 w-5 text-gray-900" />
                <input
                  id="password"
                  name="password"
                  type={showPassword ? "text" : "password"}
                  autoComplete="current-password"
                  required
                  value={credentials.password}
                  onChange={handleInputChange}
                  className="pl-10 pr-10 w-full py-3 bg-gray-50 border border-gray-700 rounded-xl text-black placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all duration-200"
                  placeholder="••••••••"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-400 hover:text-gray-300"
                >
                  {showPassword ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
                </button>
              </div>
            </div>

            {/* Remember Me */}
            <div className="flex items-center mb-5">
              <input
                id="remember-me"
                name="remember-me"
                type="checkbox"
                checked={rememberMe}
                onChange={(e) => setRememberMe(e.target.checked)}
                className="h-4 w-4 text-blue-500 focus:ring-blue-500 border-gray-700 rounded bg-gray-900"
              />
              <label htmlFor="remember-me" className="ml-2 block text-md text-gray-900">
                Remember me on this device
              </label>
            </div>

            {/* Error & Success Messages */}
            {error && (
              <div className="p-4 bg-red-900/20 border border-red-800/50 rounded-xl">
                <p className="text-red-400 text-sm flex items-center">
                  <AlertCircle className="h-4 w-4 mr-2" />
                  {error}
                </p>
              </div>
            )}

            {success && (
              <div className="p-4 bg-green-900/20 border border-green-800/50 rounded-xl">
                <p className="text-green-400 text-sm flex items-center">
                  <CheckCircle2 className="h-4 w-4 mr-2" />
                  {success}
                </p>
              </div>
            )}

            {/* Submit Button */}
            <button
              type="submit"
              disabled={isLoading || !credentials.email || !credentials.password}
              className="w-full flex justify-center items-center py-4 px-6 my-8 border border-transparent rounded-xl font-semibold text-white bg-linear-to-r from-blue-500 to-purple-600 hover:from-blue-600 hover:to-purple-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 focus:ring-offset-gray-800 disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200 hover:scale-[1.02] active:scale-[0.98] shadow-lg"
            >
              {isLoading ? (
                <>
                  <div className="h-5 w-5 border-2 border-white border-t-transparent rounded-full animate-spin mr-3"></div>
                  Signing in...
                </>
              ) : (
                'Sign in to Dashboard'
              )}
            </button>
          </form>

          {/* Security Note */}
          <div className="mt-4 pt-3 border-t border-gray-700/50">
            <div className="flex items-start space-x-3">
              <AlertCircle className="h-5 w-5 text-red-400 shrink-0 my-4" />
              <div>
                <p className="text-sm text-gray-800 italic my-4">
                  This system allows only one administrator account. If you've forgotten your password, you'll need to use the Super Admin Password.
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="mt-8 text-center">
          <p className="text-sm text-gray-500">
            Company Administration System • © {new Date().getFullYear()}
          </p>
        </div>
      </div>
    </div>
  );
};

export default LoginPage;