/**
 * Sign-in. The flow is unchanged: `onLogin` comes from `App.jsx`, which calls
 * `loginUser` and seeds the session, and the remembered address still lives in
 * `localStorage` under `rememberedEmail`.
 *
 * The original read `companyInfo.registered_at`, a column that does not exist —
 * `new Date(undefined).toLocaleDateString()` printed "Invalid Date" under the
 * company name on every launch. The column is `registration_date`, and it is a
 * SQLite `CURRENT_TIMESTAMP`, so it reads as UTC.
 */
import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  AlertCircle,
  CheckCircle,
  Eye,
  EyeOff,
  Loader2,
  Lock,
  Mail,
  ShieldCheck
} from 'lucide-react';
import { useUser } from '../contexts/UserContext';
import { formatUtcStoredDate } from '../utils/manila';

const LoginPage = ({ onLogin }) => {
  const { updateUser } = useUser();

  const [credentials, setCredentials] = useState({ email: '', password: '' });
  const [showPassword, setShowPassword] = useState(false);
  const [rememberMe, setRememberMe] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [companyInfo, setCompanyInfo] = useState(null);

  useEffect(() => {
    const savedEmail = localStorage.getItem('rememberedEmail');
    if (savedEmail) {
      setCredentials((previous) => ({ ...previous, email: savedEmail }));
      setRememberMe(true);
    }

    const loadCompanyInfo = async () => {
      try {
        const result = await window.api.getRegistrationInfo();
        if (result.success && result.data) setCompanyInfo(result.data);
      } catch (loadError) {
        console.error('Error loading company info:', loadError);
      }
    };

    loadCompanyInfo();
  }, []);
  const onField = (field) => (event) => {
    const { value } = event.target;
    setCredentials((previous) => ({ ...previous, [field]: value }));
    if (error) setError('');
  };

  const handleSubmit = async (event) => {
    event.preventDefault();

    if (!credentials.email || !credentials.password) {
      setError('Enter both your email and password.');
      return;
    }

    setIsLoading(true);
    setError('');
    setSuccess('');

    try {
      if (rememberMe) {
        localStorage.setItem('rememberedEmail', credentials.email);
      } else {
        localStorage.removeItem('rememberedEmail');
      }

      const result = await onLogin(credentials.email, credentials.password);

      if (result.success) {
        if (result.user) {
          updateUser({
            email: result.user.email,
            displayName: result.user.name,
            position: result.user.position || 'System Administrator',
            department: result.user.department || 'IT Department',
            role: result.user.role || 'Admin',
            company: result.user.company
          });
        }
        // `App.jsx` swaps the route the moment its state flips, so this shows
        // for an instant. It stays because the button is disabled by then and
        // a dead-looking form is worse than a redundant line.
        setSuccess('Signed in. Opening your dashboard…');
      } else {
        setError(result.error || 'That email and password did not match.');
      }
    } catch (submitError) {
      console.error('Login error:', submitError);
      setError('Something went wrong signing in.');
    } finally {
      setIsLoading(false);
    }
  };
  return (
    // `body` is `overflow: hidden` for the app shell, so every screen outside
    // the sidebar layout has to own its scrolling. `justify-center-safe` is
    // `justify-content: safe center`: it centres a short form, and falls back
    // to top-aligned the moment the form is taller than the window. Plain
    // `justify-center` would push the top of it permanently out of reach.
    <div className="relative flex h-full flex-col items-center justify-center-safe overflow-y-auto p-6">
      {/* The same two blooms the kiosk uses: these are the screens with no
          chrome around them, and the panel needs something behind it. */}
      <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden="true">
        <div className="absolute right-[-10%] top-[-10%] h-[500px] w-[500px] rounded-full bg-[rgb(96_165_250/0.14)] blur-[100px]" />
        <div className="absolute bottom-[-10%] left-[-10%] h-[500px] w-[500px] rounded-full bg-[rgb(34_197_94/0.12)] blur-[100px]" />
      </div>

      <div className="relative z-10 w-full max-w-md">
        <div className="mb-6 text-center">
          <span className="kpi-icon mx-auto h-12 w-12 bg-[rgb(96_165_250/0.14)] text-info">
            <ShieldCheck size={24} aria-hidden="true" />
          </span>
          <h1 className="page-title mt-3">
            {companyInfo?.company_name || 'Admin Pro'}
          </h1>
          <p className="page-subtitle mt-1">Sign in to the administrator account</p>
          {companyInfo?.registration_date && (
            <p className="help-text mt-2 justify-center">
              Registered {formatUtcStoredDate(companyInfo.registration_date)}
            </p>
          )}
        </div>

        <div className="card p-6">
          <form onSubmit={handleSubmit} className="flex flex-col gap-4">
            <div>
              <label htmlFor="email" className="label label-required">
                Email address
              </label>
              <div className="input-group">
                <Mail size={15} className="input-icon" aria-hidden="true" />
                <input
                  id="email"
                  name="email"
                  type="email"
                  autoComplete="email"
                  required
                  value={credentials.email}
                  onChange={onField('email')}
                  className={`input ${error ? 'input-invalid' : ''}`}
                  placeholder="admin@example.com"
                  aria-invalid={error ? 'true' : undefined}
                  aria-describedby={error ? 'login-error' : undefined}
                />
              </div>
            </div>
            <div>
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <label htmlFor="password" className="label label-required">
                  Password
                </label>
                <Link to="/forgot-password" className="link text-sm">
                  Forgot password?
                </Link>
              </div>
              <div className="input-group">
                <Lock size={15} className="input-icon" aria-hidden="true" />
                <input
                  id="password"
                  name="password"
                  type={showPassword ? 'text' : 'password'}
                  autoComplete="current-password"
                  required
                  value={credentials.password}
                  onChange={onField('password')}
                  className={`input pr-11 ${error ? 'input-invalid' : ''}`}
                  placeholder="Your password"
                  aria-invalid={error ? 'true' : undefined}
                  aria-describedby={error ? 'login-error' : undefined}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((previous) => !previous)}
                  className="input-affix btn btn-ghost btn-sm btn-icon"
                  aria-pressed={showPassword}
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                >
                  {showPassword ? (
                    <EyeOff size={15} aria-hidden="true" />
                  ) : (
                    <Eye size={15} aria-hidden="true" />
                  )}
                </button>
              </div>
            </div>

            <label htmlFor="remember-me" className="flex items-center gap-2 text-sm">
              <input
                id="remember-me"
                type="checkbox"
                checked={rememberMe}
                onChange={(event) => setRememberMe(event.target.checked)}
                className="checkbox"
              />
              <span className="text-muted-foreground">Remember this email</span>
            </label>
            {error && (
              <p id="login-error" className="error-text" role="alert">
                <AlertCircle size={13} aria-hidden="true" />
                {error}
              </p>
            )}

            {success && (
              <div className="alert alert-success" role="status" aria-live="polite">
                <CheckCircle size={16} aria-hidden="true" />
                <span>{success}</span>
              </div>
            )}

            <button
              type="submit"
              disabled={isLoading || !credentials.email || !credentials.password}
              className="btn btn-primary btn-lg mt-1 w-full"
            >
              {isLoading && <Loader2 size={17} className="animate-spin" aria-hidden="true" />}
              {isLoading ? 'Signing in…' : 'Sign in'}
            </button>
          </form>

          <hr className="divider my-5" />

          <p className="help-text">
            <Lock size={13} aria-hidden="true" />
            One administrator account per installation. Without the password, the
            super admin password on the forgot-password screen is the way back in.
          </p>
        </div>

        <p className="mt-6 text-center text-sm text-muted-foreground">
          Admin Pro · © {new Date().getFullYear()}
        </p>
      </div>
    </div>
  );
};

export default LoginPage;
