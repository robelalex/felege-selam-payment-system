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
  BarChart3,
  DollarSign,
  Activity,
  ArrowRight,
  PieChart,
  School,
  Bell
} from 'lucide-react';
import { Link } from 'react-router-dom';
import api from '../services/api';
import ClassCard from '../components/Admin/ClassCard';
import ClassDetails from '../components/Admin/ClassDetails';

function AdminDashboard() {
  const [selectedGrade, setSelectedGrade] = useState(null);
  const [students, setStudents] = useState([]);
  const [stats, setStats] = useState({});
  const [loading, setLoading] = useState(true);
  const [dateRange, setDateRange] = useState('month');
  const [recentPayments, setRecentPayments] = useState([]);

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      const [studentsRes, paymentsRes, pendingRes] = await Promise.all([
        api.get('/students/'),
        api.get('/payments/'),
        api.get('/reminders/pending/')
      ]);

      setStudents(studentsRes.data);
      setRecentPayments(paymentsRes.data.slice(0, 5));
      calculateStats(studentsRes.data, paymentsRes.data, pendingRes.data);
    } catch (err) {
      console.error('Error fetching data:', err);
    } finally {
      setLoading(false);
    }
  };

  const calculateStats = (studentsData, paymentsData, pendingData) => {
    const byGrade = {};
    
    for (let grade = 1; grade <= 8; grade++) {
      const gradeStudents = studentsData.filter(s => s.grade === grade);
      const paid = paymentsData.filter(p => 
        p.status === 'verified' && 
        gradeStudents.some(s => s.id === p.student)
      ).length;
      
      const gradePending = pendingData?.students?.filter(s => s.grade === grade) || [];
      
      byGrade[grade] = {
        total: gradeStudents.length,
        paid: paid,
        pending: gradeStudents.length - paid,
        collectionRate: gradeStudents.length > 0 
          ? Math.round((paid / gradeStudents.length) * 100)
          : 0
      };
    }

    setStats(byGrade);
  };

  const getOverallStats = () => {
    const total = Object.values(stats).reduce((sum, g) => sum + g.total, 0);
    const paid = Object.values(stats).reduce((sum, g) => sum + g.paid, 0);
    const pending = Object.values(stats).reduce((sum, g) => sum + g.pending, 0);
    const collection = total > 0 ? ((paid / total) * 100).toFixed(1) : 0;
    const totalCollected = paid * 200;

    return { total, paid, pending, collection, totalCollected };
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
    <div className="space-y-8">
      {/* Header with Date */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Dashboard</h1>
          <p className="text-gray-500 mt-1">
            {new Date().toLocaleDateString('en-US', { 
              weekday: 'long', 
              year: 'numeric', 
              month: 'long', 
              day: 'numeric' 
            })}
          </p>
        </div>
        <div className="flex gap-3">
          <select
            value={dateRange}
            onChange={(e) => setDateRange(e.target.value)}
            className="px-4 py-2 border border-gray-200 rounded-lg bg-white text-sm"
          >
            <option value="today">Today</option>
            <option value="week">This Week</option>
            <option value="month">This Month</option>
            <option value="year">This Year</option>
          </select>
          <button className="px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition-colors text-sm font-medium flex items-center gap-2">
            <Download className="h-4 w-4" />
            Export Report
          </button>
          <button 
            onClick={fetchData}
            className="p-2 bg-white rounded-lg shadow-sm hover:shadow transition-all border border-gray-200"
            title="Refresh"
          >
            <RefreshCw className="h-4 w-4 text-gray-600" />
          </button>
        </div>
      </div>

      {/* Key Metrics Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="bg-white rounded-2xl shadow-lg p-6 border border-gray-100 hover:shadow-xl transition-all"
        >
          <div className="flex items-start justify-between">
            <div>
              <p className="text-sm font-medium text-gray-500">Total Students</p>
              <p className="text-3xl font-bold text-gray-900 mt-2">{overall.total}</p>
              <p className="text-sm text-green-600 mt-2 flex items-center gap-1">
                <TrendingUp className="h-4 w-4" />
                +12% from last month
              </p>
            </div>
            <div className="p-3 bg-blue-100 rounded-xl">
              <Users className="h-6 w-6 text-blue-600" />
            </div>
          </div>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          className="bg-white rounded-2xl shadow-lg p-6 border border-gray-100 hover:shadow-xl transition-all"
        >
          <div className="flex items-start justify-between">
            <div>
              <p className="text-sm font-medium text-gray-500">Total Collected</p>
              <p className="text-3xl font-bold text-gray-900 mt-2">{overall.totalCollected.toLocaleString()} ETB</p>
              <p className="text-sm text-green-600 mt-2 flex items-center gap-1">
                <TrendingUp className="h-4 w-4" />
                +8% from last month
              </p>
            </div>
            <div className="p-3 bg-green-100 rounded-xl">
              <DollarSign className="h-6 w-6 text-green-600" />
            </div>
          </div>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3 }}
          className="bg-white rounded-2xl shadow-lg p-6 border border-gray-100 hover:shadow-xl transition-all"
        >
          <div className="flex items-start justify-between">
            <div>
              <p className="text-sm font-medium text-gray-500">Collection Rate</p>
              <p className="text-3xl font-bold text-gray-900 mt-2">{overall.collection}%</p>
              <p className="text-sm text-gray-500 mt-2">
                {overall.paid} of {overall.total} paid
              </p>
            </div>
            <div className="p-3 bg-purple-100 rounded-xl">
              <Activity className="h-6 w-6 text-purple-600" />
            </div>
          </div>
          <div className="mt-4 h-2 bg-gray-100 rounded-full overflow-hidden">
            <div 
              className="h-full bg-purple-600 rounded-full transition-all duration-500"
              style={{ width: `${overall.collection}%` }}
            />
          </div>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.4 }}
          className="bg-white rounded-2xl shadow-lg p-6 border border-gray-100 hover:shadow-xl transition-all"
        >
          <div className="flex items-start justify-between">
            <div>
              <p className="text-sm font-medium text-gray-500">Pending Payments</p>
              <p className="text-3xl font-bold text-gray-900 mt-2">{overall.pending}</p>
              <p className="text-sm text-orange-600 mt-2 flex items-center gap-1">
                <Clock className="h-4 w-4" />
                Need attention
              </p>
            </div>
            <div className="p-3 bg-orange-100 rounded-xl">
              <Clock className="h-6 w-6 text-orange-600" />
            </div>
          </div>
        </motion.div>
      </div>

      {/* Quick Actions Row */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Link to="/admin/students" className="bg-white rounded-xl shadow-sm border border-gray-100 p-5 hover:shadow-md transition-all group">
          <div className="flex items-center gap-4">
            <div className="p-3 bg-blue-100 rounded-xl group-hover:bg-blue-200 transition-colors">
              <Users className="h-5 w-5 text-blue-600" />
            </div>
            <div className="flex-1">
              <h3 className="font-semibold text-gray-900">Students</h3>
              <p className="text-sm text-gray-500">Manage enrollment</p>
            </div>
            <ArrowRight className="h-5 w-5 text-gray-400 group-hover:text-blue-600 transition-colors" />
          </div>
        </Link>

        <Link to="/admin/payments" className="bg-white rounded-xl shadow-sm border border-gray-100 p-5 hover:shadow-md transition-all group">
          <div className="flex items-center gap-4">
            <div className="p-3 bg-green-100 rounded-xl group-hover:bg-green-200 transition-colors">
              <CreditCard className="h-5 w-5 text-green-600" />
            </div>
            <div className="flex-1">
              <h3 className="font-semibold text-gray-900">Payments</h3>
              <p className="text-sm text-gray-500">Verify & track</p>
            </div>
            <ArrowRight className="h-5 w-5 text-gray-400 group-hover:text-green-600 transition-colors" />
          </div>
        </Link>

        <Link to="/admin/slips" className="bg-white rounded-xl shadow-sm border border-gray-100 p-5 hover:shadow-md transition-all group">
          <div className="flex items-center gap-4">
            <div className="p-3 bg-purple-100 rounded-xl group-hover:bg-purple-200 transition-colors">
              <CheckCircle className="h-5 w-5 text-purple-600" />
            </div>
            <div className="flex-1">
              <h3 className="font-semibold text-gray-900">Bank Slips</h3>
              <p className="text-sm text-gray-500">Verify uploads</p>
            </div>
            <ArrowRight className="h-5 w-5 text-gray-400 group-hover:text-purple-600 transition-colors" />
          </div>
        </Link>

        <Link to="/admin/sms" className="bg-white rounded-xl shadow-sm border border-gray-100 p-5 hover:shadow-md transition-all group">
          <div className="flex items-center gap-4">
            <div className="p-3 bg-yellow-100 rounded-xl group-hover:bg-yellow-200 transition-colors">
              <Bell className="h-5 w-5 text-yellow-600" />
            </div>
            <div className="flex-1">
              <h3 className="font-semibold text-gray-900">SMS</h3>
              <p className="text-sm text-gray-500">Send reminders</p>
            </div>
            <ArrowRight className="h-5 w-5 text-gray-400 group-hover:text-yellow-600 transition-colors" />
          </div>
        </Link>
      </div>

      {/* Classes Overview - EXACTLY like your first code but with better styling */}
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
              className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4"
            >
              {[1,2,3,4,5,6,7,8].map(grade => (
                <ClassCard
                  key={grade}
                  grade={grade}
                  stats={stats[grade] || { total: 0, paid: 0, pending: 0, collectionRate: 0 }}
                  onClick={() => setSelectedGrade(grade)}
                />
              ))}
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Recent Payments */}
      <div className="bg-white rounded-2xl shadow-lg p-6 border border-gray-100">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-gray-900">Recent Payments</h2>
          <Link to="/admin/payments" className="text-sm text-primary-600 hover:text-primary-700 font-medium flex items-center gap-1">
            View All
            <ArrowRight className="h-4 w-4" />
          </Link>
        </div>
        
        <div className="space-y-3">
          {recentPayments.length === 0 ? (
            <p className="text-gray-500 text-center py-4">No recent payments</p>
          ) : (
            recentPayments.map((payment, idx) => (
              <div key={idx} className="flex items-center justify-between py-2 border-b border-gray-100 last:border-0">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 bg-gray-100 rounded-full flex items-center justify-center">
                    <span className="text-sm font-medium text-gray-600">
                      {payment.student_name?.charAt(0) || '?'}
                    </span>
                  </div>
                  <div>
                    <p className="font-medium text-gray-900">{payment.student_name || 'Unknown'}</p>
                    <p className="text-xs text-gray-500">{payment.deadline_month || 'N/A'}</p>
                  </div>
                </div>
                <div className="text-right">
                  <p className="font-bold text-gray-900">{payment.amount || 0} Birr</p>
                  <p className="text-xs text-gray-500">
                    {payment.created_at ? new Date(payment.created_at).toLocaleDateString() : 'N/A'}
                  </p>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}

export default AdminDashboard;