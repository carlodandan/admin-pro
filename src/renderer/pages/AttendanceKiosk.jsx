import React, { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  AlertCircle,
  CheckCircle,
  ChevronLeft,
  KeyRound,
  Loader2,
  Lock,
  XCircle
} from 'lucide-react';
import Keypad from '../components/Kiosk/Keypad';
import { useDialog } from '../hooks/useDialog';
import { useUser } from '../contexts/UserContext';
import { formatStoredDate, formatStoredTime, manilaClock, manilaDate, manilaTime } from '../utils/manila';

/** The step titles, in the order the two flows walk them. */
const STEP_TITLE = {
  ID: 'Enter employee ID',
  PIN: 'Enter secure PIN',
  OLD_PIN: 'Enter current PIN',
  NEW_PIN: 'Enter new PIN',
  CONFIRM_PIN: 'Confirm new PIN'
};

/** Where Back goes from each step, and which field it clears on the way. */
const BACK_STEP = {
  PIN: 'ID',
  OLD_PIN: 'ID',
  NEW_PIN: 'OLD_PIN',
  CONFIRM_PIN: 'NEW_PIN'
};

const AttendanceKiosk = () => {
  const navigate = useNavigate();
  const { user } = useUser();

  const [currentTime, setCurrentTime] = useState(new Date());

  // 'ATTENDANCE': ID → PIN → PROCESSING → RESULT.
  // 'CHANGE_PIN': ID → OLD_PIN → NEW_PIN → CONFIRM_PIN → PROCESSING → RESULT.
  const [mode, setMode] = useState('ATTENDANCE');
  const [step, setStep] = useState('ID');
  const [employeeId, setEmployeeId] = useState('');
  const [pin, setPin] = useState('');
  const [newPin, setNewPin] = useState('');
  const [confirmPin, setConfirmPin] = useState('');
  const [feedback, setFeedback] = useState(null);
  // Replaces two `alert()` calls. A modal dialog on an unattended kiosk needs
  // someone with a mouse to dismiss it before the next person can punch in.
  const [hint, setHint] = useState('');

  const [showExitModal, setShowExitModal] = useState(false);
  const [adminPassword, setAdminPassword] = useState('');
  const [exitError, setExitError] = useState('');
  const [isVerifying, setIsVerifying] = useState(false);

  const closeExit = () => {
    if (isVerifying) return;
    setShowExitModal(false);
    setAdminPassword('');
    setExitError('');
  };

  const exitRef = useDialog(showExitModal, closeExit);

  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  const timeString = manilaClock(currentTime);
  const dateString = formatStoredDate(manilaDate(currentTime), {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    year: 'numeric'
  });
  // The auto-reset used to be a bare `setTimeout`: pressing "Try again" started
  // a fresh entry that the earlier timer then wiped four seconds later, mid-typing.
  const resetTimer = useRef(null);

  const resetKiosk = () => {
    if (resetTimer.current) {
      clearTimeout(resetTimer.current);
      resetTimer.current = null;
    }
    setMode('ATTENDANCE');
    setStep('ID');
    setEmployeeId('');
    setPin('');
    setNewPin('');
    setConfirmPin('');
    setFeedback(null);
    setHint('');
  };

  const scheduleReset = () => {
    if (resetTimer.current) clearTimeout(resetTimer.current);
    resetTimer.current = setTimeout(resetKiosk, 4000);
  };

  useEffect(
    () => () => {
      if (resetTimer.current) clearTimeout(resetTimer.current);
    },
    []
  );

  const handleKeyPress = (key) => {
    setHint('');
    if (step === 'ID') {
      if (employeeId.length < 10) setEmployeeId((prev) => prev + key);
    } else if (step === 'PIN' || step === 'OLD_PIN') {
      if (pin.length < 6) setPin((prev) => prev + key);
    } else if (step === 'NEW_PIN') {
      if (newPin.length < 6) setNewPin((prev) => prev + key);
    } else if (step === 'CONFIRM_PIN') {
      if (confirmPin.length < 6) setConfirmPin((prev) => prev + key);
    }
  };

  const handleClear = () => {
    setHint('');
    if (step === 'ID') setEmployeeId((prev) => prev.slice(0, -1));
    else if (step === 'PIN' || step === 'OLD_PIN') setPin((prev) => prev.slice(0, -1));
    else if (step === 'NEW_PIN') setNewPin((prev) => prev.slice(0, -1));
    else if (step === 'CONFIRM_PIN') setConfirmPin((prev) => prev.slice(0, -1));
  };
  const handleBack = () => {
    const target = BACK_STEP[step];
    if (!target) return;
    setHint('');
    if (step === 'PIN' || step === 'OLD_PIN') setPin('');
    else if (step === 'NEW_PIN') setNewPin('');
    else if (step === 'CONFIRM_PIN') setConfirmPin('');
    setStep(target);
  };

  const handleEnter = async () => {
    if (step === 'ID') {
      if (employeeId.trim().length === 0) {
        setHint('Enter your employee number first.');
        return;
      }
      setHint('');
      setStep(mode === 'ATTENDANCE' ? 'PIN' : 'OLD_PIN');
    } else if (step === 'PIN') {
      if (pin.trim().length === 0) {
        setHint('Enter your PIN.');
        return;
      }
      await processAttendance();
    } else if (step === 'OLD_PIN') {
      if (pin.trim().length === 0) {
        setHint('Enter your current PIN.');
        return;
      }
      setHint('');
      setStep('NEW_PIN');
    } else if (step === 'NEW_PIN') {
      if (newPin.trim().length < 4) {
        setHint('The new PIN needs at least four digits.');
        return;
      }
      setHint('');
      setStep('CONFIRM_PIN');
    } else if (step === 'CONFIRM_PIN') {
      if (confirmPin !== newPin) {
        setConfirmPin('');
        setHint('Those did not match. Enter the new PIN again.');
        return;
      }
      await processPinChange();
    }
  };
  const processAttendance = async () => {
    setStep('PROCESSING');

    try {
      const fullCompanyId = `EMP-${employeeId}`;
      const verifyResult = await window.api.verifyEmployeePin(fullCompanyId, pin);
      if (!verifyResult.success) {
        throw new Error(verifyResult.message || 'Invalid credentials');
      }

      const employee = verifyResult.employee;
      const todayRecord = await window.api.getLatestAttendance(employee.id);

      let action = 'check_in';
      if (todayRecord) {
        if (todayRecord.check_in && !todayRecord.check_out) {
          action = 'check_out';
        } else if (todayRecord.check_in && todayRecord.check_out) {
          throw new Error('You have already completed your shift today.');
        }
      }

      const nowTime = manilaTime();
      const attendance = {
        employee_id: employee.id,
        // `getLatestAttendance` looks the row up by Manila's today in Rust. This
        // was `toISOString().split('T')[0]`, the UTC date, so between midnight
        // and 08:00 the kiosk read today's row and then wrote yesterday's.
        date: manilaDate()
      };

      if (action === 'check_in') {
        attendance.check_in = nowTime;
        attendance.status = 'Present';
        attendance.notes = 'Kiosk Time In';
      } else {
        attendance.check_out = nowTime;
        // Status and check_in are left out on purpose: the upsert coalesces, so
        // omitting them preserves the morning punch. Concatenating onto a null
        // `notes` used to store the string "null | Kiosk Time Out".
        attendance.notes = todayRecord.notes
          ? `${todayRecord.notes} | Kiosk Time Out`
          : 'Kiosk Time Out';
      }

      await window.api.recordAttendance(attendance);

      setFeedback({
        type: 'success',
        message: action === 'check_in' ? 'Time in recorded' : 'Time out recorded',
        employeeName: `${employee.first_name} ${employee.last_name}`,
        time: nowTime
      });
      setStep('RESULT');
    } catch (error) {
      setFeedback({ type: 'error', message: error.message });
      setStep('RESULT');
    }

    scheduleReset();
  };
  const processPinChange = async () => {
    setStep('PROCESSING');

    try {
      const fullCompanyId = `EMP-${employeeId}`;
      const verifyResult = await window.api.verifyEmployeePin(fullCompanyId, pin);
      if (!verifyResult.success) {
        throw new Error('Invalid old PIN');
      }

      const employee = verifyResult.employee;
      const updateResult = await window.api.updateEmployeePin(employee.id, newPin);
      if (!updateResult.success) throw new Error(updateResult.message);

      setFeedback({
        type: 'success',
        message: 'PIN changed',
        employeeName: 'Use the new PIN next time.',
        time: ''
      });
      setStep('RESULT');
    } catch (error) {
      setFeedback({ type: 'error', message: error.message });
      setStep('RESULT');
    }

    scheduleReset();
  };

  const handleExitKiosk = async (event) => {
    event.preventDefault();
    setIsVerifying(true);
    setExitError('');

    try {
      if (!adminPassword) {
        throw new Error('Password is required');
      }

      const result = await window.api.loginUser(user.email, adminPassword);
      if (!result.success) {
        throw new Error(result.error || 'Invalid password');
      }

      navigate('/dashboard');
    } catch (error) {
      console.error('Kiosk exit error:', error);
      setExitError(error.message);
    } finally {
      setIsVerifying(false);
    }
  };
  useEffect(() => {
    const handleKeyDown = (event) => {
      // The only way out of a screen with no chrome. Both cases of the key, so
      // it works whether or not Caps Lock is on.
      if (event.ctrlKey && event.shiftKey && (event.key === 'Q' || event.key === 'q')) {
        event.preventDefault();
        setShowExitModal(true);
        return;
      }

      // While the exit dialog is up the digits belong to the password field. The
      // old handler fed them to the keypad behind it as well, and Enter both
      // submitted the form and advanced the hidden flow.
      if (showExitModal || step === 'PROCESSING' || step === 'RESULT') return;

      if (event.key >= '0' && event.key <= '9') {
        handleKeyPress(Number(event.key));
      } else if (event.key === 'Backspace') {
        handleClear();
      } else if (event.key === 'Enter') {
        handleEnter();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [step, employeeId, pin, newPin, confirmPin, mode, showExitModal]);

  /** What the display shows: the ID with its fixed `EMP-` prefix, or dots. */
  const displayValue = () => {
    if (step === 'ID') {
      return (
        <span className="flex items-center justify-center gap-1">
          <span className="text-muted-foreground">EMP-</span>
          <span>{employeeId || <span className="text-muted-foreground opacity-50">######</span>}</span>
        </span>
      );
    }
    const value = step === 'NEW_PIN' ? newPin : step === 'CONFIRM_PIN' ? confirmPin : pin;
    const placeholder =
      step === 'NEW_PIN' ? 'New PIN' : step === 'CONFIRM_PIN' ? 'Confirm PIN' : 'PIN code';
    return value ? '•'.repeat(value.length) : (
      <span className="text-base text-muted-foreground">{placeholder}</span>
    );
  };

  const entering = step !== 'PROCESSING' && step !== 'RESULT';
  return (
    // `body` is `overflow: hidden` and the kiosk renders outside the sidebar
    // layout, so it scrolls itself. `justify-center-safe` is `justify-content:
    // safe center`: the clock, the 460px panel and the footer add up past a
    // short window, and plain `justify-center` would clip the clock away with
    // no way to scroll up to it.
    <div className="relative flex h-full flex-col items-center justify-center-safe overflow-y-auto p-6">
      {/* Two blurred blooms, kept from the original: this is the one screen with
          no chrome around it, and the glass panel needs something behind it. */}
      <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden="true">
        <div className="absolute right-[-10%] top-[-10%] h-[500px] w-[500px] rounded-full bg-[rgb(34_197_94/0.16)] blur-[100px]" />
        <div className="absolute bottom-[-10%] left-[-10%] h-[500px] w-[500px] rounded-full bg-[rgb(96_165_250/0.14)] blur-[100px]" />
      </div>

      <div className="relative z-10 flex w-full max-w-md flex-col items-center">
        <div className="mb-8 text-center">
          {/* No live region: this ticks every second, and announcing it would
              talk over everything else on the screen. */}
          <p className="tnum font-mono text-5xl font-bold tracking-tight sm:text-6xl">
            {timeString}
          </p>
          <p className="page-subtitle mt-2 text-base">{dateString}</p>
        </div>

        <div className="card relative flex min-h-[460px] w-full flex-col justify-center p-6 sm:p-8">
          {step === 'ID' && !feedback && (
            <button
              type="button"
              onClick={() => {
                setMode(mode === 'ATTENDANCE' ? 'CHANGE_PIN' : 'ATTENDANCE');
                setHint('');
                setPin('');
                setNewPin('');
                setConfirmPin('');
              }}
              className={`btn btn-sm absolute right-4 top-4 ${
                mode === 'CHANGE_PIN' ? 'btn-secondary' : 'btn-ghost'
              }`}
            >
              <KeyRound size={14} aria-hidden="true" />
              {mode === 'ATTENDANCE' ? 'Change PIN' : 'Cancel change'}
            </button>
          )}
          {step === 'PROCESSING' && (
            <div className="flex flex-col items-center gap-4" role="status" aria-live="polite">
              <span className="spinner spinner-lg text-accent" aria-hidden="true" />
              <p className="text-base">Checking…</p>
            </div>
          )}

          {step === 'RESULT' && feedback && (
            <div
              className="fade-in flex flex-col items-center gap-3 text-center"
              role={feedback.type === 'success' ? 'status' : 'alert'}
              aria-live={feedback.type === 'success' ? 'polite' : 'assertive'}
            >
              {feedback.type === 'success' ? (
                <>
                  <span className="kpi-icon h-16 w-16 bg-[rgb(34_197_94/0.14)] text-accent">
                    <CheckCircle size={36} aria-hidden="true" />
                  </span>
                  <h2 className="section-title text-xl">{feedback.message}</h2>
                  <p className="text-lg text-accent">{feedback.employeeName}</p>
                  {feedback.time && (
                    <p className="text-sm text-muted-foreground">
                      Recorded at {formatStoredTime(feedback.time)}
                    </p>
                  )}
                </>
              ) : (
                <>
                  <span className="kpi-icon h-16 w-16 bg-[rgb(239_68_68/0.14)] text-destructive">
                    <XCircle size={36} aria-hidden="true" />
                  </span>
                  <h2 className="section-title text-xl">Not recorded</h2>
                  <p className="text-sm text-destructive">{feedback.message}</p>
                  <button type="button" onClick={resetKiosk} className="btn btn-outline mt-2">
                    Try again
                  </button>
                </>
              )}
            </div>
          )}

          {entering && (
            <div className="flex flex-col gap-5">
              <div className="mt-8 flex items-center justify-between gap-2">
                <button
                  type="button"
                  onClick={handleBack}
                  className={`btn btn-ghost btn-sm ${step === 'ID' ? 'invisible' : ''}`}
                  disabled={step === 'ID'}
                >
                  <ChevronLeft size={15} aria-hidden="true" />
                  Back
                </button>
                <h1 className="eyebrow">{STEP_TITLE[step]}</h1>
                <span className="w-[76px]" aria-hidden="true" />
              </div>

              <div
                className={`surface p-4 text-center ${
                  mode === 'CHANGE_PIN' ? 'border-warning' : ''
                }`}
              >
                <span className="font-mono text-3xl tracking-widest">{displayValue()}</span>
              </div>

              {hint && (
                <p className="error-text justify-center" role="alert">
                  <AlertCircle size={13} aria-hidden="true" />
                  {hint}
                </p>
              )}

              <Keypad
                onKeyPress={handleKeyPress}
                onClear={handleClear}
                onEnter={handleEnter}
                showEnter
              />
            </div>
          )}

        </div>
        <div className="mt-7 text-center">
          <p className="text-sm text-muted-foreground">Official attendance system · Admin Pro</p>
          <p className="help-text mt-1 justify-center">
            Press <span className="kbd">Ctrl</span>
            <span className="kbd">Shift</span>
            <span className="kbd">Q</span> to leave kiosk mode
          </p>
        </div>
      </div>
      {showExitModal && (
        <div
          className="modal-backdrop"
          onClick={(event) => {
            if (event.target === event.currentTarget) closeExit();
          }}
        >
          <div
            ref={exitRef}
            tabIndex={-1}
            role="dialog"
            aria-modal="true"
            aria-labelledby="exit-kiosk-title"
            className="modal-panel max-w-md"
          >
            <div className="flex items-start gap-3 border-b border-[rgb(248_250_252/0.1)] px-5 py-4">
              <span className="kpi-icon bg-[rgb(239_68_68/0.14)] text-destructive">
                <Lock size={20} aria-hidden="true" />
              </span>
              <div className="min-w-0">
                <h2 id="exit-kiosk-title" className="section-title">
                  Leave kiosk mode
                </h2>
                <p className="page-subtitle mt-0.5">An admin password is required</p>
              </div>
            </div>
            <form onSubmit={handleExitKiosk}>
              <div className="px-5 py-4">
                <label htmlFor="exit-password" className="label label-required">
                  Admin password
                </label>
                <input
                  id="exit-password"
                  type="password"
                  value={adminPassword}
                  onChange={(event) => setAdminPassword(event.target.value)}
                  className={`input ${exitError ? 'input-invalid' : ''}`}
                  placeholder="Password for this account"
                  autoComplete="current-password"
                  data-autofocus
                  aria-invalid={exitError ? 'true' : undefined}
                  aria-describedby={exitError ? 'exit-error' : 'exit-help'}
                />
                {exitError ? (
                  <p id="exit-error" className="error-text" role="alert">
                    <AlertCircle size={13} aria-hidden="true" />
                    {exitError}
                  </p>
                ) : (
                  <p id="exit-help" className="help-text">
                    Verified against {user?.email || 'the signed-in account'}.
                  </p>
                )}
              </div>

              <div className="flex flex-wrap items-center justify-end gap-2 border-t border-[rgb(248_250_252/0.1)] px-5 py-4">
                <button
                  type="button"
                  onClick={closeExit}
                  disabled={isVerifying}
                  className="btn btn-outline"
                >
                  Cancel
                </button>
                <button type="submit" disabled={isVerifying} className="btn btn-danger">
                  {isVerifying ? (
                    <>
                      <Loader2 size={16} className="animate-spin" aria-hidden="true" />
                      Verifying…
                    </>
                  ) : (
                    'Leave kiosk'
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default AttendanceKiosk;
