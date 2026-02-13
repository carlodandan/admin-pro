import React from 'react';
import { Delete } from 'lucide-react';

const Keypad = ({ onKeyPress, onClear, onEnter, showEnter = true }) => {
    const keys = [1, 2, 3, 4, 5, 6, 7, 8, 9, '', 0, 'DEL'];

    return (
        <div className="grid grid-cols-3 gap-4 w-full max-w-[320px] mx-auto">
            {keys.map((key, index) => {
                if (key === '') return <div key={index} />; // Spacer

                if (key === 'DEL') {
                    return (
                        <button
                            key={index}
                            onClick={onClear}
                            className="h-16 rounded-xl bg-red-50 text-red-600 hover:bg-red-100 flex items-center justify-center transition-colors shadow-sm border border-red-100 active:scale-95"
                        >
                            <Delete size={24} />
                        </button>
                    );
                }

                return (
                    <button
                        key={index}
                        onClick={() => onKeyPress(key)}
                        className="h-16 rounded-xl bg-white text-gray-800 text-2xl font-semibold hover:bg-gray-50 transition-all shadow-sm border border-gray-200 active:scale-95 active:shadow-inner"
                    >
                        {key}
                    </button>
                );
            })}

            {showEnter && (
                <button
                    onClick={onEnter}
                    className="col-span-3 h-14 mt-2 rounded-xl bg-blue-600 text-white text-lg font-medium hover:bg-blue-700 transition-all shadow-md active:scale-95"
                >
                    Enter
                </button>
            )}
        </div>
    );
};

export default Keypad;
