// src/components/Layout/ParentLayout.js
import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { School } from 'lucide-react';

const ParentLayout = ({ children }) => {
  const [schoolName, setSchoolName] = useState('School');
  const [schoolLogo, setSchoolLogo] = useState(null);
  const currentYear = new Date().getFullYear();

  useEffect(() => {
    // Get school info from localStorage
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
  }, []);

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-purple-50">
      {/* Simple Header - Dynamic School Name */}
      <header className="bg-white/80 backdrop-blur-sm border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-4 py-4">
          <Link to="/" className="flex items-center space-x-2 w-fit">
            {schoolLogo ? (
              <img 
                src={schoolLogo} 
                alt={schoolName} 
                className="h-8 w-8 rounded-full object-cover"
              />
            ) : (
              <div className="p-2 bg-primary-100 rounded-lg">
                <School className="h-6 w-6 text-primary-600" />
              </div>
            )}
            <span className="font-bold text-xl text-gray-900">
              {schoolName}
            </span>
          </Link>
        </div>
      </header>

      {/* Main Content - Centered */}
      <main className="max-w-7xl mx-auto px-4 py-12">
        {children}
      </main>

      {/* Simple Footer - Dynamic School Name & Year */}
      <footer className="bg-white/80 backdrop-blur-sm border-t border-gray-200 mt-auto">
        <div className="max-w-7xl mx-auto px-4 py-4 text-center text-sm text-gray-600">
          © {currentYear} {schoolName}. All rights reserved.
        </div>
      </footer>
    </div>
  );
};

export default ParentLayout;