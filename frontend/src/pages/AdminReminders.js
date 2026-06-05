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
  Mail,        // ✅ NEW: Email icon
  Search       // ✅ NEW: Search icon
} from 'lucide-react';
import api from '../services/api';

function AdminReminders() {
  const [pendingData, setPendingData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [selectedMonth, setSelectedMonth] = useState('all');
  const [selectedGrade, setSelectedGrade] = useState('all');
  const [studentSearch, setStudentSearch] = useState('');  // ✅ NEW: Student search state
  const [selectedStudents, setSelectedStudents] = useState([]);
  const [expandedMonth, setExpandedMonth] = useState(null);
  const [sending, setSending] = useState(false);
  const [message, setMessage] = useState('');
  const [result, setResult] = useState(null);
  
  // ✅ Prevent multiple simultaneous requests
  const isFetching = useRef(false);
  const abortController = useRef(null);

  const months = [
    'መስከረም','ጥቅምት','ህዳር','ታህሳስ','ጥር','የካቲት','መጋቢት','ሚያዝያ','ግንቦት','ሰነ','ሃምለ','ነሃሰ','ፓጉመ',
  ];

  // ✅ Use useCallback to prevent recreation of function
  const fetchPendingData = useCallback(async () => {
    // ✅ Prevent multiple simultaneous requests
    if (isFetching.current) return;
    
    // ✅ Cancel previous request
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
      if (studentSearch) params.append('student_search', studentSearch);  // ✅ NEW: Add student search
      
      const response = await api.get(`/reminders/pending/?${params}`, {
        signal: abortController.current.signal
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
  }, [selectedMonth, selectedGrade, studentSearch]); // ✅ Added studentSearch dependency

  // ✅ Cleanup on unmount
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

  // ✅ Debounce search to avoid too many requests
  useEffect(() => {
    const timeoutId = setTimeout(() => {
      if (studentSearch !== undefined) {
        fetchPendingData();
      }
    }, 500);
    
    return () => clearTimeout(timeoutId);
  }, [studentSearch, fetchPendingData]);

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

  // ✅ CHANGED: Send EMAIL reminders instead of SMS
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
        academic_year: pendingData?.academic_year
      });

      setResult({
        success: true,
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
        message: '❌ Failed to send email reminders. Please try again.'
      });
    } finally {
      setSending(false);
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
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold text-gray-900">📧 Email Reminders</h1>
          <p className="text-sm md:text-base text-gray-600 mt-1">
            {pendingData?.total_pending || 0} students with pending payments
            ({pendingData?.total_pending_months || 0} unpaid months)
          </p>
        </div>
      </div>

      {/* Filters */}
      <div className="bg-white rounded-xl shadow-lg p-4 md:p-6">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
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

          {/* ✅ NEW: Student Search */}
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
        <h2 className="text-lg font-semibold text-gray-900 mb-4">✏️ Compose Email Message</h2>
        <textarea
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          rows="3"
          className="input-field"
          placeholder="Enter custom message or leave blank for default reminder..."
        />
        <p className="text-xs text-gray-500 mt-2">
          💡 Default message will include student name, pending months, and total amount due.
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
              onClick={sendEmailReminders}
              disabled={sending || selectedStudents.length === 0}
              className="btn-primary flex items-center gap-2 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700"
            >
              {sending ? (
                <>
                  <Loader className="h-4 w-4 animate-spin" />
                  Sending Emails...
                </>
              ) : (
                <>
                  <Mail className="h-4 w-4" />
                  Send Email Reminders ({selectedStudents.length})
                </>
              )}
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
              <p className={result.success ? 'text-green-700' : 'text-red-700'}>
                {result.message}
              </p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

export default AdminReminders;