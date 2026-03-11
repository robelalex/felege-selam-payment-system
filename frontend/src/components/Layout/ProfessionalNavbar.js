// // src/components/Layout/ProfessionalNavbar.js
// import React, { useState, useEffect } from 'react';
// import { Link, useNavigate, useLocation } from 'react-router-dom';
// import { motion, AnimatePresence } from 'framer-motion';
// import { 
//   Menu, 
//   X, 
//   School, 
//   Home, 
//   User, 
//   LogIn, 
//   LogOut,
//   LayoutDashboard,
//   Bell,
//   Settings,
//   CreditCard,
//   Search
// } from 'lucide-react';

// const ProfessionalNavbar = () => {
//   const [isOpen, setIsOpen] = useState(false);
//   const [scrolled, setScrolled] = useState(false);
//   const [isAdmin, setIsAdmin] = useState(false);
//   const navigate = useNavigate();
//   const location = useLocation();

//   useEffect(() => {
//     const checkAdmin = localStorage.getItem('isAdmin') === 'true';
//     setIsAdmin(checkAdmin);

//     const handleScroll = () => {
//       setScrolled(window.scrollY > 20);
//     };

//     window.addEventListener('scroll', handleScroll);
//     return () => window.removeEventListener('scroll', handleScroll);
//   }, []);

//   const handleLogout = () => {
//     localStorage.removeItem('isAdmin');
//     setIsAdmin(false);
//     navigate('/');
//   };

//   // Parent navigation links
//   const parentLinks = [
//     { to: '/', label: 'Home', icon: Home },
//     { to: '/search', label: 'Search Student', icon: Search },
//   ];

//   // Admin navigation links (only shown when logged in)
//   const adminLinks = [
//     { to: '/admin/dashboard', label: 'Dashboard', icon: LayoutDashboard },
//     { to: '/admin/reminders', label: 'Reminders', icon: Bell },
//     { to: '/admin/reports', label: 'Reports', icon: Settings },
//   ];

//   return (
//     <>
//       <nav className={`fixed top-0 w-full z-50 transition-all duration-300 ${
//         scrolled ? 'bg-white/80 backdrop-blur-md shadow-lg' : 'bg-transparent'
//       }`}>
//         <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
//           <div className="flex items-center justify-between h-16">
//             {/* Logo */}
//             <Link to="/" className="flex items-center space-x-2 group">
//               <div className="p-2 bg-primary-100 rounded-lg group-hover:bg-primary-200 transition-colors">
//                 <School className="h-6 w-6 text-primary-600" />
//               </div>
//               <span className="font-bold text-xl text-gray-900">
//                 Felege<span className="text-primary-600">Selam</span>
//               </span>
//             </Link>

//             {/* Desktop Navigation */}
//             <div className="hidden md:flex items-center space-x-4">
//               {/* Show different links based on user type */}
//               {!isAdmin ? (
//                 // Parent View
//                 parentLinks.map((link) => {
//                   const Icon = link.icon;
//                   const isActive = location.pathname === link.to;
//                   return (
//                     <Link
//                       key={link.to}
//                       to={link.to}
//                       className={`flex items-center space-x-2 px-3 py-2 rounded-lg transition-all duration-200 ${
//                         isActive
//                           ? 'bg-primary-50 text-primary-600'
//                           : 'text-gray-600 hover:bg-gray-100'
//                       }`}
//                     >
//                       <Icon className="h-5 w-5" />
//                       <span>{link.label}</span>
//                     </Link>
//                   );
//                 })
//               ) : (
//                 // Admin View
//                 adminLinks.map((link) => {
//                   const Icon = link.icon;
//                   const isActive = location.pathname === link.to;
//                   return (
//                     <Link
//                       key={link.to}
//                       to={link.to}
//                       className={`flex items-center space-x-2 px-3 py-2 rounded-lg transition-all duration-200 ${
//                         isActive
//                           ? 'bg-primary-50 text-primary-600'
//                           : 'text-gray-600 hover:bg-gray-100'
//                       }`}
//                     >
//                       <Icon className="h-5 w-5" />
//                       <span>{link.label}</span>
//                     </Link>
//                   );
//                 })
//               )}

