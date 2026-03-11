// src/components/Admin/ClassCard.js
import React from 'react';
import { motion } from 'framer-motion';
import { Users, CheckCircle, AlertCircle } from 'lucide-react';

const ClassCard = ({ grade, stats, onClick }) => {
  const collectionRate = stats.total > 0 ? (stats.paid / stats.total) * 100 : 0;
  
  const getProgressColor = (rate) => {
    if (rate >= 80) return 'bg-green-500';
    if (rate >= 50) return 'bg-yellow-500';
    return 'bg-red-500';
  };

  return (
    <motion.div
      whileHover={{ y: -4 }}
      className="class-card"
      onClick={() => onClick(grade)}
    >
      <div className="class-header">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-xl md:text-2xl font-bold text-gray-800">Grade {grade}</h3>
          <div className="p-2 md:p-3 bg-primary-100 rounded-full">
            <Users className="h-5 w-5 md:h-6 md:w-6 text-primary-600" />
          </div>
        </div>
        
        <div className="space-y-3">
          <div className="flex justify-between text-xs md:text-sm">
            <span className="text-gray-600">Total Students:</span>
            <span className="font-semibold">{stats.total}</span>
          </div>
          
          <div className="flex justify-between text-xs md:text-sm">
            <span className="text-gray-600">Paid this month:</span>
            <span className="font-semibold text-green-600">{stats.paid}</span>
          </div>
          
          <div className="flex justify-between text-xs md:text-sm">
            <span className="text-gray-600">Pending:</span>
            <span className="font-semibold text-yellow-600">{stats.pending}</span>
          </div>
          
          <div className="pt-2">
            <div className="flex items-center justify-between mb-1">
              <span className="text-xs text-gray-500">Collection Rate</span>
              <span className="text-xs font-semibold">{collectionRate.toFixed(1)}%</span>
            </div>
            <div className="progress-bar">
              <div 
                className={`progress-bar-fill ${getProgressColor(collectionRate)}`}
                style={{ width: `${collectionRate}%` }}
              ></div>
            </div>
          </div>
        </div>
      </div>
      
      <div className="class-footer">
        <div className="flex items-center justify-between text-xs">
          <span className="flex items-center gap-1 text-green-600">
            <CheckCircle className="h-3 w-3" /> {stats.paid} paid
          </span>
          <span className="flex items-center gap-1 text-yellow-600">
            <AlertCircle className="h-3 w-3" /> {stats.pending} pending
          </span>
        </div>
      </div>
    </motion.div>
  );
};

export default ClassCard;