// src/components/Layout/AdminLayout.js
import React, { useState, useEffect } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  LayoutDashboard, 
  LogOut,
  School,
  Menu,
  X,
  Users,
  CreditCard,
  BarChart3,
  ChevronLeft,
  ChevronRight,
  Calendar,
  FileText,
  MessageSquare,
  Bell,
  Settings,
  Eye,
  ChevronDown,
  ChevronUp
} from 'lucide-react';

const AdminLayout = ({ children }) => {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const navigate = useNavigate();
  const location = useLocation();

  useEffect(() => {
    setSidebarOpen(false);
  }, [location.pathname]);

  const handleLogout = () => {
    localStorage.removeItem('isAdmin');
    navigate('/admin/login');
  };

  // Main navigation - things used daily
  const mainNavItems = [
    { path: '/admin/dashboard', label: 'Dashboard', icon: LayoutDashboard },
    { path: '/admin/students', label: 'Students', icon: Users },
    { path: '/admin/payments', label: 'Payments', icon: CreditCard },
    { path: '/admin/slips', label: 'Bank Slips', icon: Eye },
    { path: '/admin/sms', label: 'Send SMS', icon: MessageSquare },
  ];

  // Advanced settings - things used weekly/monthly
  const advancedNavItems = [
    { path: '/admin/academic-years', label: 'Academic Years', icon: Calendar },
    { path: '/admin/reports', label: 'Reports', icon: BarChart3 },
    { path: '/admin/reminders', label: 'Reminders', icon: Bell },
    { path: '/admin/settings', label: 'Settings', icon: Settings },
  ];

  return (
    <div className="flex h-screen bg-gray-50 overflow-hidden">
      {/* Mobile Overlay */}
      <AnimatePresence>
        {sidebarOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setSidebarOpen(false)}
            className="fixed inset-0 bg-black/50 z-40 lg:hidden"
          />
        )}
      </AnimatePresence>

      {/* Sidebar */}
      <motion.aside
        initial={false}
        animate={{ 
          width: isCollapsed ? '80px' : '256px',
          transition: { duration: 0.3 }
        }}
        className={`fixed lg:static inset-y-0 left-0 z-50 bg-white shadow-xl h-screen overflow-hidden ${
          sidebarOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'
        }`}
      >
        <div className="flex flex-col h-full">
          {/* Logo */}
          <div className={`flex-shrink-0 p-6 border-b border-gray-200 flex items-center ${isCollapsed ? 'justify-center' : 'justify-between'}`}>
            {!isCollapsed ? (
              <>
                <div className="flex items-center space-x-2">
                  <div className="p-2 bg-primary-100 rounded-lg">
                    <School className="h-6 w-6 text-primary-600" />
                  </div>
                  <span className="font-bold text-lg text-gray-900">
                    Felege<span className="text-primary-600">Selam</span>
                  </span>
                </div>
                <span className="px-2 py-1 bg-primary-100 text-primary-600 text-xs rounded-full">
                  Admin
                </span>
              </>
            ) : (
              <div className="p-2 bg-primary-100 rounded-lg">
                <School className="h-6 w-6 text-primary-600" />
              </div>
            )}
          </div>

          {/* Collapse Toggle */}
          <button
            onClick={() => setIsCollapsed(!isCollapsed)}
            className="hidden lg:flex absolute -right-3 top-20 w-6 h-6 bg-white rounded-full shadow-md border border-gray-200 items-center justify-center hover:bg-gray-50 z-50"
          >
            {isCollapsed ? 
              <ChevronRight className="h-4 w-4 text-gray-600" /> : 
              <ChevronLeft className="h-4 w-4 text-gray-600" />
            }
          </button>

          {/* Navigation */}
          <nav className="flex-1 overflow-y-auto p-4 space-y-1 scrollbar-hide">
            {/* Main Navigation */}
            <div className="mb-4">
              {!isCollapsed && (
                <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2 px-4">
                  Main
                </p>
              )}
              {mainNavItems.map((item) => {
                const Icon = item.icon;
                const isActive = location.pathname === item.path;
                return (
                  <Link
                    key={item.path}
                    to={item.path}
                    className={`flex items-center ${isCollapsed ? 'justify-center' : 'space-x-3'} px-4 py-3 rounded-lg transition-all duration-200 mb-1 ${
                      isActive
                        ? 'bg-primary-50 text-primary-600'
                        : 'text-gray-600 hover:bg-gray-100'
                    }`}
                    title={isCollapsed ? item.label : ''}
                  >
                    <Icon className="h-5 w-5 flex-shrink-0" />
                    {!isCollapsed && <span className="font-medium">{item.label}</span>}
                  </Link>
                );
              })}
            </div>

            {/* Advanced Section (Collapsible) */}
            <div>
              {!isCollapsed && (
                <button
                  onClick={() => setShowAdvanced(!showAdvanced)}
                  className="w-full flex items-center justify-between px-4 py-2 text-xs font-semibold text-gray-400 uppercase tracking-wider hover:text-gray-600"
                >
                  <span>Advanced</span>
                  {showAdvanced ? (
                    <ChevronUp className="h-4 w-4" />
                  ) : (
                    <ChevronDown className="h-4 w-4" />
                  )}
                </button>
              )}
              
              <AnimatePresence>
                {(showAdvanced || isCollapsed) && (
                  <motion.div
                    initial={!isCollapsed ? { opacity: 0, height: 0 } : false}
                    animate={!isCollapsed ? { opacity: 1, height: 'auto' } : false}
                    exit={!isCollapsed ? { opacity: 0, height: 0 } : false}
                    className="overflow-hidden"
                  >
                    {advancedNavItems.map((item) => {
                      const Icon = item.icon;
                      const isActive = location.pathname === item.path;
                      return (
                        <Link
                          key={item.path}
                          to={item.path}
                          className={`flex items-center ${isCollapsed ? 'justify-center' : 'space-x-3'} px-4 py-3 rounded-lg transition-all duration-200 mb-1 ${
                            isActive
                              ? 'bg-primary-50 text-primary-600'
                              : 'text-gray-600 hover:bg-gray-100'
                          }`}
                          title={isCollapsed ? item.label : ''}
                        >
                          <Icon className="h-5 w-5 flex-shrink-0" />
                          {!isCollapsed && <span className="font-medium">{item.label}</span>}
                        </Link>
                      );
                    })}
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </nav>

          {/* Logout */}
          <div className="flex-shrink-0 p-4 border-t border-gray-200">
            <button
              onClick={handleLogout}
              className={`flex items-center ${isCollapsed ? 'justify-center' : 'space-x-3'} px-4 py-3 w-full rounded-lg text-red-600 hover:bg-red-50 transition-colors`}
              title={isCollapsed ? 'Logout' : ''}
            >
              <LogOut className="h-5 w-5 flex-shrink-0" />
              {!isCollapsed && <span className="font-medium">Logout</span>}
            </button>
          </div>
        </div>
      </motion.aside>

      {/* Mobile Header */}
      <div className="lg:hidden fixed top-0 left-0 right-0 bg-white shadow-sm z-30 px-4 py-3 flex items-center">
        <button
          onClick={() => setSidebarOpen(true)}
          className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
        >
          <Menu className="h-6 w-6 text-gray-600" />
        </button>
        <div className="ml-4 flex items-center space-x-2">
          <School className="h-5 w-5 text-primary-600" />
          <span className="font-semibold text-gray-900">Admin Panel</span>
        </div>
      </div>

      {/* Main Content */}
      <main className="flex-1 overflow-y-auto bg-gray-50">
        <div className="lg:hidden h-14" />
        <div className="p-4 md:p-6 lg:p-8">
          {children}
        </div>
      </main>
    </div>
  );
};

export default AdminLayout;