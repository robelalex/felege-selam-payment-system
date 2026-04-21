// src/components/Admin/YearSelector.js
import React, { useEffect } from 'react';
import { useYear } from '../../context/YearContext';
import { Calendar, CheckCircle } from 'lucide-react';

const YearSelector = () => {
  const { allYears, selectedYear, switchYear, currentYear, refreshYears } = useYear();

  useEffect(() => {
    // Listen for year change events
    const handleYearChange = () => {
      // Force a refresh of the page data
      window.dispatchEvent(new CustomEvent('refreshData'));
    };
    
    window.addEventListener('yearChanged', handleYearChange);
    return () => window.removeEventListener('yearChanged', handleYearChange);
  }, []);

  if (!allYears.length) return null;

  const handleYearChange = (e) => {
    const yearId = parseInt(e.target.value);
    const year = allYears.find(y => y.id === yearId);
    switchYear(year);
    
    // Dispatch event to refresh all components
    window.dispatchEvent(new CustomEvent('yearChanged', { detail: year }));
    
    // Small delay to allow components to refresh
    setTimeout(() => {
      window.location.reload(); // Force full page reload to refresh all data
    }, 100);
  };

  return (
    <div className="flex items-center gap-2 bg-white rounded-lg shadow-sm border border-gray-200 px-3 py-1.5">
      <Calendar className="h-4 w-4 text-gray-400" />
      <select
        value={selectedYear?.id || ''}
        onChange={handleYearChange}
        className="border-0 bg-transparent py-1 pr-6 text-sm font-medium text-gray-700 focus:ring-0 cursor-pointer"
      >
        {allYears.map(year => (
          <option key={year.id} value={year.id}>
            {year.name} {year.is_current ? ' (Current)' : ''}
          </option>
        ))}
      </select>
      {selectedYear?.is_current && (
        <CheckCircle className="h-4 w-4 text-green-500" title="Current Year" />
      )}
    </div>
  );
};

export default YearSelector;