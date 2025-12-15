import React from 'react';
import { Minus, Square, X, Maximize2, Briefcase } from 'lucide-react';

const CustomTitleBar = () => {
  const handleMinimize = () => {
    if (window.electronAPI) {
      window.electronAPI.minimizeWindow();
    }
  };

  const handleMaximize = () => {
    if (window.electronAPI) {
      window.electronAPI.maximizeWindow();
    }
  };

  const handleClose = () => {
    if (window.electronAPI) {
      window.electronAPI.closeWindow();
    }
  };

  return (
    <div className="window-controls fixed top-0 left-0 right-0 h-10 bg-linear-to-r from-gray-900 to-gray-800 flex justify-between items-center px-4 z-50">
      <div className="flex items-center gap-3">
        <div className="w-8 h-8 rounded-lg bg-linear-to-br from-blue-500 to-purple-600 flex items-center justify-center">
          <Briefcase size={18} />
        </div>
        <span className="text-white font-semibold">Company Admin Pro</span>
      </div>
      
      <div className="flex items-center gap-2">
        <button
          onClick={handleMinimize}
          className="p-1.5 hover:bg-gray-700 rounded"
          title="Minimize"
        >
          <Minus size={16} className="text-white" />
        </button>
        <button
          onClick={handleMaximize}
          className="p-1.5 hover:bg-gray-700 rounded"
          title="Maximize"
        >
          <Maximize2 size={16} className="text-white" />
        </button>
        <button
          onClick={handleClose}
          className="p-1.5 hover:bg-red-600 rounded"
          title="Close"
        >
          <X size={16} className="text-white" />
        </button>
      </div>
    </div>
  );
};

export default CustomTitleBar;