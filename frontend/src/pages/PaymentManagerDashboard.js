// src/pages/PaymentManagerDashboard.js
import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { CreditCard, DollarSign, Clock, CheckCircle, Eye, Receipt, TrendingUp, Loader, RefreshCw } from 'lucide-react';
import api from '../services/api';

function PaymentManagerDashboard() {
  const [stats, setStats] = useState({
    total_collected: 0,
    pending_verifications: 0,
    verified_payments: 0,
    pending_slips: 0
  });
  const [loading, setLoading] = useState(true);
  const [recentPayments, setRecentPayments] = useState([]);
  const [pendingSlips, setPendingSlips] = useState([]);

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    setLoading(true);
    try {
      const schoolId = JSON.parse(localStorage.getItem('selectedSchool') || '{}').id;
      
      // Fetch payments
      const paymentsRes = await api.get('/payments/', {
        headers: { 'X-School-ID': schoolId }
      });
      
      const payments = paymentsRes.data;
      const verified = payments.filter(p => p.status === 'verified');
      const pending = payments.filter(p => p.status === 'pending');
      const totalCollected = verified.reduce((sum, p) => sum + parseFloat(p.amount), 0);
      
      // Fetch pending slips
      const slipsRes = await api.get('/slips/pending/', {
        headers: { 'X-School-ID': schoolId }
      });
      
      setStats({
        total_collected: totalCollected,
        pending_verifications: pending.length,
        verified_payments: verified.length,
        pending_slips: slipsRes.data?.length || 0
      });
      
      setRecentPayments(payments.slice(0, 5));
      setPendingSlips(slipsRes.data?.slice(0, 5) || []);
      
    } catch (err) {
      console.error('Error fetching data:', err);
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
        <h1 className="text-2xl md:text-3xl font-bold text-gray-900">Payment Manager Dashboard</h1>
        <p className="text-gray-600 mt-1">Manage and verify all financial transactions</p>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white rounded-xl shadow-lg p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-500">Total Collected</p>
              <p className="text-3xl font-bold text-green-600">ETB {stats.total_collected.toLocaleString()}</p>
            </div>
            <div className="p-3 bg-green-100 rounded-full">
              <DollarSign className="h-6 w-6 text-green-600" />
            </div>
          </div>
        </div>

        <div className="bg-white rounded-xl shadow-lg p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-500">Pending Verifications</p>
              <p className="text-3xl font-bold text-yellow-600">{stats.pending_verifications}</p>
            </div>
            <div className="p-3 bg-yellow-100 rounded-full">
              <Clock className="h-6 w-6 text-yellow-600" />
            </div>
          </div>
        </div>

        <div className="bg-white rounded-xl shadow-lg p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-500">Verified Payments</p>
              <p className="text-3xl font-bold text-blue-600">{stats.verified_payments}</p>
            </div>
            <div className="p-3 bg-blue-100 rounded-full">
              <CheckCircle className="h-6 w-6 text-blue-600" />
            </div>
          </div>
        </div>

        <div className="bg-white rounded-xl shadow-lg p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-500">Pending Bank Slips</p>
              <p className="text-3xl font-bold text-red-600">{stats.pending_slips}</p>
            </div>
            <div className="p-3 bg-red-100 rounded-full">
              <Eye className="h-6 w-6 text-red-600" />
            </div>
          </div>
        </div>
      </div>

      {/* Quick Actions */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Link to="/admin/slips" className="bg-gradient-to-r from-red-500 to-red-600 rounded-xl shadow-lg p-6 text-white hover:shadow-xl transition-all">
          <Eye className="h-8 w-8 mb-3" />
          <h3 className="text-lg font-semibold">Verify Bank Slips</h3>
          <p className="text-red-100 text-sm mt-1">Review and verify uploaded bank slips</p>
        </Link>

        <Link to="/admin/payments" className="bg-gradient-to-r from-blue-500 to-blue-600 rounded-xl shadow-lg p-6 text-white hover:shadow-xl transition-all">
          <CreditCard className="h-8 w-8 mb-3" />
          <h3 className="text-lg font-semibold">View All Payments</h3>
          <p className="text-blue-100 text-sm mt-1">Complete payment history</p>
        </Link>
      </div>

      {/* Pending Slips */}
      {pendingSlips.length > 0 && (
        <div className="bg-white rounded-xl shadow-lg overflow-hidden">
          <div className="px-6 py-4 border-b border-gray-200">
            <h2 className="text-lg font-semibold text-gray-900">Pending Bank Slips</h2>
          </div>
          <div className="divide-y divide-gray-200">
            {pendingSlips.map((slip) => (
              <div key={slip.id} className="px-6 py-4 flex justify-between items-center">
                <div>
                  <p className="font-medium text-gray-900">{slip.student_name}</p>
                  <p className="text-sm text-gray-500">Amount: ETB {slip.amount}</p>
                </div>
                <Link to="/admin/slips" className="text-blue-600 hover:text-blue-800 text-sm font-medium">
                  Verify →
                </Link>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

export default PaymentManagerDashboard;