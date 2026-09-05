/**
 * One-time setup: the company record, the administrator account, and the super
 * admin password that is the only way to reset that account later. `onRegister`
 * still does the write, and the generated password is still shown exactly once.
 *
 * Three fixes to the original, all invisible until they bite:
 *  - it sent `company_phone`, and `register_system` inserts `company_contact`,
 *    so the number typed here was thrown away;
 *  - it built a 16-character recovery credential out of `Math.random()`, which
 *    is not a cryptographic generator. `crypto.getRandomValues` is;
 *  - the last button set `window.location.href = '/dashboard'`, which under a
 *    HashRouter reloads the app at a path it does not serve — and registering
 *    does not sign anyone in, so the honest destination is the sign-in screen.
 */
import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  AlertCircle,
  Building2,
  Check,
  CheckCircle,
  Copy,
  Eye,
  EyeOff,
  KeyRound,
  Loader2,
  Lock,
  LogIn,
  Mail,
  MapPin,
  Phone,
  ShieldAlert,
  User
} from 'lucide-react';

const MIN_PASSWORD_LENGTH = 8;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const SUPER_ADMIN_LENGTH = 16;
const CHARSET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!@#$%^&*';

/**
 * A rejection-sampled draw from `CHARSET`: bytes at or above the largest
 * multiple of the alphabet size are discarded, so every character is equally
 * likely. `byte % 70` on its own would favour the first 46 characters.
 */
const generateSuperAdminPassword = () => {
  const limit = 256 - (256 % CHARSET.length);
  const picked = [];
  const bytes = new Uint8Array(SUPER_ADMIN_LENGTH);
  while (picked.length < SUPER_ADMIN_LENGTH) {
    crypto.getRandomValues(bytes);
    for (const byte of bytes) {
      if (picked.length === SUPER_ADMIN_LENGTH) break;
      if (byte < limit) picked.push(CHARSET[byte % CHARSET.length]);
    }
  }
  return picked.join('');
};

/** The label / icon / error / help arrangement all eight fields here repeat. */
const Field = ({ id, label, icon: Icon, error, help, required, children, ...inputProps }) => (
  <div>
    <label htmlFor={id} className={`label ${required ? 'label-required' : ''}`}>
      {label}
    </label>
    <div className="input-group">
      <Icon size={15} className="input-icon" aria-hidden="true" />
      <input
        id={id}
        className={`input ${children ? 'pr-11' : ''} ${error ? 'input-invalid' : ''}`}
        aria-invalid={error ? 'true' : undefined}
        aria-describedby={error ? `${id}-error` : help ? `${id}-help` : undefined}
        {...inputProps}
      />
      {children}
    </div>
    {error && (
      <p id={`${id}-error`} className="error-text" role="alert">
        <AlertCircle size={13} aria-hidden="true" />
        {error}
      </p>
    )}
    {!error && help && (
      <p id={`${id}-help`} className="help-text">
        {help}
      </p>
    )}
  </div>
);

/** The trailing eye toggle. `label` completes "Show …" / "Hide …". */
const RevealButton = ({ revealed, onClick, label }) => (
  <button
    type="button"
    onClick={onClick}
    className="input-affix btn btn-ghost btn-sm btn-icon"
    aria-pressed={revealed}
    aria-label={revealed ? `Hide ${label}` : `Show ${label}`}
  >
    {revealed ? <EyeOff size={15} aria-hidden="true" /> : <Eye size={15} aria-hidden="true" />}
  </button>
);

