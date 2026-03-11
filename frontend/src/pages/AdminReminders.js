// src/pages/AdminReminders.js
import React, { useState, useEffect } from 'react';
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
  X
} from 'lucide-react';
import axios from 'axios';

function AdminReminders() {
  const [pendingData, setPendingData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [selectedMonth, setSelectedMonth] = useState('all');
  const [selectedGrade, setSelectedGrade] = useState('all');
  const [selectedStudents, setSelectedStudents] = useState([]);
  const [expandedMonth, setExpandedMonth] = useState(null);
  const [sending, setSending] = useState(false);
  const [message, setMessage] = useState('');
  const [result, setResult] = useState(null);

  const months = [
    'Meskerem', 'Tikimt', 'Hidar', 'Tahsas', 'Tir', 'Yekatit',
    'Megabit', 'Miazia', 'Ginbot', 'Sene', 'Hamle', 'Nehase', 'Pagume'
  ];

  useEffect(() => {
    fetchPendingData();
  }, [selectedMonth, selectedGrade]);

  const fetchPendingData = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (selectedMonth !== 'all') params.append('month', selectedMonth);
      if (selectedGrade !== 'all') params.append('grade', selectedGrade);
      
      const response = await axios.get(`http://127.0.0.1:8000/api/reminders/pending/?${params}`);
      setPendingData(response.data);
    } catch (err) {
      console.error('Error fetching pending data:', err);
    } finally {
      setLoading(false);
    }
  };

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

  const sendReminders = async () => {
    if (selectedStudents.length === 0) {
      alert('Please select at least one student');
      return;
    }

    setSending(true);
    setResult(null);

    try {
      const response = await axios.post('http://127.0.0.1:8000/api/reminders/send/', {
        student_ids: selectedStudents,
        month: selectedMonth !== 'all' ? selectedMonth : null,
        message: message
      });

      setResult({
        success: true,
        sent: response.data.sent,
        failed: response.data.failed,
        message: `Successfully sent ${response.data.sent} reminders!`
      });
      
      // Clear selection after sending
      setSelectedStudents([]);
      setMessage('');
      
      // Refresh data
      fetchPendingData();
    } catch (err) {
      setResult({
        success: false,
        message: 'Failed to send reminders. Please try again.'
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
          <h1 className="text-2xl md:text-3xl font-bold text-gray-900">SMS Reminders</h1>
          <p className="text-sm md:text-base text-gray-600 mt-1">
            {pendingData?.total_pending || 0} students with pending payments
            ({pendingData?.total_pending_months || 0} unpaid months)
          </p>
        </div>
      </div>

      {/* Filters */}
      <div className="bg-white rounded-xl shadow-lg p-4 md:p-6">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
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
        </div>
      </div>

      {/* Summary Cards */}
      {pendingData?.by_month && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {Object.entries(pendingData.by_month).map(([month, data]) => (
            <div key={month} className="bg-white rounded-xl shadow-lg p-4">
              <div className="flex items-center justify-between mb-2">
                <h3 className="font-semibold text-gray-900">{data.month_name}</h3>
                <span className="text-sm bg-yellow-100 text-yellow-800 px-2 py-1 rounded-full">
                  {data.count} pending
                </span>
              </div>
              <p className="text-sm text-gray-600">
                Total: {data.total_amount} Birr
              </p>
            </div>
          ))}
        </div>
      )}

      {/* Message Composition */}
      <div className="bg-white rounded-xl shadow-lg p-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">Compose Message</h2>
        <textarea
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          rows="3"
          className="input-field"
          placeholder="Enter custom message or leave blank for default reminder..."
        />
        <p className="text-xs text-gray-500 mt-2">
          Default message will include student name, pending months, and total amount due.
        </p>
      </div>

      {/* Student Selection */}
      <div className="bg-white rounded-xl shadow-lg overflow-hidden">
        <div className="p-4 bg-gray-50 border-b border-gray-200">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <button
                onClick={selectAll}
                className="text-sm text-primary-600 hover:text-primary-700 font-medium"
              >
                {selectedStudents.length === pendingData?.students?.length 
                  ? 'Deselect All' 
                  : 'Select All'}
              </button>
              <span className="text-sm text-gray-600">
                {selectedStudents.length} students selected
              </span>
            </div>
            
            <button
              onClick={sendReminders}
              disabled={sending || selectedStudents.length === 0}
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
                  Send Reminders ({selectedStudents.length})
                </>
              )}
            </button>
          </div>
        </div>

        {/* Students List */}
        <div className="divide-y divide-gray-200 max-h-96 overflow-y-auto">
          {pendingData?.students?.map((student) => (
            <div key={student.student_id} className="p-4 hover:bg-gray-50 transition-colors">
              <div className="flex items-start gap-3">
                <input
                  type="checkbox"
                  checked={selectedStudents.includes(student.student_id)}
                  onChange={() => toggleStudent(student.student_id)}
                  className="mt-1 rounded text-primary-600"
                />
                
                <div className="flex-1">
                  <div className="flex items-center justify-between">
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
                        {student.pending_months.length} months unpaid
                      </p>
                      <p className="text-sm font-bold text-gray-900">
                        {student.total_due} Birr
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
                      </span>
                    ))}
                  </div>
                  
                  {/* Parent Contact */}
                  <div className="mt-2 flex items-center gap-4 text-sm text-gray-600">
                    <span className="flex items-center gap-1">
                      <Phone className="h-4 w-4" />
                      {student.parent_phone}
                    </span>
                    <span className="flex items-center gap-1">
                      <Users className="h-4 w-4" />
                      {student.parent_name}
                    </span>
                  </div>
                </div>
              </div>
            </div>
          ))}
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
  );
}

export default AdminReminders;