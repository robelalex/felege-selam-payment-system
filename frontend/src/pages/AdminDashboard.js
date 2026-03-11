// src/pages/AdminDashboard.js
import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  TrendingUp, 
  Users, 
  CreditCard, 
  Clock, 
  CheckCircle,
  AlertTriangle,
  Calendar,
  Download,
  Filter,
  RefreshCw,
  BarChart3
} from 'lucide-react';
import axios from 'axios';
import ClassCard from '../components/Admin/ClassCard';
import ClassDetails from '../components/Admin/ClassDetails';

function AdminDashboard() {
  const [selectedGrade, setSelectedGrade] = useState(null);
  const [students, setStudents] = useState([]);
  const [stats, setStats] = useState({});
  const [loading, setLoading] = useState(true);
  const [dateRange, setDateRange] = useState('month');

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      const [studentsRes, paymentsRes] = await Promise.all([
        axios.get('http://127.0.0.1:8000/api/students/'),
        axios.get('http://127.0.0.1:8000/api/payments/')
      ]);

      setStudents(studentsRes.data);
      calculateStats(studentsRes.data, paymentsRes.data);
    } catch (err) {
      console.error('Error fetching data:', err);
    } finally {
      setLoading(false);
    }
  };

  const calculateStats = (studentsData, paymentsData) => {
    // Group students by grade
    const byGrade = {};
    
    for (let grade = 1; grade <= 8; grade++) {
      const gradeStudents = studentsData.filter(s => s.grade === grade);
      const paid = paymentsData.filter(p => 
        p.status === 'verified' && 
        gradeStudents.some(s => s.id === p.student)
      ).length;
      
      byGrade[grade] = {
        total: gradeStudents.length,
        paid: paid,
        pending: gradeStudents.length - paid
      };
    }

    setStats(byGrade);
  };

  const getOverallStats = () => {
    const total = Object.values(stats).reduce((sum, g) => sum + g.total, 0);
    const paid = Object.values(stats).reduce((sum, g) => sum + g.paid, 0);
    const pending = Object.values(stats).reduce((sum, g) => sum + g.pending, 0);
    const collection = total > 0 ? ((paid / total) * 100).toFixed(1) : 0;

    return { total, paid, pending, collection };
  };

  const overall = getOverallStats();

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <RefreshCw className="h-8 w-8 animate-spin text-primary-600" />
      </div>
    );
  }

  return (
  <div className="space-y-6 admin-content">
    {/* Header */}
    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
      <div>
        <h1 className="text-2xl md:text-3xl font-bold text-gray-900">Dashboard</h1>
        <p className="text-sm md:text-base text-gray-600 mt-1">Welcome back! Here's what's happening today.</p>
      </div>
      
      <div className="flex items-center gap-2">
        <select
          value={dateRange}
          onChange={(e) => setDateRange(e.target.value)}
          className="input-field w-32 md:w-40 text-sm"
        >
          <option value="today">Today</option>
          <option value="week">This Week</option>
          <option value="month">This Month</option>
          <option value="year">This Year</option>
        </select>
        
        <button className="p-2 bg-white rounded-lg shadow-sm hover:shadow transition-all border border-gray-200">
          <Download className="h-4 w-4 md:h-5 md:w-5 text-gray-600" />
        </button>
        
        <button 
          onClick={fetchData}
          className="p-2 bg-white rounded-lg shadow-sm hover:shadow transition-all border border-gray-200"
        >
          <RefreshCw className="h-4 w-4 md:h-5 md:w-5 text-gray-600" />
        </button>
      </div>
    </div>

    {/* Stats Grid */}
    <div className="stats-grid">
      <div className="stat-card bg-gradient-to-br from-blue-500 to-blue-600">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-blue-100 text-sm">Total Students</p>
            <p className="text-2xl md:text-3xl font-bold mt-2">{overall.total}</p>
            <p className="text-xs text-blue-200 mt-2">↑ 12% from last month</p>
          </div>
          <Users className="stat-icon" />
        </div>
      </div>

      <div className="stat-card bg-gradient-to-br from-green-500 to-green-600">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-green-100 text-sm">Total Collected</p>
            <p className="text-2xl md:text-3xl font-bold mt-2">{overall.paid * 200} ETB</p>
            <p className="text-xs text-green-200 mt-2">↑ 8% from last month</p>
          </div>
          <CreditCard className="stat-icon" />
        </div>
      </div>

      <div className="stat-card bg-gradient-to-br from-yellow-500 to-yellow-600">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-yellow-100 text-sm">Collection Rate</p>
            <p className="text-2xl md:text-3xl font-bold mt-2">{overall.collection}%</p>
            <p className="text-xs text-yellow-200 mt-2">{overall.paid} of {overall.total} paid</p>
          </div>
          <TrendingUp className="stat-icon" />
        </div>
      </div>

      <div className="stat-card bg-gradient-to-br from-purple-500 to-purple-600">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-purple-100 text-sm">Pending Payments</p>
            <p className="text-2xl md:text-3xl font-bold mt-2">{overall.pending}</p>
            <p className="text-xs text-purple-200 mt-2">Need attention</p>
          </div>
          <Clock className="stat-icon" />
        </div>
      </div>
    </div>

    {/* Quick Actions */}
    <div className="actions-grid">
      <div className="action-card">
        <div className="flex items-center gap-4">
          <div className="action-icon bg-blue-100">
            <Users className="h-5 w-5 md:h-6 md:w-6 text-blue-600" />
          </div>
          <div>
            <h3 className="font-semibold text-gray-900">Send Reminders</h3>
            <p className="text-xs md:text-sm text-gray-600 mt-1">SMS to {overall.pending} parents</p>
          </div>
        </div>
      </div>

      <div className="action-card">
        <div className="flex items-center gap-4">
          <div className="action-icon bg-green-100">
            <CreditCard className="h-5 w-5 md:h-6 md:w-6 text-green-600" />
          </div>
          <div>
            <h3 className="font-semibold text-gray-900">Bulk Import</h3>
            <p className="text-xs md:text-sm text-gray-600 mt-1">Add students from Excel</p>
          </div>
        </div>
      </div>

      <div className="action-card">
        <div className="flex items-center gap-4">
          <div className="action-icon bg-yellow-100">
            <BarChart3 className="h-5 w-5 md:h-6 md:w-6 text-yellow-600" />
          </div>
          <div>
            <h3 className="font-semibold text-gray-900">Generate Report</h3>
            <p className="text-xs md:text-sm text-gray-600 mt-1">Monthly collection summary</p>
          </div>
        </div>
      </div>
    </div>

    {/* Classes Overview */}
    <div>
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg md:text-xl font-semibold text-gray-900">Classes Overview</h2>
        <p className="text-xs md:text-sm text-gray-600">Click on a class to view details</p>
      </div>
      
      <AnimatePresence mode="wait">
        {selectedGrade ? (
          <ClassDetails
            grade={selectedGrade}
            students={students.filter(s => s.grade === selectedGrade)}
            onBack={() => setSelectedGrade(null)}
          />
        ) : (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="classes-grid"
          >
            {[1,2,3,4,5,6,7,8].map(grade => (
              <ClassCard
                key={grade}
                grade={grade}
                stats={stats[grade] || { total: 0, paid: 0, pending: 0 }}
                onClick={() => setSelectedGrade(grade)}
              />
            ))}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  </div>
);
}

export default AdminDashboard;