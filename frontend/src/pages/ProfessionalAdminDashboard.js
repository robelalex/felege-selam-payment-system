// // frontend/src/pages/ProfessionalAdminDashboard.js
// import React, { useState, useEffect } from 'react';
// import { motion } from 'framer-motion';
// import { 
//   Users, 
//   CreditCard, 
//   Clock, 
//   CheckCircle,
//   TrendingUp,
//   Calendar,
//   Download,
//   Bell,
//   School,
//   AlertCircle,
//   DollarSign,
//   UserCheck,
//   UserX
// } from 'lucide-react';
// import api from '../services/api'; // ✅ FIXED: Using api instance
// import { Link } from 'react-router-dom';

// function ProfessionalAdminDashboard() {
//   const [stats, setStats] = useState({
//     totalStudents: 0,
//     totalCollected: 0,
//     pendingPayments: 0,
//     collectionRate: 0,
//     byGrade: {},
//     recentPayments: []
//   });
//   const [loading, setLoading] = useState(true);

//   useEffect(() => {
//     fetchDashboardData();
//   }, []);

//   const fetchDashboardData = async () => {
//     try {
//       // ✅ FIXED: Using api instance instead of axios with hardcoded URL
//       const [studentsRes, paymentsRes, pendingRes] = await Promise.all([
//         api.get('/students/'),
//         api.get('/payments/'),
//         api.get('/reminders/pending/')
//       ]);

//       const students = studentsRes.data;
//       const payments = paymentsRes.data;
//       const pending = pendingRes.data;

//       // Calculate statistics
//       const verifiedPayments = payments.filter(p => p.status === 'verified');
//       const totalCollected = verifiedPayments.reduce((sum, p) => sum + parseFloat(p.amount), 0);
      
//       // Group by grade
//       const byGrade = {};
//       for (let grade = 1; grade <= 8; grade++) {
//         const gradeStudents = students.filter(s => s.grade === grade);
//         const gradePending = pending.students?.filter(s => s.grade === grade) || [];
        
//         byGrade[grade] = {
//           total: gradeStudents.length,
//           pending: gradePending.length,
//           paid: gradeStudents.length - gradePending.length,
//           collectionRate: gradeStudents.length > 0 
//             ? Math.round(((gradeStudents.length - gradePending.length) / gradeStudents.length) * 100)
//             : 0
//         };
//       }

//       setStats({
//         totalStudents: students.length,
//         totalCollected,
//         pendingPayments: pending.total_pending || 0,
//         collectionRate: students.length > 0 
//           ? Math.round(((students.length - (pending.total_pending || 0)) / students.length) * 100)
//           : 0,
//         byGrade,
//         recentPayments: payments.slice(0, 5)
//       });

//     } catch (err) {
//       console.error('Error fetching dashboard data:', err);
//     } finally {
//       setLoading(false);
//     }
//   };

//   if (loading) {
//     return (
//       <div className="min-h-screen flex items-center justify-center">
//         <div className="text-center">
//           <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600 mx-auto"></div>
//           <p className="mt-4 text-gray-600">Loading dashboard...</p>
//         </div>
//       </div>
//     );
//   }

//   return (
//     <div className="space-y-6">
//       {/* Header */}
//       <div className="flex items-center justify-between">
//         <div>
//           <h1 className="text-3xl font-bold text-gray-900">ጤና ይድረስ ለአስተዳዳሪ</h1>
//           <p className="text-gray-600 mt-1">Welcome back! Here's your school overview</p>
//         </div>
//         <div className="flex gap-3">
//           <button className="px-4 py-2 bg-white rounded-lg shadow-sm hover:shadow flex items-center gap-2">
//             <Download className="h-4 w-4" />
//             Export Report
//           </button>
//           <button className="px-4 py-2 bg-primary-600 text-white rounded-lg shadow-sm hover:bg-primary-700 flex items-center gap-2">
//             <Bell className="h-4 w-4" />
//             Send Reminders
//           </button>
//         </div>
//       </div>

//       {/* Stats Cards */}
//       <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
//         <motion.div
//           initial={{ opacity: 0, y: 20 }}
//           animate={{ opacity: 1, y: 0 }}
//           transition={{ delay: 0.1 }}
//           className="bg-gradient-to-br from-blue-600 to-blue-700 rounded-2xl shadow-lg p-6 text-white"
//         >
//           <div className="flex items-center justify-between">
//             <div>
//               <p className="text-blue-100 text-sm">ተማሪዎች በሙሉ</p>
//               <p className="text-3xl font-bold mt-2">{stats.totalStudents}</p>
//               <p className="text-xs text-blue-200 mt-2">Total Students</p>
//             </div>
//             <Users className="h-12 w-12 text-white/30" />
//           </div>
//         </motion.div>

//         <motion.div
//           initial={{ opacity: 0, y: 20 }}
//           animate={{ opacity: 1, y: 0 }}
//           transition={{ delay: 0.2 }}
//           className="bg-gradient-to-br from-green-600 to-green-700 rounded-2xl shadow-lg p-6 text-white"
//         >
//           <div className="flex items-center justify-between">
//             <div>
//               <p className="text-green-100 text-sm">የተሰበሰበ ገንዘብ</p>
//               <p className="text-3xl font-bold mt-2">{stats.totalCollected.toLocaleString()} ብር</p>
//               <p className="text-xs text-green-200 mt-2">Total Collected</p>
//             </div>
//             <DollarSign className="h-12 w-12 text-white/30" />
//           </div>
//         </motion.div>

