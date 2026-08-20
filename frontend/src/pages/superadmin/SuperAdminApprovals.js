// src/pages/superadmin/SuperAdminApprovals.js
import React, { useEffect, useState } from 'react';
import { CheckCircle, XCircle, Building2, Loader, MailCheck, MailWarning } from 'lucide-react';
import toast from 'react-hot-toast';
import api from '../../services/api';
import SuperAdminLayout from '../../components/Layout/SuperAdminLayout';

function SuperAdminApprovals() {
  const [pending, setPending] = useState([]);
  const [loading, setLoading] = useState(true);
  const [processing, setProcessing] = useState(null);

  useEffect(() => {
    fetchPending();
  }, []);

  const fetchPending = async () => {
    setLoading(true);
    try {
      const res = await api.get('/admin/pending-approvals/');
      setPending(res.data);
    } catch (err) {
      console.error(err);
      toast.error('Could not load pending approvals');
    } finally {
      setLoading(false);
    }
  };

  const handleApprove = async (userId) => {
    setProcessing(userId);
    try {
      await api.post(`/admin/approve/${userId}/`);
      setPending((p) => p.filter((s) => s.user_id !== userId));
      toast.success('School approved');
    } catch (err) {
      console.error(err);
      toast.error('Failed to approve');
    } finally {
      setProcessing(null);
    }
  };

  const handleReject = async (userId) => {
    if (!window.confirm('Reject this school registration? This removes the registration entirely.')) return;
    setProcessing(userId);
    try {
      await api.post(`/admin/reject/${userId}/`);
      setPending((p) => p.filter((s) => s.user_id !== userId));
      toast.success('School rejected');
    } catch (err) {
      console.error(err);
      toast.error('Failed to reject');
    } finally {
      setProcessing(null);
    }
  };

  return (
    <SuperAdminLayout pendingCount={pending.length}>
      <div className="mb-6">
        <p className="text-sm text-gray-400">Registrations awaiting your decision</p>
        <h1 className="text-2xl font-semibold text-gray-900">Pending approvals</h1>
      </div>

      <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center py-16">
            <Loader className="h-6 w-6 animate-spin text-gray-400" />
          </div>
        ) : pending.length === 0 ? (
          <div className="text-center py-16">
            <CheckCircle className="h-10 w-10 text-green-500 mx-auto mb-3" />
            <p className="text-sm text-gray-500">No pending approvals.</p>
          </div>
        ) : (
          <div className="divide-y divide-gray-100">
            {pending.map((school) => (
              <div key={school.user_id} className="p-5 flex items-center justify-between gap-4 flex-wrap">
                <div className="flex items-center gap-4 min-w-0">
                  {school.logo ? (
                    <img src={school.logo} alt="" className="h-12 w-12 rounded-lg object-cover flex-shrink-0" />
                  ) : (
                    <div className="h-12 w-12 bg-gray-100 rounded-lg flex items-center justify-center flex-shrink-0">
                      <Building2 className="h-6 w-6 text-gray-400" />
                    </div>
                  )}
                  <div className="min-w-0">
                    <h3 className="font-medium text-gray-900">{school.school_name}</h3>
                    <p className="text-xs text-gray-500">Code: {school.school_code}</p>
                    <p className="text-xs text-gray-500">
                      {school.first_name} {school.last_name} · {school.email}
                    </p>
                    {school.email_verified ? (
                      <p className="text-xs text-green-600 flex items-center gap-1 mt-0.5">
                        <MailCheck className="h-3 w-3" />Email confirmed
                      </p>
                    ) : (
                      <p className="text-xs text-amber-600 flex items-center gap-1 mt-0.5">
                        <MailWarning className="h-3 w-3" />Email not confirmed yet
                      </p>
                    )}
                  </div>
                </div>
                <div className="flex gap-2 flex-shrink-0">
                  <button
                    onClick={() => handleApprove(school.user_id)}
                    disabled={processing === school.user_id}
                    className="px-3 py-1.5 bg-green-600 text-white text-sm rounded-lg hover:bg-green-700 disabled:opacity-50 flex items-center gap-1.5"
                  >
                    {processing === school.user_id ? <Loader className="h-3.5 w-3.5 animate-spin" /> : <CheckCircle className="h-3.5 w-3.5" />}
                    Approve
                  </button>
                  <button
                    onClick={() => handleReject(school.user_id)}
                    disabled={processing === school.user_id}
                    className="px-3 py-1.5 bg-red-600 text-white text-sm rounded-lg hover:bg-red-700 disabled:opacity-50 flex items-center gap-1.5"
                  >
                    <XCircle className="h-3.5 w-3.5" />
                    Reject
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </SuperAdminLayout>
  );
}

export default SuperAdminApprovals;
