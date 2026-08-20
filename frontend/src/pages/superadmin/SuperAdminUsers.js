// src/pages/superadmin/SuperAdminUsers.js
import React, { useEffect, useState } from 'react';
import { Loader, MailCheck, MailWarning, UserX, UserCheck, Send } from 'lucide-react';
import toast from 'react-hot-toast';
import api from '../../services/api';
import SuperAdminLayout from '../../components/Layout/SuperAdminLayout';

function SuperAdminUsers() {
  const [admins, setAdmins] = useState([]);
  const [loading, setLoading] = useState(true);
  const [actingId, setActingId] = useState(null);

  useEffect(() => {
    fetchAdmins();
  }, []);

  const fetchAdmins = async () => {
    setLoading(true);
    try {
      const res = await api.get('/admin/school-admins/');
      setAdmins(res.data);
    } catch (err) {
      console.error(err);
      toast.error('Could not load school admins');
    } finally {
      setLoading(false);
    }
  };

  const toggleActive = async (admin) => {
    setActingId(admin.id);
    try {
      await api.post(`/admin/school-admins/${admin.id}/toggle-active/`, {
        is_active: !admin.is_active,
      });
      toast.success(admin.is_active ? 'Account deactivated' : 'Account reactivated');
      fetchAdmins();
    } catch (err) {
      console.error(err);
      toast.error('Action failed');
    } finally {
      setActingId(null);
    }
  };

  const resendVerification = async (admin) => {
    setActingId(admin.id);
    try {
      await api.post(`/admin/school-admins/${admin.id}/resend-verification/`);
      toast.success('Verification email resent');
    } catch (err) {
      console.error(err);
      toast.error(err.response?.data?.error || 'Could not resend email');
    } finally {
      setActingId(null);
    }
  };

  return (
    <SuperAdminLayout>
      <div className="mb-6">
        <p className="text-sm text-gray-400">School owners with an account on the platform</p>
        <h1 className="text-2xl font-semibold text-gray-900">School admins</h1>
      </div>

      <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center py-16">
            <Loader className="h-6 w-6 animate-spin text-gray-400" />
          </div>
        ) : admins.length === 0 ? (
          <p className="text-sm text-gray-500 text-center py-16">No school admin accounts yet.</p>
        ) : (
          <div className="divide-y divide-gray-100">
            {admins.map((admin) => (
              <div key={admin.id} className="px-5 py-4 flex items-center justify-between gap-4 flex-wrap">
                <div>
                  <p className="font-medium text-gray-900">
                    {admin.first_name} {admin.last_name} <span className="text-gray-400 font-normal">· {admin.school_name}</span>
                  </p>
                  <p className="text-xs text-gray-500">{admin.email}</p>
                  <div className="flex items-center gap-3 mt-1">
                    <span className={`text-xs px-2 py-0.5 rounded-full ${admin.is_active ? 'bg-green-100 text-green-700' : 'bg-gray-200 text-gray-600'}`}>
                      {admin.is_active ? 'Active' : 'Inactive'}
                    </span>
                    {admin.email_verified ? (
                      <span className="text-xs text-green-600 flex items-center gap-1"><MailCheck className="h-3 w-3" />Verified</span>
                    ) : (
                      <span className="text-xs text-amber-600 flex items-center gap-1"><MailWarning className="h-3 w-3" />Unverified</span>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                  {!admin.email_verified && (
                    <button
                      onClick={() => resendVerification(admin)}
                      disabled={actingId === admin.id}
                      className="text-xs font-medium px-3 py-1.5 rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-50 flex items-center gap-1 disabled:opacity-50"
                    >
                      <Send className="h-3 w-3" />Resend email
                    </button>
                  )}
                  <button
                    onClick={() => toggleActive(admin)}
                    disabled={actingId === admin.id}
                    className={`text-xs font-medium px-3 py-1.5 rounded-lg border flex items-center gap-1 disabled:opacity-50 ${
                      admin.is_active
                        ? 'border-red-200 text-red-600 hover:bg-red-50'
                        : 'border-green-200 text-green-700 hover:bg-green-50'
                    }`}
                  >
                    {actingId === admin.id ? (
                      <Loader className="h-3 w-3 animate-spin" />
                    ) : admin.is_active ? (
                      <><UserX className="h-3 w-3" />Deactivate</>
                    ) : (
                      <><UserCheck className="h-3 w-3" />Reactivate</>
                    )}
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

export default SuperAdminUsers;
