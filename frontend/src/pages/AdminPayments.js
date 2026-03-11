// src/pages/AdminPayments.js
import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { 
  Search, 
  Filter, 
  Download, 
  CheckCircle,
  Clock,
  XCircle,
  ChevronLeft,
  ChevronRight,
  CreditCard
} from 'lucide-react';
import axios from 'axios';

function AdminPayments() {
  const [payments, setPayments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterStatus, setFilterStatus] = useState('all');

  useEffect(() => {
    fetchPayments();
  }, []);

  const fetchPayments = async () => {
    try {
      const response = await axios.get('http://127.0.0.1:8000/api/payments/');
      setPayments(response.data);
    } catch (err) {
      console.error('Error fetching payments:', err);
    } finally {
      setLoading(false);
    }
  };

  const verifyPayment = async (paymentId) => {
    try {
      await axios.post(`http://127.0.0.1:8000/api/payments/${paymentId}/verify_payment/`);
      fetchPayments(); // Refresh the list
    } catch (err) {
      console.error('Error verifying payment:', err);
    }
  };

  const filteredPayments = payments.filter(payment => {
    const matchesSearch = 
      payment.student_name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      payment.transaction_reference?.toLowerCase().includes(searchTerm.toLowerCase());
    
    const matchesStatus = filterStatus === 'all' || payment.status === filterStatus;
    
    return matchesSearch && matchesStatus;
  });

  const getStatusIcon = (status) => {
    switch(status) {
      case 'verified':
        return <CheckCircle className="h-4 w-4 text-green-600" />;
      case 'pending':
        return <Clock className="h-4 w-4 text-yellow-600" />;
      case 'rejected':
        return <XCircle className="h-4 w-4 text-red-600" />;
      default:
        return null;
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold text-gray-900">Payments Management</h1>
          <p className="text-sm md:text-base text-gray-600 mt-1">
            Total {payments.length} transactions
          </p>
        </div>
        
        <button className="btn-outline flex items-center gap-2 self-start">
          <Download className="h-4 w-4" />
          Export Report
        </button>
      </div>

      {/* Filters */}
      <div className="bg-white rounded-xl shadow-lg p-4 md:p-6">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-5 w-5 text-gray-400" />
            <input
              type="text"
              placeholder="Search by student or reference..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="input-field pl-10"
            />
          </div>
          
          <select
            value={filterStatus}
            onChange={(e) => setFilterStatus(e.target.value)}
            className="input-field"
          >
            <option value="all">All Status</option>
            <option value="verified">Verified</option>
            <option value="pending">Pending</option>
            <option value="rejected">Rejected</option>
          </select>
          
          <button className="btn-outline flex items-center justify-center gap-2">
            <Filter className="h-4 w-4" />
            Date Range
          </button>
        </div>
      </div>

      {/* Payments Table */}
      <div className="bg-white rounded-xl shadow-lg overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gray-50">
              <tr>
                <th className="table-header">Student</th>
                <th className="table-header">Amount</th>
                <th className="table-header">Month</th>
                <th className="table-header">Method</th>
                <th className="table-header">Reference</th>
                <th className="table-header">Status</th>
                <th className="table-header">Date</th>
                <th className="table-header">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {filteredPayments.map((payment) => (
                <tr key={payment.id} className="table-row">
                  <td className="table-cell font-medium">{payment.student_name}</td>
                  <td className="table-cell font-semibold">{payment.amount} Birr</td>
                  <td className="table-cell">{payment.deadline_month}</td>
                  <td className="table-cell capitalize">{payment.payment_method}</td>
                  <td className="table-cell font-mono text-sm">{payment.transaction_reference || 'N/A'}</td>
                  <td className="table-cell">
                    <span className={`badge flex items-center gap-1 w-fit ${
                      payment.status === 'verified' ? 'badge-success' :
                      payment.status === 'pending' ? 'badge-warning' : 'badge-error'
                    }`}>
                      {getStatusIcon(payment.status)}
                      {payment.status}
                    </span>
                  </td>
                  <td className="table-cell">
                    {new Date(payment.created_at).toLocaleDateString()}
                  </td>
                  <td className="table-cell">
                    {payment.status === 'pending' && (
                      <button
                        onClick={() => verifyPayment(payment.id)}
                        className="btn-primary text-sm py-1 px-3"
                      >
                        Verify
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        <div className="px-6 py-4 bg-gray-50 border-t border-gray-200">
          <div className="flex items-center justify-between">
            <p className="text-sm text-gray-600">
              Showing 1 to {filteredPayments.length} of {payments.length} payments
            </p>
            <div className="flex gap-2">
              <button className="p-2 bg-white rounded border hover:bg-gray-50">
                <ChevronLeft className="h-4 w-4" />
              </button>
              <button className="px-3 py-1 bg-primary-600 text-white rounded hover:bg-primary-700">
                1
              </button>
              <button className="px-3 py-1 bg-white rounded border hover:bg-gray-50">
                2
              </button>
              <button className="px-3 py-1 bg-white rounded border hover:bg-gray-50">
                3
              </button>
              <button className="p-2 bg-white rounded border hover:bg-gray-50">
                <ChevronRight className="h-4 w-4" />
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default AdminPayments;