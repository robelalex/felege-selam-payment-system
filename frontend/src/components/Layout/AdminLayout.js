import React, { useState, useEffect, useRef } from 'react';
import YearSelector from '../Admin/YearSelector';
import AcademicYearSelector from '../Admin/AcademicYearSelector';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { Archive } from 'lucide-react';
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
  Grid,
  History,
  ChevronDown,
  BookOpen,
  Trophy,
  FileText,
  Users as UsersIcon
} from 'lucide-react';
import api from '../../services/api';
import { getMediaUrl } from '../../utils/imageUrl';
import { useChapaWarning } from '../../context/ChapaWarningContext';  // ✅ ADD THIS
import { useLanguage } from '../../context/LanguageContext';
import LanguageToggle from '../UI/LanguageToggle';

const AdminLayout = ({ children }) => {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [showYearSelectorModal, setShowYearSelectorModal] = useState(false);
  const [schoolInfo, setSchoolInfo] = useState(null);
  const [adminUser, setAdminUser] = useState(null);
  const [isSettingsMode, setIsSettingsMode] = useState(false);
  const [userRole, setUserRole] = useState(null);
  const [profileMenuOpen, setProfileMenuOpen] = useState(false);
  const profileMenuRef = useRef(null);

  // ✅ NEW: "edit my profile" (name + photo) modal, opened from the top
  // bar / sidebar admin block.
  const [showProfileModal, setShowProfileModal] = useState(false);
  const [profileForm, setProfileForm] = useState({ first_name: '', last_name: '', phone: '' });
  const [profilePhotoFile, setProfilePhotoFile] = useState(null);
  const [profilePhotoPreview, setProfilePhotoPreview] = useState(null);
  const [savingProfile, setSavingProfile] = useState(false);
  const navigate = useNavigate();
  const location = useLocation();
  const { t } = useLanguage();

  // Close the profile dropdown when clicking outside it
  useEffect(() => {
    const handleClickOutside = (e) => {
      if (profileMenuRef.current && !profileMenuRef.current.contains(e.target)) {
        setProfileMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // ===== CHAPA STATUS BADGE =====
  const ChapaStatusBadge = () => {
    const { chapaConfigured, loading } = useChapaWarning();
    
    if (loading || chapaConfigured) return null;
    
    return (
      <span className="ml-auto inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-red-500 text-white animate-pulse">
        ⚠️ Not Configured
      </span>
    );
  };

useEffect(() => {
  setSidebarOpen(false);
  
  // First fetch admin user from localStorage
  fetchAdminUser();
  
  // Then fetch school info and user role in sequence
  const initData = async () => {
    await fetchSchoolInfo();
    await fetchUserRole();
  };
  initData();
}, [location.pathname]);

// ✅ Listen for school-info updates fired from anywhere in the app
// (e.g. SchoolSettings.js after a successful logo/grading-system save).
// Without this, the sidebar only ever showed the FIRST cached copy of
// the school from localStorage and never refreshed — so a newly
// uploaded logo never appeared until the cache happened to be cleared.
useEffect(() => {
  const handleSchoolInfoUpdated = () => {
    fetchSchoolInfo(true); // force a real API refetch, bypassing the cache
  };
  window.addEventListener('schoolInfoUpdated', handleSchoolInfoUpdated);
  return () => window.removeEventListener('schoolInfoUpdated', handleSchoolInfoUpdated);
}, []);

  const fetchSchoolInfo = async (forceRefresh = false) => {
    try {
      if (!forceRefresh) {
        const savedSchool = localStorage.getItem('selectedSchool');
        if (savedSchool) {
          const school = JSON.parse(savedSchool);
          setSchoolInfo(school);
          return;
        }
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
      if (parsedUser.role) {
        setUserRole(parsedUser.role);
      }
      // ✅ FIX: this used to also overwrite 'selectedSchool' (and
      // schoolInfo state) with parsedUser.school — a snapshot frozen at
      // LOGIN time. On every refresh this ran before fetchSchoolInfo()
      // and stomped the correctly-updated cache from a logo save with
      // that old data, which is exactly why a new logo looked saved but
      // reverted on refresh. fetchSchoolInfo() below is the single
      // source of truth for schoolInfo/selectedSchool now — this
      // function only sets the admin's own user info.
    }
  };

  const fetchUserRole = async () => {
    try {
      const response = await api.get('/me/');
      if (response.data?.user?.role) {
        setUserRole(response.data.user.role);
      }
      // ✅ Merge in photo/phone (not present in the login payload cached
      // in localStorage) so the avatar shows up without needing a fresh
      // login every time it changes.
      if (response.data?.user) {
        setAdminUser((prev) => {
          const merged = { ...(prev || {}), ...response.data.user };
          localStorage.setItem('adminUser', JSON.stringify(merged));
          return merged;
        });
      }
    } catch (err) {
      console.error('Error fetching user role:', err);
    }
  };

  const openProfileModal = () => {
    setProfileForm({
      first_name: adminUser?.first_name || '',
      last_name: adminUser?.last_name || '',
      phone: adminUser?.phone || '',
    });
    setProfilePhotoFile(null);
    setProfilePhotoPreview(adminUser?.photo ? getMediaUrl(adminUser.photo) : null);
    setProfileMenuOpen(false);
    setShowProfileModal(true);
  };

  const handleProfilePhotoChange = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setProfilePhotoFile(file);
    setProfilePhotoPreview(URL.createObjectURL(file));
  };

  const handleProfileSave = async () => {
    setSavingProfile(true);
    try {
      const formData = new FormData();
      formData.append('first_name', profileForm.first_name);
      formData.append('last_name', profileForm.last_name);
      formData.append('phone', profileForm.phone);
      if (profilePhotoFile) {
        formData.append('photo', profilePhotoFile);
      }
      // No manual Content-Type header — axios now generates the correct
      // multipart boundary itself (see services/api.js fix).
      const res = await api.patch('/me/update/', formData);

      setAdminUser((prev) => {
        const merged = { ...(prev || {}), ...res.data.user };
        localStorage.setItem('adminUser', JSON.stringify(merged));
        return merged;
      });
      setShowProfileModal(false);
    } catch (err) {
      console.error('Error saving profile:', err);
      alert('❌ Failed to update profile');
    } finally {
      setSavingProfile(false);
    }
  };

  const getAvatarUrl = () => {
    if (adminUser?.photo) return getMediaUrl(adminUser.photo);
    return null;
  };

const getLogoUrl = () => {
  if (schoolInfo?.logo) {
    return getMediaUrl(schoolInfo.logo);
  }

  // ✅ DEFAULT: Use a generic school icon
  return `data:image/svg+xml,${encodeURIComponent(`
    <svg xmlns="http://www.w3.org/2000/svg" width="40" height="40">
      <rect width="40" height="40" rx="8" fill="#4F46E5"/>
      <text x="20" y="26" font-family="Arial" font-size="14" fill="white" text-anchor="middle">🏫</text>
    </svg>
  `)}`;
};

  const handleLogout = () => {
    localStorage.removeItem('isAdmin');
    localStorage.removeItem('adminUser');
    localStorage.removeItem('selectedAcademicYear');
    localStorage.removeItem('selectedSchool');
    navigate('/admin/login');
  };

  // ========== ROLE-BASED NAVIGATION ==========
  
  // School Admin Navigation (Full Access)
  const schoolAdminNormalNavItems = [
    { path: '/admin/dashboard', label: t('nav_dashboard'), icon: LayoutDashboard },
    { path: '/admin/students', label: t('nav_students'), icon: Users },
    { path: '/admin/payments', label: t('nav_payments'), icon: CreditCard },
    { path: '/admin/slips', label: t('nav_bank_slips'), icon: Eye },
    { path: '/admin/sms', label: t('nav_send_sms'), icon: MessageSquare },
  ];

  // ✅ ADDED badge to Chapa Payment
  const schoolAdminSettingsNavItems = [
    { path: '/admin/academic-years', label: t('nav_academic_years'), icon: Calendar },
    { path: '/admin/results-awards', label: t('nav_results_awards'), icon: Trophy },
    { path: '/admin/report-cards', label: t('nav_report_cards'), icon: FileText },
    { path: '/admin/deadlines', label: t('nav_payment_deadlines'), icon: Calendar },
    { path: '/admin/sections', label: t('nav_sections'), icon: Grid },
    { path: '/admin/staff', label: t('nav_staff'), icon: UsersIcon },
    { path: '/admin/activity-log', label: t('nav_activity_log'), icon: History },
    { path: '/admin/reports', label: t('nav_reports'), icon: BarChart3 },
    { path: '/admin/reminders', label: t('nav_reminders'), icon: Bell },
    { path: '/admin-dashboard/payment-history', label: t('nav_payment_history'), icon: Archive },
    { path: '/admin/chapa-settings', label: t('nav_chapa_payment'), icon: CreditCard, badge: <ChapaStatusBadge /> },
    { path: '/school-settings', label: t('nav_school_settings'), icon: Settings },
  ];

  // ✅ eSchool-style grouped sections for the School Admin's Normal Mode.
  // Same routes/items as before (fullAdminNavItems), just organized under
  // labeled groups instead of one flat 15-item list — that flat list was
  // the "messy nav bar" — grouping fixes the visual, changes nothing else.
  const schoolAdminNavGroups = [
    {
      label: t('nav_overview'),
      items: [
        { path: '/admin/dashboard', label: t('nav_dashboard'), icon: LayoutDashboard },
      ],
    },
    {
      label: t('nav_academics'),
      items: [
        { path: '/admin/students', label: t('nav_students'), icon: Users },
        { path: '/admin/sections', label: t('nav_sections'), icon: Grid },
        { path: '/admin/academics-setup', label: t('nav_academics_setup'), icon: BookOpen },
        { path: '/admin/academic-years', label: t('nav_academic_years'), icon: Calendar },
        { path: '/admin/results-awards', label: t('nav_results_awards'), icon: Trophy },
        { path: '/admin/report-cards', label: t('nav_report_cards'), icon: FileText },
        { path: '/admin/staff', label: t('nav_staff'), icon: UsersIcon },
      ],
    },
    {
      label: t('nav_fees_payments'),
      items: [
        { path: '/admin/payments', label: t('nav_payments'), icon: CreditCard },
        { path: '/admin/slips', label: t('nav_bank_slips'), icon: Eye },
        { path: '/admin/deadlines', label: t('nav_payment_deadlines'), icon: Calendar },
        { path: '/admin-dashboard/payment-history', label: t('nav_payment_history'), icon: Archive },
        { path: '/admin/chapa-settings', label: t('nav_chapa_payment'), icon: CreditCard, badge: <ChapaStatusBadge /> },
      ],
    },
    {
      label: t('nav_communication'),
      items: [
        { path: '/admin/sms', label: t('nav_send_sms'), icon: MessageSquare },
        { path: '/admin/reminders', label: t('nav_reminders'), icon: Bell },
      ],
    },
    {
      label: t('nav_reports_system'),
      items: [
        { path: '/admin/reports', label: t('nav_reports'), icon: BarChart3 },
        { path: '/admin/activity-log', label: t('nav_activity_log'), icon: History },
        { path: '/school-settings', label: t('nav_school_settings'), icon: Settings },
      ],
    },
  ];

  // Registrar Navigation (Students + Sections — matches CanManageStudents on the backend)
  const registrarNavItems = [
    { path: '/admin/students', label: 'Students', icon: Users },
    { path: '/admin/sections', label: 'Sections', icon: Grid },
  ];

  // Accountant Navigation (Payments + Bank Slips + Deadlines — matches CanManagePayments)
  // ✅ FIXED: backend StaffMember.role uses 'accountant', not 'payment_manager' —
  // that mismatch was why accountants used to fall through to the full admin menu.
  const accountantNavItems = [
    { path: '/admin/payments', label: 'Payments', icon: CreditCard },
    { path: '/admin/slips', label: 'Bank Slips', icon: Eye },
    { path: '/admin/deadlines', label: 'Payment Deadlines', icon: Calendar },
  ];

  // Reporting Manager Navigation
  const reportingManagerNavItems = [
    { path: '/admin/reports', label: 'Reports', icon: BarChart3 },
  ];

  // Reminder Manager Navigation
  const reminderManagerNavItems = [
    { path: '/admin/sms', label: 'Send SMS', icon: MessageSquare },
    { path: '/admin/reminders', label: 'Reminders', icon: Bell },
  ];

  // ✅ Librarian / Other: no dedicated module exists yet in this system.
  // Rather than silently handing them the full admin menu (the old bug),
  // give them a minimal, honest nav until a real library module is built.
  const noModuleYetNavItems = [];

  // ✅ school_admin / super_admin: Normal Mode now shows EVERYTHING
  // (the old 5-item normal list + the settings list combined), since the
  // school admin is the one who controls the whole system and shouldn't
  // have to flip into Settings Mode just to reach Staff, Reports, etc.
  // Settings Mode itself is untouched — same subset it always showed —
  // it's just no longer the only way to reach those pages.
  const fullAdminNavItems = [...schoolAdminNormalNavItems, ...schoolAdminSettingsNavItems];

  // Determine which navigation to show based on role
  const getNavItems = () => {
    if (userRole === 'school_admin' || userRole === 'super_admin') {
      return { 
        normal: fullAdminNavItems,            // ✅ everything, in Normal Mode (kept for compatibility)
        normalGroups: schoolAdminNavGroups,    // ✅ same items, grouped for display
        settings: schoolAdminSettingsNavItems  // unchanged subset, still available via toggle
      };
    }
    
    if (userRole === 'registrar') {
      return { normal: registrarNavItems, settings: [] };
    }
    
    if (userRole === 'accountant') {
      return { normal: accountantNavItems, settings: [] };
    }
    
    if (userRole === 'reporting_manager') {
      return { normal: reportingManagerNavItems, settings: [] };
    }
    
    if (userRole === 'reminder_manager') {
      return { normal: reminderManagerNavItems, settings: [] };
    }

    if (userRole === 'librarian' || userRole === 'other') {
      return { normal: noModuleYetNavItems, settings: [] };
    }

    // Unknown/unmapped role (e.g. 'teacher', pending its own module):
    // show nothing rather than silently granting the full admin menu.
    return { normal: [], settings: [] };
  };

  const navItems = getNavItems();
  const currentNavItems = isSettingsMode ? navItems.settings : navItems.normal;
  // ✅ Grouped view only applies in Normal Mode for school_admin/super_admin —
  // Settings Mode keeps its existing flat rendering, unchanged.
  const currentNavGroups = (!isSettingsMode && navItems.normalGroups) ? navItems.normalGroups : null;

  const isPathActive = (path) => {
    return location.pathname === path;
  };

  // Flatten whichever nav structure is active (grouped or flat) into a
  // single list, so the top bar can show the current section's label
  // without duplicating the nav-building logic above.
  const getCurrentPageLabel = () => {
    const flatItems = currentNavGroups
      ? currentNavGroups.flatMap((g) => g.items)
      : currentNavItems;
    const match = flatItems.find((item) => isPathActive(item.path));
    return match?.label || t('nav_dashboard');
  };

  // Get role display name
  const getRoleDisplay = () => {
    switch(userRole) {
      case 'school_admin': return 'School Admin';
      case 'super_admin': return 'Super Admin';
      case 'registrar': return 'Registrar';
      case 'accountant': return 'Accountant';
      case 'librarian': return 'Librarian';
      case 'reporting_manager': return 'Reporting Manager';
      case 'reminder_manager': return 'Reminder Manager';
      case 'teacher': return 'Teacher';
      case 'other': return 'Staff';
      default: return 'Admin';
    }
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
                  <p className="text-[10px] text-gray-400 capitalize">{getRoleDisplay()}</p>
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
          <nav className="flex-1 overflow-y-auto px-3 py-2 space-y-1">

            {/* Navigation Items based on mode and role */}
            {currentNavGroups ? (
              // ✅ Grouped rendering (eSchool-style labeled sections)
              currentNavGroups.map((group) => (
                <div key={group.label} className="mb-4">
                  {!isCollapsed && (
                    <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-1 px-2">
                      {group.label}
                    </p>
                  )}
                  {group.items.map((item) => {
                    const Icon = item.icon;
                    const isActive = isPathActive(item.path);
                    return (
                      <Link
                        key={item.path}
                        to={item.path}
                        className={`flex items-center ${isCollapsed ? 'justify-center' : 'gap-3'} px-3 py-2 rounded-lg transition-all duration-200 mb-0.5 ${
                          isActive
                            ? 'bg-primary-50 text-primary-600 border-l-2 border-primary-600'
                            : 'text-gray-600 hover:bg-gray-100 border-l-2 border-transparent'
                        }`}
                        title={isCollapsed ? item.label : ''}
                      >
                        <Icon className={`h-4 w-4 ${isActive ? 'text-primary-600' : 'text-gray-500'}`} />
                        {!isCollapsed && (
                          <>
                            <span className="text-sm font-medium flex-1">{item.label}</span>
                            {item.badge && item.badge}
                          </>
                        )}
                      </Link>
                    );
                  })}
                </div>
              ))
            ) : (
              <>
                {!isCollapsed && currentNavItems.length > 0 && (
                  <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-2 px-2 mt-2">
                    {isSettingsMode ? t('nav_settings_menu') : t('nav_main_menu')}
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
                      {!isCollapsed && (
                        <>
                          <span className="text-sm font-medium flex-1">{item.label}</span>
                          {/* ✅ Show badge if it exists */}
                          {item.badge && item.badge}
                        </>
                      )}
                    </Link>
                  );
                })}
              </>
            )}

            {/* Manage Years - Quick action for School Admin / Super Admin */}
            {(userRole === 'school_admin' || userRole === 'super_admin') && (
              <button
                onClick={() => setShowYearSelectorModal(true)}
                className={`flex items-center ${isCollapsed ? 'justify-center' : 'gap-3'} w-full px-3 py-2 rounded-lg transition-all duration-200 mb-1 text-purple-600 bg-purple-50 hover:bg-purple-100`}
                title={isCollapsed ? 'Manage Years' : ''}
              >
                <CalendarDays className="h-4 w-4" />
                {!isCollapsed && <span className="text-sm font-medium">{t('nav_manage_years')}</span>}
              </button>
            )}
          </nav>

          {/* Year Selector - Only show in Normal Mode for School Admin / Super Admin */}
          {!isSettingsMode && (userRole === 'school_admin' || userRole === 'super_admin') && (
            <div className="flex-shrink-0 px-3 py-2 border-t border-gray-100">
              <div className="flex items-center justify-between">
                {!isCollapsed && <span className="text-[10px] text-gray-400">{t('nav_academic_year')}</span>}
                <YearSelector />
              </div>
            </div>
          )}

          {/* Language Toggle */}
          <div className={`flex-shrink-0 border-t border-gray-100 px-3 py-2 ${isCollapsed ? 'flex justify-center' : ''}`}>
            <LanguageToggle collapsedIcon={isCollapsed} />
          </div>

          {/* User Info & Logout */}
          <div className="flex-shrink-0 border-t border-gray-100">
            {!isCollapsed && adminUser && (
              <button
                onClick={openProfileModal}
                title="Edit my profile"
                className="w-full px-3 py-2 flex items-center gap-2 bg-gray-50 hover:bg-gray-100 transition-colors text-left"
              >
                <div className="w-7 h-7 bg-primary-100 rounded-full flex items-center justify-center overflow-hidden">
                  {getAvatarUrl() ? (
                    <img src={getAvatarUrl()} alt="" className="w-full h-full object-cover" />
                  ) : (
                    <User className="h-3.5 w-3.5 text-primary-600" />
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-medium text-gray-800 truncate">
                    {adminUser.first_name || adminUser.username}
                  </p>
                  <p className="text-[10px] text-gray-400 truncate capitalize">
                    {getRoleDisplay()}
                  </p>
                </div>
              </button>
            )}
            <button
              onClick={handleLogout}
              className={`flex items-center ${isCollapsed ? 'justify-center' : 'gap-2'} w-full px-3 py-2 text-red-600 hover:bg-red-50 transition-colors text-sm`}
              title={isCollapsed ? t('nav_logout') : ''}
            >
              <LogOut className="h-4 w-4" />
              {!isCollapsed && <span>{t('nav_logout')}</span>}
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
        <div className="ml-auto">
          <span className="text-xs text-gray-500 capitalize">{getRoleDisplay()}</span>
        </div>
      </div>

      {/* Content column: top bar + page content, stacked, beside the sidebar */}
      <div className="flex flex-col flex-1 min-w-0">
        {/* Desktop Top Bar — eSchool-style: current section on the left, */}
        {/* profile menu on the right. Always visible above page content. */}
        <div className="hidden lg:flex flex-shrink-0 items-center justify-between bg-white border-b border-gray-100 px-6 py-3">
          <div>
            <p className="text-sm text-gray-400">{schoolInfo?.name || t('nav_dashboard')}</p>
            <h2 className="text-base font-semibold text-gray-800">{getCurrentPageLabel()}</h2>
          </div>

          <div className="relative" ref={profileMenuRef}>
            <button
              onClick={() => setProfileMenuOpen(!profileMenuOpen)}
              className="flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-gray-50 transition-colors"
            >
              <div className="w-8 h-8 bg-primary-100 rounded-full flex items-center justify-center overflow-hidden">
                {getAvatarUrl() ? (
                  <img src={getAvatarUrl()} alt="" className="w-full h-full object-cover" />
                ) : (
                  <User className="h-4 w-4 text-primary-600" />
                )}
              </div>
              <div className="text-left">
                <p className="text-sm font-medium text-gray-800 leading-tight">
                  {adminUser?.first_name || adminUser?.username || 'Admin'}
                </p>
                <p className="text-[11px] text-gray-400 capitalize leading-tight">{getRoleDisplay()}</p>
              </div>
              <ChevronDown className={`h-4 w-4 text-gray-400 transition-transform ${profileMenuOpen ? 'rotate-180' : ''}`} />
            </button>

            {profileMenuOpen && (
              <div className="absolute top-full right-0 mt-2 w-48 bg-white rounded-lg shadow-lg border border-gray-100 py-1 z-50">
                <button
                  onClick={openProfileModal}
                  className="w-full flex items-center gap-2 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50 text-left"
                >
                  <User className="h-4 w-4 text-gray-400" />
                  My Profile
                </button>
                {(userRole === 'school_admin' || userRole === 'super_admin') && (
                  <Link
                    to="/school-settings"
                    onClick={() => setProfileMenuOpen(false)}
                    className="flex items-center gap-2 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50"
                  >
                    <Settings className="h-4 w-4 text-gray-400" />
                    {t('nav_school_settings')}
                  </Link>
                )}
                <button
                  onClick={handleLogout}
                  className="w-full flex items-center gap-2 px-4 py-2 text-sm text-red-600 hover:bg-red-50 text-left"
                >
                  <LogOut className="h-4 w-4" />
                  {t('nav_logout')}
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Main Content */}
        <main className="flex-1 overflow-y-auto bg-gray-50">
          <div className="lg:hidden h-14" />
          <div className="p-4 md:p-6">
            {children}
          </div>
        </main>
      </div>

      {/* Academic Year Selector Modal */}
      <AcademicYearSelector
        isOpen={showYearSelectorModal}
        onClose={() => setShowYearSelectorModal(false)}
      />

      {/* ✅ NEW: My Profile modal — edit own name/phone/photo. Opened from
          the sidebar admin block or the top bar "My Profile" menu item. */}
      {showProfileModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[60] p-4">
          <div className="bg-white rounded-xl shadow-2xl max-w-sm w-full">
            <div className="border-b border-gray-100 px-6 py-4 flex items-center justify-between">
              <h2 className="text-lg font-bold text-gray-900">My Profile</h2>
              <button
                onClick={() => setShowProfileModal(false)}
                className="text-gray-400 hover:text-gray-600 text-xl leading-none"
              >
                &times;
              </button>
            </div>

            <div className="p-6 space-y-4">
              <div className="flex flex-col items-center gap-2">
                <div className="w-20 h-20 rounded-full bg-primary-100 flex items-center justify-center overflow-hidden border-2 border-primary-100">
                  {profilePhotoPreview ? (
                    <img src={profilePhotoPreview} alt="" className="w-full h-full object-cover" />
                  ) : (
                    <User className="h-8 w-8 text-primary-600" />
                  )}
                </div>
                <label className="text-xs font-medium text-primary-600 cursor-pointer hover:underline">
                  Change photo
                  <input
                    type="file"
                    accept="image/jpeg,image/png,image/jpg"
                    className="hidden"
                    onChange={handleProfilePhotoChange}
                  />
                </label>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">First Name</label>
                <input
                  type="text"
                  value={profileForm.first_name}
                  onChange={(e) => setProfileForm({ ...profileForm, first_name: e.target.value })}
                  className="input-field"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Last Name</label>
                <input
                  type="text"
                  value={profileForm.last_name}
                  onChange={(e) => setProfileForm({ ...profileForm, last_name: e.target.value })}
                  className="input-field"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Phone</label>
                <input
                  type="text"
                  value={profileForm.phone}
                  onChange={(e) => setProfileForm({ ...profileForm, phone: e.target.value })}
                  className="input-field"
                />
              </div>
            </div>

            <div className="border-t border-gray-100 px-6 py-4 flex justify-end gap-2">
              <button
                onClick={() => setShowProfileModal(false)}
                className="px-4 py-2 text-sm text-gray-600 hover:bg-gray-50 rounded-lg"
              >
                Cancel
              </button>
              <button
                onClick={handleProfileSave}
                disabled={savingProfile}
                className="px-4 py-2 text-sm bg-primary-600 text-white rounded-lg hover:bg-primary-700 disabled:opacity-50"
              >
                {savingProfile ? 'Saving...' : 'Save'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default AdminLayout;