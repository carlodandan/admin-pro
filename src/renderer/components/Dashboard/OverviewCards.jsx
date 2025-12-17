import React from 'react';
import { Users, Calendar, CreditCard, TrendingUp, ArrowUp, ArrowDown } from 'lucide-react';

const OverviewCards = ({ stats }) => {
  if (!stats) return null;

  const formatCurrency = (amount) => {
    return new Intl.NumberFormat('en-PH', {
      style: 'currency',
      currency: 'PHP',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0
    }).format(amount);
  };

  const cards = [
    {
      title: 'Total Employees',
      value: stats.totalEmployees,
      change: '+12%',
      trend: 'up',
      icon: <Users className="text-blue-500" size={24} />,
      color: 'bg-blue-50',
      borderColor: 'border-blue-100'
    },
    {
      title: 'Active Today',
      value: stats.activeEmployees,
      change: '+5%',
      trend: 'up',
      icon: <Calendar className="text-green-500" size={24} />,
      color: 'bg-green-50',
      borderColor: 'border-green-100'
    },
    {
      title: 'On Leave',
      value: stats.onLeaveEmployees,
      change: '-2',
      trend: 'down',
      icon: <Calendar className="text-yellow-500" size={24} />,
      color: 'bg-yellow-50',
      borderColor: 'border-yellow-100'
    },
    {
      title: 'Avg. Annual Salary',
      value: formatCurrency(stats.avgSalary),
      change: '+3.2%',
      trend: 'up',
      icon: <CreditCard className="text-purple-500" size={24} />,
      color: 'bg-purple-50',
      borderColor: 'border-purple-100'
    },
  ];

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3 mb-4">
      {cards.map((card, index) => (
        <div 
          key={index} 
          className={`${card.color} p-6 rounded-xl border ${card.borderColor} transition-all hover:shadow-lg`}
        >
          <div className="flex justify-between items-start">
            <div className="flex-1">
              <p className="text-sm text-gray-600 mb-1">{card.title}</p>
              <p className="text-xl font-bold mb-2">{card.value}</p>
              <div className="flex items-center gap-1">
                {card.trend === 'up' ? (
                  <ArrowUp size={14} className="text-green-500" />
                ) : (
                  <ArrowDown size={14} className="text-red-500" />
                )}
                <span className={`text-sm font-medium ${
                  card.trend === 'up' ? 'text-green-600' : 'text-red-600'
                }`}>
                  {card.change}
                </span>
                <span className="text-sm text-gray-500 ml-1">from last month</span>
              </div>
            </div>
            <div className="h-12 w-12 p-3 bg-white rounded-lg shadow-sm items-center justify-center flex">
              {card.icon}
            </div>
          </div>
        </div>
      ))}
    </div>
  );
};

export default OverviewCards;