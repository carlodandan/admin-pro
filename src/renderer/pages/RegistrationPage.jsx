/**
 * One-time setup: the company record, the administrator account, and the
 * recovery key that is the only way back in if the password is lost.
 *
 * The key is no longer made here. Registration generates it in the backend,
 * seals the encryption key under both it and the password, and hands both blobs
 * to Supabase; what comes back is the one and only readable copy. This page
 * displays that copy and never keeps it. A key generated in the browser — which
 * is what this page used to do — would unwrap nothing.
 *
 * Three fixes to the original, all invisible until they bite:
 *  - it sent `company_phone`, and `register_system` inserts `company_contact`,
 *    so the number typed here was thrown away;
 *  - it displayed its own locally generated string, so the credential the user
 *    wrote down was not the one the escrow blob was sealed with;
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
/**
 * The key arrives as thirteen four-character groups. Masking it group-shape
 * intact keeps the field the same size whether it is revealed or hidden, so
 * toggling does not make the layout jump.
 */
const maskKey = (key) => key.replace(/[^-]/g, '•');

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

const RegistrationPage = ({ onRegister, onComplete }) => {
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
  // `recovery` starts revealed: the whole point of the last screen is to read
  // that string off and write it down.
  const [reveal, setReveal] = useState({ password: false, confirm: false, recovery: true });
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [formErrors, setFormErrors] = useState({});
  const [recoveryKey, setRecoveryKey] = useState('');
  // Tracked separately from the key rather than inferred from it. A registration
  // that adopted an existing keyring succeeds with no key to show, and keying
  // "are we past the form" off an empty string would send that case back to a
  // form it must not submit twice.
  const [registered, setRegistered] = useState(false);
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

  const copyRecoveryKey = async () => {
    try {
      await navigator.clipboard.writeText(recoveryKey);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (copyError) {
      console.error('Clipboard error:', copyError);
      setError('That could not be copied. Select the key and copy it by hand.');
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
      const result = await onRegister({
        company_name: formData.company_name,
        company_address: formData.company_address || '',
        // `register_system` inserts this into `company_contact`. Sending
        // `company_phone`, as the original did, dropped it on the floor.
        company_contact: formData.company_contact || '',
        company_email: formData.company_email,
        admin_name: formData.admin_name,
        admin_email: formData.admin_email,
        admin_password: formData.admin_password
      });

      if (result.success) {
        // Whatever the backend issued, verbatim. There is deliberately no
        // fallback: a locally invented key would open nothing, and handing one
        // over as if it were the escrow credential is worse than saying plainly
        // that none was issued.
        setRecoveryKey(result.recoveryKey || '');
        setRegistered(true);
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
  // A successful registration that issued no new key: the project already held
  // one, so the key from the first setup is still the escrow credential.
  const adoptedExistingKey = registered && recoveryKey === '';

  let title = 'Set up Admin Pro';
  let subtitle = 'One company, one administrator. This runs once.';
  if (adoptedExistingKey) {
    title = 'Registered';
    subtitle = 'Nothing new to write down.';
  } else if (registered) {
    title = 'Save your recovery key';
    subtitle = 'This is the last time it will be shown.';
  }

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
          <h1 className="page-title">{title}</h1>
          <p className="page-subtitle mt-1">{subtitle}</p>
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
                This needs an internet connection: the account and the encryption
                key are both created in the cloud. Submitting also issues a
                recovery key, shown once on the next screen — it is the only way
                back in, and the only way to reach the encrypted data, if the
                password is lost.
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
              <span>{adoptedExistingKey ? 'Registered.' : 'Registered. One thing left.'}</span>
            </div>

            <section className="card p-5" aria-labelledby="recovery-heading">
              <div className="flex items-start gap-3">
                <span className="kpi-icon bg-[rgb(239_68_68/0.14)] text-destructive">
                  <ShieldAlert size={20} aria-hidden="true" />
                </span>
                <div className="min-w-0">
                  <h2 id="recovery-heading" className="section-title">
                    Recovery key
                  </h2>
                  <p className="page-subtitle mt-0.5">
                    {adoptedExistingKey
                      ? 'Issued once already. This setup did not replace it.'
                      : 'Shown once. Nothing keeps a copy you can read back.'}
                  </p>
                </div>
              </div>

              {adoptedExistingKey ? (
                <p className="mt-5 text-sm text-muted-foreground">
                  This project already held an encryption key, so no new recovery
                  key was issued. The key from the first setup is still the one
                  that works, and still the only way to reach the encrypted data
                  without the password. There is nothing new to write down.
                </p>
              ) : (
                <>
                  {/* A textarea, not an input: the key is sixty-four characters,
                      and a single line would scroll most of it out of sight on
                      the one screen where every character has to be transcribed
                      exactly. Read-only rather than disabled, so it stays
                      focusable and copyable from the keyboard. */}
                  <textarea
                    id="recovery-key"
                    readOnly
                    rows={2}
                    value={reveal.recovery ? recoveryKey : maskKey(recoveryKey)}
                    aria-label="Recovery key"
                    aria-describedby="recovery-key-help"
                    className="textarea mt-5 min-h-0 resize-none font-mono tracking-wider wrap-anywhere text-foreground"
                  />
                  <div className="mt-2 flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      onClick={copyRecoveryKey}
                      className="btn btn-outline btn-sm"
                    >
                      {copied ? (
                        <Check size={15} className="text-accent" aria-hidden="true" />
                      ) : (
                        <Copy size={15} aria-hidden="true" />
                      )}
                      Copy the key
                    </button>
                    <button
                      type="button"
                      onClick={toggleReveal('recovery')}
                      className="btn btn-ghost btn-sm"
                      aria-pressed={reveal.recovery}
                      aria-controls="recovery-key"
                    >
                      {reveal.recovery ? (
                        <EyeOff size={15} aria-hidden="true" />
                      ) : (
                        <Eye size={15} aria-hidden="true" />
                      )}
                      {reveal.recovery ? 'Hide it' : 'Show it'}
                    </button>
                    <p
                      id="recovery-key-help"
                      className="help-text mt-0"
                      role="status"
                      aria-live="polite"
                    >
                      {copied ? 'Copied to the clipboard.' : 'Copy it before you continue.'}
                    </p>
                  </div>
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
                </>
              )}

              {error && (
                <p className="error-text mt-4" role="alert">
                  <AlertCircle size={13} aria-hidden="true" />
                  {error}
                </p>
              )}

              <hr className="divider my-5" />

              {/* The original's button asserted "I have saved the password" on
                  the user's behalf. The claim is theirs to make. */}
              {!adoptedExistingKey && (
                <label htmlFor="acknowledged" className="flex items-start gap-2 text-sm">
                  <input
                    id="acknowledged"
                    type="checkbox"
                    checked={acknowledged}
                    onChange={(event) => setAcknowledged(event.target.checked)}
                    className="checkbox mt-0.5"
                  />
                  <span>
                    I have saved the recovery key somewhere safe. I understand it
                    cannot be shown again, and that losing it along with the
                    password means losing the encrypted data.
                  </span>
                </label>
              )}

              <button
                type="button"
                onClick={() => {
                  if (formData.admin_email) {
                    try {
                      localStorage.setItem('rememberedEmail', formData.admin_email);
                    } catch (e) {
                      console.warn('Could not remember email:', e);
                    }
                  }
                  onComplete?.();
                  navigate('/login');
                }}
                disabled={!adoptedExistingKey && !acknowledged}
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
