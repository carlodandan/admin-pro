/**
 * Password reset, in two steps: prove the recovery key issued at registration,
 * then choose a new password. The IPC names are unchanged —
 * `verifySuperAdminPassword` gates step two and `resetAdminPassword` finishes —
 * but what they mean has: there is no second password any more, and no local
 * hash to check either. Both commands read the wrapped key out of the cloud and
 * prove possession by unwrapping it, which is why a wrong key and a corrupt one
 * fail with different words.
 *
 * Two consequences this page has to be honest about.
 *
 * The key can only be checked where the wrapped copy can be reached: while
 * signed in, or on a machine that has signed in before and still holds the
 * cached copy. A device that has never signed in cannot recover here at all,
 * and the backend says so rather than calling the key wrong.
 *
 * And passwords live in GoTrue now, which sets one only for a live session or
 * through its own emailed link. This screen is reached signed out, so the link
 * is the usual ending: the backend answers `success: false` with
 * `recoveryKeyVerified: true` and `emailSent: true`, which is the flow working.
 * Reporting that as a plain error — which is what happened before — announced
 * the one path that works as the one that broke.
 *
 * The `onResetPassword` prop was passed by `App.jsx` and ignored; the page
 * called `window.api.resetAdminPassword` itself, so the wrapper's error
 * handling never ran. It is used now, with the direct call as the fallback.
 */
