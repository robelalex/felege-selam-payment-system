// src/pages/StudentSearch.js
import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { getStudentById } from '../services/api';
import { 
  Search, 
  User, 
  School, 
  ArrowRight, 
  AlertCircle,
  Loader 
} from 'lucide-react';

function StudentSearch() {
  const [studentId, setStudentId] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const navigate = useNavigate();

  const handleSearch = async (e) => {
    e.preventDefault();
    
    if (!studentId.trim()) {
      setError('Please enter a Student ID');
      return;
    }

    setLoading(true);
    setError('');

    try {
      const response = await getStudentById(studentId);
      navigate(`/student/${studentId}`);
    } catch (err) {
      console.error('Search error:', err);
      if (err.response && err.response.status === 404) {
        setError('Student not found. Please check the ID and try again.');
      } else {
        setError('An error occurred. Please try again later.');
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-4xl mx-auto">
      {/* Hero Section */}
      <div className="text-center mb-12 animate-slide-up">
        <div className="inline-flex items-center justify-center p-2 bg-primary-100 rounded-full mb-4">
          <School className="h-8 w-8 text-primary-600" />
        </div>
        <h1 className="text-4xl font-bold text-gray-900 mb-4">
          Felege Selam School
        </h1>
        <p className="text-xl text-gray-600">
          Secure Online Payment Portal
        </p>
      </div>

      {/* Search Card */}
      <div className="card max-w-md mx-auto transform hover:scale-105 transition-transform duration-300">
        <div className="text-center mb-6">
          <div className="inline-flex items-center justify-center w-16 h-16 bg-primary-100 rounded-full mb-4">
            <User className="h-8 w-8 text-primary-600" />
          </div>
          <h2 className="text-2xl font-semibold text-gray-800">
            Parent Portal
          </h2>
          <p className="text-gray-600 mt-2">
            Enter your child's Student ID to continue
          </p>
        </div>

        <form onSubmit={handleSearch} className="space-y-4">
          <div>
            <label htmlFor="studentId" className="block text-sm font-medium text-gray-700 mb-1">
              Student ID
            </label>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-5 w-5 text-gray-400" />
              <input
                type="text"
                id="studentId"
                className="input-field pl-10"
                placeholder="e.g., FS-2024-1001"
                value={studentId}
                onChange={(e) => setStudentId(e.target.value.toUpperCase())}
              />
            </div>
            <p className="text-sm text-gray-500 mt-1">
              Format: SchoolCode-Year-Number (e.g., FS-2024-1001)
            </p>
          </div>

          {error && (
            <div className="bg-red-50 border-l-4 border-red-500 p-4 rounded animate-fade-in">
              <div className="flex items-center">
                <AlertCircle className="h-5 w-5 text-red-500 mr-2" />
                <p className="text-red-700 text-sm">{error}</p>
              </div>
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="btn-primary w-full flex items-center justify-center gap-2 text-lg py-3"
          >
            {loading ? (
              <>
                <Loader className="h-5 w-5 animate-spin" />
                Searching...
              </>
            ) : (
              <>
                View Student Information
                <ArrowRight className="h-5 w-5" />
              </>
            )}
          </button>
        </form>

        {/* Quick Tips */}
        <div className="mt-6 bg-blue-50 rounded-lg p-4">
          <h3 className="text-sm font-semibold text-blue-800 mb-2">Quick Tips</h3>
          <ul className="text-sm text-blue-700 space-y-1">
            <li>• Student ID is on your child's report card</li>
            <li>• Contact school office if you forgot your ID</li>
            <li>• You can pay for multiple months at once</li>
          </ul>
        </div>
      </div>
    </div>
  );
}

export default StudentSearch;