// src/components/Layout/ParentLayout.js
import React, { useState, useEffect } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { School, Home } from 'lucide-react';

const ParentLayout = ({ children }) => {
  const [schoolName, setSchoolName] = useState('School');
  const [schoolLogo, setSchoolLogo] = useState(null);
  const [isVerified, setIsVerified] = useState(false);
  const location = useLocation();
  const currentYear = new Date().getFullYear();

  useEffect(() => {
    // Check if we are in verified state (student selected or dashboard page)
    const isOnStudentPage = location.pathname.includes('/student/');
    const isOnPaymentPage = location.pathname.includes('/payment');
    const isVerifiedPage = isOnStudentPage || isOnPaymentPage;
    
    setIsVerified(isVerifiedPage);
    
    // Only show actual school name on verified pages
    if (isVerifiedPage) {
      const savedSchool = localStorage.getItem('selectedSchool');
      if (savedSchool) {
        try {
          const school = JSON.parse(savedSchool);
          setSchoolName(school.name || 'School');
          setSchoolLogo(school.logo || null);
        } catch (e) {
          console.error('Error parsing school:', e);
        }
      }
    } else {
      // During verification (email/OTP steps), show generic
      setSchoolName('Parent Portal');
      setSchoolLogo(null);
    }
  }, [location]);

  return (
    <div className="min-h-screen bg-gradient-to-br from-indigo-50 via-white to-purple-50">
      {/* Simple Header - Generic during verification, School name after */}
      <header className="bg-white/80 backdrop-blur-sm border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-4 py-4">
          <Link to="/" className="flex items-center space-x-2 w-fit">
            {schoolLogo && isVerified ? (
              <img 
                src={schoolLogo} 
                alt={schoolName} 
                className="h-8 w-8 rounded-full object-cover"
              />
            ) : (
              <div className="p-2 bg-indigo-100 rounded-lg">
                <Home className="h-5 w-5 text-indigo-600" />
              </div>
            )}
            <span className="font-bold text-xl text-gray-900">
              {isVerified ? schoolName : 'Parent Portal'}
            </span>
          </Link>
        </div>
      </header>

      {/* Main Content - Centered */}
      <main className="max-w-7xl mx-auto px-4 py-12">
        {children}
      </main>

      {/* Simple Footer - Generic during verification */}
      <footer className="bg-white/80 backdrop-blur-sm border-t border-gray-200 mt-auto">
        <div className="max-w-7xl mx-auto px-4 py-4 text-center text-sm text-gray-500">
          © {currentYear} {isVerified ? schoolName : 'Secure Payment Portal'}. All rights reserved.
        </div>
      </footer>
    </div>
  );
};

export default ParentLayout;