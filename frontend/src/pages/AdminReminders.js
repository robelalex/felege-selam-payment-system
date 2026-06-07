// src/pages/AdminReminders.js
import React, { useState, useEffect, useCallback, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  Bell,
  Send,
  CheckCircle,
  AlertCircle,
  Loader,
  Users,
  Calendar,
  Filter,
  ChevronDown,
  ChevronUp,
  Phone,
  DollarSign,
  Clock,
  X,
  Mail,
  Search,
  MessageSquare,
  Link as LinkIcon,
  Eye,
  Smartphone,
  ToggleLeft,
  ToggleRight
} from 'lucide-react';
import api from '../services/api';
import { useAuth } from '../context/AuthContext';
import { useYear } from '../context/YearContext';

function AdminReminders() {
  const [pendingData, setPendingData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [selectedMonth, setSelectedMonth] = useState('all');
  const [selectedGrade, setSelectedGrade] = useState('all');
  const [studentSearch, setStudentSearch] = useState('');
  const [selectedStudents, setSelectedStudents] = useState([]);
  const [expandedMonth, setExpandedMonth] = useState(null);
  const [sending, setSending] = useState(false);
  const [message, setMessage] = useState('');
  const [result, setResult] = useState(null);
  
  // ✅ NEW: Multi-channel options
  const [reminderType, setReminderType] = useState('both'); // 'sms', 'email', 'both'
  const [selectedDeadline, setSelectedDeadline] = useState(null);
  const [availableDeadlines, setAvailableDeadlines] = useState([]);
  const [deadlineLoading, setDeadlineLoading] = useState(false);
  const [showPaymentLinks, setShowPaymentLinks] = useState(false);
  const [smsConfigured, setSmsConfigured] = useState(false);
  const [checkingConfig, setCheckingConfig] = useState(true);
  
  const { getAuthHeader, schoolId } = useAuth();
  const { selectedYear } = useYear();

  const months = [
    'መስከረም','ጥቅምት','ህዳር','ታህሳስ','ጥር','የካቲት','መጋቢት','ሚያዝያ','ግንቦት','ሰኔ','ሐምሌ','ነሐሴ','ጳጉሜ',
  ];

  // Prevent multiple simultaneous requests
  const isFetching = useRef(false);
  const abortController = useRef(null);

  // ✅ NEW: Check if SMS is configured for this school
  const checkSMSConfiguration = useCallback(async () => {
    setCheckingConfig(true);
    try {
      const response = await api.get('/schools/sms-config/', {
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
      
      const activeDeadlines = (response.data.results || response.data || []).filter(d => d.is_active === true);
      setAvailableDeadlines(activeDeadlines);
      
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

  // Fetch pending data (UPDATED to include deadline)
  const fetchPendingData = useCallback(async () => {
    if (isFetching.current) return;
    
    if (abortController.current) {
      abortController.current.abort();
    }
    
    abortController.current = new AbortController();
    isFetching.current = true;
    setLoading(true);
    
    try {
      const params = new URLSearchParams();
      if (selectedMonth !== 'all') params.append('month', selectedMonth);
      if (selectedGrade !== 'all') params.append('grade', selectedGrade);
      if (studentSearch) params.append('student_search', studentSearch);
      if (selectedYear && selectedYear.id) params.append('academic_year_id', selectedYear.id);
      
      const response = await api.get(`/reminders/pending/?${params}`, {
        signal: abortController.current.signal,
        headers: getAuthHeader()
      });
      setPendingData(response.data);
    } catch (err) {
      if (err.name === 'AbortError') {
        console.log('Fetch aborted');
      } else {
        console.error('Error fetching pending data:', err);
      }
    } finally {
      isFetching.current = false;
      setLoading(false);
    }
  }, [selectedMonth, selectedGrade, studentSearch, selectedYear, getAuthHeader]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (abortController.current) {
        abortController.current.abort();
      }
    };
  }, []);

  useEffect(() => {
    fetchPendingData();
  }, [fetchPendingData]);

  // Debounce search
  useEffect(() => {
    const timeoutId = setTimeout(() => {
      if (studentSearch !== undefined) {
        fetchPendingData();
      }
    }, 500);
    
    return () => clearTimeout(timeoutId);
  }, [studentSearch, fetchPendingData]);

  // Fetch deadlines and check SMS config
  useEffect(() => {
    checkSMSConfiguration();
    fetchDeadlines();
  }, [checkSMSConfiguration, fetchDeadlines]);

  const toggleStudent = (studentId) => {
    setSelectedStudents(prev =>
      prev.includes(studentId)
        ? prev.filter(id => id !== studentId)
        : [...prev, studentId]
    );
  };

  const selectAll = () => {
    if (!pendingData?.students) return;
    
    if (selectedStudents.length === pendingData.students.length) {
      setSelectedStudents([]);
    } else {
      setSelectedStudents(pendingData.students.map(s => s.student_id));
    }
  };

  // ✅ UPDATED: Send SMS reminders with payment links
  const sendSMSReminders = async () => {
    if (selectedStudents.length === 0) {
      alert('Please select at least one student');
      return;
    }
    
    if (!selectedDeadline) {
      alert('Please select a payment deadline');
      return;
    }

    if (!smsConfigured) {
      alert('SMS is not configured for your school. Please go to School Settings to set up Africa\'s Talking credentials.');
      return;
    }

    setSending(true);
    setResult(null);

    try {
      const response = await api.post('/sms/multi-school/bulk-reminders/', {
        student_ids: selectedStudents,
        deadline_id: selectedDeadline.id,
        message: message
      }, { headers: getAuthHeader() });

      setResult({
        success: true,
        type: 'sms',
        sent: response.data.successful || 0,
        failed: response.data.failed || 0,
        message: `✅ Successfully sent ${response.data.successful || 0} SMS reminders! ${response.data.failed > 0 ? `(${response.data.failed} failed)` : ''}`
      });
      
      setSelectedStudents([]);
      setMessage('');
      fetchPendingData();
    } catch (err) {
      console.error('Error sending SMS reminders:', err);
      setResult({
        success: false,
        type: 'sms',
        message: err.response?.data?.error || '❌ Failed to send SMS reminders. Please check your SMS configuration.'
      });
    } finally {
      setSending(false);
    }
  };

  // ✅ UPDATED: Send Email reminders with payment links
  const sendEmailReminders = async () => {
    if (selectedStudents.length === 0) {
      alert('Please select at least one student');
      return;
    }

    setSending(true);
    setResult(null);

    try {
      const response = await api.post('/reminders/send_email_reminders/', {
        student_ids: selectedStudents,
        month: selectedMonth !== 'all' ? selectedMonth : null,
        message: message,
        academic_year: pendingData?.academic_year,
        deadline_id: selectedDeadline?.id
      }, { headers: getAuthHeader() });

      setResult({
        success: true,
        type: 'email',
        sent: response.data.sent,
        failed: response.data.failed,
        message: `✅ Successfully sent ${response.data.sent} email reminders! ${response.data.failed > 0 ? `(${response.data.failed} failed)` : ''}`
      });
      
      setSelectedStudents([]);
      setMessage('');
      fetchPendingData();
    } catch (err) {
      console.error('Error sending email reminders:', err);
      setResult({
        success: false,
        type: 'email',
        message: '❌ Failed to send email reminders. Please try again.'
      });
    } finally {
      setSending(false);
    }
  };

  // ✅ NEW: Send both SMS and Email
  const sendBothReminders = async () => {
    if (selectedStudents.length === 0) {
      alert('Please select at least one student');
      return;
    }
    
    if (!selectedDeadline) {
      alert('Please select a payment deadline');
      return;
    }

    setSending(true);
    setResult(null);

    let smsResult = null;
    let emailResult = null;

    try {
      // Send SMS first
      if (smsConfigured) {
        try {
          smsResult = await api.post('/sms/multi-school/bulk-reminders/', {
            student_ids: selectedStudents,
            deadline_id: selectedDeadline.id,
            message: message
          }, { headers: getAuthHeader() });
        } catch (err) {
          console.error('SMS failed:', err);
          smsResult = { data: { successful: 0, failed: selectedStudents.length } };
        }
      }

      // Send Email
      try {
        emailResult = await api.post('/reminders/send_email_reminders/', {
          student_ids: selectedStudents,
          month: selectedMonth !== 'all' ? selectedMonth : null,
          message: message,
          academic_year: pendingData?.academic_year,
          deadline_id: selectedDeadline?.id
        }, { headers: getAuthHeader() });
      } catch (err) {
        console.error('Email failed:', err);
        emailResult = { data: { sent: 0, failed: selectedStudents.length } };
      }

      const smsSent = smsResult?.data?.successful || 0;
      const emailSent = emailResult?.data?.sent || 0;

      setResult({
        success: true,
        type: 'both',
        smsSent: smsSent,
        emailSent: emailSent,
        message: `✅ SMS: ${smsSent} sent | Email: ${emailSent} sent`
      });
      
      setSelectedStudents([]);
      setMessage('');
      fetchPendingData();
    } catch (err) {
      console.error('Error sending reminders:', err);
      setResult({
        success: false,
        type: 'both',
        message: '❌ Failed to send reminders. Please try again.'
      });
    } finally {
      setSending(false);
    }
  };

  const handleSendReminders = () => {
    if (reminderType === 'sms') {
      sendSMSReminders();
    } else if (reminderType === 'email') {
      sendEmailReminders();
    } else {
      sendBothReminders();
    }
  };

  const getSendButtonText = () => {
    if (sending) return 'Sending...';
    if (reminderType === 'sms') return `Send SMS Reminders (${selectedStudents.length})`;
    if (reminderType === 'email') return `Send Email Reminders (${selectedStudents.length})`;
    return `Send Both (SMS + Email) (${selectedStudents.length})`;
  };

  const getSendButtonIcon = () => {
    if (sending) return <Loader className="h-4 w-4 animate-spin" />;
    if (reminderType === 'sms') return <Smartphone className="h-4 w-4" />;
    if (reminderType === 'email') return <Mail className="h-4 w-4" />;
    return <Send className="h-4 w-4" />;
  };

  const getSendButtonColor = () => {
    if (reminderType === 'sms') return 'bg-green-600 hover:bg-green-700';
    if (reminderType === 'email') return 'bg-blue-600 hover:bg-blue-700';
    return 'bg-purple-600 hover:bg-purple-700';
  };

  if (loading && !pendingData) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader className="h-8 w-8 animate-spin text-primary-600" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold text-gray-900">📧 Email & SMS Reminders</h1>
          {selectedYear && (
            <p className="text-sm text-primary-600 mt-1 font-medium">
              📅 Academic Year: {selectedYear.name || selectedYear.year_ec + ' E.C.'}
            </p>
          )}
          <p className="text-sm md:text-base text-gray-600 mt-1">
            {pendingData?.total_pending || 0} students with pending payments
            ({pendingData?.total_pending_months || 0} unpaid months)
          </p>
        </div>
      </div>

      {/* ✅ NEW: SMS Configuration Warning */}
      {reminderType !== 'email' && !smsConfigured && !checkingConfig && (
        <div className="bg-yellow-50 border-l-4 border-yellow-400 p-4 rounded-lg">
          <div className="flex items-center gap-2">
            <AlertCircle className="h-5 w-5 text-yellow-600" />
            <p className="text-yellow-700">
              SMS is not configured for your school. 
              <a href="/school-settings" className="ml-2 text-yellow-800 font-semibold underline">Go to School Settings</a> to set up Africa's Talking credentials.
            </p>
          </div>
        </div>
      )}

      {/* ✅ NEW: Deadline Selector for SMS */}
      {(reminderType === 'sms' || reminderType === 'both') && smsConfigured && (
        <div className="bg-white rounded-xl shadow-lg p-4">
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Select Payment Deadline for SMS
          </label>
          <div className="flex flex-wrap gap-2">
            {availableDeadlines.map(deadline => (
              <button
                key={deadline.id}
                onClick={() => setSelectedDeadline(deadline)}
                className={`px-4 py-2 rounded-lg transition-all ${
                  selectedDeadline?.id === deadline.id
                    ? 'bg-green-600 text-white shadow-md'
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
          </div>
        </div>
      )}

      {/* Filters */}
      <div className="bg-white rounded-xl shadow-lg p-4 md:p-6">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Filter by Month
            </label>
            <select
              value={selectedMonth}
              onChange={(e) => setSelectedMonth(e.target.value)}
              className="input-field"
            >
              <option value="all">All Months</option>
              {months.map((month, index) => (
                <option key={index} value={index + 1}>{month}</option>
              ))}
            </select>
          </div>
          
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Filter by Grade
            </label>
            <select
              value={selectedGrade}
              onChange={(e) => setSelectedGrade(e.target.value)}
              className="input-field"
            >
              <option value="all">All Grades</option>
              {[1,2,3,4,5,6,7,8].map(grade => (
                <option key={grade} value={grade}>Grade {grade}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Search by Student
            </label>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
              <input
                type="text"
                value={studentSearch}
                onChange={(e) => setStudentSearch(e.target.value)}
                placeholder="Student ID or name..."
                className="input-field pl-10"
              />
            </div>
          </div>

          {/* ✅ NEW: Reminder Type Selector */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Reminder Type
            </label>
            <div className="flex gap-2">
              <button
                onClick={() => setReminderType('email')}
                className={`flex-1 px-3 py-2 rounded-lg flex items-center justify-center gap-2 transition-all ${
                  reminderType === 'email'
                    ? 'bg-blue-600 text-white'
                    : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                }`}
              >
                <Mail className="h-4 w-4" />
                Email
              </button>
              <button
                onClick={() => setReminderType('sms')}
                disabled={!smsConfigured}
                className={`flex-1 px-3 py-2 rounded-lg flex items-center justify-center gap-2 transition-all ${
                  reminderType === 'sms'
                    ? 'bg-green-600 text-white'
                    : smsConfigured
                      ? 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                      : 'bg-gray-100 text-gray-400 cursor-not-allowed'
                }`}
              >
                <Smartphone className="h-4 w-4" />
                SMS
              </button>
              <button
                onClick={() => setReminderType('both')}
                disabled={!smsConfigured}
                className={`flex-1 px-3 py-2 rounded-lg flex items-center justify-center gap-2 transition-all ${
                  reminderType === 'both'
                    ? 'bg-purple-600 text-white'
                    : smsConfigured
                      ? 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                      : 'bg-gray-100 text-gray-400 cursor-not-allowed'
                }`}
              >
                <Send className="h-4 w-4" />
                Both
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Summary Cards */}
      {pendingData?.by_month && Object.keys(pendingData.by_month).length > 0 && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {Object.entries(pendingData.by_month).slice(0, 4).map(([month, data]) => (
            <div key={month} className="bg-white rounded-xl shadow-lg p-4 border-l-4 border-yellow-500">
              <div className="flex items-center justify-between mb-2">
                <h3 className="font-semibold text-gray-900">{data.month_name}</h3>
                <span className="text-sm bg-yellow-100 text-yellow-800 px-2 py-1 rounded-full">
                  {data.count} pending
                </span>
              </div>
              <p className="text-sm text-gray-600">
                Total: {data.total_amount.toLocaleString()} Birr
              </p>
            </div>
          ))}
        </div>
      )}

      {/* Message Composition */}
      <div className="bg-white rounded-xl shadow-lg p-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">
          ✏️ Compose {reminderType === 'sms' ? 'SMS' : reminderType === 'email' ? 'Email' : 'SMS & Email'} Message
        </h2>
        <textarea
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          rows="3"
          className="input-field"
          placeholder={`Enter custom message or leave blank for default ${reminderType === 'sms' ? 'SMS' : 'email'} reminder with payment link...`}
        />
        <p className="text-xs text-gray-500 mt-2">
          💡 Default message will include student name, payment amount, and a secure payment link.
          {reminderType === 'sms' && ' SMS will be sent using your school\'s Africa\'s Talking account.'}
          {reminderType === 'email' && ' Email will include school branding and bank details.'}
        </p>
      </div>

      {/* Student Selection */}
      <div className="bg-white rounded-xl shadow-lg overflow-hidden">
        <div className="p-4 bg-gray-50 border-b border-gray-200">
          <div className="flex items-center justify-between flex-wrap gap-4">
            <div className="flex items-center gap-4">
              <button
                onClick={selectAll}
                className="text-sm text-primary-600 hover:text-primary-700 font-medium"
              >
                {selectedStudents.length === pendingData?.students?.length && pendingData?.students?.length > 0
                  ? 'Deselect All' 
                  : 'Select All'}
              </button>
              <span className="text-sm text-gray-600">
                {selectedStudents.length} student(s) selected
              </span>
            </div>
            
            <button
              onClick={handleSendReminders}
              disabled={sending || selectedStudents.length === 0 || (reminderType !== 'email' && !smsConfigured)}
              className={`btn-primary flex items-center gap-2 ${getSendButtonColor()}`}
            >
              {getSendButtonIcon()}
              {getSendButtonText()}
            </button>
          </div>
        </div>

        {/* Students List */}
        <div className="divide-y divide-gray-200 max-h-96 overflow-y-auto">
          {pendingData?.students?.length === 0 ? (
            <div className="p-8 text-center text-gray-500">
              <CheckCircle className="h-12 w-12 text-green-500 mx-auto mb-3" />
              <p>No students with pending payments found!</p>
              <p className="text-sm mt-1">Try changing your filters or search term.</p>
            </div>
          ) : (
            pendingData?.students?.map((student) => (
              <div key={student.student_id} className="p-4 hover:bg-gray-50 transition-colors">
                <div className="flex items-start gap-3">
                  <input
                    type="checkbox"
                    checked={selectedStudents.includes(student.student_id)}
                    onChange={() => toggleStudent(student.student_id)}
                    className="mt-1 rounded text-primary-600"
                  />
                  
                  <div className="flex-1">
                    <div className="flex items-center justify-between flex-wrap gap-2">
                      <div>
                        <h3 className="font-semibold text-gray-900">
                          {student.student_name}
                        </h3>
                        <p className="text-sm text-gray-600">
                          Grade {student.grade} {student.section} • ID: {student.student_id}
                        </p>
                      </div>
                      <div className="text-right">
                        <p className="text-sm font-medium text-red-600">
                          {student.pending_months.length} month(s) unpaid
                        </p>
                        <p className="text-sm font-bold text-gray-900">
                          {student.total_due.toLocaleString()} Birr
                        </p>
                      </div>
                    </div>
                    
                    {/* Pending Months */}
                    <div className="mt-2 flex flex-wrap gap-2">
                      {student.pending_months.map((month, idx) => (
                        <span
                          key={idx}
                          className="inline-flex items-center gap-1 px-2 py-1 bg-yellow-100 text-yellow-800 rounded text-xs"
                        >
                          <Calendar className="h-3 w-3" />
                          {month.month_name}
                          {month.days_overdue > 0 && (
                            <span className="text-red-600 ml-1">
                              ({month.days_overdue} days overdue)
                            </span>
                          )}
                        </span>
                      ))}
                    </div>
                    
                    {/* Parent Contact */}
                    <div className="mt-2 flex items-center gap-4 text-sm text-gray-600 flex-wrap">
                      <span className="flex items-center gap-1">
                        <Phone className="h-4 w-4" />
                        {student.parent_phone || 'No phone'}
                      </span>
                      <span className="flex items-center gap-1">
                        <Users className="h-4 w-4" />
                        {student.parent_name || 'No parent name'}
                      </span>
                      <span className="flex items-center gap-1">
                        <Mail className="h-4 w-4" />
                        {student.parent_email || 'No email'}
                      </span>
                    </div>

                    {/* ✅ NEW: Payment Link Preview */}
                    {selectedDeadline && (
                      <div className="mt-2">
                        <button
                          onClick={() => setShowPaymentLinks(!showPaymentLinks)}
                          className="text-xs text-blue-600 hover:text-blue-700 flex items-center gap-1"
                        >
                          <Eye className="h-3 w-3" />
                          {showPaymentLinks ? 'Hide' : 'Show'} Payment Link Preview
                        </button>
                        {showPaymentLinks && (
                          <div className="mt-2 p-2 bg-gray-100 rounded text-xs break-all">
                            <LinkIcon className="h-3 w-3 inline mr-1" />
                            <span className="text-gray-600">
                              {`${window.location.origin}/parent-pay?student=${student.student_id}&deadline=${selectedDeadline.id}&amount=${student.total_due}`}
                            </span>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      {/* Result Message */}
      <AnimatePresence>
        {result && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            className={`p-4 rounded-lg ${
              result.success ? 'bg-green-50 border border-green-200' : 'bg-red-50 border border-red-200'
            }`}
          >
            <div className="flex items-center gap-2">
              {result.success ? (
                <CheckCircle className="h-5 w-5 text-green-600" />
              ) : (
                <AlertCircle className="h-5 w-5 text-red-600" />
              )}
              <div>
                <p className={result.success ? 'text-green-700' : 'text-red-700'}>
                  {result.message}
                </p>
                {result.type === 'both' && result.success && (
                  <p className="text-sm text-gray-600 mt-1">
                    SMS: {result.smsSent} sent | Email: {result.emailSent} sent
                  </p>
                )}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

export default AdminReminders;