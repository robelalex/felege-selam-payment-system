// src/context/ChapaWarningContext.js
import React, { createContext, useContext, useEffect, useState } from 'react';
import api from '../services/api';

// ✅ FIX: without a default value here, useChapaWarning() returns `undefined`
// on any route that isn't wrapped in <ChapaWarningProvider> — and since the
// sidebar's ChapaStatusBadge renders on EVERY admin page (not just the one
// route that wraps the provider), that crashed the whole app on pages like
// /admin/sections. A safe default means the badge just quietly assumes
// "configured" until a real provider overrides it, instead of crashing.
const ChapaWarningContext = createContext({
  chapaConfigured: true,
  loading: false,
  setChapaConfigured: () => {},
});

export const ChapaWarningProvider = ({ children }) => {
  const [chapaConfigured, setChapaConfigured] = useState(true);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const checkChapaStatus = async () => {
      try {
        // ✅ FIX: this background badge check used to hit
        // /schools/chapa-config/ — the same endpoint the real Chapa
        // Settings page uses, which now requires a fresh password
        // re-auth token. This check runs on every admin page load and
        // never has that token (nor should it, just to draw a badge),
        // so it always got a 401 and the badge permanently showed
        // "Not Configured" even when Chapa was working fine. This uses
        // a separate, secret-free status endpoint that isn't gated by
        // re-auth.
        const response = await api.get('/schools/chapa-status/');
        setChapaConfigured(!!response.data.chapa_enabled);
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