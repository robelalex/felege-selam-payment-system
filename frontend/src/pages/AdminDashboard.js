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
  RefreshCw,
  BarChart3,
  DollarSign,
  Activity,
  ArrowRight,
  Bell,
  Eye
} from 'lucide-react';
import { Link } from 'react-router-dom';
import api from '../services/api';
import ClassCard from '../components/Admin/ClassCard';
import ClassDetails from '../components/Admin/ClassDetails';
import { useYear } from '../context/YearContext';

function AdminDashboard() {
  const [selectedGrade, setSelectedGrade] = useState(null);
  const [students, setStudents] = useState([]);
  const [payments, setPayments] = useState([]);
  const [stats, setStats] = useState({});
  const [loading, setLoading] = useState(true);
  const [dateRange, setDateRange] = useState('year');
  const [dashboardStats, setDashboardStats] = useState({
    total_students: 0,
    students_paid: 0,
    total_collected: 0,
    collection_rate: 0,
    pending_students: 0
  });
  const [gradeOverview, setGradeOverview] = useState([]);
  const [pendingStudents, setPendingStudents] = useState([]);
  
  const { selectedYear } = useYear();

  // Helper function to get date range based on selected period
  const getDateRangeParams = (period, selectedYearData) => {
    const now = new Date();
    let startDate = null;
    let endDate = null;
    
    console.log('📅 Calculating date range for period:', period);
    
    switch(period) {
      case 'today':
        startDate = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        endDate = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
        break;
        
      case 'week':
        const dayOfWeek = now.getDay();
        const diffToMonday = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
        const monday = new Date(now);
        monday.setDate(now.getDate() - diffToMonday);
        monday.setHours(0, 0, 0, 0);
        
        const sunday = new Date(monday);
        sunday.setDate(monday.getDate() + 6);
        sunday.setHours(23, 59, 59, 999);
        
        startDate = monday;
        endDate = sunday;
        break;
        
      case 'month':
        startDate = new Date(now.getFullYear(), now.getMonth(), 1);
        endDate = new Date(now.getFullYear(), now.getMonth() + 1, 0);
        endDate.setHours(23, 59, 59, 999);
        break;
        
      case 'year':
      default:
        if (selectedYearData && selectedYearData.start_date && selectedYearData.end_date) {
          startDate = new Date(selectedYearData.start_date);
          startDate.setHours(0, 0, 0, 0);
          
          endDate = new Date(selectedYearData.end_date);
          endDate.setHours(23, 59, 59, 999);
        } else {
          startDate = new Date(now.getFullYear(), 0, 1);
          endDate = new Date(now.getFullYear(), 11, 31);
          endDate.setHours(23, 59, 59, 999);
        }
        break;
    }
    
    return {
      start_date: startDate ? startDate.toISOString().split('T')[0] : null,
      end_date: endDate ? endDate.toISOString().split('T')[0] : null
    };
  };

  useEffect(() => {
    fetchData();
    
    const handleRefresh = () => {
      fetchData();
    };
    
    window.addEventListener('refreshData', handleRefresh);
    window.addEventListener('yearChanged', handleRefresh);
    
    return () => {
      window.removeEventListener('refreshData', handleRefresh);
      window.removeEventListener('yearChanged', handleRefresh);
    };
  }, [selectedYear, dateRange]);

  const fetchData = async () => {
    setLoading(true);
    try {
      const dateParams = getDateRangeParams(dateRange, selectedYear);
      
      const queryParams = new URLSearchParams();
      
      queryParams.append('period', dateRange);
      
      if (selectedYear && selectedYear.id) {
        queryParams.append('academic_year_id', selectedYear.id);
      }
      
      if (dateParams.start_date) {
        queryParams.append('start_date', dateParams.start_date);
      }
      if (dateParams.end_date) {
        queryParams.append('end_date', dateParams.end_date);
      }
      
      const queryString = queryParams.toString();
      const queryPrefix = queryString ? '?' + queryString : '';
      
      console.log('📡 Fetching data with params:', queryPrefix);
      
      // ✅ UPDATED: Use the filtered endpoints that respect X-School-ID
      const statsRes = await api.get(`/reports/stats-filtered/${queryPrefix}`);
      
      console.log('📊 Dashboard stats from API:', statsRes.data);
      
      if (statsRes.data) {
        setDashboardStats({
          total_students: statsRes.data.total_students || 0,
          students_paid: statsRes.data.students_paid || 0,
          total_collected: statsRes.data.total_collected || 0,
          collection_rate: statsRes.data.collection_rate || 0,
          pending_students: statsRes.data.pending_students || 0
        });
      }
      
      // ✅ UPDATED: Use the filtered endpoints
      const [studentsRes, paymentsRes, gradesRes, pendingRes] = await Promise.all([
        api.get(`/students/${queryPrefix}`),
        api.get(`/payments/${queryPrefix}`),
        api.get(`/reports/grades/${queryPrefix}`),
        api.get(`/reports/pending-filtered/${queryPrefix}`)
      ]);

      console.log('👥 Students received:', studentsRes.data?.length || 0);
      console.log('💰 Payments received:', paymentsRes.data?.length || 0);
      console.log('📊 Grade Overview from API:', gradesRes.data);
      console.log('📋 Pending Students from API:', pendingRes.data?.length || 0);
      
      setStudents(studentsRes.data || []);
      setPayments(paymentsRes.data || []);
      setGradeOverview(gradesRes.data || []);
      setPendingStudents(pendingRes.data || []);
      
      // Calculate grade-wise stats
      calculateStatsFromAPI(gradesRes.data || [], studentsRes.data || []);
      
    } catch (err) {
      console.error('❌ Error fetching data:', err);
    } finally {
      setLoading(false);
    }
  };

  const calculateStatsFromAPI = (gradeOverviewData, studentsData) => {
    const byGrade = {};
    
    // Initialize all grades
    for (let grade = 1; grade <= 8; grade++) {
      byGrade[grade] = {
        total: 0,
        paid: 0,
        pending: 0,
        totalPayments: 0,
        totalAmount: 0,
        collectionRate: 0
      };
    }
    
    // Populate from API grade overview
    if (gradeOverviewData && gradeOverviewData.length > 0) {
      gradeOverviewData.forEach(gradeInfo => {
        const grade = gradeInfo.grade;
        if (byGrade[grade]) {
          byGrade[grade].total = gradeInfo.total || 0;
          byGrade[grade].paid = gradeInfo.paid || 0;
          byGrade[grade].pending = gradeInfo.pending || 0;
          byGrade[grade].collectionRate = gradeInfo.collection_rate || 0;
        }
      });
    } else {
      // Fallback: Calculate from students data
      studentsData.forEach(student => {
        const grade = student.grade;
        if (byGrade[grade]) {
          byGrade[grade].total += 1;
        }
      });
    }
    
    console.log('📊 Final Grade Stats:', byGrade);
    setStats(byGrade);
  };

  const overall = {
    total: dashboardStats.total_students,
    paidStudents: dashboardStats.students_paid,
    totalPayments: payments.filter(p => p.status === 'verified').length,
    pending: dashboardStats.pending_students,
    collection: dashboardStats.collection_rate,
    totalCollected: dashboardStats.total_collected
  };

  const handleExportReport = async () => {
    try {
      let csvContent = "Grade,Total Students,Students Paid,Pending Students,Total Payments,Total Amount (ETB),Collection Rate\n";
      
      for (let grade = 1; grade <= 8; grade++) {
        const data = stats[grade] || { total: 0, paid: 0, pending: 0, totalPayments: 0, totalAmount: 0, collectionRate: 0 };
        csvContent += `${grade},${data.total},${data.paid},${data.pending},${data.totalPayments},${data.totalAmount},${data.collectionRate}%\n`;
      }
      
      csvContent += `\nSummary (${dateRange.toUpperCase()} - ${selectedYear?.name || 'All Years'})\n`;
      csvContent += `Overall,${overall.total},${overall.paidStudents},${overall.pending},${overall.totalPayments},${overall.totalCollected},${overall.collection}%\n`;

      const blob = new Blob([csvContent], { type: 'text/csv' });
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `dashboard-report-${dateRange}-${new Date().toISOString().slice(0,10)}.csv`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
    } catch (err) {
      console.error('Export failed:', err);
      alert('Failed to export report');
    }
  };

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
          {selectedYear && (
            <p className="text-sm text-primary-600 mt-1 font-medium">
              📅 Academic Year: {selectedYear.name || selectedYear.year_ec + ' E.C.'}
              {selectedYear.is_current && <span className="ml-2 text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded-full">Current</span>}
            </p>
          )}
          <p className="text-xs text-gray-500 mt-1">
            Filter: {dateRange === 'today' ? 'Today' : dateRange === 'week' ? 'This Week' : dateRange === 'month' ? 'This Month' : 'This Year'}
          </p>
        </div>
        <div className="flex gap-3 flex-wrap">
          <select
            value={dateRange}
            onChange={(e) => setDateRange(e.target.value)}
            className="px-4 py-2 border border-gray-200 rounded-lg bg-white text-sm font-medium cursor-pointer hover:border-primary-400 transition-colors"
          >
            <option value="today">📅 Today</option>
            <option value="week">📆 This Week</option>
            <option value="month">📆 This Month</option>
            <option value="year">📅 This Year</option>
          </select>
          <button 
            onClick={handleExportReport}
            className="px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition-colors text-sm font-medium flex items-center gap-2"
          >
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
                {overall.paidStudents} have paid
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
                {overall.totalPayments} payments
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
                {overall.paidStudents} of {overall.total} students
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
              <p className="text-sm font-medium text-gray-500">Pending Students</p>
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
              <p className="text-sm text-gray-500">View all transactions</p>
            </div>
            <ArrowRight className="h-5 w-5 text-gray-400 group-hover:text-green-600 transition-colors" />
          </div>
        </Link>

        <Link to="/admin/slips" className="bg-white rounded-xl shadow-sm border border-gray-100 p-5 hover:shadow-md transition-all group">
          <div className="flex items-center gap-4">
            <div className="p-3 bg-purple-100 rounded-xl group-hover:bg-purple-200 transition-colors">
              <Eye className="h-5 w-5 text-purple-600" />
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

      {/* Classes Overview - Grade Boxes 1-8 */}
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
    </div>
  );
}

export default AdminDashboard;