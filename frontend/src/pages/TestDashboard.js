// src/pages/TestDashboard.js
import React, { useState, useEffect } from 'react';
import api from '../services/api';

function TestDashboard() {
  const [students, setStudents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      console.log('Fetching students...');
      const response = await api.get('/students/');
      console.log('Students received:', response.data);
      setStudents(response.data);
    } catch (err) {
      console.error('Error:', err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  if (loading) return <div className="p-8">Loading...</div>;
  if (error) return <div className="p-8 text-red-500">Error: {error}</div>;

  return (
    <div className="p-8">
      <h1 className="text-2xl font-bold mb-4">Test Dashboard</h1>
      <p className="mb-4">Found {students.length} students</p>
      
      <div className="space-y-2">
        {students.map(student => (
          <div key={student.id} className="p-3 bg-gray-100 rounded">
            {student.full_name} - Grade {student.grade}
          </div>
        ))}
      </div>
    </div>
  );
}

export default TestDashboard;