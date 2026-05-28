// src/pages/AdminPayments.js
import React, { useState, useEffect } from 'react';
import { 
  Download, 
  CheckCircle,
  Clock,
  XCircle,
  DollarSign,
  RefreshCw,
} from 'lucide-react';
import api from '../services/api';
import { useYear } from '../context/YearContext';

function AdminPayments() {
  const [payments, setPayments] = useState([]);
  const [loading, setLoading] = useState(true);
  const { selectedYear } = useYear();

  useEffect(() => {
    fetchPayments();
  }, [selectedYear]);

  const fetchPayments = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (selectedYear && selectedYear.id) {
        params.append('academic_year_id', selectedYear.id);
      }
      
      const queryString = params.toString();
      const url = queryString ? `/payments-filtered/?${queryString}` : '/payments-filtered/';
      
      const savedSchool = localStorage.getItem('selectedSchool');
      let schoolId = null;
      if (savedSchool) {
        try {
          const school = JSON.parse(savedSchool);
          schoolId = school.id;
        } catch (e) {
          console.error('Error parsing school:', e);
        }
      }
      
      const response = await api.get(url, {
        headers: schoolId ? { 'X-School-ID': schoolId } : {}
      });
      
      setPayments(response.data);
    } catch (err) {
      console.error('Error fetching payments:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleExport = async () => {
    try {
      const params = new URLSearchParams();
      if (selectedYear && selectedYear.id) {
        params.append('academic_year_id', selectedYear.id);
      }
      
      const queryString = params.toString();
      const url = queryString ? `/payments/export/?${queryString}` : '/payments/export/';
      
      const response = await api.get(url, { responseType: 'blob' });
      const url_blob = window.URL.createObjectURL(new Blob([response.data]));
      const link = document.createElement('a');
      link.href = url_blob;
      link.setAttribute('download', `payments_${selectedYear?.name || 'all'}_${new Date().toISOString().slice(0,10)}.xlsx`);
      document.body.appendChild(link);
      link.click();
      link.remove();
    } catch (err) {
      console.error('Export failed:', err);
      alert('Failed to export payments');
    }
  };

  const totalAmount = payments.reduce((sum, p) => sum + parseFloat(p.amount || 0), 0);
  const verifiedCount = payments.filter(p => p.status === 'verified').length;
  const pendingCount = payments.filter(p => p.status === 'pending').length;
  const rejectedCount = payments.filter(p => p.status === 'rejected').length;

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <RefreshCw className="h-8 w-8 animate-spin text-primary-600" />
      </div>
    );
  }

  return (
    <div className="space-y-6 pb-20 md:pb-0">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold text-gray-900">Payment Management</h1>
          <p className="text-sm md:text-base text-gray-600 mt-1">
            {selectedYear ? (
              <span className="text-primary-600 font-medium">
                📅 {selectedYear.name || selectedYear.year_ec + ' E.C.'}
              </span>
            ) : (
              'No academic year selected'
            )}
          </p>
        </div>
        
        <div className="flex gap-2 flex-wrap">
          <button onClick={handleExport} className="btn-outline flex items-center gap-2 tap-target">
            <Download className="h-4 w-4" />
            <span className="hidden sm:inline">Export</span>
          </button>
          <button onClick={fetchPayments} className="btn-outline flex items-center gap-2 tap-target">
            <RefreshCw className="h-4 w-4" />
            <span className="hidden sm:inline">Refresh</span>
          </button>
        </div>
      </div>

      {/* Stats Cards Only - No Table */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 md:gap-4">
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-3 md:p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs md:text-sm text-gray-500">Total Amount</p>
              <p className="text-lg md:text-2xl font-bold text-gray-900">{totalAmount.toLocaleString()} Birr</p>
            </div>
            <div className="p-2 md:p-3 bg-blue-100 rounded-full">
              <DollarSign className="h-4 w-4 md:h-5 md:w-5 text-blue-600" />
            </div>
          </div>
        </div>
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-3 md:p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs md:text-sm text-gray-500">Verified</p>
              <p className="text-lg md:text-2xl font-bold text-green-600">{verifiedCount}</p>
            </div>
            <div className="p-2 md:p-3 bg-green-100 rounded-full">
              <CheckCircle className="h-4 w-4 md:h-5 md:w-5 text-green-600" />
            </div>
          </div>
        </div>
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-3 md:p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs md:text-sm text-gray-500">Pending</p>
              <p className="text-lg md:text-2xl font-bold text-yellow-600">{pendingCount}</p>
            </div>
            <div className="p-2 md:p-3 bg-yellow-100 rounded-full">
              <Clock className="h-4 w-4 md:h-5 md:w-5 text-yellow-600" />
            </div>
          </div>
        </div>
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-3 md:p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs md:text-sm text-gray-500">Rejected</p>
              <p className="text-lg md:text-2xl font-bold text-red-600">{rejectedCount}</p>
            </div>
            <div className="p-2 md:p-3 bg-red-100 rounded-full">
              <XCircle className="h-4 w-4 md:h-5 md:w-5 text-red-600" />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default AdminPayments;