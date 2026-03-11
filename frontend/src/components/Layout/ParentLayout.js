// src/components/Layout/ParentLayout.js
import React from 'react';
import { Link } from 'react-router-dom';
import { School } from 'lucide-react';

const ParentLayout = ({ children }) => {
  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-purple-50">
      {/* Simple Header - Only Logo */}
      <header className="bg-white/80 backdrop-blur-sm border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-4 py-4">
          <Link to="/" className="flex items-center space-x-2 w-fit">
            <div className="p-2 bg-primary-100 rounded-lg">
              <School className="h-6 w-6 text-primary-600" />
            </div>
            <span className="font-bold text-xl text-gray-900">
              Felege<span className="text-primary-600">Selam</span>
            </span>
          </Link>
        </div>
      </header>

      {/* Main Content - Centered */}
      <main className="max-w-7xl mx-auto px-4 py-12">
        {children}
      </main>

      {/* Simple Footer */}
      <footer className="bg-white/80 backdrop-blur-sm border-t border-gray-200 mt-auto">
        <div className="max-w-7xl mx-auto px-4 py-4 text-center text-sm text-gray-600">
          © 2026 Felege Selam School. All rights reserved.
        </div>
      </footer>
    </div>
  );
};

export default ParentLayout;