const RegistrationPage = ({ onRegister }) => {
  const navigate = useNavigate();

  const [formData, setFormData] = useState({
    company_name: '',
    company_address: '',
    company_contact: '',
    company_email: '',
    admin_name: '',
    admin_email: '',
    admin_password: '',
    confirm_password: ''
  });
  // `superAdmin` starts revealed: the whole point of the last screen is to read
  // that string off and write it down.
  const [reveal, setReveal] = useState({ password: false, confirm: false, superAdmin: true });
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [formErrors, setFormErrors] = useState({});
  const [superAdminPassword, setSuperAdminPassword] = useState('');
  const [copied, setCopied] = useState(false);
  const [acknowledged, setAcknowledged] = useState(false);

  const onField = (field) => (event) => {
    const { value } = event.target;
    setFormData((previous) => ({ ...previous, [field]: value }));
    if (formErrors[field]) {
      setFormErrors((previous) => ({ ...previous, [field]: '' }));
    }
    if (error) setError('');
  };

  const toggleReveal = (field) => () =>
    setReveal((previous) => ({ ...previous, [field]: !previous[field] }));

  const copyPassword = async () => {
    try {
      await navigator.clipboard.writeText(superAdminPassword);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (copyError) {
      console.error('Clipboard error:', copyError);
      setError('That could not be copied. Select the password and copy it by hand.');
    }
  };
  const handleSubmit = async (event) => {
    event.preventDefault();

    const errors = {};
    if (!formData.company_name.trim()) errors.company_name = 'Enter the company name.';
    if (!formData.company_email.trim()) errors.company_email = 'Enter the company email.';
    else if (!EMAIL_PATTERN.test(formData.company_email)) {
      errors.company_email = 'That is not a valid email address.';
    }
    if (!formData.admin_name.trim()) errors.admin_name = 'Enter the administrator name.';
    if (!formData.admin_email.trim()) errors.admin_email = 'Enter the sign-in email.';
    else if (!EMAIL_PATTERN.test(formData.admin_email)) {
      errors.admin_email = 'That is not a valid email address.';
    }
    if (!formData.admin_password) errors.admin_password = 'Choose a password.';
    else if (formData.admin_password.length < MIN_PASSWORD_LENGTH) {
      errors.admin_password = `Use at least ${MIN_PASSWORD_LENGTH} characters.`;
    }
    if (!formData.confirm_password) errors.confirm_password = 'Type the password again.';
    else if (formData.admin_password !== formData.confirm_password) {
      errors.confirm_password = 'The two passwords do not match.';
    }

    setFormErrors(errors);
    if (Object.keys(errors).length > 0) return;

    setIsLoading(true);
    setError('');

    try {
      const generated = generateSuperAdminPassword();

      const result = await onRegister({
        company_name: formData.company_name,
        company_address: formData.company_address || '',
        // `register_system` inserts this into `company_contact`. Sending
        // `company_phone`, as the original did, dropped it on the floor.
        company_contact: formData.company_contact || '',
        company_email: formData.company_email,
        admin_name: formData.admin_name,
        admin_email: formData.admin_email,
        admin_password: formData.admin_password,
        super_admin_password: generated
      });

      if (result.success) {
        // Only held once the write succeeded: the original set it first, so a
        // failed registration still left a password in state.
        setSuperAdminPassword(result.superAdminPassword || generated);
      } else {
        setError(result.error || 'The system could not be registered.');
      }
    } catch (submitError) {
      console.error('Registration error:', submitError);
      setError('Something went wrong during registration.');
    } finally {
      setIsLoading(false);
    }
  };
  // The password only exists after a successful write, so it doubles as the
  // "we are past the form" flag the original kept in a second state.
  const registered = superAdminPassword !== '';

  return (
    // `body` is `overflow: hidden`, so this screen owns its own scrolling.
    // Eight fields in two cards overflow most windows, and plain
    // `justify-center` would put the top of the form out of reach for good;
    // `justify-center-safe` is `justify-content: safe center`, which centres
    // the short handover screen and top-aligns the tall form.
    <div className="relative flex h-full flex-col items-center justify-center-safe overflow-y-auto p-6">
      <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden="true">
        <div className="absolute right-[-10%] top-[-10%] h-[500px] w-[500px] rounded-full bg-[rgb(96_165_250/0.14)] blur-[100px]" />
        <div className="absolute bottom-[-10%] left-[-10%] h-[500px] w-[500px] rounded-full bg-[rgb(34_197_94/0.12)] blur-[100px]" />
      </div>

      <div className="relative z-10 w-full max-w-3xl">
        <div className="mb-6 text-center">
          <h1 className="page-title">
            {registered ? 'Save your recovery password' : 'Set up Admin Pro'}
          </h1>
          <p className="page-subtitle mt-1">
            {registered
              ? 'This is the last time it will be shown.'
              : 'One company, one administrator. This runs once.'}
          </p>
        </div>

        {!registered ? (
          <form onSubmit={handleSubmit} className="flex flex-col gap-3">
            <section className="card p-5" aria-labelledby="company-heading">
              <h2 id="company-heading" className="section-title">
                Company
              </h2>
              <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-2">
                <Field
                  id="company_name"
                  label="Company name"
                  icon={Building2}
                  required
                  type="text"
                  value={formData.company_name}
                  onChange={onField('company_name')}
                  error={formErrors.company_name}
                  placeholder="Acme Corporation"
                  autoComplete="organization"
                />
                <Field
                  id="company_email"
                  label="Company email"
                  icon={Mail}
                  required
                  type="email"
                  value={formData.company_email}
                  onChange={onField('company_email')}
                  error={formErrors.company_email}
                  placeholder="hello@acme.com"
                />
                <Field
                  id="company_contact"
                  label="Contact number"
                  icon={Phone}
                  type="tel"
                  value={formData.company_contact}
                  onChange={onField('company_contact')}
                  placeholder="+63 900 000 0000"
                  autoComplete="tel"
                  help="Optional. Printed on payslips."
                />
                <Field
                  id="company_address"
                  label="Address"
                  icon={MapPin}
                  type="text"
                  value={formData.company_address}
                  onChange={onField('company_address')}
                  placeholder="Street, city, country"
                  autoComplete="street-address"
                  help="Optional."
                />
              </div>
            </section>

            <section className="card p-5" aria-labelledby="admin-heading">
              <h2 id="admin-heading" className="section-title">
                Administrator
              </h2>
              <p className="page-subtitle mt-0.5">
                The only account that can sign in.
              </p>
              <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-2">
                <Field
                  id="admin_name"
                  label="Full name"
                  icon={User}
                  required
                  type="text"
                  value={formData.admin_name}
                  onChange={onField('admin_name')}
                  error={formErrors.admin_name}
                  placeholder="Juan dela Cruz"
                  autoComplete="name"
                />
                <Field
                  id="admin_email"
                  label="Sign-in email"
                  icon={Mail}
                  required
                  type="email"
                  value={formData.admin_email}
                  onChange={onField('admin_email')}
                  error={formErrors.admin_email}
                  placeholder="admin@acme.com"
                  autoComplete="email"
                />
                <Field
                  id="admin_password"
                  label="Password"
                  icon={Lock}
                  required
                  type={reveal.password ? 'text' : 'password'}
                  value={formData.admin_password}
                  onChange={onField('admin_password')}
                  error={formErrors.admin_password}
                  autoComplete="new-password"
                  help={`At least ${MIN_PASSWORD_LENGTH} characters.`}
                >
                  <RevealButton
                    revealed={reveal.password}
                    onClick={toggleReveal('password')}
                    label="the password"
                  />
                </Field>
                <Field
                  id="confirm_password"
                  label="Confirm password"
                  icon={Lock}
                  required
                  type={reveal.confirm ? 'text' : 'password'}
                  value={formData.confirm_password}
                  onChange={onField('confirm_password')}
                  error={formErrors.confirm_password}
                  autoComplete="new-password"
                >
                  <RevealButton
                    revealed={reveal.confirm}
                    onClick={toggleReveal('confirm')}
                    label="the confirmation"
                  />
                </Field>
              </div>
            </section>

            <div className="alert alert-warning">
              <KeyRound size={16} aria-hidden="true" />
              <span>
                Submitting generates a 16-character super admin password. It is
                shown once, on the next screen, and it is the only way to reset
                this account if the password is lost.
              </span>
            </div>

            {error && (
              <p className="error-text" role="alert">
                <AlertCircle size={13} aria-hidden="true" />
                {error}
              </p>
            )}
            <button
              type="submit"
              disabled={isLoading}
              className="btn btn-primary btn-lg w-full"
            >
              {isLoading && <Loader2 size={17} className="animate-spin" aria-hidden="true" />}
              {isLoading ? 'Registering…' : 'Create the account'}
            </button>
          </form>
        ) : (
          <div className="flex flex-col gap-3">
            <div className="alert alert-success" role="status" aria-live="polite">
              <CheckCircle size={16} aria-hidden="true" />
              <span>Registered. One thing left.</span>
            </div>

            <section className="card p-5" aria-labelledby="super-heading">
              <div className="flex items-start gap-3">
                <span className="kpi-icon bg-[rgb(239_68_68/0.14)] text-destructive">
                  <ShieldAlert size={20} aria-hidden="true" />
                </span>
                <div className="min-w-0">
                  <h2 id="super-heading" className="section-title">
                    Super admin password
                  </h2>
                  <p className="page-subtitle mt-0.5">
                    Shown once. Not stored anywhere you can read it back.
                  </p>
                </div>
              </div>

              {/* Readable by default: it has to be copied down, and hiding a
                  string nobody has memorised yet only invites a typo. */}
              <div className="input-group mt-5">
                <input
                  id="super-admin-password"
                  type={reveal.superAdmin ? 'text' : 'password'}
                  value={superAdminPassword}
                  readOnly
                  aria-label="Super admin password"
                  className="input pr-24 font-mono tracking-wider"
                />
                <span className="input-affix flex items-center gap-1">
                  <RevealButton
                    revealed={reveal.superAdmin}
                    onClick={toggleReveal('superAdmin')}
                    label="the super admin password"
                  />
                  <button
                    type="button"
                    onClick={copyPassword}
                    className="btn btn-ghost btn-sm btn-icon"
                    aria-label="Copy the super admin password"
                  >
                    {copied ? (
                      <Check size={15} className="text-accent" aria-hidden="true" />
                    ) : (
                      <Copy size={15} aria-hidden="true" />
                    )}
                  </button>
                </span>
              </div>
              <p className="help-text" role="status" aria-live="polite">
                {copied ? 'Copied to the clipboard.' : 'Copy it before you continue.'}
              </p>
              <hr className="divider my-5" />

              <h3 className="eyebrow">Where to keep it</h3>
              <ul className="mt-2 flex flex-col gap-1.5 text-sm text-muted-foreground">
                <li className="flex items-start gap-2">
                  <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-warning" aria-hidden="true" />
                  A password manager, alongside the admin password.
                </li>
                <li className="flex items-start gap-2">
                  <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-warning" aria-hidden="true" />
                  Printed, in whatever the company treats as a safe.
                </li>
                <li className="flex items-start gap-2">
                  <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-warning" aria-hidden="true" />
                  Not in a note beside the machine this runs on.
                </li>
              </ul>

              {error && (
                <p className="error-text mt-4" role="alert">
                  <AlertCircle size={13} aria-hidden="true" />
                  {error}
                </p>
              )}

              <hr className="divider my-5" />

              {/* The original's button asserted "I have saved the password" on
                  the user's behalf. The claim is theirs to make. */}
              <label htmlFor="acknowledged" className="flex items-start gap-2 text-sm">
                <input
                  id="acknowledged"
                  type="checkbox"
                  checked={acknowledged}
                  onChange={(event) => setAcknowledged(event.target.checked)}
                  className="checkbox mt-0.5"
                />
                <span>I have saved the super admin password somewhere safe.</span>
              </label>

              <button
                type="button"
                onClick={() => navigate('/login')}
                disabled={!acknowledged}
                className="btn btn-primary btn-lg mt-4 w-full"
              >
                <LogIn size={17} aria-hidden="true" />
                Continue to sign in
              </button>
              <p className="help-text mt-2">
                Registering does not sign you in — use the administrator email and
                password you just chose.
              </p>
            </section>
          </div>
        )}

        <p className="mt-6 text-center text-sm text-muted-foreground">
          Admin Pro · © {new Date().getFullYear()}
        </p>
      </div>
    </div>
  );
};

export default RegistrationPage;
