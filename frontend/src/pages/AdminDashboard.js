// src/pages/AdminDashboard.js
import React, { useState, useEffect, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  TrendingUp, 
  Users, 
  CreditCard, 
  Clock, 
  CheckCircle,
  XCircle,
  AlertTriangle,
  Calendar,
  Download,
  RefreshCw,
  BarChart3,
  DollarSign,
  Activity,
  ArrowRight,
  Bell,
  Eye,
  ChevronLeft,
  ChevronRight
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
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [chapaStatus, setChapaStatus] = useState(null);
  const [loadingChapa, setLoadingChapa] = useState(true);

  // ✅ Dismiss state for green banner — persists for the session
  const [chapaBannerDismissed, setChapaBannerDismissed] = useState(
    () => sessionStorage.getItem('chapaBannerDismissed') === '1'
  );

  const { selectedYear } = useYear();
  const isFetching = useRef(false);
  const abortController = useRef(null);

  const getDateRangeParams = useCallback((period, selectedYearData) => {
    const now = new Date();
    let startDate = null;
    let endDate = null;
    
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
  }, []);

  const checkChapaStatus = useCallback(async () => {
    try {
      const response = await api.get('/schools/chapa-config/');
      setChapaStatus(response.data);
    } catch (err) {
      console.error('Error checking Chapa status:', err);
    } finally {
      setLoadingChapa(false);
    }
  }, []);

  const fetchData = useCallback(async () => {
    if (isFetching.current) {
      console.log('⚠️ Fetch already in progress, skipping...');
      return;
    }
    
    if (abortController.current) {
      abortController.current.abort();
    }
    
    abortController.current = new AbortController();
    isFetching.current = true;
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
      
      const signal = abortController.current.signal;
      
      const [statsRes, studentsRes, paymentsRes, gradesRes, pendingRes] = await Promise.all([
        api.get(`/reports/stats-filtered/${queryPrefix}`, { signal }),
        api.get(`/students/${queryPrefix}`, { signal }),
        api.get(`/payments/${queryPrefix}`, { signal }),
        api.get(`/reports/grades/${queryPrefix}`, { signal }),
        api.get(`/reports/pending-filtered/${queryPrefix}`, { signal })
      ]);

      if (statsRes.data) {
        setDashboardStats({
          total_students: statsRes.data.total_students || 0,
          students_paid: statsRes.data.students_paid || 0,
          total_collected: statsRes.data.total_collected || 0,
          collection_rate: statsRes.data.collection_rate || 0,
          pending_students: statsRes.data.pending_students || 0
        });
      }
      
      setStudents(studentsRes.data || []);
      setPayments(paymentsRes.data || []);
      setGradeOverview(gradesRes.data || []);
      setPendingStudents(pendingRes.data || []);
      
      const byGrade = {};
      for (let grade = 1; grade <= 8; grade++) {
        byGrade[grade] = { total: 0, paid: 0, pending: 0, totalPayments: 0, totalAmount: 0, collectionRate: 0 };
      }
      
      if (gradesRes.data && gradesRes.data.length > 0) {
        gradesRes.data.forEach(gradeInfo => {
          const grade = gradeInfo.grade;
          if (byGrade[grade]) {
            byGrade[grade].total = gradeInfo.total || 0;
            byGrade[grade].paid = gradeInfo.paid || 0;
            byGrade[grade].pending = gradeInfo.pending || 0;
            byGrade[grade].collectionRate = gradeInfo.collection_rate || 0;
          }
        });
      }
      setStats(byGrade);
      
    } catch (err) {
      if (err.name === 'AbortError') {
        console.log('Fetch aborted');
      } else {
        console.error('❌ Error fetching data:', err);
      }
    } finally {
      isFetching.current = false;
      setLoading(false);
    }
  }, [dateRange, selectedYear, getDateRangeParams]);

  useEffect(() => {
    return () => {
      if (abortController.current) {
        abortController.current.abort();
      }
    };
  }, []);

  useEffect(() => {
    fetchData();
    checkChapaStatus();

    const handleRefresh = () => { fetchData(); };
    window.addEventListener('refreshData', handleRefresh);
    window.addEventListener('yearChanged', handleRefresh);
    
    return () => {
      window.removeEventListener('refreshData', handleRefresh);
      window.removeEventListener('yearChanged', handleRefresh);
    };
  }, [fetchData, checkChapaStatus]);

  const overall = {
    total: dashboardStats.total_students,
    paidStudents: dashboardStats.students_paid,
    totalPayments: payments.filter(p => p.status === 'verified').length,
    pending: dashboardStats.pending_students,
    collection: dashboardStats.collection_rate,
    totalCollected: dashboardStats.total_collected
  };

  const handleDismissChapaBanner = () => {
    setChapaBannerDismissed(true);
    sessionStorage.setItem('chapaBannerDismissed', '1');
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
    <div className="space-y-6 md:space-y-8 pb-20 md:pb-0">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold text-gray-900">Dashboard</h1>
          <p className="text-sm text-gray-500 mt-1">
            {new Date().toLocaleDateString('en-US', { 
              weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' 
            })}
          </p>
          {selectedYear && (
            <div className="flex flex-wrap items-center gap-2 mt-1">
              <p className="text-xs sm:text-sm text-primary-600 font-medium">
                📅 Academic Year: {selectedYear.name || selectedYear.year_ec + ' E.C.'}
              </p>
              {selectedYear.is_current && (
                <span className="text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded-full">Current</span>
              )}
            </div>
          )}
        </div>
        
        <div className="flex flex-wrap gap-2">
          <select
            value={dateRange}
            onChange={(e) => setDateRange(e.target.value)}
            className="px-3 sm:px-4 py-2 border border-gray-200 rounded-lg bg-white text-sm font-medium cursor-pointer hover:border-primary-400 transition-colors tap-target"
          >
            <option value="today">📅 Today</option>
            <option value="week">📆 This Week</option>
            <option value="month">📆 This Month</option>
            <option value="year">📅 This Year</option>
          </select>
          
          <button 
            onClick={handleExportReport}
            className="px-3 sm:px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition-colors text-sm font-medium flex items-center gap-2 tap-target"
          >
            <Download className="h-4 w-4" />
            <span className="hidden sm:inline">Export</span>
          </button>
          
          <button 
            onClick={fetchData}
            className="p-2 bg-white rounded-lg shadow-sm hover:shadow transition-all border border-gray-200 tap-target"
            title="Refresh"
          >
            <RefreshCw className="h-4 w-4 text-gray-600" />
          </button>
        </div>
      </div>

      {/* ===== CHAPA STATUS NOTIFICATION =====
          ✅ FIX: Single block with ternary — only ONE banner can show at a time.
          - Not configured → red warning (no dismiss, needs action)
          - Configured → green success (dismissable with × button)
      */}
      {!loadingChapa && chapaStatus && (
        chapaStatus.chapa_enabled ? (
          // ✅ Configured — green banner, dismissable
          !chapaBannerDismissed && (
            <motion.div
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="bg-green-50 border-l-4 border-green-500 p-4 rounded-lg shadow-sm"
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <CheckCircle className="h-5 w-5 text-green-500 flex-shrink-0" />
                  <div>
                    <p className="font-semibold text-green-800 text-sm">✅ Online Payments Enabled</p>
                    <p className="text-green-700 text-sm">Chapa is configured and working. Parents can make online payments.</p>
                  </div>
                </div>
                <button
                  onClick={handleDismissChapaBanner}
                  className="ml-4 text-green-500 hover:text-green-800 text-2xl font-bold leading-none flex-shrink-0"
                  title="Dismiss"
                >
                  ×
                </button>
              </div>
            </motion.div>
          )
        ) : (
          // ❌ Not configured — red warning, no dismiss (needs action)
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            className="bg-red-50 border-l-4 border-red-500 p-4 rounded-lg shadow-sm"
          >
            <div className="flex items-start gap-3">
              <AlertTriangle className="h-6 w-6 text-red-500 flex-shrink-0 mt-0.5" />
              <div className="flex-1">
                <h3 className="font-semibold text-red-800 text-sm">⚠️ Online Payments Not Configured</h3>
                <p className="text-red-700 text-sm mt-1">
                  Parents cannot make online payments until you configure your Chapa payment gateway.
                </p>
                <Link
                  to="/admin/chapa-settings"
                  className="mt-2 inline-block bg-red-600 text-white px-4 py-2 rounded-lg text-sm hover:bg-red-700 transition-colors"
                >
                  Configure Chapa Now
                </Link>
              </div>
            </div>
          </motion.div>
        )
      )}

      {/* Stats Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 md:gap-6">
        {/* Card 1 - Total Students */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="bg-white rounded-xl md:rounded-2xl shadow-lg p-4 md:p-6 border border-gray-100 hover:shadow-xl transition-all"
        >
          <div className="flex items-start justify-between">
            <div>
              <p className="text-xs md:text-sm font-medium text-gray-500">Total Students</p>
              <p className="text-2xl md:text-3xl font-bold text-gray-900 mt-1 md:mt-2">{overall.total}</p>
              <p className="text-xs md:text-sm text-green-600 mt-1 md:mt-2 flex items-center gap-1">
                <TrendingUp className="h-3 w-3 md:h-4 md:w-4" />
                {overall.paidStudents} have paid
              </p>
            </div>
            <div className="p-2 md:p-3 bg-blue-100 rounded-xl">
              <Users className="h-5 w-5 md:h-6 md:w-6 text-blue-600" />
            </div>
          </div>
        </motion.div>

        {/* Card 2 - Total Collected */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          className="bg-white rounded-xl md:rounded-2xl shadow-lg p-4 md:p-6 border border-gray-100 hover:shadow-xl transition-all"
        >
          <div className="flex items-start justify-between">
            <div>
              <p className="text-xs md:text-sm font-medium text-gray-500">Total Collected</p>
              <p className="text-2xl md:text-3xl font-bold text-gray-900 mt-1 md:mt-2">
                {(overall.totalCollected || 0).toLocaleString()} ETB
              </p>
              <p className="text-xs md:text-sm text-green-600 mt-1 md:mt-2 flex items-center gap-1">
                <TrendingUp className="h-3 w-3 md:h-4 md:w-4" />
                {overall.totalPayments} payments
              </p>
            </div>
            <div className="p-2 md:p-3 bg-green-100 rounded-xl">
              <DollarSign className="h-5 w-5 md:h-6 md:w-6 text-green-600" />
            </div>
          </div>
        </motion.div>

        {/* Card 3 - Collection Rate */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3 }}
          className="bg-white rounded-xl md:rounded-2xl shadow-lg p-4 md:p-6 border border-gray-100 hover:shadow-xl transition-all"
        >
          <div className="flex items-start justify-between">
            <div>
              <p className="text-xs md:text-sm font-medium text-gray-500">Collection Rate</p>
              <p className="text-2xl md:text-3xl font-bold text-gray-900 mt-1 md:mt-2">{overall.collection}%</p>
              <p className="text-xs md:text-sm text-gray-500 mt-1 md:mt-2">
                {overall.paidStudents} of {overall.total} students
              </p>
            </div>
            <div className="p-2 md:p-3 bg-purple-100 rounded-xl">
              <Activity className="h-5 w-5 md:h-6 md:w-6 text-purple-600" />
            </div>
          </div>
          <div className="mt-3 md:mt-4 h-2 bg-gray-100 rounded-full overflow-hidden">
            <div 
              className="h-full bg-purple-600 rounded-full transition-all duration-500"
              style={{ width: `${overall.collection}%` }}
            />
          </div>
        </motion.div>

        {/* Card 4 - Pending Students */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.4 }}
          className="bg-white rounded-xl md:rounded-2xl shadow-lg p-4 md:p-6 border border-gray-100 hover:shadow-xl transition-all"
        >
          <div className="flex items-start justify-between">
            <div>
              <p className="text-xs md:text-sm font-medium text-gray-500">Pending Students</p>
              <p className="text-2xl md:text-3xl font-bold text-gray-900 mt-1 md:mt-2">{overall.pending}</p>
              <p className="text-xs md:text-sm text-orange-600 mt-1 md:mt-2 flex items-center gap-1">
                <Clock className="h-3 w-3 md:h-4 md:w-4" />
                Need attention
              </p>
            </div>
            <div className="p-2 md:p-3 bg-orange-100 rounded-xl">
              <Clock className="h-5 w-5 md:h-6 md:w-6 text-orange-600" />
            </div>
          </div>
        </motion.div>
      </div>

      {/* Quick Actions Row */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 md:gap-4">
        <Link to="/admin/students" className="bg-white rounded-lg md:rounded-xl shadow-sm border border-gray-100 p-3 md:p-5 hover:shadow-md transition-all group">
          <div className="flex items-center gap-2 md:gap-4">
            <div className="p-2 md:p-3 bg-blue-100 rounded-lg md:rounded-xl group-hover:bg-blue-200 transition-colors">
              <Users className="h-4 w-4 md:h-5 md:w-5 text-blue-600" />
            </div>
            <div className="flex-1">
              <h3 className="text-sm md:text-base font-semibold text-gray-900">Students</h3>
              <p className="text-xs text-gray-500 hidden sm:block">Manage enrollment</p>
            </div>
            <ArrowRight className="h-4 w-4 text-gray-400 group-hover:text-blue-600 transition-colors" />
          </div>
        </Link>

        <Link to="/admin/payments" className="bg-white rounded-lg md:rounded-xl shadow-sm border border-gray-100 p-3 md:p-5 hover:shadow-md transition-all group">
          <div className="flex items-center gap-2 md:gap-4">
            <div className="p-2 md:p-3 bg-green-100 rounded-lg md:rounded-xl group-hover:bg-green-200 transition-colors">
              <CreditCard className="h-4 w-4 md:h-5 md:w-5 text-green-600" />
            </div>
            <div className="flex-1">
              <h3 className="text-sm md:text-base font-semibold text-gray-900">Payments</h3>
              <p className="text-xs text-gray-500 hidden sm:block">View transactions</p>
            </div>
            <ArrowRight className="h-4 w-4 text-gray-400 group-hover:text-green-600 transition-colors" />
          </div>
        </Link>

        <Link to="/admin/slips" className="bg-white rounded-lg md:rounded-xl shadow-sm border border-gray-100 p-3 md:p-5 hover:shadow-md transition-all group">
          <div className="flex items-center gap-2 md:gap-4">
            <div className="p-2 md:p-3 bg-purple-100 rounded-lg md:rounded-xl group-hover:bg-purple-200 transition-colors">
              <Eye className="h-4 w-4 md:h-5 md:w-5 text-purple-600" />
            </div>
            <div className="flex-1">
              <h3 className="text-sm md:text-base font-semibold text-gray-900">Bank Slips</h3>
              <p className="text-xs text-gray-500 hidden sm:block">Verify uploads</p>
            </div>
            <ArrowRight className="h-4 w-4 text-gray-400 group-hover:text-purple-600 transition-colors" />
          </div>
        </Link>

        <Link to="/admin/sms" className="bg-white rounded-lg md:rounded-xl shadow-sm border border-gray-100 p-3 md:p-5 hover:shadow-md transition-all group">
          <div className="flex items-center gap-2 md:gap-4">
            <div className="p-2 md:p-3 bg-yellow-100 rounded-lg md:rounded-xl group-hover:bg-yellow-200 transition-colors">
              <Bell className="h-4 w-4 md:h-5 md:w-5 text-yellow-600" />
            </div>
            <div className="flex-1">
              <h3 className="text-sm md:text-base font-semibold text-gray-900">SMS</h3>
              <p className="text-xs text-gray-500 hidden sm:block">Send reminders</p>
            </div>
            <ArrowRight className="h-4 w-4 text-gray-400 group-hover:text-yellow-600 transition-colors" />
          </div>
        </Link>
      </div>

      {/* Classes Overview */}
      <div>
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-4">
          <h2 className="text-lg md:text-xl font-semibold text-gray-900">Classes Overview</h2>
          <p className="text-xs md:text-sm text-gray-500">Tap on a class to view details</p>
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
              className="grid grid-cols-2 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3 md:gap-4"
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