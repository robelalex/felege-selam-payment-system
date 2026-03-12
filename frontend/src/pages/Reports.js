// src/pages/Reports.js
import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  Download,
  Calendar,
  TrendingUp,
  Users,
  CreditCard,
  Clock,
  CheckCircle,
  AlertCircle,
  BarChart3,
  PieChart,
  FileText,
  Search,
  ChevronDown,
  ChevronUp,
  Printer
} from 'lucide-react';
import axios from 'axios';

// Add this function to get the auth token
const getAuthToken = () => {
  // For development, we'll use a simple token
  // In production, you'd use proper JWT tokens
  return localStorage.getItem('authToken') || '';
};

function Reports() {
  const [reportType, setReportType] = useState('monthly');
  const [selectedYear, setSelectedYear] = useState('2018 E.C.');
  const [selectedMonth, setSelectedMonth] = useState('7');
  const [selectedStudent, setSelectedStudent] = useState('');
  const [reportData, setReportData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [expandedGrade, setExpandedGrade] = useState(null);

  const months = [
    { value: '1', name: 'Meskerem' },
    { value: '2', name: 'Tikimt' },
    { value: '3', name: 'Hidar' },
    { value: '4', name: 'Tahsas' },
    { value: '5', name: 'Tir' },
    { value: '6', name: 'Yekatit' },
    { value: '7', name: 'Megabit' },
    { value: '8', name: 'Miazia' },
    { value: '9', name: 'Ginbot' },
    { value: '10', name: 'Sene' },
    { value: '11', name: 'Hamle' },
    { value: '12', name: 'Nehase' },
    { value: '13', name: 'Pagume' }
  ];

  const years = [
    '2018 E.C.',
    '2017 E.C.',
    '2016 E.C.'
  ];

const fetchReport = async () => {
  setLoading(true);
  setError('');
  
  try {
    let url = '';
    if (reportType === 'monthly') {
      url = `http://127.0.0.1:8000/api/reports/monthly/?year=${selectedYear}&month=${selectedMonth}`;
    } else if (reportType === 'annual') {
      url = `http://127.0.0.1:8000/api/reports/annual/?year=${selectedYear}`;
    } else if (reportType === 'student' && selectedStudent) {
      url = `http://127.0.0.1:8000/api/reports/student/${selectedStudent}/`;
    }
    
    console.log('Fetching URL:', url); // Debug log
    
    const response = await axios.get(url, {
      withCredentials: false, // Change to false temporarily
      headers: {
        'Content-Type': 'application/json',
      }
    });
    
    console.log('Response:', response.data); // Debug log
    setReportData(response.data);
  } catch (err) {
    console.error('Error fetching report:', err);
    if (err.response) {
      console.error('Error response:', err.response.data);
      console.error('Error status:', err.response.status);
      setError(`Server error: ${err.response.status} - ${err.response.data.error || 'Unknown error'}`);
    } else if (err.request) {
      console.error('No response received:', err.request);
      setError('No response from server. Is Django running?');
    } else {
      setError('Failed to load report. Please try again.');
    }
  } finally {
    setLoading(false);
  }
};
  const downloadCSV = () => {
    if (!reportData) return;
    
    let csvContent = '';
    
    if (reportType === 'monthly' && reportData.by_grade) {
      // Create CSV for monthly report
      csvContent = 'Grade,Total Students,Paid,Pending,Collected (Birr),Collection Rate %\n';
      
      Object.entries(reportData.by_grade).forEach(([grade, data]) => {
        csvContent += `${grade},${data.total},${data.paid},${data.pending},${data.collected},${data.collection_rate}\n`;
      });
      
      csvContent += `\nSummary,,,,\n`;
      csvContent += `Total Students,${reportData.summary.total_students}\n`;
      csvContent += `Total Paid,${reportData.summary.total_paid}\n`;
      csvContent += `Total Pending,${reportData.summary.total_pending}\n`;
      csvContent += `Total Collected,${reportData.summary.total_collected} Birr\n`;
      csvContent += `Collection Rate,${reportData.summary.collection_rate}%\n`;
      
    } else if (reportType === 'student' && reportData.payment_history) {
      // Create CSV for student report
      csvContent = 'Month,Amount (Birr),Date,Method,Reference\n';
      
      reportData.payment_history.forEach(p => {
        csvContent += `${p.month},${p.amount},${p.date},${p.method},${p.reference || 'N/A'}\n`;
      });
      
      csvContent += `\nSummary\n`;
      csvContent += `Total Paid,${reportData.summary.total_paid} Birr\n`;
      csvContent += `Pending Months,${reportData.summary.pending_count}\n`;
      csvContent += `Pending Amount,${reportData.summary.pending_amount} Birr\n`;
    }
    
    // Download file
    const blob = new Blob([csvContent], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `${reportType}_report_${new Date().toISOString().slice(0,10)}.csv`);
    document.body.appendChild(link);
    link.click();
    link.remove();
  };

  const getCollectionColor = (rate) => {
    if (rate >= 80) return 'text-green-600';
    if (rate >= 50) return 'text-yellow-600';
    return 'text-red-600';
  };

  const getProgressBarColor = (rate) => {
    if (rate >= 80) return 'bg-green-500';
    if (rate >= 50) return 'bg-yellow-500';
    return 'bg-red-500';
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold text-gray-900">Reports & Analytics</h1>
          <p className="text-sm md:text-base text-gray-600 mt-1">
            View and export payment reports
          </p>
        </div>
      </div>

      {/* Report Type Selector */}
      <div className="bg-white rounded-xl shadow-lg p-4 md:p-6">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Report Type
            </label>
            <select
              value={reportType}
              onChange={(e) => {
                setReportType(e.target.value);
                setReportData(null);
              }}
              className="input-field"
            >
              <option value="monthly">Monthly Report</option>
              <option value="annual">Annual Summary</option>
              <option value="student">Student Report</option>
            </select>
          </div>

          {reportType !== 'student' && (
            <>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Academic Year
                </label>
                <select
                  value={selectedYear}
                  onChange={(e) => setSelectedYear(e.target.value)}
                  className="input-field"
                >
                  {years.map(year => (
                    <option key={year} value={year}>{year}</option>
                  ))}
                </select>
              </div>

              {reportType === 'monthly' && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Month
                  </label>
                  <select
                    value={selectedMonth}
                    onChange={(e) => setSelectedMonth(e.target.value)}
                    className="input-field"
                  >
                    {months.map(month => (
                      <option key={month.value} value={month.value}>
                        {month.name}
                      </option>
                    ))}
                  </select>
                </div>
              )}
            </>
          )}

          {reportType === 'student' && (
            <div className="md:col-span-2">
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Student ID
              </label>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={selectedStudent}
                  onChange={(e) => setSelectedStudent(e.target.value)}
                  placeholder="e.g., FS-2018-00001"
                  className="input-field flex-1"
                />
                <button
                  onClick={fetchReport}
                  disabled={!selectedStudent}
                  className="btn-primary px-6"
                >
                  <Search className="h-4 w-4" />
                </button>
              </div>
            </div>
          )}

          {reportType !== 'student' && (
            <div className="flex items-end">
              <button
                onClick={fetchReport}
                className="btn-primary w-full"
              >
                Generate Report
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Loading State */}
      {loading && (
        <div className="flex items-center justify-center py-12">
          <div className="text-center">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600 mx-auto"></div>
            <p className="mt-4 text-gray-600">Generating report...</p>
          </div>
        </div>
      )}

      {/* Error State */}
      {error && (
        <div className="bg-red-50 border-l-4 border-red-500 p-4 rounded">
          <div className="flex items-center gap-2">
            <AlertCircle className="h-5 w-5 text-red-500" />
            <p className="text-red-700">{error}</p>
          </div>
        </div>
      )}

      {/* Report Results */}
      <AnimatePresence mode="wait">
        {reportData && !loading && (
          <motion.div
            key={reportType}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            className="space-y-6"
          >
            {/* Monthly Report */}
            {reportType === 'monthly' && reportData.summary && (
              <>
                {/* Report Header */}
                <div className="bg-white rounded-xl shadow-lg p-6">
                  <div className="flex items-center justify-between">
                    <div>
                      <h2 className="text-xl font-bold text-gray-900">
                        Monthly Collection Report
                      </h2>
                      <p className="text-gray-600 mt-1">
                        {months.find(m => m.value === selectedMonth)?.name} {reportData.year}
                      </p>
                    </div>
                    <div className="flex gap-2">
                      <button
                        onClick={downloadCSV}
                        className="btn-outline flex items-center gap-2"
                      >
                        <Download className="h-4 w-4" />
                        Download CSV
                      </button>
                      <button className="btn-outline flex items-center gap-2">
                        <Printer className="h-4 w-4" />
                        Print
                      </button>
                    </div>
                  </div>
                </div>

                {/* Summary Cards */}
                <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                  <div className="bg-gradient-to-br from-blue-500 to-blue-600 rounded-xl shadow-lg p-4 text-white">
                    <p className="text-blue-100 text-sm">Total Students</p>
                    <p className="text-2xl font-bold">{reportData.summary.total_students}</p>
                  </div>
                  <div className="bg-gradient-to-br from-green-500 to-green-600 rounded-xl shadow-lg p-4 text-white">
                    <p className="text-green-100 text-sm">Total Collected</p>
                    <p className="text-2xl font-bold">{reportData.summary.total_collected} Birr</p>
                  </div>
                  <div className="bg-gradient-to-br from-yellow-500 to-yellow-600 rounded-xl shadow-lg p-4 text-white">
                    <p className="text-yellow-100 text-sm">Collection Rate</p>
                    <p className="text-2xl font-bold">{reportData.summary.collection_rate}%</p>
                  </div>
                  <div className="bg-gradient-to-br from-purple-500 to-purple-600 rounded-xl shadow-lg p-4 text-white">
                    <p className="text-purple-100 text-sm">Pending</p>
                    <p className="text-2xl font-bold">{reportData.summary.total_pending}</p>
                  </div>
                </div>

                {/* Grade-wise Breakdown */}
                <div className="bg-white rounded-xl shadow-lg p-6">
                  <h3 className="text-lg font-semibold text-gray-900 mb-4">Grade-wise Breakdown</h3>
                  <div className="space-y-4">
                    {Object.entries(reportData.by_grade).map(([grade, data]) => (
                      <div key={grade} className="border border-gray-200 rounded-lg p-4">
                        <div 
                          className="flex items-center justify-between cursor-pointer"
                          onClick={() => setExpandedGrade(expandedGrade === grade ? null : grade)}
                        >
                          <div className="flex items-center gap-4">
                            <h4 className="font-semibold text-gray-800">Grade {grade}</h4>
                            <span className={`text-sm font-medium ${getCollectionColor(data.collection_rate)}`}>
                              {data.collection_rate}%
                            </span>
                          </div>
                          <div className="flex items-center gap-4">
                            <span className="text-sm text-gray-600">
                              {data.paid}/{data.total} paid
                            </span>
                            {expandedGrade === grade ? (
                              <ChevronUp className="h-5 w-5 text-gray-400" />
                            ) : (
                              <ChevronDown className="h-5 w-5 text-gray-400" />
                            )}
                          </div>
                        </div>

                        {/* Progress Bar */}
                        <div className="mt-3 progress-bar">
                          <div 
                            className={`progress-bar-fill ${getProgressBarColor(data.collection_rate)}`}
                            style={{ width: `${data.collection_rate}%` }}
                          ></div>
                        </div>

                        {/* Expanded Details */}
                        <AnimatePresence>
                          {expandedGrade === grade && (
                            <motion.div
                              initial={{ opacity: 0, height: 0 }}
                              animate={{ opacity: 1, height: 'auto' }}
                              exit={{ opacity: 0, height: 0 }}
                              className="mt-4 grid grid-cols-3 gap-4 text-sm"
                            >
                              <div>
                                <p className="text-gray-500">Paid</p>
                                <p className="font-semibold text-green-600">{data.paid} students</p>
                              </div>
                              <div>
                                <p className="text-gray-500">Pending</p>
                                <p className="font-semibold text-yellow-600">{data.pending} students</p>
                              </div>
                              <div>
                                <p className="text-gray-500">Collected</p>
                                <p className="font-semibold text-gray-900">{data.collected} Birr</p>
                              </div>
                            </motion.div>
                          )}
                        </AnimatePresence>
                      </div>
                    ))}
                  </div>
                </div>
              </>
            )}

            {/* Student Report */}
            {reportType === 'student' && reportData.student && (
              <>
                {/* Student Info */}
                <div className="bg-gradient-to-r from-primary-600 to-primary-800 rounded-xl shadow-lg p-6 text-white">
                  <h2 className="text-2xl font-bold">{reportData.student.name}</h2>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-4">
                    <div>
                      <p className="text-primary-100 text-sm">Student ID</p>
                      <p className="font-semibold">{reportData.student.id}</p>
                    </div>
                    <div>
                      <p className="text-primary-100 text-sm">Grade</p>
                      <p className="font-semibold">{reportData.student.grade}</p>
                    </div>
                    <div>
                      <p className="text-primary-100 text-sm">Section</p>
                      <p className="font-semibold">{reportData.student.section}</p>
                    </div>
                    <div>
                      <p className="text-primary-100 text-sm">Monthly Fee</p>
                      <p className="font-semibold">{reportData.student.monthly_fee} Birr</p>
                    </div>
                  </div>
                </div>

                {/* Summary Cards */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div className="bg-white rounded-xl shadow-lg p-4">
                    <p className="text-sm text-gray-600">Total Paid</p>
                    <p className="text-2xl font-bold text-green-600">{reportData.summary.total_paid} Birr</p>
                  </div>
                  <div className="bg-white rounded-xl shadow-lg p-4">
                    <p className="text-sm text-gray-600">Pending Months</p>
                    <p className="text-2xl font-bold text-yellow-600">{reportData.summary.pending_count}</p>
                  </div>
                  <div className="bg-white rounded-xl shadow-lg p-4">
                    <p className="text-sm text-gray-600">Pending Amount</p>
                    <p className="text-2xl font-bold text-red-600">{reportData.summary.pending_amount} Birr</p>
                  </div>
                </div>

                {/* Payment History */}
                <div className="bg-white rounded-xl shadow-lg p-6">
                  <h3 className="text-lg font-semibold text-gray-900 mb-4">Payment History</h3>
                  {reportData.payment_history.length === 0 ? (
                    <p className="text-gray-500 text-center py-4">No payments found</p>
                  ) : (
                    <div className="overflow-x-auto">
                      <table className="w-full">
                        <thead className="bg-gray-50">
                          <tr>
                            <th className="table-header">Month</th>
                            <th className="table-header">Amount</th>
                            <th className="table-header">Date</th>
                            <th className="table-header">Method</th>
                            <th className="table-header">Reference</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-200">
                          {reportData.payment_history.map((payment, index) => (
                            <tr key={index} className="table-row">
                              <td className="table-cell">{payment.month}</td>
                              <td className="table-cell font-medium">{payment.amount} Birr</td>
                              <td className="table-cell">{payment.date}</td>
                              <td className="table-cell capitalize">{payment.method}</td>
                              <td className="table-cell font-mono text-sm">{payment.reference || '—'}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>

                {/* Pending Payments */}
                {reportData.pending.length > 0 && (
                  <div className="bg-white rounded-xl shadow-lg p-6">
                    <h3 className="text-lg font-semibold text-gray-900 mb-4">Pending Payments</h3>
                    <div className="space-y-3">
                      {reportData.pending.map((pending, index) => (
                        <div key={index} className="flex items-center justify-between p-3 bg-yellow-50 rounded-lg">
                          <div>
                            <p className="font-medium text-yellow-800">{pending.month}</p>
                            <p className="text-sm text-yellow-600">Due: {pending.due_date}</p>
                          </div>
                          <p className="font-bold text-yellow-800">{pending.amount} Birr</p>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

export default Reports;