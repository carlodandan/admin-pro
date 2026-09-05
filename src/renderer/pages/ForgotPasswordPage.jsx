/**
 * Password reset, in two steps: prove the super admin password, then set a new
 * one. Both commands are unchanged — `verifySuperAdminPassword` gates step two,
 * `resetAdminPassword` does the write — and the reset still ends on `/login`.
 *
 * The `onResetPassword` prop was passed by `App.jsx` and ignored; the page
 * called `window.api.resetAdminPassword` itself, so the wrapper's error
 * handling never ran. It is used now, with the direct call as the fallback.
 */
import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  AlertCircle,
  ArrowLeft,
  CheckCircle,
  Eye,
  EyeOff,
  KeyRound,
  Loader2,
  LogIn,
  Lock,
  Mail,
  ShieldAlert
} from 'lucide-react';
import { useDialog } from '../hooks/useDialog';

const MIN_PASSWORD_LENGTH = 8;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Shown once the write lands. Its one action is the one the flow ends on. */
const SuccessDialog = ({ onClose }) => {
  const dialogRef = useDialog(true, onClose);

  return (
    <div className="modal-backdrop">
      <div
        ref={dialogRef}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-labelledby="reset-done-title"
        className="modal-panel max-w-sm"
      >
        <div className="px-5 py-6 text-center">
          <span className="kpi-icon mx-auto h-14 w-14 bg-[rgb(34_197_94/0.14)] text-accent">
            <CheckCircle size={28} aria-hidden="true" />
          </span>
          <h2 id="reset-done-title" className="section-title mt-3 text-lg">
            Password reset
          </h2>
          <p className="page-subtitle mt-1">
            Sign in with the new password. The super admin password has not
            changed, and it is still what a future reset asks for.
          </p>
          <button
            type="button"
            onClick={onClose}
            data-autofocus
            className="btn btn-primary mt-5 w-full"
          >
            <LogIn size={16} aria-hidden="true" />
            Go to sign in
          </button>
        </div>
      </div>
    </div>
  );
};

