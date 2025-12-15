import React from 'react';
import { Calendar, Clock, CheckCircle, XCircle, TrendingUp } from 'lucide-react';

const AttendanceChart = ({ weeklyAttendance }) => {
  if (!weeklyAttendance || weeklyAttendance.length === 0) {
    return (
      <div className="bg-white rounded-xl border border-gray-200 p-6">
        <div className="flex justify-between items-center mb-6">
          <div>
            <h3 className="text-lg font-semibold">Weekly Attendance</h3>
            <p className="text-gray-600">No attendance data available</p>
          </div>
        </div>
        <div className="text-center py-8 text-gray-500">
          <Calendar className="h-12 w-12 mx-auto mb-4 text-gray-300" />
          <p>Attendance data will appear here once recorded</p>
        </div>
      </div>
    );
  }

  // Find max value for scaling
  const maxAttendance = Math.max(...weeklyAttendance.map(day => day.total));

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-6">
      <div className="flex justify-between items-center mb-6">
        <div>
          <h3 className="text-lg font-semibold">Weekly Attendance</h3>
          <p className="text-gray-600">Employee attendance overview</p>
        </div>
        <div className="flex gap-4">
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 bg-green-500 rounded-full"></div>
            <span className="text-sm">Present</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 bg-red-500 rounded-full"></div>
            <span className="text-sm">Absent</span>
          </div>
        </div>
      </div>

      <div className="h-48 flex items-end gap-3 mb-6 px-4">
        {weeklyAttendance.map((day, index) => (
          <div key={index} className="flex-1 flex flex-col items-center">
            <div className="flex-1 w-full flex flex-col justify-end gap-1">
              <div 
                className="w-full bg-green-500 rounded-t"
                style={{ height: `${(day.present / maxAttendance) * 100}%` }}
                title={`Present: ${day.present}`}
              ></div>
              <div 
                className="w-full bg-red-500 rounded-t"
                style={{ height: `${(day.absent / maxAttendance) * 100}%` }}
                title={`Absent: ${day.absent}`}
              ></div>
            </div>
            <span className="mt-2 text-sm font-medium text-gray-600">{day.day}</span>
            <span className="text-xs text-gray-400 mt-1">{day.date.split('-')[2]}</span>
          </div>
        ))}
      </div>

      {/* Attendance Stats */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-green-50 p-4 rounded-lg border border-green-100">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-600">Present Today</p>
              <p className="text-2xl font-bold">
                {weeklyAttendance[weeklyAttendance.length - 1]?.present || 0}
              </p>
            </div>
            <CheckCircle className="text-green-500" size={24} />
          </div>
          <div className="flex items-center gap-1 mt-2">
            <TrendingUp size={14} className="text-green-500" />
            <span className="text-sm text-green-600">+5% from yesterday</span>
          </div>
        </div>
        
        <div className="bg-red-50 p-4 rounded-lg border border-red-100">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-600">Absent Today</p>
              <p className="text-2xl font-bold">
                {weeklyAttendance[weeklyAttendance.length - 1]?.absent || 0}
              </p>
            </div>
            <XCircle className="text-red-500" size={24} />
          </div>
          <div className="flex items-center gap-1 mt-2">
            <TrendingUp size={14} className="text-red-500" />
            <span className="text-sm text-red-600">-2 from last week</span>
          </div>
        </div>
        
        <div className="bg-blue-50 p-4 rounded-lg border border-blue-100">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-600">Attendance Rate</p>
              <p className="text-2xl font-bold">
                {weeklyAttendance.length > 0 
                  ? `${((weeklyAttendance[weeklyAttendance.length - 1].present / 
                      (weeklyAttendance[weeklyAttendance.length - 1].present + 
                       weeklyAttendance[weeklyAttendance.length - 1].absent)) * 100).toFixed(1)}%`
                  : '0%'
                }
              </p>
            </div>
            <Clock className="text-blue-500" size={24} />
          </div>
          <div className="flex items-center gap-1 mt-2">
            <TrendingUp size={14} className="text-blue-500" />
            <span className="text-sm text-blue-600">+2.3% from last week</span>
          </div>
        </div>
      </div>
    </div>
  );
};

export default AttendanceChart;