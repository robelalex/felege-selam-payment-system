// src/components/Auth/AuthSplitLayout.js
// Shared shell for the Admin Login / Register screens.
// eSchool-style split panel: branded left side, form on the right.
// Purely presentational — takes no data/handlers, so it can wrap any form
// without touching that form's state or submit logic.
import React from 'react';
import { GraduationCap, ShieldCheck, Users, BarChart3 } from 'lucide-react';
import { useLanguage } from '../../context/LanguageContext';
import LanguageToggle from '../UI/LanguageToggle';
import { PLATFORM_NAME } from '../../config/brand';

const AuthSplitLayout = ({ children, panelTitle, panelSubtitle }) => {
  const { t } = useLanguage();

  const FEATURES = [
    { icon: Users, text: 'Manage students, staff, and parents in one place' },
    { icon: BarChart3, text: 'Track payments, deadlines, and reports at a glance' },
    { icon: ShieldCheck, text: 'OTP-secured logins and payment links' },
  ];

  return (
    <div className="min-h-screen flex bg-gray-50">
      {/* Language toggle, top-right, visible on every auth screen */}
      <div className="absolute top-4 right-4 z-20 bg-white rounded-lg shadow-sm border border-gray-100 p-1">
        <LanguageToggle />
      </div>

      {/* Left brand panel — hidden on small screens, eSchool-style */}
      <div className="hidden lg:flex lg:w-[42%] relative bg-gradient-to-br from-primary-700 via-primary-600 to-indigo-700 text-white flex-col justify-between p-12 overflow-hidden">
        {/* Decorative background circles */}
        <div className="absolute -top-24 -right-24 w-72 h-72 rounded-full bg-white/10" />
        <div className="absolute bottom-0 -left-16 w-56 h-56 rounded-full bg-white/10" />

        <div className="relative z-10">
          <div className="flex items-center gap-3 mb-16">
            <div className="w-11 h-11 bg-white/15 rounded-xl flex items-center justify-center backdrop-blur-sm">
              <GraduationCap className="h-6 w-6 text-white" />
            </div>
            <span className="text-xl font-bold tracking-tight">{PLATFORM_NAME}</span>
          </div>

          <h1 className="text-3xl xl:text-4xl font-bold leading-tight mb-4">
            {panelTitle || t('brand_login_title')}
          </h1>
          <p className="text-primary-100 text-base leading-relaxed max-w-md">
            {panelSubtitle || t('brand_login_subtitle')}
          </p>
        </div>

        <div className="relative z-10 space-y-4">
          {FEATURES.map(({ icon: Icon, text }) => (
            <div key={text} className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-lg bg-white/15 flex items-center justify-center flex-shrink-0">
                <Icon className="h-4 w-4 text-white" />
              </div>
              <span className="text-sm text-primary-50">{text}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Right form panel */}
      <div className="flex-1 flex items-center justify-center p-4 sm:p-8">
        <div className="w-full max-w-md">
          {/* Mobile-only compact brand mark, since the left panel is hidden below lg */}
          <div className="lg:hidden flex items-center gap-2 justify-center mb-8">
            <div className="w-9 h-9 bg-primary-600 rounded-lg flex items-center justify-center">
              <GraduationCap className="h-5 w-5 text-white" />
            </div>
            <span className="font-bold text-gray-800">{PLATFORM_NAME}</span>
          </div>
          {children}
        </div>
      </div>
    </div>
  );
};

export default AuthSplitLayout;
