// // src/components/Navbar.js
// import React from 'react';
// import { Link, useNavigate } from 'react-router-dom';
// import 'bootstrap/dist/css/bootstrap.min.css';

// function Navbar() {
//   const navigate = useNavigate();
//   const isAdmin = localStorage.getItem('isAdmin') === 'true';

//   const handleLogout = () => {
//     localStorage.removeItem('isAdmin');
//     navigate('/');
//   };

//   return (
//     <nav className="navbar navbar-expand-lg navbar-dark bg-dark">
//       <div className="container">
//         <Link className="navbar-brand" to="/">
//           Felege Selam School
//         </Link>
        
//         <button 
//           className="navbar-toggler" 
//           type="button" 
//           data-bs-toggle="collapse" 
//           data-bs-target="#navbarNav"
//         >
//           <span className="navbar-toggler-icon"></span>
//         </button>

//         <div className="collapse navbar-collapse" id="navbarNav">
//           <ul className="navbar-nav me-auto">
//             <li className="nav-item">
//               <Link className="nav-link" to="/">Home</Link>
//             </li>
//             {isAdmin && (
//               <>
//                 <li className="nav-item">
//                   <Link className="nav-link" to="/admin">Admin Dashboard</Link>
//                 </li>
//                 <li className="nav-item">
//                   <Link className="nav-link" to="/reminders">SMS Reminders</Link>
//                 </li>
//                 <li className="nav-item">
//                   <Link className="nav-link" to="/reports">Reports</Link>
//                 </li>
//               </>
//             )}
//           </ul>

//           {isAdmin ? (
//             <button className="btn btn-outline-light" onClick={handleLogout}>
//               Logout
//             </button>
//           ) : (
//             <button 
//               className="btn btn-outline-light"
//               onClick={() => {
//                 const password = prompt('Enter admin password:');
//                 if (password === 'admin123') { // Change this in production!
//                   localStorage.setItem('isAdmin', 'true');
//                   window.location.reload();
//                 } else {
//                   alert('Invalid password');
//                 }
//               }}
//             >
//               Admin Login
//             </button>
//           )}
//         </div>
//       </div>
//     </nav>
//   );
// }

// export default Navbar;