// src/pages/SMSDashboard.js
import React, { useState, useEffect, useCallback, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  Send, 
  Phone, 
  DollarSign,
  CheckCircle,
  AlertCircle,
  Loader,
  RefreshCw,
  Users,
  MessageSquare,
  ChevronUp,
  ChevronDown,
  AlertTriangle,
  Calendar,
  Search,
  Link as LinkIcon,
  Eye,
  Settings
} from 'lucide-react';
import api from '../services/api';
import { useYear } from '../context/YearContext';
import { useAuth } from '../context/AuthContext';

function SMSDashboard() {
  const [balance, setBalance] = useState(null);
  const [history, setHistory] = useState([]);
  const [loading, setLoading] = useState(true);
  const [testPhone, setTestPhone] = useState('');
  const [testMessage, setTestMessage] = useState('');
  const [sending, setSending] = useState(false);
  const [result, setResult] = useState(null);
  
  const [pendingStudents, setPendingStudents] = useState([]);
  const [selectedStudents, setSelectedStudents] = useState([]);
  const [bulkMessage, setBulkMessage] = useState('');
  const [sendingBulk, setSendingBulk] = useState(false);
  const [bulkResult, setBulkResult] = useState(null);
  const [filterGrade, setFilterGrade] = useState('all');
  const [filterMonth, setFilterMonth] = useState('all');
  const [studentSearch, setStudentSearch] = useState('');
  const [expandedSection, setExpandedSection] = useState('test');
  const [pendingStats, setPendingStats] = useState(null);
  
  // ✅ NEW: Multi-school state
  const [selectedDeadline, setSelectedDeadline] = useState(null);
  const [availableDeadlines, setAvailableDeadlines] = useState([]);
  const [showPaymentLinks, setShowPaymentLinks] = useState(false);
  const [deadlineLoading, setDeadlineLoading] = useState(false);
  const [smsConfigured, setSmsConfigured] = useState(false);
  const [checkingConfig, setCheckingConfig] = useState(true);

  // ✅ NEW: Use auth context
  const { getAuthHeader, schoolId } = useAuth();

  const months = [
    'መስከረም', 'ጥቅምት', 'ህዳር', 'ታህሳስ', 'ጥር', 'የካቲት',
    'መጋቢት', 'ሚያዝያ', 'ግንቦት', 'ሰኔ', 'ሐምሌ', 'ነሐሴ', 'ጳጉሜ'
  ];

  const { selectedYear } = useYear();

  // ✅ NEW: Check if SMS is configured for this school
  const checkSMSConfiguration = useCallback(async () => {
    setCheckingConfig(true);
    try {
         const response = await api.get('/sms-config/', {
             headers: getAuthHeader()
          });
      setSmsConfigured(response.data.sms_enabled === true);
    } catch (err) {
      console.error('Error checking SMS config:', err);
      setSmsConfigured(false);
    } finally {
      setCheckingConfig(false);
    }
  }, [getAuthHeader]);

  // ✅ NEW: Fetch available deadlines for this school
  const fetchDeadlines = useCallback(async () => {
    setDeadlineLoading(true);
    try {
      const params = new URLSearchParams();
      if (selectedYear && selectedYear.id) {
        params.append('academic_year_id', selectedYear.id);
      }
      
      const response = await api.get(`/deadlines/?${params.toString()}`, {
        headers: getAuthHeader()
      });
      
      // Filter active deadlines
      const activeDeadlines = (response.data.results || response.data || []).filter(d => d.is_active === true);
      setAvailableDeadlines(activeDeadlines);
      
      // Auto-select first deadline if none selected
      if (activeDeadlines.length > 0 && !selectedDeadline) {
        setSelectedDeadline(activeDeadlines[0]);
      }
    } catch (err) {
      console.error('Error fetching deadlines:', err);
      setAvailableDeadlines([]);
    } finally {
      setDeadlineLoading(false);
    }
  }, [selectedYear, selectedDeadline, getAuthHeader]);

  // ✅ Fetch pending students with all filters (UPDATED for multi-school)
  const fetchPendingStudents = useCallback(async () => {
    if (!selectedDeadline) return;
    
    try {
      // Use new multi-school endpoint
      const response = await api.get(`/sms/multi-school/deadline/${selectedDeadline.id}/pending/`, {
        headers: getAuthHeader()
      });
      
      console.log('📱 Pending students response:', response.data);
      
      const data = response.data;
      const students = data.students || [];
      
      // Transform to match existing UI format
      const transformedStudents = students.map(s => ({
        student_id: s.student_id,
        student_name: s.name,
        grade: s.grade,
        parent_phone: s.parent_phone,
        parent_email: s.parent_email,
        pending_months: [{
          month_name: data.deadline?.month || selectedDeadline?.month_name,
          amount: s.amount,
          days_overdue: 0
        }],
        total_due: s.amount,
        payment_link: s.payment_link
      }));
      
      setPendingStudents(transformedStudents);
      setPendingStats({
        total_pending: data.total_pending || 0,
        total_pending_months: data.total_pending || 0,
        by_month: {
          [selectedDeadline.id]: {
            month_name: data.deadline?.month,
            count: data.total_pending,
            total_amount: data.total_pending * (data.deadline?.amount || 0)
          }
        }
      });
      
      // Reset selected students when data changes
      setSelectedStudents([]);
      
    } catch (err) {
      console.error('Error fetching pending students:', err);
      setPendingStudents([]);
      setPendingStats(null);
    }
  }, [selectedDeadline, getAuthHeader]);

  // Fetch SMS balance and history (UPDATED for multi-school)
  const fetchData = useCallback(async () => {
    if (!smsConfigured) return;
    
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (selectedYear && selectedYear.id) {
        params.append('academic_year_id', selectedYear.id);
      }
      
      // Use multi-school balance endpoint
      const [balanceRes, historyRes] = await Promise.all([
        api.get('/sms/multi-school/balance/', { headers: getAuthHeader() }),
        api.get(`/sms/history/?limit=50${params.toString() ? '&' + params.toString() : ''}`, { headers: getAuthHeader() })
      ]);
      setBalance(balanceRes.data);
      setHistory(historyRes.data);
    } catch (err) {
      console.error('Error fetching SMS data:', err);
    } finally {
      setLoading(false);
    }
  }, [selectedYear, smsConfigured, getAuthHeader]);

  // ✅ Debounced search
  const searchTimeout = useRef(null);
  
  useEffect(() => {
    if (searchTimeout.current) {
      clearTimeout(searchTimeout.current);
    }
    searchTimeout.current = setTimeout(() => {
      if (selectedDeadline) {
        fetchPendingStudents();
      }
    }, 500);
    
    return () => {
      if (searchTimeout.current) {
        clearTimeout(searchTimeout.current);
      }
    };
  }, [studentSearch, selectedDeadline, fetchPendingStudents]);

  // ✅ Fetch deadlines when year changes
  useEffect(() => {
    fetchDeadlines();
  }, [selectedYear, fetchDeadlines]);

  // ✅ Fetch pending students when deadline changes
  useEffect(() => {
    if (selectedDeadline) {
      fetchPendingStudents();
    }
  }, [selectedDeadline, fetchPendingStudents]);

  // ✅ Fetch data when SMS is configured
  useEffect(() => {
    if (smsConfigured) {
      fetchData();
    }
  }, [smsConfigured, fetchData]);

  // ✅ Initial check
  useEffect(() => {
    checkSMSConfiguration();
  }, [checkSMSConfiguration]);

  // ✅ UPDATED: Send test SMS using multi-school endpoint
  const sendTestSMS = async () => {
    if (!testPhone) {
      alert('Please enter a phone number');
      return;
    }

    const phoneRegex = /^09[0-9]{8}$/;
    if (!phoneRegex.test(testPhone)) {
      alert('Please enter a valid Ethiopian phone number (e.g., 0912345678)');
      return;
    }

    setSending(true);
    setResult(null);

    try {
      const response = await api.post('/sms/multi-school/test/', {
        phone: testPhone,
        message: testMessage || 'Test message from school payment system'
      }, { headers: getAuthHeader() });

      setResult({
        success: response.data.success,
        message: response.data.success ? '✅ Test SMS sent successfully! Check your phone.' : '❌ Failed to send SMS'
      });

      if (response.data.success) {
        setTestPhone('');
        setTestMessage('');
        fetchData();
      }
    } catch (err) {
      console.error('Error sending SMS:', err);
      setResult({
        success: false,
        message: '❌ Error sending SMS. Please check your Africa\'s Talking credentials in School Settings.'
      });
    } finally {
      setSending(false);
    }
  };

  // ✅ UPDATED: Send single reminder with payment link
  const sendSingleReminder = async (student) => {
    if (!selectedDeadline) {
      alert('Please select a deadline first');
      return;
    }
    
    try {
      const response = await api.post('/sms/multi-school/reminder/', {
        student_id: student.student_id,
        deadline_id: selectedDeadline.id
      }, { headers: getAuthHeader() });
      
      if (response.data.success) {
        alert(`✅ Reminder sent to ${student.student_name}\nPayment link: ${response.data.payment_link}`);
        // Refresh pending list
        fetchPendingStudents();
      } else {
        alert(`❌ Failed to send: ${response.data.error || 'Unknown error'}`);
      }
    } catch (err) {
      console.error('Error sending reminder:', err);
      alert('❌ Failed to send reminder. Please try again.');
    }
  };

  // ✅ UPDATED: Send bulk SMS using multi-school endpoint
  const sendBulkSMS = async () => {
    if (selectedStudents.length === 0) {
      alert('Please select at least one student');
      return;
    }
    
    if (!selectedDeadline) {
      alert('Please select a deadline first');
      return;
    }

    setSendingBulk(true);
    setBulkResult(null);

    try {
      const response = await api.post('/sms/multi-school/bulk-reminders/', {
        student_ids: selectedStudents,
        deadline_id: selectedDeadline.id,
        message: bulkMessage
      }, { headers: getAuthHeader() });

      setBulkResult({
        success: true,
        sent: response.data.successful || 0,
        failed: response.data.failed || 0,
        total: response.data.total_processed || selectedStudents.length,
        message: `✅ Successfully sent ${response.data.successful || 0} messages!`
      });

      setSelectedStudents([]);
      setBulkMessage('');
      fetchData();
      fetchPendingStudents();
    } catch (err) {
      console.error('Error sending bulk SMS:', err);
      setBulkResult({
        success: false,
        message: '❌ Failed to send bulk messages. Please check your SMS configuration.'
      });
    } finally {
      setSendingBulk(false);
    }
  };

  const toggleStudent = (studentId) => {
    setSelectedStudents(prev =>
      prev.includes(studentId)
        ? prev.filter(id => id !== studentId)
        : [...prev, studentId]
    );
  };

  const selectAllStudents = () => {
    if (selectedStudents.length === filteredStudents.length) {
      setSelectedStudents([]);
    } else {
      setSelectedStudents(filteredStudents.map(s => s.student_id));
    }
  };

  const filteredStudents = pendingStudents;

  const getStatusColor = (status) => {
    switch(status) {
      case 'sent': return 'bg-green-100 text-green-700';
      case 'delivered': return 'bg-blue-100 text-blue-700';
      case 'failed': return 'bg-red-100 text-red-700';
      default: return 'bg-gray-100 text-gray-700';
    }
  };

  // Show configuration needed screen
  if (!checkingConfig && !smsConfigured) {
    return (
      <div className="max-w-2xl mx-auto mt-12">
        <div className="bg-yellow-50 border-l-4 border-yellow-400 p-6 rounded-lg shadow-lg">
          <div className="flex items-center gap-3 mb-4">
            <AlertTriangle className="h-8 w-8 text-yellow-600" />
            <h2 className="text-xl font-bold text-yellow-800">SMS Not Configured</h2>
          </div>
          <p className="text-yellow-700 mb-4">
            Your school hasn't configured Africa's Talking SMS credentials yet. 
            Please set up your SMS settings to send messages to parents.
          </p>
          <div className="bg-white p-4 rounded-lg mb-4">
            <p className="font-semibold text-gray-800 mb-2">To configure SMS:</p>
            <ol className="list-decimal list-inside text-gray-600 space-y-1">
              <li>Go to <strong>School Settings</strong> page</li>
              <li>Enter your Africa's Talking username and API key</li>
              <li>Set your preferred Sender ID (optional)</li>
              <li>Click "Test Credentials" to verify</li>
              <li>Once successful, return here to send SMS</li>
            </ol>
          </div>
          <button
            onClick={() => window.location.href = '/school-settings'}
            className="bg-yellow-600 hover:bg-yellow-700 text-white px-6 py-2 rounded-lg flex items-center gap-2"
          >
            <Settings className="h-4 w-4" />
            Go to School Settings
          </button>
        </div>
      </div>
    );
  }

  if (loading && !balance) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader className="h-8 w-8 animate-spin text-primary-600" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold text-gray-900">📱 SMS Dashboard</h1>
          {selectedYear && (
            <p className="text-sm text-primary-600 mt-1 font-medium">
              📅 Academic Year: {selectedYear.name || selectedYear.year_ec + ' E.C.'}
            </p>
          )}
          <p className="text-sm text-gray-500 mt-1">
            {pendingStudents.length} students with pending payments
          </p>
        </div>
        <button
          onClick={() => {
            fetchData();
            fetchPendingStudents();
          }}
          className="p-2 bg-white rounded-lg shadow-sm hover:shadow transition-all"
        >
          <RefreshCw className="h-5 w-5 text-gray-600" />
        </button>
      </div>

      {/* Balance Card */}
      <div className="bg-gradient-to-r from-primary-600 to-primary-800 rounded-xl shadow-lg p-6 text-white">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-primary-100">SMS Account Balance</p>
            <p className="text-3xl font-bold mt-2">
              {balance?.success ? (
                balance.balance || 'Available'
              ) : 'N/A'}
            </p>
            <p className="text-primary-200 text-sm mt-2">
              {balance?.success ? 'Using school\'s own Africa\'s Talking account' : 'Configure SMS in School Settings'}
            </p>
          </div>
          <DollarSign className="h-12 w-12 text-white/30" />
        </div>
      </div>

      {/* ✅ NEW: Deadline Selector */}
      <div className="bg-white rounded-xl shadow-lg p-4">
        <label className="block text-sm font-medium text-gray-700 mb-2">
          Select Payment Deadline
        </label>
        <div className="flex flex-wrap gap-2">
          {availableDeadlines.map(deadline => (
            <button
              key={deadline.id}
              onClick={() => setSelectedDeadline(deadline)}
              className={`px-4 py-2 rounded-lg transition-all ${
                selectedDeadline?.id === deadline.id
                  ? 'bg-primary-600 text-white shadow-md'
                  : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
              }`}
            >
              {deadline.month_name || months[deadline.month - 1]} {deadline.academic_year}
              <span className="text-xs ml-1">({deadline.amount} Birr)</span>
            </button>
          ))}
          {availableDeadlines.length === 0 && !deadlineLoading && (
            <p className="text-gray-500 text-sm">No active deadlines found. Please create a deadline first.</p>
          )}
          {deadlineLoading && (
            <Loader className="h-5 w-5 animate-spin text-gray-400" />
          )}
        </div>
      </div>

      {/* Pending Summary Cards */}
      {pendingStats && pendingStats.by_month && Object.keys(pendingStats.by_month).length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {Object.entries(pendingStats.by_month).map(([deadlineId, data]) => (
            <div key={deadlineId} className="bg-white rounded-xl shadow-lg p-4 border-l-4 border-red-500">
              <div className="flex items-center justify-between mb-2">
                <h3 className="font-semibold text-gray-900">{data.month_name}</h3>
                <span className="text-sm bg-red-100 text-red-800 px-2 py-1 rounded-full">
                  {data.count} pending
                </span>
              </div>
              <p className="text-sm text-gray-600">
                Total: {data.total_amount?.toLocaleString() || 0} Birr
              </p>
            </div>
          ))}
        </div>
      )}

      {/* Test SMS Section */}
      <div className="bg-white rounded-xl shadow-lg overflow-hidden">
        <button
          onClick={() => setExpandedSection(expandedSection === 'test' ? null : 'test')}
          className="w-full px-6 py-4 flex items-center justify-between bg-gray-50 hover:bg-gray-100 transition-colors"
        >
          <div className="flex items-center gap-3">
            <MessageSquare className="h-5 w-5 text-primary-600" />
            <h2 className="text-lg font-semibold text-gray-900">Send Test SMS</h2>
          </div>
          {expandedSection === 'test' ? (
            <ChevronUp className="h-5 w-5 text-gray-500" />
          ) : (
            <ChevronDown className="h-5 w-5 text-gray-500" />
          )}
        </button>

        <AnimatePresence>
          {expandedSection === 'test' && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              className="px-6 pb-6"
            >
              <div className="pt-4 space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Phone Number
                  </label>
                  <input
                    type="text"
                    value={testPhone}
                    onChange={(e) => setTestPhone(e.target.value)}
                    placeholder="0912345678"
                    className="input-field"
                  />
                  <p className="text-xs text-gray-500 mt-1">Format: 09XXXXXXXX (10 digits)</p>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Message (Optional)
                  </label>
                  <textarea
                    value={testMessage}
                    onChange={(e) => setTestMessage(e.target.value)}
                    rows="3"
                    className="input-field"
                    placeholder="Enter your test message..."
                  />
                </div>

                <button
                  onClick={sendTestSMS}
                  disabled={sending}
                  className="btn-primary flex items-center gap-2"
                >
                  {sending ? (
                    <>
                      <Loader className="h-4 w-4 animate-spin" />
                      Sending...
                    </>
                  ) : (
                    <>
                      <Send className="h-4 w-4" />
                      Send Test SMS
                    </>
                  )}
                </button>

                <AnimatePresence>
                  {result && (
                    <motion.div
                      initial={{ opacity: 0, y: -10 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0 }}
                      className={`p-4 rounded-lg ${
                        result.success ? 'bg-green-50' : 'bg-red-50'
                      }`}
                    >
                      <div className="flex items-center gap-2">
                        {result.success ? (
                          <CheckCircle className="h-5 w-5 text-green-600" />
                        ) : (
                          <AlertCircle className="h-5 w-5 text-red-600" />
                        )}
                        <p className={result.success ? 'text-green-700' : 'text-red-700'}>
                          {result.message}
                        </p>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Bulk SMS Section */}
      <div className="bg-white rounded-xl shadow-lg overflow-hidden">
        <button
          onClick={() => setExpandedSection(expandedSection === 'bulk' ? null : 'bulk')}
          className="w-full px-6 py-4 flex items-center justify-between bg-gray-50 hover:bg-gray-100 transition-colors"
        >
          <div className="flex items-center gap-3">
            <Users className="h-5 w-5 text-primary-600" />
            <h2 className="text-lg font-semibold text-gray-900">
              Send Bulk SMS ({pendingStudents.length} with pending payments)
            </h2>
          </div>
          {expandedSection === 'bulk' ? (
            <ChevronUp className="h-5 w-5 text-gray-500" />
          ) : (
            <ChevronDown className="h-5 w-5 text-gray-500" />
          )}
        </button>

        <AnimatePresence>
          {expandedSection === 'bulk' && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              className="px-6 pb-6"
            >
              <div className="pt-4 space-y-4">
                {pendingStudents.length === 0 && selectedDeadline && (
                  <div className="bg-green-50 border border-green-200 rounded-lg p-4">
                    <div className="flex items-center gap-2">
                      <CheckCircle className="h-5 w-5 text-green-600" />
                      <p className="text-green-700">
                        No pending payments for {selectedDeadline.month_name} {selectedDeadline.academic_year}!
                      </p>
                    </div>
                  </div>
                )}

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Filter by Grade
                    </label>
                    <select
                      value={filterGrade}
                      onChange={(e) => setFilterGrade(e.target.value)}
                      className="input-field"
                    >
                      <option value="all">All Grades</option>
                      {[1,2,3,4,5,6,7,8].map(g => (
                        <option key={g} value={g}>Grade {g}</option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Search by Student ID or Name
                    </label>
                    <div className="relative">
                      <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
                      <input
                        type="text"
                        value={studentSearch}
                        onChange={(e) => setStudentSearch(e.target.value)}
                        placeholder="Enter student ID or name..."
                        className="input-field pl-10"
                      />
                    </div>
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Custom Message (Optional)
                  </label>
                  <textarea
                    value={bulkMessage}
                    onChange={(e) => setBulkMessage(e.target.value)}
                    rows="3"
                    className="input-field"
                    placeholder="Enter your custom message or leave blank for default reminder with payment link..."
                  />
                  <p className="text-xs text-gray-500 mt-2">
                    Default message includes student name, amount due, and a payment link
                  </p>
                </div>

                {pendingStudents.length > 0 && (
                  <div className="border border-gray-200 rounded-lg overflow-hidden">
                    <div className="bg-gray-50 px-4 py-3 flex items-center justify-between flex-wrap gap-2">
                      <div className="flex items-center gap-4">
                        <button
                          onClick={selectAllStudents}
                          className="text-sm text-primary-600 hover:text-primary-700 font-medium"
                        >
                          {selectedStudents.length === filteredStudents.length && filteredStudents.length > 0 ? 'Deselect All' : 'Select All'}
                        </button>
                        <span className="text-sm text-gray-600">
                          {selectedStudents.length} student(s) selected
                        </span>
                      </div>
                      <span className="text-xs text-gray-500">
                        {filteredStudents.length} student(s) found
                      </span>
                    </div>

                    <div className="max-h-60 overflow-y-auto divide-y divide-gray-200">
                      {filteredStudents.map((student) => (
                        <div key={student.student_id} className="px-4 py-3 hover:bg-gray-50">
                          <div className="flex items-start gap-3">
                            <input
                              type="checkbox"
                              checked={selectedStudents.includes(student.student_id)}
                              onChange={() => toggleStudent(student.student_id)}
                              className="rounded text-primary-600 mt-1"
                            />
                            <div className="flex-1">
                              <div className="flex items-center justify-between flex-wrap gap-2">
                                <p className="font-medium text-gray-900">{student.student_name}</p>
                                <div className="flex gap-2">
                                  {/* ✅ NEW: Preview payment link button */}
                                  <button
                                    onClick={() => setShowPaymentLinks(!showPaymentLinks)}
                                    className="text-xs text-blue-600 hover:text-blue-700 flex items-center gap-1"
                                  >
                                    <Eye className="h-3 w-3" />
                                    Preview Link
                                  </button>
                                  {/* ✅ NEW: Send single reminder button */}
                                  <button
                                    onClick={() => sendSingleReminder(student)}
                                    className="text-xs bg-primary-100 text-primary-700 px-2 py-1 rounded hover:bg-primary-200 flex items-center gap-1"
                                  >
                                    <Send className="h-3 w-3" />
                                    Send Now
                                  </button>
                                </div>
                              </div>
                              <p className="text-sm text-gray-500">
                                ID: {student.student_id} • Grade {student.grade} • {student.parent_phone || 'No phone'}
                              </p>
                              <p className="text-xs text-orange-600 mt-1">
                                {selectedDeadline?.month_name} {selectedDeadline?.academic_year} • {student.total_due?.toLocaleString() || 0} Birr due
                              </p>
                              {showPaymentLinks && student.payment_link && (
                                <div className="mt-2 p-2 bg-gray-100 rounded text-xs break-all">
                                  <LinkIcon className="h-3 w-3 inline mr-1" />
                                  <a href={student.payment_link} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline">
                                    {student.payment_link}
                                  </a>
                                </div>
                              )}
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {pendingStudents.length > 0 && selectedDeadline && (
                  <button
                    onClick={sendBulkSMS}
                    disabled={sendingBulk || selectedStudents.length === 0}
                    className="btn-primary flex items-center gap-2 w-full justify-center"
                  >
                    {sendingBulk ? (
                      <>
                        <Loader className="h-4 w-4 animate-spin" />
                        Sending to {selectedStudents.length} students...
                      </>
                    ) : (
                      <>
                        <Send className="h-4 w-4" />
                        Send Bulk SMS ({selectedStudents.length} selected)
                      </>
                    )}
                  </button>
                )}

                <AnimatePresence>
                  {bulkResult && (
                    <motion.div
                      initial={{ opacity: 0, y: -10 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0 }}
                      className={`p-4 rounded-lg ${
                        bulkResult.success ? 'bg-green-50 border border-green-200' : 'bg-red-50 border border-red-200'
                      }`}
                    >
                      <div className="flex items-center gap-2">
                        {bulkResult.success ? (
                          <CheckCircle className="h-5 w-5 text-green-600" />
                        ) : (
                          <AlertCircle className="h-5 w-5 text-red-600" />
                        )}
                        <div>
                          <p className={bulkResult.success ? 'text-green-700' : 'text-red-700'}>
                            {bulkResult.message}
                          </p>
                          {bulkResult.success && bulkResult.sent > 0 && (
                            <p className="text-sm text-gray-600 mt-1">
                              Sent: {bulkResult.sent} • Failed: {bulkResult.failed}
                            </p>
                          )}
                        </div>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* SMS History */}
      <div className="bg-white rounded-xl shadow-lg overflow-hidden">
        <div className="px-6 py-4 bg-gray-50 border-b border-gray-200 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-gray-900">SMS History</h2>
          <span className="text-sm text-gray-500">Last 50 messages</span>
        </div>
        
        <div className="divide-y divide-gray-200 max-h-96 overflow-y-auto">
          {history.length === 0 ? (
            <p className="p-6 text-gray-500 text-center">No SMS history yet</p>
          ) : (
            history.map((item) => (
              <div key={item.id} className="p-4 hover:bg-gray-50">
                <div className="flex items-start justify-between">
                  <div className="flex items-start gap-3 flex-1">
                    <Phone className="h-5 w-5 text-gray-400 mt-1" />
                    <div className="flex-1">
                      <p className="font-medium">{item.recipient}</p>
                      <p className="text-sm text-gray-600 mt-1">{item.message}</p>
                      <div className="flex items-center gap-3 mt-2">
                        <span className={`px-2 py-1 rounded-full text-xs ${getStatusColor(item.status)}`}>
                          {item.status}
                        </span>
                        {item.related_to && (
                          <span className="text-xs text-gray-400">
                            Ref: {item.related_to}
                          </span>
                        )}
                        <span className="text-xs text-gray-400">
                          {new Date(item.created_at).toLocaleString()}
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}

export default SMSDashboard;