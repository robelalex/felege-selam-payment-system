// src/pages/EnterStudentId.js
import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Key, ArrowRight, AlertCircle, Loader, Shield, GraduationCap, CheckCircle } from 'lucide-react';
import api from '../services/api';

function EnterStudentId() {
  const navigate = useNavigate();
  const [studentId, setStudentId] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [parentEmail, setParentEmail] = useState('');

  useEffect(() => {
    const parentSession = localStorage.getItem('parentSession');
    if (!parentSession) {
      navigate('/parent/login');
      return;
    }
    
    const session = JSON.parse(parentSession);
    setParentEmail(session.email);
  }, [navigate]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    try {
      // ✅ CHANGED: Removed /api/ prefix (baseURL already has it)
      const response = await api.get(`/students/search_by_id/?student_id=${studentId}`);
      
      if (response.data) {
        const student = response.data;
        const parentSession = JSON.parse(localStorage.getItem('parentSession'));
        
        if (student.parent_email !== parentSession.email) {
          setError(`This student ID (${studentId}) is not linked to ${parentSession.email}. Please contact your school.`);
          setLoading(false);
          return;
        }
        
        localStorage.setItem('selectedStudent', JSON.stringify(student));
        localStorage.setItem('isParent', 'true');
        
        navigate(`/parent/dashboard/${student.id}`);
      }
    } catch (err) {
      console.error('Student ID error:', err);
      if (err.response?.status === 404) {
        setError(`Student ID "${studentId}" not found. Please check and try again.`);
      } else {
        setError(err.response?.data?.error || 'Failed to verify student ID. Please try again.');
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-green-50 via-white to-teal-50 flex items-center justify-center p-4">
      <div className="max-w-md w-full">
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center p-3 bg-green-100 rounded-full mb-4">
            <GraduationCap className="h-8 w-8 text-green-600" />
          </div>
          <h1 className="text-3xl font-bold text-gray-900">Access Student Portal</h1>
          <p className="text-gray-600 mt-2">
            Verified as: <strong className="text-green-600">{parentEmail}</strong>
          </p>
          <p className="text-gray-500 text-sm mt-1">Enter your child's student ID to continue</p>
        </div>

        <div className="bg-white rounded-2xl shadow-xl p-8">
          <form onSubmit={handleSubmit} className="space-y-6">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Student ID
              </label>
              <div className="relative">
                <Key className="absolute left-3 top-1/2 transform -translate-y-1/2 h-5 w-5 text-gray-400" />
                <input
                  type="text"
                  value={studentId}
                  onChange={(e) => setStudentId(e.target.value.toUpperCase())}
                  className="w-full pl-10 pr-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent"
                  placeholder="e.g., FS-2024-1001"
                  required
                  autoFocus
                />
              </div>
              <p className="text-sm text-gray-500 mt-2">
                Enter the student ID provided by your school
              </p>
            </div>

            {error && (
              <div className="bg-red-50 border-l-4 border-red-500 p-4 rounded">
                <div className="flex items-center">
                  <AlertCircle className="h-5 w-5 text-red-500 mr-2" />
                  <p className="text-red-700 text-sm">{error}</p>
                </div>
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full bg-green-600 text-white py-3 rounded-lg font-medium hover:bg-green-700 transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
            >
              {loading ? (
                <>
                  <Loader className="h-5 w-5 animate-spin" />
                  Verifying Student ID...
                </>
              ) : (
                <>
                  Access Dashboard
                  <ArrowRight className="h-5 w-5" />
                </>
              )}
            </button>
          </form>

          <div className="mt-6 p-4 bg-gray-50 rounded-lg">
            <div className="flex items-center gap-2 text-sm text-gray-600 mb-2">
              <Shield className="h-4 w-4 text-green-500" />
              <span className="font-medium">Secure Two-Step Verification Complete</span>
            </div>
            <div className="space-y-1 text-xs text-gray-500">
              <p className="flex items-center gap-2">
                <CheckCircle className="h-3 w-3 text-green-500" />
                ✓ Email verified with OTP code
              </p>
              <p className="flex items-center gap-2">
                <CheckCircle className="h-3 w-3 text-green-500" />
                ✓ Student ID verified and matched to your email
              </p>
              <p className="flex items-center gap-2">
                <CheckCircle className="h-3 w-3 text-green-500" />
                ✓ Secure access granted
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default EnterStudentId;