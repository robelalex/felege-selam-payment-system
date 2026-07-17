// src/components/UI/LanguageToggle.js
import React from 'react';
import { useLanguage, SUPPORTED_LANGUAGES } from '../../context/LanguageContext';

// Always-visible segmented control — EN / አማ / OM — no dropdown, no
// positioning logic, so it can never render off-screen no matter where
// it's placed (sidebar footer, auth header, wherever). One click, done.
const LanguageToggle = ({ collapsedIcon = false }) => {
  const { language, setLanguage } = useLanguage();

  if (collapsedIcon) {
    // Sidebar-collapsed state: stack short codes vertically, still all visible
    return (
      <div className="flex flex-col items-center gap-1">
        {SUPPORTED_LANGUAGES.map((lang) => (
          <button
            key={lang.code}
            onClick={() => setLanguage(lang.code)}
            className={`w-9 py-1 rounded-md text-[10px] font-semibold transition-colors ${
              lang.code === language
                ? 'bg-primary-600 text-white'
                : 'text-gray-500 hover:bg-gray-100'
            }`}
            title={lang.label}
          >
            {lang.shortLabel}
          </button>
        ))}
      </div>
    );
  }

  return (
    <div className="inline-flex items-center bg-gray-100 rounded-lg p-1 gap-1">
      {SUPPORTED_LANGUAGES.map((lang) => (
        <button
          key={lang.code}
          onClick={() => setLanguage(lang.code)}
          className={`px-3 py-1.5 rounded-md text-xs font-semibold transition-colors ${
            lang.code === language
              ? 'bg-white text-primary-700 shadow-sm'
              : 'text-gray-500 hover:text-gray-700'
          }`}
        >
          {lang.shortLabel}
        </button>
      ))}
    </div>
  );
};

export default LanguageToggle;
