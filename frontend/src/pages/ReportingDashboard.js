// src/pages/ReportingDashboard.js
import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { BarChart3, FileText, Download, TrendingUp, DollarSign, Users, CreditCard, Loader, RefreshCw } from 'lucide-react';
import api from '../services/api';

function ReportingDashboard() {
  const [summary, setSummary] = useState({
    total_students: 0,
    total_collected: 0,
    collection_rate: 0
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchSummary();
  }, []);

  const fetchSummary = async () => {
    setLoading(true);
    try {
      const schoolId = JSON.parse(localStorage.getItem('selectedSchool') || '{}').id;
      
      // Fetch students
      const studentsRes = await api.get('/students/', {
        headers: { 'X-School-ID': schoolId }
      });
      
      // Fetch payments
      const paymentsRes = await api.get('/payments/', {
        headers: { 'X-School-ID': schoolId }
      });
      
      const payments = paymentsRes.data || [];
      const verifiedPayments = payments.filter(p => p.status === 'verified');
      const totalCollected = verifiedPayments.reduce((sum, p) => sum + parseFloat(p.amount), 0);
      
      setSummary({
        total_students: studentsRes.data?.length || 0,
        total_collected: totalCollected,
        collection_rate: studentsRes.data?.length > 0 
          ? ((verifiedPayments.length / studentsRes.data.length) * 100).toFixed(1)
          : 0
      });
      
    } catch (err) {
      console.error('Error fetching summary:', err);
    } finally {
      setLoading(false);
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
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl md:text-3xl font-bold text-gray-900">Reporting Dashboard</h1>
        <p className="text-gray-600 mt-1">Generate and export reports</p>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-white rounded-xl shadow-lg p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-500">Total Students</p>
              <p className="text-3xl font-bold text-blue-600">{summary.total_students}</p>
            </div>
            <div className="p-3 bg-blue-100 rounded-full">
              <Users className="h-6 w-6 text-blue-600" />
            </div>
          </div>
        </div>

        <div className="bg-white rounded-xl shadow-lg p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-500">Total Collected</p>
              <p className="text-3xl font-bold text-green-600">ETB {summary.total_collected.toLocaleString()}</p>
            </div>
            <div className="p-3 bg-green-100 rounded-full">
              <DollarSign className="h-6 w-6 text-green-600" />
            </div>
          </div>
        </div>

        <div className="bg-white rounded-xl shadow-lg p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-500">Collection Rate</p>
              <p className="text-3xl font-bold text-purple-600">{summary.collection_rate}%</p>
            </div>
            <div className="p-3 bg-purple-100 rounded-full">
              <TrendingUp className="h-6 w-6 text-purple-600" />
            </div>
          </div>
        </div>
      </div>

      {/* Report Options */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Link to="/admin/reports" className="bg-white rounded-xl shadow-lg p-6 hover:shadow-xl transition-all border border-gray-100">
          <div className="flex items-center gap-4">
            <div className="p-3 bg-indigo-100 rounded-xl">
              <BarChart3 className="h-6 w-6 text-indigo-600" />
            </div>
            <div className="flex-1">
              <h3 className="font-semibold text-gray-900">Financial Reports</h3>
              <p className="text-sm text-gray-500">Payment reports and analytics</p>
            </div>
            <Download className="h-5 w-5 text-gray-400" />
          </div>
        </Link>

        <Link to="/admin/reports" className="bg-white rounded-xl shadow-lg p-6 hover:shadow-xl transition-all border border-gray-100">
          <div className="flex items-center gap-4">
            <div className="p-3 bg-green-100 rounded-xl">
              <FileText className="h-6 w-6 text-green-600" />
            </div>
            <div className="flex-1">
              <h3 className="font-semibold text-gray-900">Student Reports</h3>
              <p className="text-sm text-gray-500">Enrollment and grade reports</p>
            </div>
            <Download className="h-5 w-5 text-gray-400" />
          </div>
        </Link>
      </div>
    </div>
  );
}

export default ReportingDashboard;