//         <motion.div
//           initial={{ opacity: 0, y: 20 }}
//           animate={{ opacity: 1, y: 0 }}
//           transition={{ delay: 0.3 }}
//           className="bg-gradient-to-br from-yellow-600 to-yellow-700 rounded-2xl shadow-lg p-6 text-white"
//         >
//           <div className="flex items-center justify-between">
//             <div>
//               <p className="text-yellow-100 text-sm">ያልተከፈለ ክፍያ</p>
//               <p className="text-3xl font-bold mt-2">{stats.pendingPayments}</p>
//               <p className="text-xs text-yellow-200 mt-2">Pending Payments</p>
//             </div>
//             <Clock className="h-12 w-12 text-white/30" />
//           </div>
//         </motion.div>

//         <motion.div
//           initial={{ opacity: 0, y: 20 }}
//           animate={{ opacity: 1, y: 0 }}
//           transition={{ delay: 0.4 }}
//           className="bg-gradient-to-br from-purple-600 to-purple-700 rounded-2xl shadow-lg p-6 text-white"
//         >
//           <div className="flex items-center justify-between">
//             <div>
//               <p className="text-purple-100 text-sm">የክፍያ መጠን</p>
//               <p className="text-3xl font-bold mt-2">{stats.collectionRate}%</p>
//               <p className="text-xs text-purple-200 mt-2">Collection Rate</p>
//             </div>
//             <TrendingUp className="h-12 w-12 text-white/30" />
//           </div>
//         </motion.div>
//       </div>

//       {/* Grade Overview */}
//       <div className="bg-white rounded-2xl shadow-lg p-6">
//         <h2 className="text-xl font-semibold text-gray-800 mb-4">የክፍል ሁኔታ (Grade Overview)</h2>
//         <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
//           {[1,2,3,4,5,6,7,8].map(grade => {
//             const gradeStats = stats.byGrade[grade] || { total: 0, pending: 0, paid: 0, collectionRate: 0 };
//             return (
//               <div key={grade} className="border border-gray-200 rounded-xl p-4 hover:shadow-md transition-shadow">
//                 <div className="flex items-center justify-between mb-3">
//                   <h3 className="font-bold text-lg text-gray-800">ክፍል {grade}</h3>
//                   <span className={`px-2 py-1 rounded-full text-xs ${
//                     gradeStats.collectionRate > 80 ? 'bg-green-100 text-green-700' :
//                     gradeStats.collectionRate > 50 ? 'bg-yellow-100 text-yellow-700' :
//                     'bg-red-100 text-red-700'
//                   }`}>
//                     {gradeStats.collectionRate}%
//                   </span>
//                 </div>
//                 <div className="space-y-2 text-sm">
//                   <div className="flex justify-between">
//                     <span className="text-gray-600">ተማሪዎች:</span>
//                     <span className="font-semibold">{gradeStats.total}</span>
//                   </div>
//                   <div className="flex justify-between">
//                     <span className="text-gray-600">የከፈሉ:</span>
//                     <span className="font-semibold text-green-600">{gradeStats.paid}</span>
//                   </div>
//                   <div className="flex justify-between">
//                     <span className="text-gray-600">ያልከፈሉ:</span>
//                     <span className="font-semibold text-red-600">{gradeStats.pending}</span>
//                   </div>
//                 </div>
//               </div>
//             );
//           })}
//         </div>
//       </div>

//       {/* Quick Actions */}
//       <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
//         <Link to="/admin/students" className="bg-white rounded-xl shadow-lg p-6 hover:shadow-xl transition-all group">
//           <div className="flex items-center gap-4">
//             <div className="p-3 bg-blue-100 rounded-lg group-hover:bg-blue-200 transition-colors">
//               <Users className="h-6 w-6 text-blue-600" />
//             </div>
//             <div>
//               <h3 className="font-semibold text-gray-800">ተማሪዎችን መዝግብ</h3>
//               <p className="text-sm text-gray-500">Register new students</p>
//             </div>
//           </div>
//         </Link>

//         <Link to="/admin/reminders" className="bg-white rounded-xl shadow-lg p-6 hover:shadow-xl transition-all group">
//           <div className="flex items-center gap-4">
//             <div className="p-3 bg-yellow-100 rounded-lg group-hover:bg-yellow-200 transition-colors">
//               <Bell className="h-6 w-6 text-yellow-600" />
//             </div>
//             <div>
//               <h3 className="font-semibold text-gray-800">አስታዋሽ ላክ</h3>
//               <p className="text-sm text-gray-500">Send SMS reminders</p>
//             </div>
//           </div>
//         </Link>

//         <Link to="/admin/reports" className="bg-white rounded-xl shadow-lg p-6 hover:shadow-xl transition-all group">
//           <div className="flex items-center gap-4">
//             <div className="p-3 bg-green-100 rounded-lg group-hover:bg-green-200 transition-colors">
//               <TrendingUp className="h-6 w-6 text-green-600" />
//             </div>
//             <div>
//               <h3 className="font-semibold text-gray-800">ሪፖርት አውጣ</h3>
//               <p className="text-sm text-gray-500">Generate reports</p>
//             </div>
//           </div>
//         </Link>
//       </div>
//     </div>
//   );
// }

// export default ProfessionalAdminDashboard;