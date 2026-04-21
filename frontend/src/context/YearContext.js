// src/context/YearContext.js
import React, { createContext, useState, useContext, useEffect } from 'react';
import academicYearService from '../services/academicYearService';
import api from '../services/api';

const YearContext = createContext();

export const useYear = () => {
  const context = useContext(YearContext);
  if (!context) {
    throw new Error('useYear must be used within a YearProvider');
  }
  return context;
};

export const YearProvider = ({ children }) => {
  const [currentYear, setCurrentYear] = useState(null);
  const [allYears, setAllYears] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedYear, setSelectedYear] = useState(null);

  useEffect(() => {
    fetchYears();
  }, []);

  const fetchYears = async () => {
    try {
      // Fetch all years
      const yearsData = await api.get('/academic-years/');
      setAllYears(yearsData.data);
      
      // Fetch current year
      const currentData = await api.get('/academic-years/current/').catch(() => null);
      setCurrentYear(currentData?.data || null);
      
      // Check localStorage for saved selection
      const savedYear = localStorage.getItem('selectedAcademicYear');
      let yearToSelect = null;
      
      if (savedYear) {
        try {
          yearToSelect = JSON.parse(savedYear);
          // Verify the saved year still exists
          const exists = yearsData.data.some(y => y.id === yearToSelect.id);
          if (!exists) yearToSelect = null;
        } catch (e) {
          console.error('Error parsing saved year:', e);
        }
      }
      
      // Default to current year if no saved selection
      const finalSelected = yearToSelect || currentData?.data || (yearsData.data[0] || null);
      setSelectedYear(finalSelected);
      
      // Store in localStorage
      if (finalSelected) {
        localStorage.setItem('selectedAcademicYear', JSON.stringify(finalSelected));
      }
    } catch (err) {
      console.error('Error fetching years:', err);
    } finally {
      setLoading(false);
    }
  };

  const switchYear = async (year) => {
    setSelectedYear(year);
    localStorage.setItem('selectedAcademicYear', JSON.stringify(year));
    
    // Dispatch a custom event to notify all components
    window.dispatchEvent(new CustomEvent('yearChanged', { detail: year }));
    
    // Also dispatch refresh event to update dashboard
    window.dispatchEvent(new CustomEvent('refreshData'));
  };

  const refreshYears = async () => {
    await fetchYears();
  };

  const setAsCurrentYear = async (yearId) => {
    try {
      await api.post(`/academic-years/${yearId}/set_current/`);
      await fetchYears(); // Refresh all years
      return true;
    } catch (err) {
      console.error('Error setting current year:', err);
      return false;
    }
  };

  return (
    <YearContext.Provider value={{
      currentYear,
      allYears,
      selectedYear,
      loading,
      switchYear,
      refreshYears,
      setAsCurrentYear
    }}>
      {children}
    </YearContext.Provider>
  );
};