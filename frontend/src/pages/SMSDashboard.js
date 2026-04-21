// src/pages/SMSDashboard.js
import React, { useState, useEffect } from 'react';
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
  Calendar
} from 'lucide-react';
import api from '../services/api';
import { useYear } from '../context/YearContext';

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
  const [expandedSection, setExpandedSection] = useState('test');
  const [pendingStats, setPendingStats] = useState(null);

  const months = [
    'Meskerem', 'Tikimt', 'Hidar', 'Tahsas', 'Tir', 'Yekatit',
    'Megabit', 'Miazia', 'Ginbot', 'Sene', 'Hamle', 'Nehase', 'Pagume'
  ];

  const { selectedYear } = useYear();

  useEffect(() => {
    fetchData();
    fetchPendingStudents();
  }, [selectedYear]);

  const fetchData = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (selectedYear && selectedYear.id) {
        params.append('academic_year_id', selectedYear.id);
      }
      
      const queryString = params.toString();
      
      const [balanceRes, historyRes] = await Promise.all([
        api.get('/sms/balance/'),
        api.get(`/sms/history/?limit=50${queryString ? '&' + queryString : ''}`)
      ]);
      setBalance(balanceRes.data);
      setHistory(historyRes.data);
    } catch (err) {
      console.error('Error fetching SMS data:', err);
    } finally {
      setLoading(false);
    }
  };

  const fetchPendingStudents = async () => {
    try {
      const params = new URLSearchParams();
      if (selectedYear && selectedYear.id) {
        params.append('academic_year_id', selectedYear.id);
      }
      
      const queryString = params.toString();
      // ✅ USE THE NEW STANDALONE ENDPOINT
      const url = queryString ? `/reminders-filtered/?${queryString}` : '/reminders-filtered/';
      
      console.log('📱 Fetching pending students URL:', url);
      
      const response = await api.get(url);
      console.log('📱 API Response:', response.data);
      
      const data = response.data;
      const students = data.students || [];
      
      setPendingStudents(students);
      setPendingStats({
        total_pending: data.total_pending || 0,
        total_pending_months: data.total_pending_months || 0,
        by_month: data.by_month || {}
      });
      
      // Reset selected students when data changes
      setSelectedStudents([]);
      
    } catch (err) {
      console.error('Error fetching pending students:', err);
      setPendingStudents([]);
      setPendingStats(null);
    }
  };

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
      const response = await api.post('/sms/send-test/', {
        phone: testPhone,
        message: testMessage || 'Test message from Felege Selam School'
      });

      setResult({
        success: response.data.success,
        message: response.data.success ? 'SMS sent successfully! Check your phone.' : 'Failed to send SMS'
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
        message: 'Error sending SMS. Check your configuration.'
      });
    } finally {
      setSending(false);
    }
  };

  const sendBulkSMS = async () => {
    if (selectedStudents.length === 0) {
      alert('Please select at least one student');
      return;
    }

    setSendingBulk(true);
    setBulkResult(null);

    try {
      const requestData = {
        student_ids: selectedStudents,
        month: filterMonth !== 'all' ? filterMonth : null,
        message: bulkMessage
      };
      
      if (selectedYear && selectedYear.id) {
        requestData.academic_year_id = selectedYear.id;
        requestData.academic_year = selectedYear.year_ec;
      }
      
      const response = await api.post('/sms/send-bulk/', requestData);

      setBulkResult({
        success: true,
        sent: response.data.successful || response.data.sent || 0,
        failed: response.data.failed || 0,
        total: response.data.total_processed || selectedStudents.length,
        message: `Successfully sent ${response.data.successful || response.data.sent || 0} messages!`
      });

      setSelectedStudents([]);
      setBulkMessage('');
      fetchData();
      fetchPendingStudents();
    } catch (err) {
      console.error('Error sending bulk SMS:', err);
      setBulkResult({
        success: false,
        message: 'Failed to send bulk messages. Please try again.'
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

  const filteredStudents = pendingStudents.filter(student => {
    const matchesGrade = filterGrade === 'all' || student.grade === parseInt(filterGrade);
    return matchesGrade;
  });

  const getStatusColor = (status) => {
    switch(status) {
      case 'sent': return 'bg-green-100 text-green-700';
      case 'delivered': return 'bg-blue-100 text-blue-700';
      case 'failed': return 'bg-red-100 text-red-700';
      default: return 'bg-gray-100 text-gray-700';
    }
  };

  if (loading) {
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
          <h1 className="text-2xl md:text-3xl font-bold text-gray-900">SMS Dashboard</h1>
          {selectedYear && (
            <p className="text-sm text-primary-600 mt-1 font-medium">
              📅 Academic Year: {selectedYear.name || selectedYear.year_ec + ' E.C.'}
            </p>
          )}
          <p className="text-sm text-gray-500 mt-1">
            {pendingStudents.length} students with overdue payments
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
              {balance?.success ? balance.balance : 'N/A'}
            </p>
            <p className="text-primary-200 text-sm mt-2">
              {balance?.success ? 'Live account - messages will be sent' : 'Configure SMS provider'}
            </p>
          </div>
          <DollarSign className="h-12 w-12 text-white/30" />
        </div>
      </div>

      {/* Overdue Summary Cards */}
      {pendingStats && pendingStats.by_month && Object.keys(pendingStats.by_month).length > 0 && (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
          {Object.entries(pendingStats.by_month).map(([month, data]) => (
            <div key={month} className="bg-white rounded-xl shadow-lg p-4 border-l-4 border-red-500">
              <div className="flex items-center justify-between mb-2">
                <h3 className="font-semibold text-gray-900">{data.month_name}</h3>
                <span className="text-sm bg-red-100 text-red-800 px-2 py-1 rounded-full">
                  {data.count} overdue
                </span>
              </div>
              <p className="text-sm text-gray-600">
                Total: {data.total_amount.toLocaleString()} Birr
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
              Send Bulk SMS ({pendingStudents.length} with overdue payments)
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
                {pendingStudents.length === 0 && (
                  <div className="bg-green-50 border border-green-200 rounded-lg p-4">
                    <div className="flex items-center gap-2">
                      <CheckCircle className="h-5 w-5 text-green-600" />
                      <p className="text-green-700">
                        No overdue payments for {selectedYear?.name || 'selected academic year'}!
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
                      Filter by Month
                    </label>
                    <select
                      value={filterMonth}
                      onChange={(e) => setFilterMonth(e.target.value)}
                      className="input-field"
                    >
                      <option value="all">All Months</option>
                      {months.map((month, index) => (
                        <option key={index} value={index + 1}>{month}</option>
                      ))}
                    </select>
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Message (Optional)
                  </label>
                  <textarea
                    value={bulkMessage}
                    onChange={(e) => setBulkMessage(e.target.value)}
                    rows="3"
                    className="input-field"
                    placeholder="Enter your message or leave blank for default reminder..."
                  />
                  <p className="text-xs text-gray-500 mt-2">
                    Default message will include student name and overdue months
                  </p>
                </div>

                {pendingStudents.length > 0 && (
                  <div className="border border-gray-200 rounded-lg overflow-hidden">
                    <div className="bg-gray-50 px-4 py-3 flex items-center justify-between">
                      <div className="flex items-center gap-4">
                        <button
                          onClick={selectAllStudents}
                          className="text-sm text-primary-600 hover:text-primary-700 font-medium"
                        >
                          {selectedStudents.length === filteredStudents.length ? 'Deselect All' : 'Select All'}
                        </button>
                        <span className="text-sm text-gray-600">
                          {selectedStudents.length} students selected
                        </span>
                      </div>
                    </div>

                    <div className="max-h-60 overflow-y-auto divide-y divide-gray-200">
                      {filteredStudents.map((student) => (
                        <div key={student.student_id} className="px-4 py-3 hover:bg-gray-50 flex items-center gap-3">
                          <input
                            type="checkbox"
                            checked={selectedStudents.includes(student.student_id)}
                            onChange={() => toggleStudent(student.student_id)}
                            className="rounded text-primary-600"
                          />
                          <div className="flex-1">
                            <p className="font-medium text-gray-900">{student.student_name}</p>
                            <p className="text-sm text-gray-500">
                              Grade {student.grade} • {student.parent_phone}
                            </p>
                            <div className="mt-1 flex flex-wrap gap-1">
                              {student.pending_months?.slice(0, 3).map((month, idx) => (
                                <span key={idx} className="text-xs bg-red-100 text-red-700 px-2 py-0.5 rounded-full">
                                  {month.month_name} ({month.days_overdue} days)
                                </span>
                              ))}
                              {student.pending_months?.length > 3 && (
                                <span className="text-xs text-gray-500">
                                  +{student.pending_months.length - 3} more
                                </span>
                              )}
                            </div>
                            <p className="text-xs text-orange-600 mt-1">
                              {student.pending_months?.length || 0} months overdue • {student.total_due.toLocaleString()} Birr due
                            </p>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {pendingStudents.length > 0 && (
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
                        bulkResult.success ? 'bg-green-50' : 'bg-red-50'
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
                          {bulkResult.success && (
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