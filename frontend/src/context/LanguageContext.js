// src/context/LanguageContext.js
import React, { createContext, useState, useContext } from 'react';
import translations from '../i18n/translations';

const LanguageContext = createContext();

export const useLanguage = () => {
  const context = useContext(LanguageContext);
  if (!context) {
    throw new Error('useLanguage must be used within a LanguageProvider');
  }
  return context;
};

export const SUPPORTED_LANGUAGES = [
  { code: 'en', label: 'English', shortLabel: 'EN' },
  { code: 'am', label: 'አማርኛ', shortLabel: 'አማ' },
  { code: 'om', label: 'Afaan Oromoo', shortLabel: 'OM' },
];

export const LanguageProvider = ({ children }) => {
  const [language, setLanguageState] = useState(
    localStorage.getItem('appLanguage') || 'en'
  );

  const setLanguage = (code) => {
    setLanguageState(code);
    localStorage.setItem('appLanguage', code);
  };

  // t('some_key') looks up the current language's dictionary, falling back
  // to English, then to the raw key itself so missing translations never
  // crash the UI — they just show the English (or key) text until added.
  const t = (key) => {
    return (
      translations[language]?.[key] ??
      translations.en?.[key] ??
      key
    );
  };

  return (
    <LanguageContext.Provider value={{ language, setLanguage, t }}>
      {children}
    </LanguageContext.Provider>
  );
};
