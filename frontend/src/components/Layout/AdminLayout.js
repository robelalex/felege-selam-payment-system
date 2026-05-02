import React, { useState, useEffect } from 'react';
import YearSelector from '../Admin/YearSelector';
import AcademicYearSelector from '../Admin/AcademicYearSelector';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  LayoutDashboard, 
  LogOut,
  Menu,
  Users,
  CreditCard,
  BarChart3,
  ChevronLeft,
  ChevronRight,
  Calendar,
  MessageSquare,
  Bell,
  Settings,
  Eye,
  CalendarDays,
  User,
  ArrowLeft
} from 'lucide-react';
import api from '../../services/api';

const AdminLayout = ({ children }) => {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [showYearSelectorModal, setShowYearSelectorModal] = useState(false);
  const [schoolInfo, setSchoolInfo] = useState(null);
  const [adminUser, setAdminUser] = useState(null);
  const [isSettingsMode, setIsSettingsMode] = useState(false); // Toggle between modes
  const navigate = useNavigate();
  const location = useLocation();

  useEffect(() => {
    setSidebarOpen(false);
    fetchAdminUser();
    fetchSchoolInfo();
  }, [location.pathname]);

  const fetchSchoolInfo = async () => {
    try {
      const savedSchool = localStorage.getItem('selectedSchool');
      if (savedSchool) {
        const school = JSON.parse(savedSchool);
        setSchoolInfo(school);
        return;
      }
      
      const response = await api.get('/schools/');
      if (response.data && response.data[0]) {
        setSchoolInfo(response.data[0]);
        localStorage.setItem('selectedSchool', JSON.stringify(response.data[0]));
      }
    } catch (err) {
      console.error('Error fetching school info:', err);
    }
  };

  const fetchAdminUser = () => {
    const user = localStorage.getItem('adminUser');
    if (user) {
      const parsedUser = JSON.parse(user);
      setAdminUser(parsedUser);
      if (parsedUser.school) {
        localStorage.setItem('selectedSchool', JSON.stringify(parsedUser.school));
        setSchoolInfo(parsedUser.school);
      }
    }
  };

  const getLogoUrl = () => {
    if (schoolInfo?.logo) {
      if (schoolInfo.logo.startsWith('http')) {
        return schoolInfo.logo;
      }
      return `http://127.0.0.1:8000${schoolInfo.logo}`;
    }
    return '/images/logo.jpg';
  };

  const handleLogout = () => {
    localStorage.removeItem('isAdmin');
    localStorage.removeItem('adminUser');
    localStorage.removeItem('selectedAcademicYear');
    localStorage.removeItem('selectedSchool');
    navigate('/admin/login');
  };

  // Toggle between Normal Mode and Settings Mode
  const toggleSettingsMode = () => {
    setIsSettingsMode(!isSettingsMode);
  };

  // Normal Mode Navigation Items
  const normalNavItems = [
    { path: '/admin/dashboard', label: 'Dashboard', icon: LayoutDashboard },
    { path: '/admin/students', label: 'Students', icon: Users },
    { path: '/admin/payments', label: 'Payments', icon: CreditCard },
    { path: '/admin/slips', label: 'Bank Slips', icon: Eye },
    { path: '/admin/sms', label: 'Send SMS', icon: MessageSquare },
  ];

  // Settings Mode Navigation Items
  const settingsNavItems = [
    { path: '/admin/academic-years', label: 'Academic Years', icon: Calendar },
    { path: '/admin/deadlines', label: 'Payment Deadlines', icon: Calendar },
    { path: '/admin/reports', label: 'Reports', icon: BarChart3 },
    { path: '/admin/reminders', label: 'Reminders', icon: Bell },
  ];

  // Current active navigation items based on mode
  const currentNavItems = isSettingsMode ? settingsNavItems : normalNavItems;

  // Check if a path is active (for settings mode, check if path starts with the base)
  const isPathActive = (path) => {
    if (isSettingsMode) {
      return location.pathname === path;
    }
    return location.pathname === path;
  };

  return (
    <div className="flex h-screen bg-gray-50 overflow-hidden">
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

      <motion.aside
        initial={false}
        animate={{ 
          width: isCollapsed ? '72px' : '260px',
          transition: { duration: 0.3 }
        }}
        className={`fixed lg:static inset-y-0 left-0 z-50 bg-white shadow-xl h-screen overflow-hidden ${
          sidebarOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'
        }`}
      >
        <div className="flex flex-col h-full">
          {/* Logo */}
          <div className={`flex-shrink-0 px-4 py-4 border-b border-gray-100 flex items-center ${isCollapsed ? 'justify-center' : 'justify-between'}`}>
            {!isCollapsed ? (
              <div className="flex items-center gap-3">
                <img 
                  src={getLogoUrl()}
                  alt={schoolInfo?.name || 'School Logo'} 
                  className="w-10 h-10 rounded-full object-cover border-2 border-primary-100"
                  onError={(e) => {
                    e.target.onerror = null;
                    e.target.src = '/images/logo.jpg';
                  }}
                />
                <div>
                  <span className="font-bold text-gray-800 text-sm">{schoolInfo?.name || 'Admin Portal'}</span>
                  <p className="text-[10px] text-gray-400">{adminUser?.first_name} {adminUser?.last_name}</p>
                </div>
              </div>
            ) : (
              <img 
                src={getLogoUrl()}
                alt={schoolInfo?.name || 'School Logo'} 
                className="w-8 h-8 rounded-full object-cover border border-primary-100"
                onError={(e) => {
                  e.target.onerror = null;
                  e.target.src = '/images/logo.jpg';
                }}
              />
            )}
          </div>

          {/* Collapse Toggle */}
          <button
            onClick={() => setIsCollapsed(!isCollapsed)}
            className="hidden lg:flex absolute -right-3 top-20 w-5 h-5 bg-white rounded-full shadow-md border border-gray-200 items-center justify-center hover:bg-gray-50 z-50"
          >
            {isCollapsed ? 
              <ChevronRight className="h-3 w-3 text-gray-500" /> : 
              <ChevronLeft className="h-3 w-3 text-gray-500" />
            }
          </button>

          {/* Mode Indicator */}
          {!isCollapsed && (
            <div className="px-3 py-2 mt-2">
              <div className={`text-xs font-medium px-2 py-1 rounded-full inline-block ${
                isSettingsMode ? 'bg-purple-100 text-purple-700' : 'bg-blue-100 text-blue-700'
              }`}>
                {isSettingsMode ? '⚙️ Settings Mode' : '📱 Normal Mode'}
              </div>
            </div>
          )}

          {/* Navigation */}
          <nav className="flex-1 overflow-y-auto px-3 py-2 space-y-1">
            {/* Settings Toggle Button - Always visible */}
            <button
              onClick={toggleSettingsMode}
              className={`flex items-center ${isCollapsed ? 'justify-center' : 'gap-3'} w-full px-3 py-2 rounded-lg transition-all duration-200 mb-4 ${
                isSettingsMode
                  ? 'bg-purple-600 text-white hover:bg-purple-700'
                  : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
              }`}
              title={isCollapsed ? (isSettingsMode ? 'Back to Main Menu' : 'Settings') : ''}
            >
              {isSettingsMode ? (
                <ArrowLeft className="h-4 w-4" />
              ) : (
                <Settings className="h-4 w-4" />
              )}
              {!isCollapsed && (
                <span className="text-sm font-medium">
                  {isSettingsMode ? 'Back to Main Menu' : 'Settings'}
                </span>
              )}
            </button>

            {/* Divider */}
            <div className="border-t border-gray-100 my-2"></div>

            {/* Navigation Items based on mode */}
            {!isCollapsed && (
              <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-2 px-2 mt-2">
                {isSettingsMode ? 'Settings Menu' : 'Main Menu'}
              </p>
            )}
            
            {currentNavItems.map((item) => {
              const Icon = item.icon;
              const isActive = isPathActive(item.path);
              return (
                <Link
                  key={item.path}
                  to={item.path}
                  className={`flex items-center ${isCollapsed ? 'justify-center' : 'gap-3'} px-3 py-2 rounded-lg transition-all duration-200 mb-1 ${
                    isActive
                      ? isSettingsMode 
                        ? 'bg-purple-50 text-purple-600' 
                        : 'bg-primary-50 text-primary-600'
                      : 'text-gray-600 hover:bg-gray-100'
                  }`}
                  title={isCollapsed ? item.label : ''}
                >
                  <Icon className={`h-4 w-4 ${isActive ? (isSettingsMode ? 'text-purple-600' : 'text-primary-600') : 'text-gray-500'}`} />
                  {!isCollapsed && <span className="text-sm font-medium">{item.label}</span>}
                </Link>
              );
            })}

            {/* Manage Years - Special button that appears in Settings Mode */}
            {isSettingsMode && (
              <button
                onClick={() => setShowYearSelectorModal(true)}
                className={`flex items-center ${isCollapsed ? 'justify-center' : 'gap-3'} w-full px-3 py-2 rounded-lg transition-all duration-200 mb-1 text-purple-600 bg-purple-50 hover:bg-purple-100`}
                title={isCollapsed ? 'Manage Years' : ''}
              >
                <CalendarDays className="h-4 w-4" />
                {!isCollapsed && <span className="text-sm font-medium">Manage Years</span>}
              </button>
            )}
          </nav>

          {/* Year Selector - Only show in Normal Mode */}
          {!isSettingsMode && (
            <div className="flex-shrink-0 px-3 py-2 border-t border-gray-100">
              <div className="flex items-center justify-between">
                {!isCollapsed && <span className="text-[10px] text-gray-400">Academic Year</span>}
                <YearSelector />
              </div>
            </div>
          )}

          {/* User Info & Logout */}
          <div className="flex-shrink-0 border-t border-gray-100">
            {!isCollapsed && adminUser && (
              <div className="px-3 py-2 flex items-center gap-2 bg-gray-50">
                <div className="w-7 h-7 bg-primary-100 rounded-full flex items-center justify-center">
                  <User className="h-3.5 w-3.5 text-primary-600" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-medium text-gray-800 truncate">
                    {adminUser.first_name} {adminUser.last_name}
                  </p>
                  <p className="text-[10px] text-gray-400 truncate">{adminUser.email}</p>
                </div>
              </div>
            )}
            <button
              onClick={handleLogout}
              className={`flex items-center ${isCollapsed ? 'justify-center' : 'gap-2'} w-full px-3 py-2 text-red-600 hover:bg-red-50 transition-colors text-sm`}
              title={isCollapsed ? 'Logout' : ''}
            >
              <LogOut className="h-4 w-4" />
              {!isCollapsed && <span>Logout</span>}
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
          <Menu className="h-5 w-5 text-gray-600" />
        </button>
        <div className="ml-3 flex items-center gap-2">
          <img 
            src={getLogoUrl()}
            alt={schoolInfo?.name || 'School Logo'} 
            className="w-7 h-7 rounded-full object-cover"
            onError={(e) => {
              e.target.onerror = null;
              e.target.src = '/images/logo.jpg';
            }}
          />
          <span className="font-semibold text-gray-800 text-sm">{schoolInfo?.name || 'Admin Panel'}</span>
        </div>
      </div>

      {/* Main Content */}
      <main className="flex-1 overflow-y-auto bg-gray-50">
        <div className="lg:hidden h-14" />
        <div className="p-4 md:p-6">
          {children}
        </div>
      </main>

      {/* Academic Year Selector Modal */}
      <AcademicYearSelector
        isOpen={showYearSelectorModal}
        onClose={() => setShowYearSelectorModal(false)}
      />
    </div>
  );
};

export default AdminLayout;