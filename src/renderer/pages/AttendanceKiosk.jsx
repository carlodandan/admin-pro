import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Clock, KeyRound, User, LogOut, CheckCircle, XCircle, Lock, Loader2, AlertCircle } from 'lucide-react';
import Keypad from '../components/Kiosk/Keypad';
import { useUser } from '../contexts/UserContext';

const AttendanceKiosk = () => {
    const navigate = useNavigate();
    const [currentTime, setCurrentTime] = useState(new Date());

    // States: 'ID' -> 'PIN' -> 'PROCESSING' -> 'RESULT'
    // Change PIN Mode: 'ID' -> 'OLD_PIN' -> 'NEW_PIN' -> 'CONFIRM_PIN' -> 'PROCESSING_CHANGE' -> 'RESULT'
    const { user } = useUser();
    const [mode, setMode] = useState('ATTENDANCE'); // 'ATTENDANCE' or 'CHANGE_PIN'
    const [step, setStep] = useState('ID');
    const [employeeId, setEmployeeId] = useState('');
    const [pin, setPin] = useState('');
    const [newPin, setNewPin] = useState('');
    const [confirmPin, setConfirmPin] = useState('');
    const [feedback, setFeedback] = useState(null); // { type: 'success'|'error', message: '', record: null }

    // Exit Kiosk State
    const [showExitModal, setShowExitModal] = useState(false);
    const [adminPassword, setAdminPassword] = useState('');
    const [exitError, setExitError] = useState('');
    const [isVerifying, setIsVerifying] = useState(false);

    // Real-time clock effect
    useEffect(() => {
        const timer = setInterval(() => {
            setCurrentTime(new Date());
        }, 1000);
        return () => clearInterval(timer);
    }, []);

    // Format time for Manila
    const timeString = currentTime.toLocaleTimeString('en-US', {
        timeZone: 'Asia/Manila',
        hour12: true,
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit'
    });

    const dateString = currentTime.toLocaleDateString('en-US', {
        timeZone: 'Asia/Manila',
        weekday: 'long',
        month: 'long',
        day: 'numeric',
        year: 'numeric'
    });

    // Handle Keypad Input
    const handleKeyPress = (key) => {
        if (step === 'ID') {
            if (employeeId.length < 10) setEmployeeId(prev => prev + key);
        } else if (step === 'PIN' || step === 'OLD_PIN') {
            if (pin.length < 6) setPin(prev => prev + key);
        } else if (step === 'NEW_PIN') {
            if (newPin.length < 6) setNewPin(prev => prev + key);
        } else if (step === 'CONFIRM_PIN') {
            if (confirmPin.length < 6) setConfirmPin(prev => prev + key);
        }
    };

    const handleClear = () => {
        if (step === 'ID') {
            setEmployeeId(prev => prev.slice(0, -1));
        } else if (step === 'PIN' || step === 'OLD_PIN') {
            setPin(prev => prev.slice(0, -1));
        } else if (step === 'NEW_PIN') {
            setNewPin(prev => prev.slice(0, -1));
        } else if (step === 'CONFIRM_PIN') {
            setConfirmPin(prev => prev.slice(0, -1));
        }
    };

    const handleEnter = async () => {
        if (step === 'ID') {
            if (employeeId.trim().length > 0) {
                if (mode === 'ATTENDANCE') setStep('PIN');
                else setStep('OLD_PIN');
            }
        } else if (step === 'PIN') {
            if (pin.trim().length > 0) await processAttendance();
        } else if (step === 'OLD_PIN') {
            if (pin.trim().length > 0) setStep('NEW_PIN');
        } else if (step === 'NEW_PIN') {
            if (newPin.trim().length >= 4) setStep('CONFIRM_PIN');
            else alert('PIN must be at least 4 digits');
        } else if (step === 'CONFIRM_PIN') {
            if (confirmPin === newPin) await processPinChange();
            else {
                alert('PINs do not match');
                setConfirmPin('');
            }
        }
    };

    const processAttendance = async () => {
        setStep('PROCESSING');

        try {
            // 1. Verify credentials
            const fullCompanyId = `EMP-${employeeId}`;
            const verifyResult = await window.electronAPI.verifyEmployeePin(fullCompanyId, pin);

            if (!verifyResult.success) {
                throw new Error(verifyResult.message || 'Invalid credentials');
            }

            const employee = verifyResult.employee;

            // 2. Check latest status
            const todayRecord = await window.electronAPI.getLatestAttendance(employee.id);

            let action = 'check_in'; // Default
            if (todayRecord) {
                if (todayRecord.check_in && !todayRecord.check_out) {
                    action = 'check_out';
                } else if (todayRecord.check_in && todayRecord.check_out) {
                    throw new Error('You have already completed your shift today.');
                }
            }

            // 3. Record attendance
            const attendanceData = {
                employee_id: employee.id,
                date: new Date().toISOString().split('T')[0], // Use properly formatted date YYYY-MM-DD
            };

            const nowTime = new Date().toLocaleTimeString('en-GB', {
                timeZone: 'Asia/Manila',
                hour12: false
            });

            if (action === 'check_in') {
                attendanceData.check_in = nowTime;
                attendanceData.status = 'Present';
                attendanceData.notes = 'Kiosk Time In';
            } else {
                attendanceData.check_out = nowTime;
                // Don't overwrite status or check_in
                attendanceData.notes = todayRecord.notes + ' | Kiosk Time Out';
            }

            await window.electronAPI.recordAttendance(attendanceData);

            // 4. Success Feedback
            setFeedback({
                type: 'success',
                message: action === 'check_in' ? 'Time In Recorded' : 'Time Out Recorded',
                employeeName: `${employee.first_name} ${employee.last_name}`,
                time: nowTime
            });
            setStep('RESULT');

        } catch (error) {
            setFeedback({
                type: 'error',
                message: error.message
            });
            setStep('RESULT');
        }

        // Auto-reset after delay
        setTimeout(() => {
            resetKiosk();
        }, 4000);
    };

    const processPinChange = async () => {
        setStep('PROCESSING');

        try {
            // 1. Verify old credentials
            const fullCompanyId = `EMP-${employeeId}`;
            const verifyResult = await window.electronAPI.verifyEmployeePin(fullCompanyId, pin);

            if (!verifyResult.success) {
                throw new Error('Invalid Old PIN');
            }

            const employee = verifyResult.employee;

            // 2. Update PIN
            const updateResult = await window.electronAPI.updateEmployeePin(employee.id, newPin);

            if (!updateResult.success) throw new Error(updateResult.message);

            setFeedback({
                type: 'success',
                message: 'PIN Changed Successfully',
                employeeName: 'Please use your new PIN next time.',
                time: ''
            });
            setStep('RESULT');

        } catch (error) {
            setFeedback({
                type: 'error',
                message: error.message
            });
            setStep('RESULT'); // Show error then retry?
        }

        setTimeout(() => {
            resetKiosk();
        }, 4000);
    };

    const resetKiosk = () => {
        setMode('ATTENDANCE');
        setStep('ID');
        setEmployeeId('');
        setPin('');
        setNewPin('');
        setConfirmPin('');
        setFeedback(null);
    };

    const handleExitKiosk = async (e) => {
        e.preventDefault();
        setIsVerifying(true);
        setExitError('');

        try {
            if (!adminPassword) {
                throw new Error('Password is required');
            }

            // Verify admin password
            const result = await window.electronAPI.loginUser(user.email, adminPassword);

            if (result.success) {
                // Success - Exit Kiosk
                navigate('/dashboard');
            } else {
                throw new Error(result.error || 'Invalid password');
            }
        } catch (error) {
            console.error('Kiosk exit error:', error);
            setExitError(error.message);
        } finally {
            setIsVerifying(false);
        }
    };


    // Exit Kiosk Handler
    useEffect(() => {
        const handleKeyDown = (e) => {
            // Create a secret combination to exit, e.g., Ctrl + Shift + Q
            if (e.ctrlKey && e.shiftKey && e.key === 'Q') {
                setShowExitModal(true);
            }
            // Also support keyboard input for numbers
            if (step !== 'PROCESSING' && step !== 'RESULT') {
                if (e.key >= '0' && e.key <= '9') {
                    handleKeyPress(parseInt(e.key));
                } else if (e.key === 'Backspace') {
                    handleClear();
                } else if (e.key === 'Enter') {
                    handleEnter();
                }
            }
        };

        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [step, employeeId, pin, newPin, confirmPin, mode, navigate]);

    const getStepTitle = () => {
        if (step === 'ID') return 'Enter Employee ID';
        if (step === 'PIN') return 'Enter Secure PIN';
        if (step === 'OLD_PIN') return 'Enter Current PIN';
        if (step === 'NEW_PIN') return 'Enter New PIN';
        if (step === 'CONFIRM_PIN') return 'Confirm New PIN';
        return '';
    };

    const getDisplayValue = () => {
        if (step === 'ID') {
            return (
                <span className="flex items-center justify-center gap-1">
                    <span className="text-slate-500">EMP-</span>
                    <span>{employeeId || <span className="text-slate-600 opacity-50">######</span>}</span>
                </span>
            );
        }
        if (step === 'PIN' || step === 'OLD_PIN') return pin ? '•'.repeat(pin.length) : <span className="text-slate-600">PIN Code</span>;
        if (step === 'NEW_PIN') return newPin ? '•'.repeat(newPin.length) : <span className="text-slate-600">New PIN</span>;
        if (step === 'CONFIRM_PIN') return confirmPin ? '•'.repeat(confirmPin.length) : <span className="text-slate-600">Confirm PIN</span>;
        return '';
    };

    return (
        <div className="min-h-screen bg-slate-900 text-white flex flex-col items-center justify-center p-6 relative overflow-hidden">
            {/* Background Decor */}
            <div className="absolute top-0 left-0 w-full h-full overflow-hidden z-0">
                <div className="absolute top-[-10%] right-[-10%] w-[500px] h-[500px] bg-blue-600/20 rounded-full blur-[100px]"></div>
                <div className="absolute bottom-[-10%] left-[-10%] w-[500px] h-[500px] bg-purple-600/20 rounded-full blur-[100px]"></div>
            </div>

            <div className="z-10 w-full max-w-md flex flex-col items-center">
                {/* Clock Header */}
                <div className="text-center mb-12">
                    <div className="text-6xl font-bold tracking-tight text-white mb-2 font-mono">
                        {timeString}
                    </div>
                    <div className="text-xl text-slate-400 font-light tracking-wide">
                        {dateString}
                    </div>
                </div>

                {/* Dynamic Content Area */}
                <div className="w-full bg-white/10 backdrop-blur-xl rounded-2xl p-8 border border-white/10 shadow-2xl min-h-[460px] flex flex-col justify-center relative">

                    {/* Toggle Mode Button (Only visible on ID step) */}
                    {step === 'ID' && !feedback && (
                        <div className="absolute top-4 right-4">
                            <button
                                onClick={() => setMode(mode === 'ATTENDANCE' ? 'CHANGE_PIN' : 'ATTENDANCE')}
                                className={`text-xs px-3 py-1 rounded-full border transition-colors ${mode === 'CHANGE_PIN'
                                    ? 'bg-yellow-500/20 border-yellow-500 text-yellow-300 hover:bg-yellow-500/30'
                                    : 'bg-white/5 border-white/10 text-slate-400 hover:bg-white/10 hover:text-white'
                                    }`}
                            >
                                {mode === 'ATTENDANCE' ? 'Change PIN' : 'Cancel Change'}
                            </button>
                        </div>
                    )}

                    {step === 'PROCESSING' && (
                        <div className="flex flex-col items-center animate-pulse">
                            <div className="w-16 h-16 border-4 border-blue-500 border-t-transparent rounded-full animate-spin mb-4"></div>
                            <p className="text-lg font-medium">Processing...</p>
                        </div>
                    )}

                    {step === 'RESULT' && (
                        <div className="flex flex-col items-center text-center animate-fade-in">
                            {feedback.type === 'success' ? (
                                <>
                                    <CheckCircle className="w-20 h-20 text-green-400 mb-4" />
                                    <h2 className="text-2xl font-bold text-white mb-2">{feedback.message}</h2>
                                    <p className="text-xl text-green-300 mb-4">{feedback.employeeName}</p>
                                    {feedback.time && <p className="text-slate-400">Recorded at {feedback.time}</p>}
                                </>
                            ) : (
                                <>
                                    <XCircle className="w-20 h-20 text-red-400 mb-4" />
                                    <h2 className="text-2xl font-bold text-white mb-2">Error</h2>
                                    <p className="text-red-300 mb-4">{feedback.message}</p>
                                    <button
                                        onClick={resetKiosk}
                                        className="mt-4 px-6 py-2 bg-white/10 hover:bg-white/20 rounded-lg text-sm"
                                    >
                                        Try Again
                                    </button>
                                </>
                            )}
                        </div>
                    )}

                    {step !== 'PROCESSING' && step !== 'RESULT' && (
                        <div className="flex flex-col gap-6">
                            <div className="flex items-center justify-between mb-2 mt-4">
                                <button
                                    onClick={() => {
                                        if (step === 'PIN' || step === 'OLD_PIN') {
                                            setStep('ID');
                                            setPin('');
                                        } else if (step === 'NEW_PIN') {
                                            setStep('OLD_PIN');
                                            setNewPin('');
                                        } else if (step === 'CONFIRM_PIN') {
                                            setStep('NEW_PIN');
                                            setConfirmPin('');
                                        }
                                    }}
                                    className={`text-sm flex items-center gap-1 ${step !== 'ID' ? 'text-slate-300 hover:text-white' : 'invisible'}`}
                                >
                                    ← Back
                                </button>
                                <span className="text-sm font-medium text-slate-400 uppercase tracking-wider">
                                    {getStepTitle()}
                                </span>
                                <span className="w-10"></span>
                            </div>

                            {/* Display Input */}
                            <div className={`bg-slate-800/50 rounded-xl p-4 text-center border ${mode === 'CHANGE_PIN' ? 'border-yellow-500/50' : 'border-slate-700'}`}>
                                <span className="text-3xl font-mono tracking-widest text-white">
                                    {getDisplayValue()}
                                </span>
                            </div>

                            {/* Keypad */}
                            <Keypad
                                onKeyPress={handleKeyPress}
                                onClear={handleClear}
                                onEnter={handleEnter}
                                showEnter={true}
                            />
                        </div>
                    )}
                </div>

                {/* Footer */}
                <div className="mt-8 text-center text-slate-500 text-sm">
                    <p className="flex items-center justify-center gap-2">
                        Official Attendance System <span className="w-1 h-1 bg-slate-500 rounded-full"></span> Admin Pro
                    </p>
                    <p className="mt-2 text-xs opacity-50">Press Ctrl+Shift+Q to exit kiosk mode</p>
                </div>
            </div>
            {/* Exit Kiosk Password Modal */}
            {
                showExitModal && (
                    <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 backdrop-blur-sm">
                        <div className="bg-white rounded-xl shadow-2xl w-full max-w-md p-6 text-slate-900">
                            <div className="flex items-center gap-3 mb-4">
                                <div className="p-3 bg-red-100 rounded-full text-red-600">
                                    <Lock size={24} />
                                </div>
                                <div>
                                    <h3 className="text-xl font-bold text-gray-900">Exit Kiosk Mode</h3>
                                    <p className="text-sm text-gray-500">Admin password required</p>
                                </div>
                            </div>

                            <form onSubmit={handleExitKiosk}>
                                <div className="mb-4">
                                    <label className="block text-sm font-medium text-gray-700 mb-1">
                                        Admin Password
                                    </label>
                                    <input
                                        type="password"
                                        value={adminPassword}
                                        onChange={(e) => setAdminPassword(e.target.value)}
                                        className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-red-500 focus:border-red-500 outline-none transition-all text-slate-900"
                                        placeholder="Enter password..."
                                        autoFocus
                                    />
                                    {exitError && (
                                        <p className="mt-2 text-sm text-red-600 flex items-center gap-1">
                                            <AlertCircle size={14} />
                                            {exitError}
                                        </p>
                                    )}
                                </div>

                                <div className="flex gap-3 justify-end mt-6">
                                    <button
                                        type="button"
                                        onClick={() => {
                                            setShowExitModal(false);
                                            setAdminPassword('');
                                            setExitError('');
                                        }}
                                        className="px-4 py-2 text-gray-700 hover:bg-gray-100 rounded-lg transition-colors font-medium"
                                    >
                                        Cancel
                                    </button>
                                    <button
                                        type="submit"
                                        disabled={isVerifying}
                                        className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors font-medium flex items-center gap-2 disabled:opacity-70 disabled:cursor-not-allowed"
                                    >
                                        {isVerifying ? (
                                            <>
                                                <Loader2 size={18} className="animate-spin" />
                                                Verifying...
                                            </>
                                        ) : (
                                            <>
                                                Exit Kiosk
                                            </>
                                        )}
                                    </button>
                                </div>
                            </form>
                        </div>
                    </div>
                )
            }
        </div >
    );
};

export default AttendanceKiosk;
