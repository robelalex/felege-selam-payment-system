// src/pages/StudentSearch.js
import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { getSchoolInfo } from '../services/api';
import api from '../services/api';
import { 
  Search, 
  User, 
  School, 
  ArrowRight, 
  AlertCircle,
  Loader,
  Shield,
  Mail,
  CheckCircle,
  Building2,
  GraduationCap,
  Phone,
  ChevronRight,
  Lock
} from 'lucide-react';

function StudentSearch() {
  const [studentId, setStudentId] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [schoolInfo, setSchoolInfo] = useState(null);
  const [loadingSchool, setLoadingSchool] = useState(true);
  
  // OTP States
  const [step, setStep] = useState('email'); // 'email' or 'otp' or 'student'
  const [email, setEmail] = useState('');
  const [userId, setUserId] = useState(null);
  const [otpCode, setOtpCode] = useState('');
  const [resendTimer, setResendTimer] = useState(0);
  const [studentsList, setStudentsList] = useState([]);
  const [selectedStudentId, setSelectedStudentId] = useState('');
  const [verifiedSchool, setVerifiedSchool] = useState(null);
  
  const navigate = useNavigate();

  useEffect(() => {
    const fetchSchoolInfo = async () => {
      try {
        const savedSchool = localStorage.getItem('selectedSchool');
        if (savedSchool) {
          setSchoolInfo(JSON.parse(savedSchool));
        } else {
          const response = await getSchoolInfo();
          if (response.data && response.data.length > 0) {
            setSchoolInfo(response.data[0]);
          }
        }
      } catch (err) {
        console.error('Error fetching school info:', err);
      } finally {
        setLoadingSchool(false);
      }
    };
    
    fetchSchoolInfo();
  }, []);

  useEffect(() => {
    if (resendTimer > 0) {
      const timer = setTimeout(() => setResendTimer(resendTimer - 1), 1000);
      return () => clearTimeout(timer);
    }
  }, [resendTimer]);

  const handleSendOTP = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    try {
      const response = await api.post('/parent/send-otp/', {
        email: email
      });

      if (response.data.success) {
        setUserId(response.data.user_id);
        setStep('otp');
        setResendTimer(60);
        setError('');
      } else {
        setError(response.data.error || 'No student found with this email');
      }
    } catch (err) {
      console.error('Send OTP error:', err);
      setError(err.response?.data?.error || 'Failed to send verification code. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleVerifyOTP = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    try {
      const response = await api.post('/parent/verify/', {
        user_id: userId,
        otp_code: otpCode
      });

      if (response.data.success) {
        setStudentsList(response.data.students);
        if (response.data.students && response.data.students.length > 0) {
          const student = response.data.students[0];
          setVerifiedSchool({
            name: student.school_name || schoolInfo?.name || 'School',
            logo: student.school_logo || schoolInfo?.logo || null
          });
        }
        setStep('student');
        setError('');
      } else {
        setError(response.data.error || 'Invalid verification code');
      }
    } catch (err) {
      console.error('OTP verification error:', err);
      setError('Verification failed. Please try again.');
    } finally {
      setLoading(false);
    }
  };

const handleSelectStudent = async (e) => {
  e.preventDefault();
  
  if (!selectedStudentId) {
    setError('Please select a student');
    return;
  }

  // ✅ Save selected student to localStorage
  const selectedStudent = studentsList.find(s => s.student_id === selectedStudentId);
  if (selectedStudent) {
    localStorage.setItem('selectedStudent', JSON.stringify(selectedStudent));
  }

  setLoading(true);
  setError('');

  try {
    navigate(`/student/${selectedStudentId}`);
  } catch (err) {
    console.error('Navigation error:', err);
    setError('Failed to load student information. Please try again.');
    setLoading(false);
  }
};

  const handleResendOTP = async () => {
    if (resendTimer > 0) return;
    
    setLoading(true);
    setError('');
    
    try {
      const response = await api.post('/parent/send-otp/', {
        email: email
      });
      
      if (response.data.success) {
        setUserId(response.data.user_id);
        setResendTimer(60);
        setError('');
      } else {
        setError(response.data.error || 'Failed to resend code');
      }
    } catch (err) {
      setError('Failed to resend code. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleBackToEmail = () => {
    setStep('email');
    setOtpCode('');
    setError('');
  };

  const handleBackToOTP = () => {
    setStep('otp');
    setSelectedStudentId('');
    setError('');
  };

  const handleStudentChange = (e) => {
    setSelectedStudentId(e.target.value);
    setError('');
  };

  if (loadingSchool) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-indigo-50 via-white to-purple-50 flex items-center justify-center">
        <Loader className="h-8 w-8 animate-spin text-indigo-600" />
      </div>
    );
  }

  // Render Email Step - Mobile Responsive
  if (step === 'email') {
    return (
      <div className="min-h-screen bg-gradient-to-br from-indigo-50 via-white to-purple-50">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 py-8 sm:py-12">
          {/* Hero Section - Responsive */}
          <div className="text-center mb-8 sm:mb-12">
            <div className="inline-flex items-center justify-center p-3 bg-gradient-to-r from-indigo-600 to-purple-600 rounded-2xl mb-4 sm:mb-6 shadow-lg">
              <GraduationCap className="h-8 w-8 sm:h-10 sm:w-10 text-white" />
            </div>
            <h1 className="text-2xl sm:text-3xl md:text-4xl font-bold bg-gradient-to-r from-indigo-600 to-purple-600 bg-clip-text text-transparent mb-2 sm:mb-4">
              Parent Payment Portal
            </h1>
            <p className="text-sm sm:text-base text-gray-600 max-w-md mx-auto px-4">
              Secure access to your child's school fees and payment history
            </p>
          </div>

          {/* Email Card - Responsive */}
          <div className="max-w-md mx-auto px-4 sm:px-0">
            <div className="bg-white/80 backdrop-blur-sm rounded-2xl shadow-2xl p-5 sm:p-8 border border-gray-100">
              <div className="text-center mb-5 sm:mb-6">
                <div className="inline-flex items-center justify-center w-14 h-14 sm:w-16 sm:h-16 bg-gradient-to-r from-indigo-100 to-purple-100 rounded-full mb-3 sm:mb-4">
                  <Mail className="h-6 w-6 sm:h-8 sm:w-8 text-indigo-600" />
                </div>
                <h2 className="text-xl sm:text-2xl font-bold text-gray-800">Verify Your Identity</h2>
                <p className="text-xs sm:text-sm text-gray-500 mt-1">
                  Enter your registered email address
                </p>
              </div>

              <form onSubmit={handleSendOTP} className="space-y-4 sm:space-y-5">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Email Address
                  </label>
                  <div className="relative">
                    <Mail className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 sm:h-5 sm:w-5 text-gray-400" />
                    <input
                      type="email"
                      className="w-full pl-9 sm:pl-10 pr-4 py-2.5 sm:py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all text-sm sm:text-base"
                      placeholder="parent@example.com"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      required
                    />
                  </div>
                  <p className="text-xs text-gray-500 mt-2">
                    We'll send a 6-digit verification code to this email
                  </p>
                </div>

                {error && (
                  <div className="bg-red-50 border-l-4 border-red-500 p-3 sm:p-4 rounded-xl">
                    <div className="flex items-center">
                      <AlertCircle className="h-4 w-4 sm:h-5 sm:w-5 text-red-500 mr-2" />
                      <p className="text-red-700 text-xs sm:text-sm">{error}</p>
                    </div>
                  </div>
                )}

                <button
                  type="submit"
                  disabled={loading}
                  className="w-full bg-gradient-to-r from-indigo-600 to-purple-600 text-white py-2.5 sm:py-3 rounded-xl font-semibold hover:from-indigo-700 hover:to-purple-700 transition-all duration-200 flex items-center justify-center gap-2 shadow-lg tap-target text-sm sm:text-base"
                >
                  {loading ? (
                    <>
                      <Loader className="h-4 w-4 sm:h-5 sm:w-5 animate-spin" />
                      Sending Code...
                    </>
                  ) : (
                    <>
                      Send Verification Code
                      <ArrowRight className="h-4 w-4 sm:h-5 sm:w-5" />
                    </>
                  )}
                </button>
              </form>

              <div className="mt-5 sm:mt-6 p-3 sm:p-4 bg-gradient-to-r from-indigo-50 to-purple-50 rounded-xl">
                <h3 className="text-xs sm:text-sm font-semibold text-indigo-800 mb-2">🔒 Secure Access</h3>
                <ul className="text-xs text-indigo-700 space-y-1">
                  <li className="flex items-center gap-2">
                    <CheckCircle className="h-3 w-3" />
                    One-time code sent to your email
                  </li>
                  <li className="flex items-center gap-2">
                    <CheckCircle className="h-3 w-3" />
                    Code expires in 10 minutes
                  </li>
                  <li className="flex items-center gap-2">
                    <CheckCircle className="h-3 w-3" />
                    Your information is encrypted
                  </li>
                </ul>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Render OTP Step - Mobile Responsive
  if (step === 'otp') {
    return (
      <div className="min-h-screen bg-gradient-to-br from-indigo-50 via-white to-purple-50">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 py-8 sm:py-12">
          <div className="text-center mb-6 sm:mb-8">
            <div className="inline-flex items-center justify-center p-3 bg-gradient-to-r from-indigo-600 to-purple-600 rounded-2xl mb-4 shadow-lg">
              <Shield className="h-8 w-8 sm:h-10 sm:w-10 text-white" />
            </div>
            <h1 className="text-2xl sm:text-3xl font-bold text-gray-800 mb-2">Verify Your Email</h1>
            <p className="text-sm sm:text-base text-gray-500">
              Enter the 6-digit code sent to <strong className="text-indigo-600">{email}</strong>
            </p>
          </div>

          <div className="max-w-md mx-auto px-4 sm:px-0">
            <div className="bg-white rounded-2xl shadow-2xl p-5 sm:p-8">
              <form onSubmit={handleVerifyOTP} className="space-y-5 sm:space-y-6">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2 text-center">
                    Verification Code
                  </label>
                  <input
                    type="text"
                    value={otpCode}
                    onChange={(e) => setOtpCode(e.target.value)}
                    className="w-full text-center text-2xl sm:text-3xl tracking-widest py-3 sm:py-4 border border-gray-200 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                    placeholder="000000"
                    maxLength={6}
                    required
                    autoFocus
                  />
                  <p className="text-xs text-gray-500 text-center mt-3">
                    Code expires in 10 minutes
                  </p>
                </div>

                {error && (
                  <div className="bg-red-50 border-l-4 border-red-500 p-3 rounded-xl">
                    <div className="flex items-center">
                      <AlertCircle className="h-4 w-4 text-red-500 mr-2" />
                      <p className="text-red-700 text-sm">{error}</p>
                    </div>
                  </div>
                )}

                <button
                  type="submit"
                  disabled={loading || otpCode.length !== 6}
                  className="w-full bg-gradient-to-r from-indigo-600 to-purple-600 text-white py-2.5 sm:py-3 rounded-xl font-semibold hover:from-indigo-700 hover:to-purple-700 transition-all duration-200 flex items-center justify-center gap-2 tap-target text-sm sm:text-base"
                >
                  {loading ? (
                    <>
                      <Loader className="h-4 w-4 sm:h-5 sm:w-5 animate-spin" />
                      Verifying...
                    </>
                  ) : (
                    <>
                      Verify & Continue
                      <ArrowRight className="h-4 w-4 sm:h-5 sm:w-5" />
                    </>
                  )}
                </button>

                <div className="text-center space-y-2">
                  <button
                    type="button"
                    onClick={handleResendOTP}
                    disabled={resendTimer > 0}
                    className="text-sm text-indigo-600 hover:text-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed tap-target"
                  >
                    {resendTimer > 0 ? `Resend code in ${resendTimer}s` : 'Resend code'}
                  </button>
                  <div>
                    <button
                      type="button"
                      onClick={handleBackToEmail}
                      className="text-sm text-gray-500 hover:text-gray-700 tap-target"
                    >
                      ← Use different email
                    </button>
                  </div>
                </div>
              </form>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Render Student Selection Step - Mobile Responsive
  if (step === 'student') {
    const displaySchool = verifiedSchool || schoolInfo;
    
    return (
      <div className="min-h-screen bg-gradient-to-br from-indigo-50 via-white to-purple-50">
        {/* School Navbar - Responsive */}
        <div className="bg-white/80 backdrop-blur-sm border-b border-gray-200 sticky top-0 z-10">
          <div className="max-w-4xl mx-auto px-4 py-2.5 sm:py-3 flex items-center gap-2 sm:gap-3">
            {displaySchool?.logo ? (
              <img src={displaySchool.logo} alt={displaySchool.name} className="h-8 w-8 sm:h-10 sm:w-10 rounded-full object-cover" />
            ) : (
              <div className="h-8 w-8 sm:h-10 sm:w-10 bg-gradient-to-r from-indigo-100 to-purple-100 rounded-full flex items-center justify-center">
                <School className="h-4 w-4 sm:h-5 sm:w-5 text-indigo-600" />
              </div>
            )}
            <div className="flex-1">
              <p className="text-xs text-gray-500">Welcome to</p>
              <h2 className="font-bold text-gray-800 text-sm sm:text-base">{displaySchool?.name || 'School Payment Portal'}</h2>
            </div>
          </div>
        </div>

        <div className="max-w-4xl mx-auto px-4 sm:px-6 py-8 sm:py-12">
          <div className="text-center mb-6 sm:mb-8">
            <div className="inline-flex items-center justify-center w-14 h-14 sm:w-16 sm:h-16 bg-gradient-to-r from-green-100 to-emerald-100 rounded-full mb-3 sm:mb-4">
              <CheckCircle className="h-7 w-7 sm:h-8 sm:w-8 text-green-600" />
            </div>
            <h1 className="text-2xl sm:text-3xl font-bold text-gray-800 mb-2">Welcome Parent!</h1>
            <p className="text-sm sm:text-base text-gray-500">
              Select a student to continue to payment portal
            </p>
          </div>

          <div className="max-w-md mx-auto px-4 sm:px-0">
            <div className="bg-white rounded-2xl shadow-2xl p-5 sm:p-8">
              <form onSubmit={handleSelectStudent} className="space-y-5">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Select Student
                  </label>
                  <select
                    value={selectedStudentId}
                    onChange={handleStudentChange}
                    className="w-full px-4 py-2.5 sm:py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-transparent text-sm sm:text-base tap-target"
                    required
                  >
                    <option value="">-- Select a student --</option>
                    {studentsList.map((student) => (
                      <option key={student.id} value={student.student_id}>
                        {student.full_name} - Grade {student.grade} {student.section}
                      </option>
                    ))}
                  </select>
                </div>

                {error && (
                  <div className="bg-red-50 border-l-4 border-red-500 p-3 rounded-xl">
                    <div className="flex items-center">
                      <AlertCircle className="h-4 w-4 text-red-500 mr-2" />
                      <p className="text-red-700 text-sm">{error}</p>
                    </div>
                  </div>
                )}

                <button
                  type="submit"
                  disabled={loading}
                  className="w-full bg-gradient-to-r from-indigo-600 to-purple-600 text-white py-2.5 sm:py-3 rounded-xl font-semibold hover:from-indigo-700 hover:to-purple-700 transition-all duration-200 flex items-center justify-center gap-2 tap-target text-sm sm:text-base"
                >
                  {loading ? (
                    <>
                      <Loader className="h-4 w-4 sm:h-5 sm:w-5 animate-spin" />
                      Loading...
                    </>
                  ) : (
                    <>
                      Continue to Payment Portal
                      <ArrowRight className="h-4 w-4 sm:h-5 sm:w-5" />
                    </>
                  )}
                </button>

                <div className="text-center">
                  <button
                    type="button"
                    onClick={handleBackToOTP}
                    className="text-sm text-gray-500 hover:text-gray-700 tap-target"
                  >
                    ← Back to verification
                  </button>
                </div>
              </form>

              <div className="mt-5 sm:mt-6 p-3 sm:p-4 bg-gradient-to-r from-indigo-50 to-purple-50 rounded-xl">
                <h3 className="text-xs sm:text-sm font-semibold text-indigo-800 mb-2">💡 Quick Tips</h3>
                <ul className="text-xs text-indigo-700 space-y-1">
                  <li className="flex items-center gap-2">
                    <CheckCircle className="h-3 w-3" />
                    Multiple students will appear here
                  </li>
                  <li className="flex items-center gap-2">
                    <CheckCircle className="h-3 w-3" />
                    Select the student you want to pay for
                  </li>
                  <li className="flex items-center gap-2">
                    <CheckCircle className="h-3 w-3" />
                    You can switch students after logging in
                  </li>
                </ul>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return null;
}

export default StudentSearch;