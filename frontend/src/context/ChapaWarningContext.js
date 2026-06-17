// src/context/ChapaWarningContext.js
import React, { createContext, useContext, useEffect, useState } from 'react';
import api from '../services/api';

const ChapaWarningContext = createContext();

export const ChapaWarningProvider = ({ children }) => {
  const [chapaConfigured, setChapaConfigured] = useState(true);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const checkChapaStatus = async () => {
      try {
        const response = await api.get('/schools/chapa-config/');
        const configured = response.data.chapa_enabled && !!response.data.chapa_api_key;
        setChapaConfigured(configured);
      } catch (e) {
        setChapaConfigured(false);
      } finally {
        setLoading(false);
      }
    };
    checkChapaStatus();
  }, []);

  return (
    <ChapaWarningContext.Provider value={{ chapaConfigured, loading, setChapaConfigured }}>
      {children}
    </ChapaWarningContext.Provider>
  );
};

export const useChapaWarning = () => useContext(ChapaWarningContext);