import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  AlertCircle,
  AlertTriangle,
  ArrowLeft,
  CheckCircle,
  Eye,
  EyeOff,
  KeyRound,
  Loader2,
  LogIn,
  Lock,
  Mail,
  MailCheck,
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
            Sign in with the new password. Your recovery key is unchanged — the
            data key is re-sealed under the new password and the escrow copy the
            recovery key opens is left alone — so keep it for next time.
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
    recovery_key: '',
    new_password: '',
    confirm_password: ''
  });
  // No toggle for the recovery key, which is deliberate: it is sixty-four
  // characters being copied off paper, and masking the one field that has to be
  // transcribed exactly is how a typo becomes ten minutes of retrying. The two
  // password fields keep theirs.
  const [reveal, setReveal] = useState({ next: false, confirm: false });
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [formErrors, setFormErrors] = useState({});
  const [step, setStep] = useState(1);
  const [showSuccess, setShowSuccess] = useState(false);
  // Set when the key was accepted but the password could not be written here.
  // `sent` separates "go and open the email" from "the key was right and nothing
  // happened", which need different words and lead to different next steps.
  const [emailNotice, setEmailNotice] = useState(null);

  const onField = (field) => (event) => {
    const { value } = event.target;
    setFormData((previous) => ({ ...previous, [field]: value }));
    if (formErrors[field]) {
      setFormErrors((previous) => ({ ...previous, [field]: '' }));
    }
    if (error) setError('');
    if (emailNotice) setEmailNotice(null);
  };

  const toggleReveal = (field) => () =>
    setReveal((previous) => ({ ...previous, [field]: !previous[field] }));
  const handleVerify = async (event) => {
    event.preventDefault();

    const errors = {};
    if (!formData.email.trim()) errors.email = 'Enter the registered email address.';
    else if (!EMAIL_PATTERN.test(formData.email)) errors.email = 'That is not a valid email address.';
    if (!formData.recovery_key.trim()) {
      errors.recovery_key = 'Enter the recovery key.';
    }
    setFormErrors(errors);
    if (Object.keys(errors).length > 0) return;

    setIsLoading(true);
    setError('');

    try {
      // Sent as typed. The backend canonicalises it — dashes, spaces and case
      // are stripped, and the base32 look-alikes I/L/O are folded onto 1/1/0 —
      // so a key read back off paper does not have to be perfect to work.
      const result = await window.api.verifySuperAdminPassword(
        formData.email,
        formData.recovery_key
      );

      if (result.success) {
        setStep(2);
      } else {
        // Rendered verbatim. The backend already distinguishes a key that does
        // not unwrap from a wrapped key it could not reach on this device, and
        // rewriting both into one sentence would lose the difference between
        // "check what you typed" and "this device cannot do it".
        setError(result.error || 'That email and recovery key did not match.');
      }
    } catch (verifyError) {
      console.error('Verification error:', verifyError);
      setError('Something went wrong checking that recovery key.');
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
      // The middle argument keeps the name `superAdminPassword` because that is
      // what the Tauri command calls its parameter; what travels in it is the
      // recovery key.
      const reset =
        onResetPassword ??
        ((email, superAdminPassword, newPassword) =>
          window.api.resetAdminPassword(email, superAdminPassword, newPassword));
      const result = await reset(
        formData.email,
        formData.recovery_key,
        formData.new_password
      );

      if (result.success) {
        setShowSuccess(true);
      } else if (result.recoveryKeyVerified) {
        // The key was right. GoTrue sets a password only for a live session or
        // through its own link, and this screen is reached signed out, so the
        // link is the normal ending — the password typed above is discarded and
        // chosen again from the email. Showing this as an error, which is what
        // used to happen, reported the working path as a broken one.
        setEmailNotice({ sent: result.emailSent === true, message: result.error || '' });
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
    setEmailNotice(null);
    setFormData({
      email: '',
      recovery_key: '',
      new_password: '',
      confirm_password: ''
    });
    setStep(1);
    navigate('/login');
  };

  // Hoisted out of the JSX so the three views below read as three conditions
  // instead of a ternary nested inside a ternary.
  const linkSent = emailNotice?.sent === true;

  let stepLabel = 'Verify';
  if (linkSent) stepLabel = 'Emailed';
  else if (step === 2) stepLabel = 'New password';

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
                  Needs the recovery key issued at registration.
                </p>
              </div>
            </div>

            {/* Two steps, so the position is stated rather than implied by which
                fields happen to be on screen. */}
            <div className="mt-5">
              <div className="flex items-baseline justify-between">
                <p className="eyebrow">Step {step} of 2</p>
                <p className="text-sm text-muted-foreground">{stepLabel}</p>
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
            {/* The usual ending, and a terminal one: the key was accepted and
                the new password is now chosen from the emailed link, so the form
                is replaced rather than left standing with fields that no longer
                lead anywhere. */}
            {linkSent && (
              <div className="mt-5">
                <div className="alert alert-success" role="status">
                  <MailCheck size={16} aria-hidden="true" />
                  <span className="wrap-anywhere">
                    Recovery key accepted for <strong>{formData.email}</strong>
                  </span>
                </div>
                <p className="mt-4 text-sm text-foreground">
                  {emailNotice.message ||
                    'A reset link has been emailed to you — open it to choose the new password.'}
                </p>
                <p className="help-text mt-3">
                  <AlertCircle size={13} aria-hidden="true" />
                  The link is the only place the new password can be set. Your
                  recovery key still works afterwards — keep it.
                </p>
                <button
                  type="button"
                  onClick={finish}
                  className="btn btn-primary btn-lg mt-5 w-full"
                >
                  <LogIn size={16} aria-hidden="true" />
                  Go to sign in
                </button>
              </div>
            )}

            {!linkSent && step === 1 && (
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
                  <label htmlFor="recovery-key" className="label label-required">
                    Recovery key
                  </label>
                  {/* A textarea, matching the one that handed the key over at
                      registration: sixty-four characters do not fit a 40px
                      single-line input, and this is the field where every
                      character has to arrive intact. The icon and reveal affixes
                      are gone with it — `.input-affix` is centred on a
                      single-line control, and there is nothing to reveal. */}
                  <textarea
                    id="recovery-key"
                    rows={2}
                    value={formData.recovery_key}
                    onChange={onField('recovery_key')}
                    className={`textarea min-h-0 font-mono tracking-wider wrap-anywhere ${
                      formErrors.recovery_key ? 'input-invalid' : ''
                    }`}
                    placeholder="XXXX-XXXX-XXXX-XXXX-…"
                    autoComplete="off"
                    spellCheck={false}
                    autoCapitalize="characters"
                    aria-invalid={formErrors.recovery_key ? 'true' : undefined}
                    aria-describedby={formErrors.recovery_key ? 'recovery-error' : 'recovery-help'}
                  />
                  {formErrors.recovery_key ? (
                    <p id="recovery-error" className="error-text" role="alert">
                      <AlertCircle size={13} aria-hidden="true" />
                      {formErrors.recovery_key}
                    </p>
                  ) : (
                    <p id="recovery-help" className="help-text">
                      <KeyRound size={13} aria-hidden="true" />
                      Shown once at registration and not reissuable. Dashes, spaces
                      and letter case do not matter.
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
            )}

            {!linkSent && step === 2 && (
              <form onSubmit={handleReset} className="mt-5 flex flex-col gap-4">
                <div className="alert alert-success" role="status">
                  <CheckCircle size={16} aria-hidden="true" />
                  <span className="wrap-anywhere">
                    Recovery key accepted for <strong>{formData.email}</strong>
                  </span>
                </div>

                {/* Stated before the fields rather than after the attempt.
                    Passwords are set in the cloud, and with no signed-in session
                    — which is the normal state of a forgot-password screen — the
                    cloud finishes the change through an emailed link and what is
                    typed here is thrown away. */}
                <p className="help-text">
                  <AlertCircle size={13} aria-hidden="true" />
                  If this app has no signed-in session, a reset link is emailed to
                  you instead and the password below is discarded.
                </p>

                {emailNotice && !emailNotice.sent && (
                  <div className="alert alert-warning" role="alert">
                    <AlertTriangle size={16} aria-hidden="true" />
                    <span>
                      {emailNotice.message ||
                        'The recovery key is correct, but the password could not be set and no reset email could be sent.'}{' '}
                      Check the connection and try again.
                    </span>
                  </div>
                )}

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
              A reset leaves the recovery key as it was, and the key cannot be
              reissued. Lose it along with the password and the encrypted data
              goes with them — nobody, including this app, can open it again.
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
