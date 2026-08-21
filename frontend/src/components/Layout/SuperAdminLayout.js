// src/components/Layout/SuperAdminLayout.js
//
// ✅ NEW — Item 8 redesign. Deliberately visually distinct from
// AdminLayout.js (dark sidebar vs white) so it's never ambiguous which
// surface you're in: this is the platform-owner view across all schools,
// not one school's own admin panel.
//
// ✅ Dark mode (build spec §3.2): the outer wrapper below carries the
// 'dark' class conditionally, and only that — Tailwind's darkMode:'class'
// selector is a descendant selector (`.dark .dark\:bg-x`), so putting the
// class on an ancestor div (rather than <html>) naturally scopes dark
// mode to just this component's subtree, i.e. everything rendered inside
// SuperAdminLayout. Nothing outside /superadmin/* is touched, and no
// global <html> class or app-wide ThemeContext was needed.
//
// ✅ Logout now redirects to /superadmin/login rather than /admin/login —
// carrying over the same "never send a super admin through the
// school-admin door" rule from the route-guard fix (build spec §1) to
// the logout path too, since the dedicated login now exists.
import React, { useEffect, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import {
  ShieldCheck, LayoutDashboard, Building2, ClipboardCheck, Users,
  History, LogOut, Menu, X, Sun, Moon,
} from 'lucide-react';

const NAV_ITEMS = [
  { to: '/superadmin/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { to: '/superadmin/schools', label: 'Schools', icon: Building2 },
  { to: '/superadmin/approvals', label: 'Pending approvals', icon: ClipboardCheck },
  { to: '/superadmin/school-admins', label: 'School admins', icon: Users },
  { to: '/superadmin/activity-log', label: 'Activity log', icon: History },
];

const THEME_KEY = 'superadmin_theme';

function SuperAdminLayout({ children, pendingCount = 0 }) {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [adminUser, setAdminUser] = useState(null);
  // Persisted (localStorage), and explicitly NOT derived from the OS-level
  // prefers-color-scheme media query — only from what the user picked
  // last time via the toggle below, so the manual choice always wins.
  const [darkMode, setDarkMode] = useState(() => localStorage.getItem(THEME_KEY) === 'dark');
  const location = useLocation();
  const navigate = useNavigate();

  useEffect(() => {
    const raw = localStorage.getItem('adminUser');
    if (raw) setAdminUser(JSON.parse(raw));
  }, []);

  useEffect(() => {
    localStorage.setItem(THEME_KEY, darkMode ? 'dark' : 'light');
  }, [darkMode]);

  const handleLogout = () => {
    localStorage.removeItem('isAdmin');
    localStorage.removeItem('adminUser');
    localStorage.removeItem('access_token');
    localStorage.removeItem('refresh_token');
    localStorage.removeItem('selectedSchool');
    navigate('/superadmin/login');
  };

  const currentLabel = NAV_ITEMS.find((i) => location.pathname.startsWith(i.to))?.label || 'Dashboard';

  return (
    <div className={darkMode ? 'dark' : ''}>
      <div className="min-h-screen flex bg-gray-50 dark:bg-slate-950 transition-colors">
        {sidebarOpen && (
          <div
            className="fixed inset-0 bg-black/40 z-40 lg:hidden"
            onClick={() => setSidebarOpen(false)}
          />
        )}

        {/* Sidebar is deliberately always dark-navy regardless of the
            light/dark toggle below — it's the platform-owner brand
            surface (see header comment), same as before this task. The
            toggle controls the main content area's palette. */}
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
          {/* Top bar — was lg:hidden (mobile-only) before; now always
              visible so the dark-mode toggle has a permanent home on
              desktop too, per build spec §3.1/§3.2. */}
          <div className="flex items-center gap-3 bg-white dark:bg-slate-900 border-b border-gray-100 dark:border-slate-800 px-4 py-3 transition-colors">
            <button onClick={() => setSidebarOpen(true)} className="lg:hidden p-1.5 hover:bg-gray-100 dark:hover:bg-slate-800 rounded-lg">
              <Menu className="h-5 w-5 text-gray-600 dark:text-slate-300" />
            </button>
            <span className="text-sm font-semibold text-gray-800 dark:text-slate-100">{currentLabel}</span>
            <button
              onClick={() => setDarkMode((d) => !d)}
              className="ml-auto flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium text-gray-600 dark:text-slate-300 hover:bg-gray-100 dark:hover:bg-slate-800 transition-colors"
              title={darkMode ? 'Switch to light mode' : 'Switch to dark mode'}
            >
              {darkMode ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
              <span className="hidden sm:inline">{darkMode ? 'Light' : 'Dark'}</span>
            </button>
          </div>

          <main className="flex-1 p-4 md:p-8 max-w-6xl w-full mx-auto">
            {children}
          </main>
        </div>
      </div>
    </div>
  );
}

export default SuperAdminLayout;
