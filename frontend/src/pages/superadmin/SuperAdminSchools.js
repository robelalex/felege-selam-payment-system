// src/pages/superadmin/SuperAdminSchools.js
import React, { useEffect, useState, useCallback } from 'react';
import { Search, Building2, Loader, CheckCircle2, PauseCircle, XCircle, Clock, ShieldOff } from 'lucide-react';
import toast from 'react-hot-toast';
import api from '../../services/api';
import SuperAdminLayout from '../../components/Layout/SuperAdminLayout';

const STATUS_META = {
  approved: { label: 'Approved', className: 'bg-green-100 text-green-700', icon: CheckCircle2 },
  pending: { label: 'Pending', className: 'bg-amber-100 text-amber-700', icon: Clock },
  suspended: { label: 'Suspended', className: 'bg-gray-200 text-gray-700', icon: PauseCircle },
  rejected: { label: 'Rejected', className: 'bg-red-100 text-red-700', icon: XCircle },
};

function StatusBadge({ status }) {
  const meta = STATUS_META[status] || STATUS_META.pending;
  const Icon = meta.icon;
  return (
    <span className={`inline-flex items-center gap-1 text-xs font-medium px-2 py-1 rounded-full ${meta.className}`}>
      <Icon className="h-3 w-3" />
      {meta.label}
    </span>
  );
}

function SuperAdminSchools() {
  const [schools, setSchools] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [actingId, setActingId] = useState(null);

  const fetchSchools = useCallback(async () => {
    setLoading(true);
    try {
      const params = {};
      if (search.trim()) params.search = search.trim();
      if (statusFilter) params.status = statusFilter;
      const res = await api.get('/admin/schools-list/', { params });
      setSchools(res.data);
    } catch (err) {
      console.error('Error fetching schools:', err);
      toast.error('Could not load schools');
    } finally {
      setLoading(false);
    }
  }, [search, statusFilter]);

  useEffect(() => {
    const t = setTimeout(fetchSchools, 300);
    return () => clearTimeout(t);
  }, [fetchSchools]);

  const handleSuspendToggle = async (school) => {
    const nextStatus = school.subscription_status === 'suspended' ? 'approved' : 'suspended';
    setActingId(school.id);
    try {
      await api.patch(`/admin/schools-list/${school.id}/subscription/`, {
        subscription_status: nextStatus,
      });
      toast.success(nextStatus === 'suspended' ? 'School suspended' : 'School reactivated');
      fetchSchools();
    } catch (err) {
      console.error(err);
      toast.error('Action failed');
    } finally {
      setActingId(null);
    }
  };

  return (
    <SuperAdminLayout>
      <div className="mb-6 flex items-center justify-between flex-wrap gap-3">
        <div>
          <p className="text-sm text-gray-400">All schools</p>
          <h1 className="text-2xl font-semibold text-gray-900">Schools</h1>
        </div>
      </div>

      <div className="flex items-center gap-3 mb-4 flex-wrap">
        <div className="relative flex-1 min-w-[220px]">
          <Search className="h-4 w-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by name or code"
            className="w-full pl-9 pr-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-200"
          />
        </div>
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="border border-gray-200 rounded-lg text-sm px-3 py-2"
        >
          <option value="">All statuses</option>
          <option value="approved">Approved</option>
          <option value="pending">Pending</option>
          <option value="suspended">Suspended</option>
          <option value="rejected">Rejected</option>
        </select>
      </div>

      <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center py-16">
            <Loader className="h-6 w-6 animate-spin text-gray-400" />
          </div>
        ) : schools.length === 0 ? (
          <p className="text-sm text-gray-500 text-center py-16">No schools match this search.</p>
        ) : (
          <div className="divide-y divide-gray-100">
            {schools.map((school) => (
              <div key={school.id} className="px-5 py-4 flex items-center justify-between gap-4 flex-wrap">
                <div className="flex items-center gap-3 min-w-0">
                  <div className="h-10 w-10 rounded-lg bg-gray-100 flex items-center justify-center flex-shrink-0">
                    <Building2 className="h-5 w-5 text-gray-400" />
                  </div>
                  <div className="min-w-0">
                    <p className="font-medium text-gray-900 truncate">{school.name}</p>
                    <p className="text-xs text-gray-500">
                      {school.code}{school.city ? ` · ${school.city}` : ''}
                      {school.subscription_expiry ? ` · expires ${school.subscription_expiry}` : ''}
                    </p>
                    <p className="text-xs text-gray-400">
                      Admin: {school.admin_name || '—'} {school.admin_email ? `(${school.admin_email})` : ''}
                      {school.admin_email_verified === false && (
                        <span className="ml-1 text-amber-600">· email unverified</span>
                      )}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-3 flex-shrink-0">
                  <StatusBadge status={school.subscription_status} />
                  {school.subscription_status !== 'pending' && school.subscription_status !== 'rejected' && (
                    <button
                      onClick={() => handleSuspendToggle(school)}
                      disabled={actingId === school.id}
                      className={`text-xs font-medium px-3 py-1.5 rounded-lg border transition-colors ${
                        school.subscription_status === 'suspended'
                          ? 'border-green-200 text-green-700 hover:bg-green-50'
                          : 'border-gray-200 text-gray-600 hover:bg-gray-50'
                      }`}
                    >
                      {actingId === school.id ? (
                        <Loader className="h-3.5 w-3.5 animate-spin" />
                      ) : school.subscription_status === 'suspended' ? (
                        'Reactivate'
                      ) : (
                        <span className="flex items-center gap-1"><ShieldOff className="h-3 w-3" />Suspend</span>
                      )}
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </SuperAdminLayout>
  );
}

export default SuperAdminSchools;
