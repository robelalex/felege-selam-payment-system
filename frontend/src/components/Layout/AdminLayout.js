import React, { useState, useEffect } from 'react';
import YearSelector from '../Admin/YearSelector';
import AcademicYearSelector from '../Admin/AcademicYearSelector';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  LayoutDashboard, 
  LogOut,
  School,
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
  ChevronDown,
  ChevronUp,
  CalendarDays,
  User
} from 'lucide-react';
import api from '../../services/api';

const AdminLayout = ({ children }) => {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [showYearSelectorModal, setShowYearSelectorModal] = useState(false);
  const [schoolInfo, setSchoolInfo] = useState(null);
  const [adminUser, setAdminUser] = useState(null);
  const navigate = useNavigate();
  const location = useLocation();

  useEffect(() => {
    setSidebarOpen(false);
    fetchAdminUser();
    fetchSchoolInfo();
  }, [location.pathname]);

  // ✅ FIXED: Load school from localStorage (priority)
  const fetchSchoolInfo = async () => {
    try {
      // First, check localStorage for selected school
      const savedSchool = localStorage.getItem('selectedSchool');
      if (savedSchool) {
        const school = JSON.parse(savedSchool);
        setSchoolInfo(school);
        console.log('📚 Loaded school from localStorage:', school.name);
        return;
      }
      
      // Fallback: Fetch from API
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
      // If user has school info, update localStorage
      if (parsedUser.school) {
        localStorage.setItem('selectedSchool', JSON.stringify(parsedUser.school));
        setSchoolInfo(parsedUser.school);
      }
    }
  };

  // ✅ Helper function to get logo URL
  const getLogoUrl = () => {
    if (schoolInfo?.logo) {
      // If logo is a full URL or path
      if (schoolInfo.logo.startsWith('http')) {
        return schoolInfo.logo;
      }
      // If logo is a relative path
      return `http://127.0.0.1:8000${schoolInfo.logo}`;
    }
    // Default logo
    return '/images/logo.jpg';
  };

  const handleLogout = () => {
    localStorage.removeItem('isAdmin');
    localStorage.removeItem('adminUser');
    localStorage.removeItem('selectedAcademicYear');
    localStorage.removeItem('selectedSchool');
    navigate('/admin/login');
  };

  const mainNavItems = [
    { path: '/admin/dashboard', label: 'Dashboard', icon: LayoutDashboard },
    { path: '/admin/students', label: 'Students', icon: Users },
    { path: '/admin/payments', label: 'Payments', icon: CreditCard },
    { path: '/admin/slips', label: 'Bank Slips', icon: Eye },
    { path: '/admin/sms', label: 'Send SMS', icon: MessageSquare },
  ];

  const advancedNavItems = [
    { path: '/admin/academic-years', label: 'Academic Years', icon: Calendar },
    { path: '/admin/deadlines', label: 'Payment Deadlines', icon: Calendar },
    { path: '/admin/reports', label: 'Reports', icon: BarChart3 },
    { path: '/admin/reminders', label: 'Reminders', icon: Bell },
    { path: '/admin/settings', label: 'Settings', icon: Settings },
  ];

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
          {/* Logo - Now uses dynamic school logo */}
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

          {/* Navigation */}
          <nav className="flex-1 overflow-y-auto px-3 py-4 space-y-1">
            <div className="mb-2">
              {!isCollapsed && (
                <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-2 px-2">
                  Main Menu
                </p>
              )}
              {mainNavItems.map((item) => {
                const Icon = item.icon;
                const isActive = location.pathname === item.path;
                return (
                  <Link
                    key={item.path}
                    to={item.path}
                    className={`flex items-center ${isCollapsed ? 'justify-center' : 'gap-3'} px-3 py-2 rounded-lg transition-all duration-200 mb-1 ${
                      isActive
                        ? 'bg-primary-50 text-primary-600'
                        : 'text-gray-600 hover:bg-gray-100'
                    }`}
                    title={isCollapsed ? item.label : ''}
                  >
                    <Icon className={`h-4 w-4 ${isActive ? 'text-primary-600' : 'text-gray-500'}`} />
                    {!isCollapsed && <span className="text-sm font-medium">{item.label}</span>}
                  </Link>
                );
              })}
            </div>

            {/* Advanced Section */}
            <div className="pt-2">
              {!isCollapsed && (
                <button
                  onClick={() => setShowAdvanced(!showAdvanced)}
                  className="w-full flex items-center justify-between px-2 py-1 text-[10px] font-semibold text-gray-400 uppercase tracking-wider hover:text-gray-600"
                >
                  <span>Advanced</span>
                  {showAdvanced ? (
                    <ChevronUp className="h-3 w-3" />
                  ) : (
                    <ChevronDown className="h-3 w-3" />
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
                          className={`flex items-center ${isCollapsed ? 'justify-center' : 'gap-3'} px-3 py-2 rounded-lg transition-all duration-200 mb-1 ${
                            isActive
                              ? 'bg-primary-50 text-primary-600'
                              : 'text-gray-600 hover:bg-gray-100'
                          }`}
                          title={isCollapsed ? item.label : ''}
                        >
                          <Icon className={`h-4 w-4 ${isActive ? 'text-primary-600' : 'text-gray-500'}`} />
                          {!isCollapsed && <span className="text-sm font-medium">{item.label}</span>}
                        </Link>
                      );
                    })}
                    
                    {!isCollapsed && (
                      <button
                        onClick={() => setShowYearSelectorModal(true)}
                        className="w-full flex items-center gap-3 px-3 py-2 rounded-lg transition-all duration-200 mb-1 text-primary-600 bg-primary-50 hover:bg-primary-100"
                      >
                        <CalendarDays className="h-4 w-4" />
                        <span className="text-sm font-medium">Manage Years</span>
                      </button>
                    )}

                    {isCollapsed && (
                      <button
                        onClick={() => setShowYearSelectorModal(true)}
                        className="w-full flex items-center justify-center px-3 py-2 rounded-lg transition-all duration-200 mb-1 text-primary-600 bg-primary-50 hover:bg-primary-100"
                        title="Manage Academic Years"
                      >
                        <CalendarDays className="h-4 w-4" />
                      </button>
                    )}
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </nav>

          {/* Year Selector - Compact */}
          <div className="flex-shrink-0 px-3 py-2 border-t border-gray-100">
            <div className="flex items-center justify-between">
              {!isCollapsed && <span className="text-[10px] text-gray-400">Academic Year</span>}
              <YearSelector />
            </div>
          </div>

          {/* User Info & Logout - Compact */}
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