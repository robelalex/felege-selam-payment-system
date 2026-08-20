// src/components/Layout/SuperAdminLayout.js
//
// ✅ NEW — Item 8 redesign. Deliberately visually distinct from
// AdminLayout.js (dark sidebar vs white) so it's never ambiguous which
// surface you're in: this is the platform-owner view across all schools,
// not one school's own admin panel.
import React, { useEffect, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import {
  ShieldCheck, LayoutDashboard, Building2, ClipboardCheck, Users,
  LogOut, Menu, X,
} from 'lucide-react';

const NAV_ITEMS = [
  { to: '/superadmin/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { to: '/superadmin/schools', label: 'Schools', icon: Building2 },
  { to: '/superadmin/approvals', label: 'Pending approvals', icon: ClipboardCheck },
  { to: '/superadmin/school-admins', label: 'School admins', icon: Users },
];

function SuperAdminLayout({ children, pendingCount = 0 }) {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [adminUser, setAdminUser] = useState(null);
  const location = useLocation();
  const navigate = useNavigate();

  useEffect(() => {
    const raw = localStorage.getItem('adminUser');
    if (raw) setAdminUser(JSON.parse(raw));
  }, []);

  const handleLogout = () => {
    localStorage.removeItem('isAdmin');
    localStorage.removeItem('adminUser');
    localStorage.removeItem('access_token');
    localStorage.removeItem('refresh_token');
    localStorage.removeItem('selectedSchool');
    navigate('/admin/login');
  };

  const currentLabel = NAV_ITEMS.find((i) => location.pathname.startsWith(i.to))?.label || 'Dashboard';

  return (
    <div className="min-h-screen flex bg-gray-50">
      {sidebarOpen && (
        <div
          className="fixed inset-0 bg-black/40 z-40 lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      <aside
        className={`fixed lg:sticky top-0 left-0 h-screen w-64 bg-slate-900 text-slate-200 flex flex-col z-50 transition-transform duration-200 ${
          sidebarOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'
        }`}
      >
        <div className="flex items-center gap-2 px-5 py-5 border-b border-slate-800">
          <ShieldCheck className="h-6 w-6 text-indigo-400" />
          <div>
            <p className="text-sm font-semibold text-white leading-tight">Platform admin</p>
            <p className="text-xs text-slate-400 leading-tight">SchoolPay Ethiopia</p>
          </div>
          <button
            className="ml-auto lg:hidden text-slate-400"
            onClick={() => setSidebarOpen(false)}
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <nav className="flex-1 px-3 py-4 space-y-1">
          {NAV_ITEMS.map(({ to, label, icon: Icon }) => {
            const active = location.pathname.startsWith(to);
            return (
              <Link
                key={to}
                to={to}
                onClick={() => setSidebarOpen(false)}
                className={`flex items-center justify-between gap-3 px-3 py-2 rounded-lg text-sm transition-colors ${
                  active
                    ? 'bg-indigo-500/15 text-white font-medium'
                    : 'text-slate-300 hover:bg-slate-800 hover:text-white'
                }`}
              >
                <span className="flex items-center gap-3">
                  <Icon className="h-4 w-4" />
                  {label}
                </span>
                {to === '/superadmin/approvals' && pendingCount > 0 && (
                  <span className="bg-amber-400 text-amber-950 text-xs font-semibold px-1.5 py-0.5 rounded-full">
                    {pendingCount}
                  </span>
                )}
              </Link>
            );
          })}
        </nav>

        <div className="px-3 py-4 border-t border-slate-800">
          <div className="flex items-center gap-2 px-3 py-2">
            <div className="h-8 w-8 rounded-full bg-indigo-500/20 flex items-center justify-center text-indigo-300 text-sm font-medium">
              {(adminUser?.first_name || adminUser?.username || 'A').charAt(0).toUpperCase()}
            </div>
            <div className="min-w-0">
              <p className="text-sm text-white truncate">{adminUser?.first_name || adminUser?.username || 'Admin'}</p>
              <p className="text-xs text-slate-400 truncate">Platform owner</p>
            </div>
          </div>
          <button
            onClick={handleLogout}
            className="w-full flex items-center gap-2 px-3 py-2 mt-1 rounded-lg text-sm text-red-300 hover:bg-red-500/10 transition-colors"
          >
            <LogOut className="h-4 w-4" />
            Log out
          </button>
        </div>
      </aside>

      <div className="flex-1 min-w-0 flex flex-col">
        <div className="lg:hidden flex items-center gap-3 bg-white border-b border-gray-100 px-4 py-3">
          <button onClick={() => setSidebarOpen(true)} className="p-1.5 hover:bg-gray-100 rounded-lg">
            <Menu className="h-5 w-5 text-gray-600" />
          </button>
          <span className="text-sm font-semibold text-gray-800">{currentLabel}</span>
        </div>

        <main className="flex-1 p-4 md:p-8 max-w-6xl w-full mx-auto">
          {children}
        </main>
      </div>
    </div>
  );
}

export default SuperAdminLayout;