//               {/* Auth Button */}
//               {isAdmin ? (
//                 <button
//                   onClick={handleLogout}
//                   className="flex items-center space-x-2 px-4 py-2 bg-red-50 text-red-600 rounded-lg hover:bg-red-100 transition-colors"
//                 >
//                   <LogOut className="h-5 w-5" />
//                   <span>Logout</span>
//                 </button>
//               ) : (
//                 <Link
//                   to="/admin/login"
//                   className="flex items-center space-x-2 px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition-colors"
//                 >
//                   <LogIn className="h-5 w-5" />
//                   <span>Admin Login</span>
//                 </Link>
//               )}
//             </div>

//             {/* Mobile menu button */}
//             <button
//               onClick={() => setIsOpen(!isOpen)}
//               className="md:hidden p-2 rounded-lg hover:bg-gray-100 transition-colors"
//             >
//               {isOpen ? <X className="h-6 w-6" /> : <Menu className="h-6 w-6" />}
//             </button>
//           </div>
//         </div>
//       </nav>

//       {/* Mobile menu */}
//       <AnimatePresence>
//         {isOpen && (
//           <motion.div
//             initial={{ opacity: 0, height: 0 }}
//             animate={{ opacity: 1, height: 'auto' }}
//             exit={{ opacity: 0, height: 0 }}
//             className="fixed top-16 left-0 right-0 bg-white shadow-lg z-40 md:hidden"
//           >
//             <div className="px-4 py-2 space-y-1">
//               {/* Mobile Parent Links */}
//               {!isAdmin && parentLinks.map((link) => {
//                 const Icon = link.icon;
//                 return (
//                   <Link
//                     key={link.to}
//                     to={link.to}
//                     className="flex items-center space-x-3 px-4 py-3 rounded-lg hover:bg-gray-100 transition-colors"
//                     onClick={() => setIsOpen(false)}
//                   >
//                     <Icon className="h-5 w-5 text-gray-600" />
//                     <span className="text-gray-900">{link.label}</span>
//                   </Link>
//                 );
//               })}

//               {/* Mobile Admin Links */}
//               {isAdmin && adminLinks.map((link) => {
//                 const Icon = link.icon;
//                 return (
//                   <Link
//                     key={link.to}
//                     to={link.to}
//                     className="flex items-center space-x-3 px-4 py-3 rounded-lg hover:bg-gray-100 transition-colors"
//                     onClick={() => setIsOpen(false)}
//                   >
//                     <Icon className="h-5 w-5 text-gray-600" />
//                     <span className="text-gray-900">{link.label}</span>
//                   </Link>
//                 );
//               })}
              
//               {/* Mobile Auth Button */}
//               {isAdmin ? (
//                 <button
//                   onClick={() => {
//                     handleLogout();
//                     setIsOpen(false);
//                   }}
//                   className="w-full flex items-center space-x-3 px-4 py-3 rounded-lg hover:bg-red-50 text-red-600 transition-colors"
//                 >
//                   <LogOut className="h-5 w-5" />
//                   <span>Logout</span>
//                 </button>
//               ) : (
//                 <Link
//                   to="/admin/login"
//                   className="flex items-center space-x-3 px-4 py-3 rounded-lg hover:bg-primary-50 text-primary-600 transition-colors"
//                   onClick={() => setIsOpen(false)}
//                 >
//                   <LogIn className="h-5 w-5" />
//                   <span>Admin Login</span>
//                 </Link>
//               )}
//             </div>
//           </motion.div>
//         )}
//       </AnimatePresence>

//       {/* Spacer to prevent content from hiding under navbar */}
//       <div className="h-16" />
//     </>
//   );
// };

// export default ProfessionalNavbar;