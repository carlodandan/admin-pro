import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Clock, KeyRound, User, LogOut, CheckCircle, XCircle } from 'lucide-react';
import Keypad from '../components/Kiosk/Keypad';

const AttendanceKiosk = () => {
    const navigate = useNavigate();
    const [currentTime, setCurrentTime] = useState(new Date());

    // States: 'ID' -> 'PIN' -> 'PROCESSING' -> 'RESULT'
    const [step, setStep] = useState('ID');
    const [employeeId, setEmployeeId] = useState('');
    const [pin, setPin] = useState('');
    const [feedback, setFeedback] = useState(null); // { type: 'success'|'error', message: '', record: null }

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
        } else if (step === 'PIN') {
            if (pin.length < 6) setPin(prev => prev + key);
        }
    };

    const handleClear = () => {
        if (step === 'ID') {
            setEmployeeId(prev => prev.slice(0, -1));
        } else if (step === 'PIN') {
            setPin(prev => prev.slice(0, -1));
        }
    };

    const handleEnter = async () => {
        if (step === 'ID') {
            if (employeeId.trim().length > 0) {
                setStep('PIN');
            }
        } else if (step === 'PIN') {
            if (pin.trim().length > 0) {
                await processAttendance();
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

    const resetKiosk = () => {
        setStep('ID');
        setEmployeeId('');
        setPin('');
        setFeedback(null);
    };

    // Exit Kiosk Handler
    useEffect(() => {
        const handleKeyDown = (e) => {
            // Create a secret combination to exit, e.g., Ctrl + Shift + Q
            if (e.ctrlKey && e.shiftKey && e.key === 'Q') {
                if (window.confirm('Exit Kiosk Mode?')) {
                    navigate('/dashboard');
                }
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
    }, [step, employeeId, pin, navigate]);

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
                <div className="w-full bg-white/10 backdrop-blur-xl rounded-2xl p-8 border border-white/10 shadow-2xl min-h-[400px] flex flex-col justify-center">

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
                                    <p className="text-slate-400">Recorded at {feedback.time}</p>
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

                    {(step === 'ID' || step === 'PIN') && (
                        <div className="flex flex-col gap-6">
                            <div className="flex items-center justify-between mb-2">
                                <button
                                    onClick={() => {
                                        if (step === 'PIN') {
                                            setStep('ID');
                                            setPin('');
                                        }
                                    }}
                                    className={`text-sm flex items-center gap-1 ${step === 'PIN' ? 'text-slate-300 hover:text-white' : 'invisible'}`}
                                >
                                    ← Back
                                </button>
                                <span className="text-sm font-medium text-slate-400 uppercase tracking-wider">
                                    {step === 'ID' ? 'Enter Employee ID' : 'Enter Secure PIN'}
                                </span>
                                <span className="w-10"></span>
                            </div>

                            {/* Display Input */}
                            <div className="bg-slate-800/50 rounded-xl p-4 text-center border border-slate-700">
                                <span className="text-3xl font-mono tracking-widest text-white">
                                    {step === 'ID'
                                        ? (
                                            <span className="flex items-center justify-center gap-1">
                                                <span className="text-slate-500">EMP-</span>
                                                <span>{employeeId || <span className="text-slate-600 opacity-50">######</span>}</span>
                                            </span>
                                        )
                                        : (pin ? '•'.repeat(pin.length) : <span className="text-slate-600">PIN Code</span>)
                                    }
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
        </div>
    );
};

export default AttendanceKiosk;