const ForgotPasswordPage = ({ onResetPassword }) => {
  const navigate = useNavigate();

  const [formData, setFormData] = useState({
    email: '',
    super_admin_password: '',
    new_password: '',
    confirm_password: ''
  });
  const [reveal, setReveal] = useState({ superAdmin: false, next: false, confirm: false });
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [formErrors, setFormErrors] = useState({});
  const [step, setStep] = useState(1);
  const [showSuccess, setShowSuccess] = useState(false);

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
  const handleVerify = async (event) => {
    event.preventDefault();

    const errors = {};
    if (!formData.email.trim()) errors.email = 'Enter the registered email address.';
    else if (!EMAIL_PATTERN.test(formData.email)) errors.email = 'That is not a valid email address.';
    if (!formData.super_admin_password) {
      errors.super_admin_password = 'Enter the super admin password.';
    }
    setFormErrors(errors);
    if (Object.keys(errors).length > 0) return;

    setIsLoading(true);
    setError('');

    try {
      const result = await window.api.verifySuperAdminPassword(
        formData.email,
        formData.super_admin_password
      );

      if (result.success) {
        setStep(2);
      } else {
        setError(result.error || 'That email and super admin password did not match.');
      }
    } catch (verifyError) {
      console.error('Verification error:', verifyError);
      setError('Something went wrong checking that password.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleReset = async (event) => {
    event.preventDefault();

    const errors = {};
    if (!formData.new_password) errors.new_password = 'Enter a new password.';
    else if (formData.new_password.length < MIN_PASSWORD_LENGTH) {
      errors.new_password = `Use at least ${MIN_PASSWORD_LENGTH} characters.`;
    }
    if (!formData.confirm_password) errors.confirm_password = 'Type the new password again.';
    else if (formData.new_password !== formData.confirm_password) {
      errors.confirm_password = 'The two passwords do not match.';
    }
    setFormErrors(errors);
    if (Object.keys(errors).length > 0) return;
    setIsLoading(true);
    setError('');

    try {
      const reset =
        onResetPassword ??
        ((email, superAdminPassword, newPassword) =>
          window.api.resetAdminPassword(email, superAdminPassword, newPassword));
      const result = await reset(
        formData.email,
        formData.super_admin_password,
        formData.new_password
      );

      if (result.success) {
        setShowSuccess(true);
      } else {
        setError(result.error || 'The password could not be reset.');
      }
    } catch (resetError) {
      console.error('Reset error:', resetError);
      setError('Something went wrong resetting the password.');
    } finally {
      setIsLoading(false);
    }
  };

  const finish = () => {
    setShowSuccess(false);
    setFormData({
      email: '',
      super_admin_password: '',
      new_password: '',
      confirm_password: ''
    });
    setStep(1);
    navigate('/login');
  };

  return (
    <>
      {showSuccess && <SuccessDialog onClose={finish} />}

      {/* `body` is `overflow: hidden`, so a screen outside the sidebar layout
          owns its own scrolling. `justify-center-safe` centres the short step-1
          form but degrades to top-aligned for the taller step 2, where plain
          `justify-center` would put the heading out of reach. */}
      <div className="relative flex h-full flex-col items-center justify-center-safe overflow-y-auto p-6">
        <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden="true">
          <div className="absolute right-[-10%] top-[-10%] h-[500px] w-[500px] rounded-full bg-[rgb(239_68_68/0.12)] blur-[100px]" />
          <div className="absolute bottom-[-10%] left-[-10%] h-[500px] w-[500px] rounded-full bg-[rgb(96_165_250/0.12)] blur-[100px]" />
        </div>

        <div className="relative z-10 w-full max-w-lg">
          <Link to="/login" className="link mb-4 inline-flex items-center gap-1.5 text-sm">
            <ArrowLeft size={15} aria-hidden="true" />
            Back to sign in
          </Link>

          <div className="card p-6">
            <div className="flex items-start gap-3">
              <span className="kpi-icon bg-[rgb(239_68_68/0.14)] text-destructive">
                <ShieldAlert size={20} aria-hidden="true" />
              </span>
              <div className="min-w-0">
                <h1 className="section-title text-lg">Reset the admin password</h1>
                <p className="page-subtitle mt-0.5">
                  Needs the super admin password issued at registration.
                </p>
              </div>
            </div>

            {/* Two steps, so the position is stated rather than implied by which
                fields happen to be on screen. */}
            <div className="mt-5">
              <div className="flex items-baseline justify-between">
                <p className="eyebrow">Step {step} of 2</p>
                <p className="text-sm text-muted-foreground">
                  {step === 1 ? 'Verify' : 'New password'}
                </p>
              </div>
              <div
                className="progress mt-2"
                role="progressbar"
                aria-valuenow={step}
                aria-valuemin={1}
                aria-valuemax={2}
                aria-label="Reset progress"
              >
                <div className="progress-bar" style={{ width: step === 1 ? '50%' : '100%' }} />
              </div>
            </div>
            {step === 1 ? (
              <form onSubmit={handleVerify} className="mt-5 flex flex-col gap-4">
                <div>
                  <label htmlFor="email" className="label label-required">
                    Registered email address
                  </label>
                  <div className="input-group">
                    <Mail size={15} className="input-icon" aria-hidden="true" />
                    <input
                      id="email"
                      type="email"
                      value={formData.email}
                      onChange={onField('email')}
                      className={`input ${formErrors.email ? 'input-invalid' : ''}`}
                      placeholder="admin@yourcompany.com"
                      autoComplete="email"
                      aria-invalid={formErrors.email ? 'true' : undefined}
                      aria-describedby={formErrors.email ? 'email-error' : undefined}
                    />
                  </div>
                  {formErrors.email && (
                    <p id="email-error" className="error-text" role="alert">
                      <AlertCircle size={13} aria-hidden="true" />
                      {formErrors.email}
                    </p>
                  )}
                </div>

                <div>
                  <label htmlFor="super-admin-password" className="label label-required">
                    Super admin password
                  </label>
                  <div className="input-group">
                    <KeyRound size={15} className="input-icon" aria-hidden="true" />
                    <input
                      id="super-admin-password"
                      type={reveal.superAdmin ? 'text' : 'password'}
                      value={formData.super_admin_password}
                      onChange={onField('super_admin_password')}
                      className={`input pr-11 ${
                        formErrors.super_admin_password ? 'input-invalid' : ''
                      }`}
                      placeholder="Issued at registration"
                      autoComplete="off"
                      aria-invalid={formErrors.super_admin_password ? 'true' : undefined}
                      aria-describedby={
                        formErrors.super_admin_password ? 'super-error' : 'super-help'
                      }
                    />
                    <button
                      type="button"
                      onClick={toggleReveal('superAdmin')}
                      className="input-affix btn btn-ghost btn-sm btn-icon"
                      aria-pressed={reveal.superAdmin}
                      aria-label={
                        reveal.superAdmin
                          ? 'Hide the super admin password'
                          : 'Show the super admin password'
                      }
                    >
                      {reveal.superAdmin ? (
                        <EyeOff size={15} aria-hidden="true" />
                      ) : (
                        <Eye size={15} aria-hidden="true" />
                      )}
                    </button>
                  </div>
                  {formErrors.super_admin_password ? (
                    <p id="super-error" className="error-text" role="alert">
                      <AlertCircle size={13} aria-hidden="true" />
                      {formErrors.super_admin_password}
                    </p>
                  ) : (
                    <p id="super-help" className="help-text">
                      Shown once during registration and not recoverable from here.
                    </p>
                  )}
                </div>

                {error && (
                  <p className="error-text" role="alert">
                    <AlertCircle size={13} aria-hidden="true" />
                    {error}
                  </p>
                )}

                <button type="submit" disabled={isLoading} className="btn btn-primary btn-lg w-full">
                  {isLoading && <Loader2 size={17} className="animate-spin" aria-hidden="true" />}
                  {isLoading ? 'Checking…' : 'Verify and continue'}
                </button>
              </form>
            ) : (
              <form onSubmit={handleReset} className="mt-5 flex flex-col gap-4">
                <div className="alert alert-success" role="status">
                  <CheckCircle size={16} aria-hidden="true" />
                  <span className="wrap-anywhere">
                    Verified for <strong>{formData.email}</strong>
                  </span>
                </div>

                <div>
                  <label htmlFor="new-password" className="label label-required">
                    New password
                  </label>
                  <div className="input-group">
                    <Lock size={15} className="input-icon" aria-hidden="true" />
                    <input
                      id="new-password"
                      type={reveal.next ? 'text' : 'password'}
                      value={formData.new_password}
                      onChange={onField('new_password')}
                      className={`input pr-11 ${formErrors.new_password ? 'input-invalid' : ''}`}
                      autoComplete="new-password"
                      aria-invalid={formErrors.new_password ? 'true' : undefined}
                      aria-describedby={formErrors.new_password ? 'new-error' : 'new-help'}
                    />
                    <button
                      type="button"
                      onClick={toggleReveal('next')}
                      className="input-affix btn btn-ghost btn-sm btn-icon"
                      aria-pressed={reveal.next}
                      aria-label={reveal.next ? 'Hide the new password' : 'Show the new password'}
                    >
                      {reveal.next ? (
                        <EyeOff size={15} aria-hidden="true" />
                      ) : (
                        <Eye size={15} aria-hidden="true" />
                      )}
                    </button>
                  </div>
                  {formErrors.new_password ? (
                    <p id="new-error" className="error-text" role="alert">
                      <AlertCircle size={13} aria-hidden="true" />
                      {formErrors.new_password}
                    </p>
                  ) : (
                    <p id="new-help" className="help-text">
                      At least {MIN_PASSWORD_LENGTH} characters.
                    </p>
                  )}
                </div>
                <div>
                  <label htmlFor="confirm-password" className="label label-required">
                    Confirm new password
                  </label>
                  <div className="input-group">
                    <Lock size={15} className="input-icon" aria-hidden="true" />
                    <input
                      id="confirm-password"
                      type={reveal.confirm ? 'text' : 'password'}
                      value={formData.confirm_password}
                      onChange={onField('confirm_password')}
                      className={`input pr-11 ${
                        formErrors.confirm_password ? 'input-invalid' : ''
                      }`}
                      autoComplete="new-password"
                      aria-invalid={formErrors.confirm_password ? 'true' : undefined}
                      aria-describedby={formErrors.confirm_password ? 'confirm-error' : undefined}
                    />
                    <button
                      type="button"
                      onClick={toggleReveal('confirm')}
                      className="input-affix btn btn-ghost btn-sm btn-icon"
                      aria-pressed={reveal.confirm}
                      aria-label={
                        reveal.confirm ? 'Hide the confirmation' : 'Show the confirmation'
                      }
                    >
                      {reveal.confirm ? (
                        <EyeOff size={15} aria-hidden="true" />
                      ) : (
                        <Eye size={15} aria-hidden="true" />
                      )}
                    </button>
                  </div>
                  {formErrors.confirm_password && (
                    <p id="confirm-error" className="error-text" role="alert">
                      <AlertCircle size={13} aria-hidden="true" />
                      {formErrors.confirm_password}
                    </p>
                  )}
                </div>

                {error && (
                  <p className="error-text" role="alert">
                    <AlertCircle size={13} aria-hidden="true" />
                    {error}
                  </p>
                )}
                <div className="flex flex-wrap items-center justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      setStep(1);
                      setError('');
                      setFormErrors({});
                    }}
                    disabled={isLoading}
                    className="btn btn-outline"
                  >
                    <ArrowLeft size={16} aria-hidden="true" />
                    Back
                  </button>
                  <button type="submit" disabled={isLoading} className="btn btn-primary">
                    {isLoading && (
                      <Loader2 size={16} className="animate-spin" aria-hidden="true" />
                    )}
                    {isLoading ? 'Resetting…' : 'Reset password'}
                  </button>
                </div>
              </form>
            )}

            <hr className="divider my-5" />

            <p className="help-text">
              <AlertCircle size={13} aria-hidden="true" />
              The super admin password is not changed by a reset, and it cannot be
              recovered here — without it there is no way back into the account.
            </p>
          </div>

          <p className="mt-6 text-center text-sm text-muted-foreground">
            Admin Pro · © {new Date().getFullYear()}
          </p>
        </div>
      </div>
    </>
  );
};

export default ForgotPasswordPage;
