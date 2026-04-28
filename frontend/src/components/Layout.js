// src/components/Layout.js
import React, { useState, useEffect } from 'react';
import Navbar from './Navbar';

function Layout({ children }) {
  const [schoolName, setSchoolName] = useState('School');
  const currentYear = new Date().getFullYear();

  useEffect(() => {
    const savedSchool = localStorage.getItem('selectedSchool');
    if (savedSchool) {
      try {
        const school = JSON.parse(savedSchool);
        setSchoolName(school.name || 'School');
      } catch (e) {
        console.error('Error parsing school:', e);
      }
    }
  }, []);

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-purple-50">
      <Navbar />
      <main className="container mx-auto px-4 py-8 animate-fade-in">
        {children}
      </main>
      <footer className="bg-white/80 backdrop-blur-sm border-t border-gray-200 py-6 mt-12">
        <div className="container mx-auto px-4 text-center text-gray-600">
          <p>© {currentYear} {schoolName}. All rights reserved.</p>
          <p className="text-sm mt-2">Modern Payment System for Ethiopian Schools</p>
        </div>
      </footer>
    </div>
  );
}

export default Layout;