// src/pages/RegistrarDashboard.js
import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { Users, UserPlus, TrendingUp, Award, Calendar, Loader, RefreshCw, GraduationCap, BookOpen } from 'lucide-react';
import api from '../services/api';

function RegistrarDashboard() {
  const [stats, setStats] = useState({
    total_students: 0,
    active_students: 0,
    graduated_students: 0,
    promoted_this_year: 0
  });
  const [loading, setLoading] = useState(true);
  const [recentStudents, setRecentStudents] = useState([]);

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    setLoading(true);
    try {
      const schoolId = JSON.parse(localStorage.getItem('selectedSchool') || '{}').id;
      
      // Fetch students
      const studentsRes = await api.get('/students/', {
        headers: { 'X-School-ID': schoolId }
      });
      
      const students = studentsRes.data;
      
      setStats({
        total_students: students.length,
        active_students: students.filter(s => s.status === 'active').length,
        graduated_students: students.filter(s => s.status === 'graduated').length,
        promoted_this_year: 0
      });
      
      setRecentStudents(students.slice(0, 5));
      
    } catch (err) {
      console.error('Error fetching data:', err);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <RefreshCw className="h-8 w-8 animate-spin text-primary-600" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl md:text-3xl font-bold text-gray-900">Registrar Dashboard</h1>
        <p className="text-gray-600 mt-1">Manage student enrollment and academic records</p>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white rounded-xl shadow-lg p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-500">Total Students</p>
              <p className="text-3xl font-bold text-gray-900">{stats.total_students}</p>
            </div>
            <div className="p-3 bg-blue-100 rounded-full">
              <Users className="h-6 w-6 text-blue-600" />
            </div>
          </div>
        </div>

        <div className="bg-white rounded-xl shadow-lg p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-500">Active Students</p>
              <p className="text-3xl font-bold text-green-600">{stats.active_students}</p>
            </div>
            <div className="p-3 bg-green-100 rounded-full">
              <GraduationCap className="h-6 w-6 text-green-600" />
            </div>
          </div>
        </div>

        <div className="bg-white rounded-xl shadow-lg p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-500">Graduated</p>
              <p className="text-3xl font-bold text-purple-600">{stats.graduated_students}</p>
            </div>
            <div className="p-3 bg-purple-100 rounded-full">
              <Award className="h-6 w-6 text-purple-600" />
            </div>
          </div>
        </div>

        <div className="bg-white rounded-xl shadow-lg p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-500">Active Grades</p>
              <p className="text-3xl font-bold text-orange-600">8</p>
            </div>
            <div className="p-3 bg-orange-100 rounded-full">
              <BookOpen className="h-6 w-6 text-orange-600" />
            </div>
          </div>
        </div>
      </div>

      {/* Quick Actions */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Link to="/admin/students" className="bg-gradient-to-r from-blue-500 to-blue-600 rounded-xl shadow-lg p-6 text-white hover:shadow-xl transition-all">
          <UserPlus className="h-8 w-8 mb-3" />
          <h3 className="text-lg font-semibold">Enroll New Student</h3>
          <p className="text-blue-100 text-sm mt-1">Register a new student</p>
        </Link>

        <Link to="/admin/students" className="bg-gradient-to-r from-green-500 to-green-600 rounded-xl shadow-lg p-6 text-white hover:shadow-xl transition-all">
          <Users className="h-8 w-8 mb-3" />
          <h3 className="text-lg font-semibold">Manage Students</h3>
          <p className="text-green-100 text-sm mt-1">View, edit, or update student records</p>
        </Link>

        <Link to="/admin/academic-years" className="bg-gradient-to-r from-purple-500 to-purple-600 rounded-xl shadow-lg p-6 text-white hover:shadow-xl transition-all">
          <TrendingUp className="h-8 w-8 mb-3" />
          <h3 className="text-lg font-semibold">Promote Students</h3>
          <p className="text-purple-100 text-sm mt-1">Move students to next grade</p>
        </Link>
      </div>

      {/* Recent Students */}
      <div className="bg-white rounded-xl shadow-lg overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-200">
          <h2 className="text-lg font-semibold text-gray-900">Recently Enrolled Students</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500">Student Name</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500">Student ID</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500">Grade</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {recentStudents.map((student) => (
                <tr key={student.id} className="hover:bg-gray-50">
                  <td className="px-6 py-4 font-medium text-gray-900">{student.full_name}</td>
                  <td className="px-6 py-4 text-gray-600">{student.student_id}</td>
                  <td className="px-6 py-4 text-gray-600">Grade {student.grade}</td>
                  <td className="px-6 py-4">
                    <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                      student.status === 'active' ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'
                    }`}>
                      {student.status}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

export default RegistrarDashboard;