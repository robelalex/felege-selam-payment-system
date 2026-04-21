// src/pages/SuperAdminDashboard.js
import React, { useState, useEffect } from 'react';
import { CheckCircle, XCircle, Users, Building2, Loader } from 'lucide-react';
import api from '../services/api';

function SuperAdminDashboard() {
  const [pendingSchools, setPendingSchools] = useState([]);
  const [loading, setLoading] = useState(true);
  const [processing, setProcessing] = useState(null);

  useEffect(() => {
    fetchPendingSchools();
  }, []);

  const fetchPendingSchools = async () => {
    try {
      const response = await api.get('/admin/pending-approvals/');
      setPendingSchools(response.data);
    } catch (err) {
      console.error('Error fetching pending schools:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleApprove = async (userId) => {
    setProcessing(userId);
    try {
      await api.post(`/admin/approve/${userId}/`);
      // Remove from list
      setPendingSchools(pendingSchools.filter(s => s.user_id !== userId));
      alert('School approved successfully!');
    } catch (err) {
      console.error('Error approving school:', err);
      alert('Failed to approve school');
    } finally {
      setProcessing(null);
    }
  };

  const handleReject = async (userId) => {
    setProcessing(userId);
    try {
      await api.post(`/admin/reject/${userId}/`);
      setPendingSchools(pendingSchools.filter(s => s.user_id !== userId));
      alert('School rejected');
    } catch (err) {
      console.error('Error rejecting school:', err);
      alert('Failed to reject school');
    } finally {
      setProcessing(null);
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
      <div>
        <h1 className="text-3xl font-bold text-gray-900">Super Admin Dashboard</h1>
        <p className="text-gray-500 mt-1">Manage school registrations</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Stats */}
        <div className="bg-white rounded-xl shadow-sm p-6 border border-gray-100">
          <div className="flex items-center gap-4">
            <div className="p-3 bg-yellow-100 rounded-xl">
              <Building2 className="h-6 w-6 text-yellow-600" />
            </div>
            <div>
              <p className="text-sm text-gray-500">Pending Approvals</p>
              <p className="text-2xl font-bold text-gray-900">{pendingSchools.length}</p>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-xl shadow-sm p-6 border border-gray-100">
          <div className="flex items-center gap-4">
            <div className="p-3 bg-green-100 rounded-xl">
              <Users className="h-6 w-6 text-green-600" />
            </div>
            <div>
              <p className="text-sm text-gray-500">Total Schools</p>
              <p className="text-2xl font-bold text-gray-900">-</p>
            </div>
          </div>
        </div>
      </div>

      {/* Pending Schools List */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-100">
          <h2 className="text-lg font-semibold text-gray-900">Pending School Registrations</h2>
        </div>
        
        {pendingSchools.length === 0 ? (
          <div className="p-12 text-center">
            <CheckCircle className="h-12 w-12 text-green-500 mx-auto mb-4" />
            <p className="text-gray-500">No pending approvals</p>
          </div>
        ) : (
          <div className="divide-y divide-gray-100">
            {pendingSchools.map((school) => (
              <div key={school.user_id} className="p-6 flex items-center justify-between">
                <div className="flex items-center gap-4">
                  {school.logo ? (
                    <img src={school.logo} alt={school.school_name} className="h-12 w-12 rounded-lg object-cover" />
                  ) : (
                    <div className="h-12 w-12 bg-gray-100 rounded-lg flex items-center justify-center">
                      <Building2 className="h-6 w-6 text-gray-400" />
                    </div>
                  )}
                  <div>
                    <h3 className="font-semibold text-gray-900">{school.school_name}</h3>
                    <p className="text-sm text-gray-500">Code: {school.school_code}</p>
                    <p className="text-sm text-gray-500">Admin: {school.first_name} {school.last_name}</p>
                    <p className="text-sm text-gray-500">Email: {school.email}</p>
                  </div>
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={() => handleApprove(school.user_id)}
                    disabled={processing === school.user_id}
                    className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors flex items-center gap-2"
                  >
                    {processing === school.user_id ? (
                      <Loader className="h-4 w-4 animate-spin" />
                    ) : (
                      <CheckCircle className="h-4 w-4" />
                    )}
                    Approve
                  </button>
                  <button
                    onClick={() => handleReject(school.user_id)}
                    disabled={processing === school.user_id}
                    className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors flex items-center gap-2"
                  >
                    <XCircle className="h-4 w-4" />
                    Reject
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

export default SuperAdminDashboard;