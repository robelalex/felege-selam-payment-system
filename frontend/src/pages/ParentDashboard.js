// src/pages/ParentDashboard.js
import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { 
  GraduationCap, BookOpen, Phone, Mail, Calendar, 
  DollarSign, CreditCard, Clock, CheckCircle, 
  XCircle, AlertCircle, Loader, Eye, Download, 
  ChevronRight, User, Home, Receipt, TrendingUp,
  Shield, Smartphone, Building2, Lock, ArrowLeft,
  Upload, Banknote, Trash2, AlertTriangle, FileText, Award,
  ClipboardCheck, Star
} from 'lucide-react';
import api from '../services/api';
import { getMediaUrl } from '../utils/imageUrl';
import ParentLayout from '../components/Layout/ParentLayout';
import UploadSlipModal from '../components/UploadSlipModal';
import ReceiptModal from '../components/ReceiptModal';
import RegistrationCompletionCard from '../components/RegistrationCompletionCard';
import { isParentSessionValid, clearParentSession } from '../utils/parentSession';

function ParentDashboard() {
  const { studentId } = useParams();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [student, setStudent] = useState(null);
  const [payments, setPayments] = useState([]);
  const [pendingPayments, setPendingPayments] = useState([]);
  const [pendingSlips, setPendingSlips] = useState([]);
  const [academicYear, setAcademicYear] = useState(null);
  const [processingPaymentId, setProcessingPaymentId] = useState(null);
  const [error, setError] = useState('');
  const [showUploadModal, setShowUploadModal] = useState(false);
  const [selectedDeadline, setSelectedDeadline] = useState(null);
  const [showBankInfo, setShowBankInfo] = useState(null);
  const [showReceiptModal, setShowReceiptModal] = useState(false);
  const [selectedPayment, setSelectedPayment] = useState(null);
  
  // ✅ NEW: Chapa status state
  const [chapaConfigured, setChapaConfigured] = useState(true);
  const [loadingChapa, setLoadingChapa] = useState(true);
  // ✅ NEW: Multiple bank accounts
  const [bankAccounts, setBankAccounts] = useState([]);
  // ✅ NEW: Released report cards
  const [reportCards, setReportCards] = useState([]);
  const [loadingReportCards, setLoadingReportCards] = useState(true);
  // ✅ NEW: Jimma request #4 (part 1) — attendance + marks, "my child's record"
  const [childRecord, setChildRecord] = useState(null);
  const [loadingChildRecord, setLoadingChildRecord] = useState(true);
  const [recordTab, setRecordTab] = useState('attendance'); // 'attendance' | 'marks'

  useEffect(() => {
    // ✅ FIX: this page previously trusted whatever was in localStorage
    // indefinitely — no check that a session existed, was actually
    // verified, or hadn't expired. A tab left open, or a bookmark to a
    // dashboard URL, would keep working forever. Now the same 24-hour
    // expiry used at login-entry is enforced here too.
    if (!isParentSessionValid()) {
      clearParentSession();
      navigate('/parent/login');
      return;
    }

    fetchStudentData();
    fetchAcademicYear();
    fetchPendingSlips();
    checkChapaStatus(); // ✅ Check if Chapa is configured
    fetchBankAccounts(); // ✅ Load school's bank accounts
    fetchReportCards(); // ✅ Load released report cards
    fetchChildRecord(); // ✅ Load attendance + marks
  }, [studentId]);

  // ✅ NEW: Jimma request #4 (part 1) — same backend endpoint the mobile
  // app uses (GET /students/{id}/child_record/), scoped server-side to
  // this parent's own child by IsSameSchoolOrOwnParent — nothing extra
  // to enforce here on the frontend.
  const fetchChildRecord = async () => {
    setLoadingChildRecord(true);
    try {
      const response = await api.get(`/students/${studentId}/child_record/`);
      setChildRecord(response.data);
    } catch (err) {
      console.error('Error fetching child record:', err);
      setChildRecord(null);
    } finally {
      setLoadingChildRecord(false);
    }
  };

  // ✅ NEW: Fetch this student's released report cards
  const fetchReportCards = async () => {
    setLoadingReportCards(true);
    try {
      const response = await api.get('/report-cards/', {
        params: { student_id: studentId, status: 'released' }
      });
      const cards = response.data?.results || response.data || [];
      setReportCards(cards);
    } catch (err) {
      console.error('Error fetching report cards:', err);
      setReportCards([]);
    } finally {
      setLoadingReportCards(false);
    }
  };

  // ✅ NEW: Check Chapa status for this school
  const checkChapaStatus = async () => {
    setLoadingChapa(true);
    try {
      const response = await api.get('/schools/chapa-config/');
      setChapaConfigured(response.data.chapa_enabled);
    } catch (err) {
      console.error('Error checking Chapa status:', err);
      setChapaConfigured(false);
    } finally {
      setLoadingChapa(false);
    }
  };

  // ✅ NEW: Fetch school's bank accounts so parents see all options
  const fetchBankAccounts = async () => {
    try {
      const res = await api.get('/bank-accounts/');
      const accounts = res.data?.results || res.data || [];
      setBankAccounts(accounts);
    } catch {
      // Silently fall back to the old single-account fields on student object
    }
  };

  const fetchStudentData = async () => {
    setLoading(true);
    try {
      const studentResponse = await api.get(`/students/${studentId}/`);
      setStudent(studentResponse.data);
      
      const paymentResponse = await api.get(`/students/${studentId}/payment_history/`);
      setPayments(paymentResponse.data);
      
      const pendingResponse = await api.get(`/students/${studentId}/pending_payments/`);
      setPendingPayments(pendingResponse.data);
      
      localStorage.setItem('selectedStudent', JSON.stringify(studentResponse.data));

      // ✅ NEW: a parent who saw "Verification Pending" and closed the tab
      // had no way to resolve it themselves — the only re-check was the
      // "Check Again" button on that one page, easy to lose. Now, every
      // time the dashboard loads, any still-pending Chapa payment gets
      // silently re-checked in the background. If Chapa has since
      // confirmed it (webhook lag is common), it flips to Verified right
      // here — no trip to the school needed.
      recheckPendingChapaPayments(paymentResponse.data);

    } catch (err) {
      console.error('Error fetching student data:', err);
      setError('Failed to load student information. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const recheckPendingChapaPayments = async (paymentList) => {
    const stuckOnes = (paymentList || []).filter(
      (p) => p.status === 'pending' && p.payment_method === 'chapa' && p.transaction_ref
    );
    if (stuckOnes.length === 0) return;

    let anyResolved = false;
    for (const p of stuckOnes) {
      try {
        const res = await api.get(`/chapa/verify/?tx_ref=${encodeURIComponent(p.transaction_ref)}`);
        if (res.data?.verified) anyResolved = true;
      } catch {
        // Silent — this is a background best-effort check, not a
        // user-facing action. If Chapa is unreachable right now, the
        // payment just stays pending until the next dashboard load.
      }
    }

    // Refresh the lists once if anything actually changed, so the parent
    // sees the updated status without needing to do anything.
    if (anyResolved) {
      const paymentResponse = await api.get(`/students/${studentId}/payment_history/`);
      setPayments(paymentResponse.data);
      const pendingResponse = await api.get(`/students/${studentId}/pending_payments/`);
      setPendingPayments(pendingResponse.data);
    }
  };

  const fetchPendingSlips = async () => {
    try {
      const response = await api.get(`/students/${studentId}/pending_slips/`);
      setPendingSlips(response.data);
      console.log('📋 Pending slips:', response.data);
    } catch (err) {
      console.error('Error fetching pending slips:', err);
      setPendingSlips([]);
    }
  };

  const fetchAcademicYear = async () => {
    try {
      const response = await api.get('/academic-years/current/');
      setAcademicYear(response.data);
    } catch (err) {
      console.error('Error fetching academic year:', err);
    }
  };

  // ✅ FIXED: Check verification_status instead of legacy status
  const hasPendingSlip = (deadlineId) => {
    return pendingSlips.some(slip => 
      slip.deadline_id === deadlineId && 
      slip.verification_status !== 'verified'
    );
  };

  const isAlreadyPaid = (deadlineId) => {
    return payments.some(payment => 
      payment.deadline_id === deadlineId && 
      (payment.status === 'verified' || payment.status === 'completed')
    );
  };

  const isPayNowDisabled = (deadlineId) => {
    return isAlreadyPaid(deadlineId) || hasPendingSlip(deadlineId) || !chapaConfigured;
  };

  const getDisabledReason = (deadlineId) => {
    if (!chapaConfigured) return 'Online payments are currently unavailable. Please contact the school.';
    if (isAlreadyPaid(deadlineId)) return 'Already paid for this month';
    if (hasPendingSlip(deadlineId)) return 'You have a pending bank slip. Please wait for auto-verification.';
    return null;
  };

const handleMakePayment = async (deadlineId, amount) => {
  if (isPayNowDisabled(deadlineId)) {
    const reason = getDisabledReason(deadlineId);
    alert(`❌ Cannot process payment: ${reason}`);
    return;
  }

  setProcessingPaymentId(deadlineId);
  setError('');

  try {
    const payment = pendingPayments.find(p => p.id === deadlineId);

    if (!payment) {
      setError('Payment information not found');
      setProcessingPaymentId(null);
      return;
    }

    console.log('💰 Paying for specific month:', payment.month_name);

    const pendingPaymentInfo = {
      deadline_id: deadlineId,
      amount: parseFloat(amount),
      month_name: payment.month_name,
      academic_year: payment.academic_year,
      student_id: student.student_id,
      student_name: student.full_name,
      grade: student.grade,
      section: student.section,
      school_name: student.school_name || 'School Name',
    };
    sessionStorage.setItem('pendingPayment', JSON.stringify(pendingPaymentInfo));

    // ✅ Parse first/last name properly
    const fullName = student.parent_full_name || student.full_name || 'Parent User';
    const nameParts = fullName.trim().split(' ');
    const firstName = nameParts[0] || 'Parent';
    const lastName = nameParts.slice(1).join(' ') || 'User';

    // ✅ Get school ID for the header
    const schoolId = student.school_id || student.school;

    const response = await api.post(
      '/chapa/test-payment/',
      {
        student_id: student.student_id,
        deadline_id: deadlineId,
        amount: parseFloat(amount),
        // ✅ These 3 are required by Chapa
        email: student.parent_email || `${student.student_id}@school.com`,
        first_name: firstName,
        last_name: lastName,
        platform: 'web',
      },
      {
        // ✅ School ID header required by backend
        headers: {
          'X-School-ID': schoolId,
        }
      }
    );

    if (response.data.checkout_url) {
      window.location.href = response.data.checkout_url;
    } else if (response.data.success) {
      alert('Payment initiated successfully!');
      fetchStudentData();
      fetchPendingSlips();
    } else {
      setError(response.data.error || 'Payment initiation failed');
    }

  } catch (err) {
    console.error('Payment error:', err);
    const errorMsg = err.response?.data?.error || err.response?.data?.message || 'Payment initiation failed. Please try again.';
    setError(errorMsg);
  } finally {
    setProcessingPaymentId(null);
  }
};

  const handleBankTransfer = (payment) => {
    const schoolName = student?.school_name || 'School Name';

    // Use the new bank accounts list if available; fall back to old single-account fields
    const accountList = bankAccounts.length > 0
      ? bankAccounts.map(acc => ({
          label: acc.display_label || acc.bank_name,
          bank: acc.bank_name,
          accountName: acc.account_holder,
          accountNumber: acc.account_number,
          isPrimary: acc.is_primary,
        }))
      : [{
          label: student?.bank_name || 'Commercial Bank of Ethiopia',
          bank: student?.bank_name || 'Commercial Bank of Ethiopia',
          accountName: student?.bank_account_holder || schoolName,
          accountNumber: student?.bank_account_number || 'Not provided',
          isPrimary: true,
        }];

    const primaryAcc = accountList.find(a => a.isPrimary) || accountList[0];

    setShowBankInfo({
      payment,
      amount: payment.amount,
      accounts: accountList,
      instructions: [
        accountList.length > 1
          ? `Choose any of the ${accountList.length} accounts listed below`
          : `Bank: ${primaryAcc.bank}`,
        `Account Name: ${primaryAcc.accountName}`,
        `Account Number: ${primaryAcc.accountNumber}`,
        `Reference: Use Student ID: ${student?.student_id}`,
        `Month: ${payment.month_name}`,
        'After transfer, upload the bank slip',
      ],
    });
  };

  const handleUploadClick = (deadline) => {
    setSelectedDeadline(deadline);
    setShowUploadModal(true);
  };

  const formatDate = (dateString) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric'
    });
  };

  const getDaysRemaining = (dueDate) => {
    const today = new Date();
    const due = new Date(dueDate);
    const diffTime = due - today;
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    return diffDays;
  };

  if (loading) {
    return (
      <ParentLayout>
        <div className="flex items-center justify-center min-h-[60vh]">
          <Loader className="h-8 w-8 animate-spin text-indigo-600" />
        </div>
      </ParentLayout>
    );
  }

  if (error || !student) {
    return (
      <ParentLayout>
        <div className="bg-red-50 border-l-4 border-red-500 p-4 rounded-lg">
          <div className="flex items-center gap-2">
            <AlertCircle className="h-5 w-5 text-red-500" />
            <p className="text-red-700">{error || 'Student not found'}</p>
          </div>
          <button
            onClick={() => navigate('/parent/enter-student-id')}
            className="mt-4 text-indigo-600 hover:text-indigo-700 flex items-center gap-1"
          >
            <ArrowLeft className="h-4 w-4" />
            Back to Student ID Entry
          </button>
        </div>
      </ParentLayout>
    );
  }

  return (
    <ParentLayout>
      <div className="space-y-6">
        {/* Student Header */}
        <div className="bg-white rounded-2xl shadow-lg p-6">
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
            <div className="flex items-center gap-4">
              {student.photo ? (
                <img
                  src={getMediaUrl(student.photo)}
                  alt={student.full_name}
                  className="w-16 h-16 rounded-full object-cover border-2 border-indigo-200"
                />
              ) : (
                <div className="p-4 bg-indigo-100 rounded-full">
                  <GraduationCap className="h-8 w-8 text-indigo-600" />
                </div>
              )}
              <div>
                <h1 className="text-2xl font-bold text-gray-900">{student.full_name}</h1>
                <div className="flex flex-wrap gap-3 mt-1 text-sm text-gray-500">
                  <span className="flex items-center gap-1">
                    <BookOpen className="h-4 w-4" />
                    {student.grade} - {student.section || 'Section A'}
                  </span>
                  <span className="flex items-center gap-1">
                    <User className="h-4 w-4" />
                    ID: {student.student_id}
                  </span>
                  {academicYear && (
                    <span className="flex items-center gap-1">
                      <Calendar className="h-4 w-4" />
                      Year: {academicYear.name}
                    </span>
                  )}
                </div>
              </div>
            </div>
            <div className="text-right">
              <p className="text-sm text-gray-500">Monthly Tuition</p>
              <p className="text-2xl font-bold text-indigo-600">
                ETB {parseFloat(student.monthly_fee || 0).toLocaleString()}
              </p>
            </div>
          </div>
        </div>

        {/* ✅ NEW: Chapa Configuration Warning */}
        {!loadingChapa && !chapaConfigured && (
          <div className="bg-yellow-50 border-l-4 border-yellow-500 p-4 rounded-lg shadow-sm">
            <div className="flex items-start gap-3">
              <AlertTriangle className="h-5 w-5 text-yellow-600 flex-shrink-0 mt-0.5" />
              <div>
                <h3 className="font-semibold text-yellow-800 text-sm">⚠️ Online Payments Unavailable</h3>
                <p className="text-yellow-700 text-sm mt-1">
                  Online payments are currently not available for this school. Please contact the school administration for payment options.
                </p>
              </div>
            </div>
          </div>
        )}

        {/* ✅ NEW: Finish registration (photo + required documents) */}
        <RegistrationCompletionCard
          studentId={studentId}
          onPhotoUploaded={(photoUrl) => setStudent(prev => ({ ...prev, photo: photoUrl }))}
        />

        {/* Contact Information */}
        <div className="bg-white rounded-2xl shadow-lg p-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
            <User className="h-5 w-5 text-indigo-600" />
            Parent/Guardian Information
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="flex items-center gap-2 text-gray-600">
              <Mail className="h-4 w-4 text-gray-400" />
              <span>{student.parent_email || 'Not provided'}</span>
            </div>
            <div className="flex items-center gap-2 text-gray-600">
              <Phone className="h-4 w-4 text-gray-400" />
              <span>{student.parent_phone || 'Not provided'}</span>
            </div>
          </div>
        </div>

        {/* ✅ NEW: Jimma request #4 (part 1) — Attendance & Marks, "my
            child's record". Same data the mobile app's Attendance & Marks
            screen shows, via the same backend endpoint — this is just the
            web rendering of it, following this page's existing pattern of
            inline sections rather than a separate route. */}
        <div className="bg-white rounded-2xl shadow-lg p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
              <ClipboardCheck className="h-5 w-5 text-indigo-600" />
              Attendance & Marks
            </h2>
            <div className="flex bg-gray-100 rounded-lg p-1">
              <button
                onClick={() => setRecordTab('attendance')}
                className={`px-3 py-1.5 text-sm font-medium rounded-md transition-colors ${
                  recordTab === 'attendance' ? 'bg-white text-indigo-600 shadow-sm' : 'text-gray-500'
                }`}
              >
                Attendance
              </button>
              <button
                onClick={() => setRecordTab('marks')}
                className={`px-3 py-1.5 text-sm font-medium rounded-md transition-colors ${
                  recordTab === 'marks' ? 'bg-white text-indigo-600 shadow-sm' : 'text-gray-500'
                }`}
              >
                Marks
              </button>
            </div>
          </div>

          {loadingChildRecord ? (
            <div className="flex items-center justify-center py-8">
              <Loader className="h-6 w-6 animate-spin text-indigo-600" />
            </div>
          ) : !childRecord ? (
            <p className="text-sm text-gray-500 py-4">Couldn't load attendance/marks right now. Try refreshing the page.</p>
          ) : recordTab === 'attendance' ? (
            <ParentAttendanceTab attendance={childRecord.attendance} formatDate={formatDate} />
          ) : (
            <ParentMarksTab marks={childRecord.marks} />
          )}
        </div>

        {/* Report Cards Section */}
        {!loadingReportCards && reportCards.length > 0 && (
          <div className="bg-white rounded-2xl shadow-lg p-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
              <Award className="h-5 w-5 text-indigo-600" />
              Report Cards ({reportCards.length})
            </h2>
            <div className="space-y-3">
              {reportCards.map((card) => (
                <div
                  key={card.id}
                  className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 border border-gray-200 rounded-xl p-4 hover:border-indigo-200 transition-colors"
                >
                  <div className="flex items-center gap-3">
                    <div className="p-2.5 bg-indigo-100 rounded-lg flex-shrink-0">
                      <FileText className="h-5 w-5 text-indigo-600" />
                    </div>
                    <div>
                      <p className="font-medium text-gray-900">
                        {card.report_type === 'cumulative'
                          ? `${card.academic_year_name} — Year-End Report`
                          : `${card.term_name || 'Term'} — ${card.academic_year_name}`}
                      </p>
                      <div className="flex flex-wrap gap-3 mt-1 text-sm text-gray-500">
                        {card.overall_average != null && (
                          <span>Average: {parseFloat(card.overall_average).toFixed(1)}%</span>
                        )}
                        {card.letter_grade && <span>Grade: {card.letter_grade}</span>}
                        {card.released_at && (
                          <span>Released {formatDate(card.released_at)}</span>
                        )}
                      </div>
                    </div>
                  </div>
                  {card.pdf_url ? (
                    <a
                      href={card.pdf_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      download
                      className="inline-flex items-center justify-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors text-sm font-medium flex-shrink-0"
                    >
                      <Download className="h-4 w-4" />
                      Download PDF
                    </a>
                  ) : (
                    <span className="text-sm text-gray-400 flex-shrink-0">PDF not available</span>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Pending Payments Section */}
        {pendingPayments.length > 0 && (
          <div className="bg-white rounded-2xl shadow-lg p-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
              <Clock className="h-5 w-5 text-yellow-600" />
              Pending Payments ({pendingPayments.length})
            </h2>
            <div className="space-y-4">
              {pendingPayments.map((payment) => {
                const daysRemaining = getDaysRemaining(payment.due_date);
                const payNowDisabled = isPayNowDisabled(payment.id);
                const disabledReason = getDisabledReason(payment.id);
                const hasPending = hasPendingSlip(payment.id);
                
                return (
                  <div key={payment.id} className="border rounded-lg p-4 hover:shadow-md transition-shadow">
                    <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-1 flex-wrap">
                          <p className="font-semibold text-gray-900">{payment.month_name}</p>
                          {daysRemaining <= 10 && daysRemaining > 0 && (
                            <span className="text-xs text-orange-600 bg-orange-100 px-2 py-0.5 rounded-full">
                              {daysRemaining} days reminder
                            </span>
                          )}
                          {daysRemaining <= 0 && (
                            <span className="text-xs text-red-600 bg-red-100 px-2 py-0.5 rounded-full">
                              Overdue
                            </span>
                          )}
                          {hasPending && (
                            <span className="text-xs text-blue-600 bg-blue-100 px-2 py-0.5 rounded-full flex items-center gap-1">
                              <Clock className="h-3 w-3" />
                              Slip Verifying...
                            </span>
                          )}
                        </div>
                        <p className="text-sm text-gray-500">Due: {formatDate(payment.due_date)}</p>
                        <p className="text-xl font-bold text-red-600 mt-1">
                          ETB {parseFloat(payment.amount).toLocaleString()}
                        </p>
                        {hasPending && (
                          <p className="text-xs text-blue-600 mt-1 flex items-center gap-1">
                            <Clock className="h-3 w-3" />
                            Auto-verifying with CBE bank servers...
                          </p>
                        )}
                      </div>
                      <div className="flex flex-wrap gap-2">
                        {/* Pay Now button with Chapa status check */}
                        <button
                          onClick={() => handleMakePayment(payment.id, payment.amount)}
                          disabled={processingPaymentId === payment.id || payNowDisabled}
                          title={disabledReason || ''}
                          className={`flex items-center gap-2 px-4 py-2 rounded-lg transition-colors text-sm ${
                            payNowDisabled
                              ? 'bg-gray-300 text-gray-500 cursor-not-allowed'
                              : 'bg-indigo-600 text-white hover:bg-indigo-700'
                          }`}
                        >
                          {processingPaymentId === payment.id ? (
                            <Loader className="h-4 w-4 animate-spin" />
                          ) : (
                            <CreditCard className="h-4 w-4" />
                          )}
                          {!chapaConfigured ? 'Unavailable' : hasPending ? 'Verifying...' : 'Pay Now'}
                        </button>
                        <button
                          onClick={() => handleBankTransfer(payment)}
                          className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors text-sm"
                        >
                          <Banknote className="h-4 w-4" />
                          Bank Transfer
                        </button>
                        <button
                          onClick={() => handleUploadClick(payment)}
                          disabled={hasPending}
                          title={hasPending ? 'Verification in progress. Wait for completion.' : ''}
                          className={`flex items-center gap-2 px-4 py-2 rounded-lg transition-colors text-sm ${
                            hasPending
                              ? 'bg-gray-300 text-gray-500 cursor-not-allowed'
                              : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
                          }`}
                        >
                          <Upload className="h-4 w-4" />
                          {hasPending ? 'Verifying...' : 'Upload Slip'}
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Payment History */}
        <div className="bg-white rounded-2xl shadow-lg p-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
            <Receipt className="h-5 w-5 text-gray-600" />
            Payment History
          </h2>
          
          {payments.length === 0 && pendingSlips.length === 0 ? (
            <p className="text-gray-500 text-center py-8">No payment records found.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-4 py-3 text-left text-sm font-medium text-gray-600">Date</th>
                    <th className="px-4 py-3 text-left text-sm font-medium text-gray-600">Description</th>
                    <th className="px-4 py-3 text-right text-sm font-medium text-gray-600">Amount</th>
                    <th className="px-4 py-3 text-center text-sm font-medium text-gray-600">Status</th>
                    <th className="px-4 py-3 text-center text-sm font-medium text-gray-600">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200">
{pendingSlips.map((slip) => (
  <tr key={`slip-${slip.id}`} className="hover:bg-gray-50 bg-yellow-50/30">
    <td className="px-4 py-3 text-sm text-gray-600">
      {formatDate(slip.uploaded_at)}
    </td>
    <td className="px-4 py-3 text-sm text-gray-900">
      {/* ✅ Use slip.month_name directly instead of slip.deadline?.month_name */}
      {slip.month_name || 'Tuition Fee'}
      <span className="ml-2 text-xs bg-yellow-100 text-yellow-700 px-1.5 py-0.5 rounded-full">
        Bank Slip Uploaded
      </span>
      {slip.transaction_reference && (
        <p className="text-xs text-gray-400 mt-0.5 font-mono">
          Ref: {slip.transaction_reference.substring(0, 20)}...
        </p>
      )}
    </td>
    <td className="px-4 py-3 text-sm text-gray-900 text-right font-medium">
      ETB {parseFloat(slip.amount).toLocaleString()}
    </td>
    <td className="px-4 py-3 text-center">
      {slip.verification_status === 'verified' ? (
        <span className="inline-flex items-center gap-1 text-green-600 bg-green-50 px-2 py-1 rounded-full text-xs">
          <CheckCircle className="h-3 w-3" /> Verified by System
        </span>
      ) : slip.verification_status === 'failed' || slip.verification_status === 'manual_review' ? (
        <span className="inline-flex items-center gap-1 text-orange-600 bg-orange-50 px-2 py-1 rounded-full text-xs">
          <AlertTriangle className="h-3 w-3" /> Needs Attention
        </span>
      ) : slip.verification_status === 'rejected' ? (
        <span className="inline-flex items-center gap-1 text-red-600 bg-red-50 px-2 py-1 rounded-full text-xs">
          <XCircle className="h-3 w-3" /> Rejected
        </span>
      ) : (
        <span className="inline-flex items-center gap-1 text-blue-600 bg-blue-50 px-2 py-1 rounded-full text-xs">
          <Loader className="h-3 w-3 animate-spin" /> Verifying...
        </span>
      )}
    </td>
    <td className="px-4 py-3 text-center">
      <button
        onClick={() => {
          setSelectedPayment({ ...slip, is_slip: true });
          setShowReceiptModal(true);
        }}
        className="p-1.5 text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
        title="View Slip"
      >
        <Eye className="h-4 w-4" />
      </button>
    </td>
  </tr>
))}
                  
                  {payments.map((payment) => (
                    <tr key={payment.id} className="hover:bg-gray-50">
                      <td className="px-4 py-3 text-sm text-gray-600">
                        {formatDate(payment.payment_date || payment.created_at)}
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-900">
                        {payment.description || payment.deadline_name || 'Tuition Fee'}
                        {payment.is_from_slip && (
                          <span className="ml-2 text-xs bg-blue-100 text-blue-700 px-1.5 py-0.5 rounded-full">
                            Bank Slip
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-900 text-right font-medium">
                        ETB {parseFloat(payment.amount).toLocaleString()}
                      </td>
                      <td className="px-4 py-3 text-center">
                        {payment.status === 'verified' && (
                          <span className="inline-flex items-center gap-1 text-green-600 bg-green-50 px-2 py-1 rounded-full text-xs">
                            <CheckCircle className="h-3 w-3" /> Verified
                          </span>
                        )}
                        {payment.status === 'pending' && (
                          <span className="inline-flex items-center gap-1 text-yellow-600 bg-yellow-50 px-2 py-1 rounded-full text-xs">
                            <Clock className="h-3 w-3" /> Pending
                          </span>
                        )}
                        {payment.status === 'rejected' && (
                          <span className="inline-flex items-center gap-1 text-red-600 bg-red-50 px-2 py-1 rounded-full text-xs">
                            <XCircle className="h-3 w-3" /> Rejected
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-center">
                        <button
                          onClick={() => {
                            setSelectedPayment(payment);
                            setShowReceiptModal(true);
                          }}
                          className="p-1.5 text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                          title="View Receipt"
                        >
                          <Eye className="h-4 w-4" />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Receipt Modal */}
        {showReceiptModal && selectedPayment && (
          <ReceiptModal
            payment={selectedPayment}
            student={student}
            onClose={() => {
              setShowReceiptModal(false);
              setSelectedPayment(null);
            }}
          />
        )}

        {/* Payment Methods Info */}
        <div className="bg-gradient-to-r from-indigo-50 to-purple-50 rounded-2xl p-6">
          <h3 className="font-medium text-gray-900 mb-3 flex items-center gap-2">
            <Shield className="h-5 w-5 text-indigo-600" />
            Payment Options
          </h3>
          <div className="flex flex-wrap gap-4 text-sm text-gray-600">
            <span className="flex items-center gap-2">
              <Smartphone className="h-4 w-4" />
              Telebirr
            </span>
            <span className="flex items-center gap-2">
              <CreditCard className="h-4 w-4" />
              Chapa
            </span>
            <span className="flex items-center gap-2">
              <Building2 className="h-4 w-4" />
              Bank Transfer
            </span>
            <span className="flex items-center gap-2">
              <Upload className="h-4 w-4" />
              Bank Slip Upload
            </span>
            <span className="flex items-center gap-2">
              <Lock className="h-4 w-4" />
              Secure & Encrypted
            </span>
          </div>
        </div>
      </div>

      {/* Bank Transfer Info Modal */}
      {showBankInfo && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={() => setShowBankInfo(null)}>
          <div className="bg-white rounded-xl shadow-2xl max-w-md w-full p-6" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-lg font-bold mb-1">Bank Transfer Instructions</h3>
            <p className="text-sm text-gray-500 mb-4">
              Transfer the amount to any of the accounts below, then upload your slip.
            </p>

            {/* Multiple bank account cards */}
            {showBankInfo.accounts && showBankInfo.accounts.length > 0 ? (
              <div className="space-y-3 mb-4">
                {showBankInfo.accounts.map((acc, idx) => (
                  <div key={idx} className={`border rounded-lg p-3 ${acc.isPrimary ? 'border-primary-300 bg-primary-50' : 'border-gray-200'}`}>
                    <div className="flex items-center gap-2 mb-1">
                      <Building2 className="h-4 w-4 text-primary-600 flex-shrink-0" />
                      <span className="font-semibold text-sm text-gray-900">{acc.bank}</span>
                      {acc.isPrimary && <span className="text-xs bg-primary-100 text-primary-700 px-1.5 py-0.5 rounded-full">Primary</span>}
                    </div>
                    <p className="text-sm text-gray-600 ml-6">Account Name: <span className="font-medium">{acc.accountName}</span></p>
                    <p className="text-sm text-gray-600 ml-6">Account No: <span className="font-mono font-medium">{acc.accountNumber}</span></p>
                  </div>
                ))}
              </div>
            ) : (
              <div className="space-y-2 mb-4">
                {showBankInfo.instructions.map((instruction, idx) => (
                  <p key={idx} className="text-sm text-gray-700">{instruction}</p>
                ))}
              </div>
            )}

            <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-3 mb-4 text-sm text-yellow-800">
              <p>Reference: Use your student ID <span className="font-bold">{student?.student_id}</span></p>
              <p className="mt-0.5">Month: <span className="font-medium">{showBankInfo.payment?.month_name}</span></p>
            </div>

            <button
              onClick={() => {
                setShowBankInfo(null);
                handleUploadClick(showBankInfo.payment);
              }}
              className="mt-2 w-full btn-primary flex items-center justify-center gap-2"
            >
              <Upload className="h-4 w-4" />
              Upload Bank Slip
            </button>
            <button onClick={() => setShowBankInfo(null)} className="mt-2 w-full btn-secondary">
              Close
            </button>
          </div>
        </div>
      )}

      {/* Upload Slip Modal */}
      {showUploadModal && (
        <UploadSlipModal
          student={student}
          deadline={selectedDeadline}
          onClose={() => setShowUploadModal(false)}
          onSuccess={() => {
            fetchStudentData();
            fetchPendingSlips();
            setShowUploadModal(false);
          }}
        />
      )}
    </ParentLayout>
  );
}

// ✅ NEW: Jimma request #4 (part 1) — small presentational sub-components
// for the Attendance & Marks card above. Kept outside ParentDashboard
// (rather than inline in its render) since they're pure display of data
// ParentDashboard already fetched — no state/effects of their own needed.

function ParentAttendanceTab({ attendance, formatDate }) {
  const daily = attendance?.daily || { summary: {}, records: [] };
  const summary = daily.summary || {};
  const records = daily.records || [];
  const subjectGroups = attendance?.subject || [];

  if (records.length === 0 && subjectGroups.length === 0) {
    return <p className="text-sm text-gray-500 py-4">No attendance recorded yet for this academic year.</p>;
  }

  const statusColor = (s) => ({
    present: 'text-green-700 bg-green-50',
    absent: 'text-red-700 bg-red-50',
    late: 'text-amber-700 bg-amber-50',
    excused: 'text-slate-700 bg-slate-100',
  }[s] || 'text-gray-600 bg-gray-50');

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
        <div className="col-span-2 sm:col-span-1 bg-indigo-50 rounded-xl p-3 text-center">
          <p className="text-2xl font-bold text-indigo-700">
            {summary.attendance_rate != null ? `${summary.attendance_rate}%` : '—'}
          </p>
          <p className="text-xs text-gray-500 mt-1">Attendance Rate</p>
        </div>
        {['present', 'absent', 'late', 'excused'].map((s) => (
          <div key={s} className={`rounded-xl p-3 text-center ${statusColor(s)}`}>
            <p className="text-2xl font-bold">{summary[s] ?? 0}</p>
            <p className="text-xs mt-1 capitalize">{s}</p>
          </div>
        ))}
      </div>

      {records.length > 0 && (
        <div>
          <h3 className="text-sm font-semibold text-gray-700 mb-2">Recent Daily Attendance</h3>
          <div className="max-h-64 overflow-y-auto border border-gray-100 rounded-xl divide-y divide-gray-100">
            {records.slice(0, 20).map((r, i) => (
              <div key={i} className="flex items-center justify-between px-4 py-2 text-sm">
                <span className="text-gray-600">{formatDate(r.date)}</span>
                <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${statusColor(r.status)}`}>
                  {r.status_display}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {subjectGroups.length > 0 && (
        <div>
          <h3 className="text-sm font-semibold text-gray-700 mb-2">By Subject</h3>
          <div className="space-y-2">
            {subjectGroups.map((g, i) => (
              <details key={i} className="border border-gray-100 rounded-xl px-4 py-2">
                <summary className="cursor-pointer flex items-center justify-between text-sm font-medium text-gray-700">
                  <span>{g.subject}</span>
                  <span className="text-xs text-gray-500 font-normal">
                    Present {g.summary?.present ?? 0} · Absent {g.summary?.absent ?? 0} · Late {g.summary?.late ?? 0}
                  </span>
                </summary>
                <div className="mt-2 space-y-1">
                  {(g.records || []).slice(0, 10).map((r, j) => (
                    <div key={j} className="flex items-center justify-between text-xs px-1 py-1">
                      <span className="text-gray-500">{formatDate(r.date)}</span>
                      <span className={`px-2 py-0.5 rounded-full font-medium ${statusColor(r.status)}`}>
                        {r.status_display}
                      </span>
                    </div>
                  ))}
                </div>
              </details>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function ParentMarksTab({ marks }) {
  const terms = marks?.terms || [];

  if (terms.length === 0) {
    return <p className="text-sm text-gray-500 py-4">No marks have been finalized yet for this academic year.</p>;
  }

  return (
    <div className="space-y-6">
      {terms.map((t, i) => (
        <div key={i}>
          <h3 className="text-sm font-semibold text-gray-700 mb-2 flex items-center gap-1.5">
            <Star className="h-4 w-4 text-indigo-500" />
            {t.term}
          </h3>
          <div className="border border-gray-100 rounded-xl divide-y divide-gray-100">
            {(t.marks || []).map((m, j) => {
              const pct = m.score != null && m.max_score ? (m.score / m.max_score) * 100 : null;
              return (
                <div key={j} className="flex items-center justify-between px-4 py-2.5 text-sm">
                  <div>
                    <p className="font-medium text-gray-800">{m.subject}</p>
                    <p className="text-xs text-gray-500">{m.assessment_type}</p>
                  </div>
                  <span
                    className={`font-semibold ${
                      pct == null ? 'text-gray-400' : pct >= 50 ? 'text-green-700' : 'text-red-700'
                    }`}
                  >
                    {m.score != null ? `${m.score} / ${m.max_score}` : '—'}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}

export default ParentDashboard;