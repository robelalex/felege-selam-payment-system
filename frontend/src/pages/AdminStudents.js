// src/pages/AdminStudents.js
import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  Search, 
  Filter, 
  Download, 
  Plus,
  Edit,
  Trash2,
  ChevronLeft,
  ChevronRight,
  Users,
  RefreshCw,
  Upload
} from 'lucide-react';
import api from '../services/api'; // ✅ ADD THIS IMPORT (if not already there)
import StudentRegistrationForm from '../components/Admin/StudentRegistrationForm';
import BulkImport from '../components/Admin/BulkImport';

function AdminStudents() {
  const [students, setStudents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedGrade, setSelectedGrade] = useState('all');
  const [showRegistrationForm, setShowRegistrationForm] = useState(false);
  const [editStudent, setEditStudent] = useState(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [showBulkImport, setShowBulkImport] = useState(false);
  const itemsPerPage = 10;

  useEffect(() => {
    fetchStudents();
  }, []);

  const fetchStudents = async () => {
    setLoading(true);
    try {
      // ✅ FIXED: Using api instance
      const response = await api.get('/students/');
      setStudents(response.data);
    } catch (err) {
      console.error('Error fetching students:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteStudent = async (studentId) => {
    if (window.confirm('Are you sure you want to delete this student?')) {
      try {
        // ✅ FIXED: Using api instance instead of hardcoded URL
        await api.delete(`/students/${studentId}/`);
        fetchStudents();
      } catch (err) {
        console.error('Error deleting student:', err);
        alert('Failed to delete student. Please try again.');
      }
    }
  };

  const handleExport = async () => {
    try {
      // ✅ FIXED: Using api instance with responseType blob
      const response = await api.get('/students/export/', {
        responseType: 'blob'
      });
      
      // Create download link
      const url = window.URL.createObjectURL(new Blob([response.data]));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', `students_export_${new Date().toISOString().slice(0,10)}.xlsx`);
      document.body.appendChild(link);
      link.click();
      link.remove();
    } catch (err) {
      console.error('Export failed:', err);
      alert('Failed to export students');
    }
  };

  const filteredStudents = students.filter(student => {
    const matchesSearch = 
      (student.full_name?.toLowerCase() || '').includes(searchTerm.toLowerCase()) ||
      (student.student_id?.toLowerCase() || '').includes(searchTerm.toLowerCase()) ||
      (student.parent_phone || '').includes(searchTerm);
    
    const matchesGrade = selectedGrade === 'all' || student.grade === parseInt(selectedGrade);
    
    return matchesSearch && matchesGrade;
  });

  // Pagination
  const totalPages = Math.ceil(filteredStudents.length / itemsPerPage);
  const paginatedStudents = filteredStudents.slice(
    (currentPage - 1) * itemsPerPage,
    currentPage * itemsPerPage
  );

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <RefreshCw className="h-8 w-8 animate-spin text-primary-600" />
      </div>
    );
  }

  return (
    <>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl md:text-3xl font-bold text-gray-900">Students Management</h1>
            <p className="text-sm md:text-base text-gray-600 mt-1">
              Total {students.length} students enrolled
            </p>
          </div>
          
          <div className="flex items-center gap-2">
            {/* Add Student Button */}
            <button 
              onClick={() => {
                setEditStudent(null);
                setShowRegistrationForm(true);
              }}
              className="btn-primary flex items-center gap-2"
            >
              <Plus className="h-4 w-4" />
              Add Student
            </button>
            
            {/* Bulk Import Button */}
            <button
              onClick={() => setShowBulkImport(true)}
              className="btn-outline flex items-center gap-2"
            >
              <Upload className="h-4 w-4" />
              Bulk Import
            </button>
            
            {/* Export Button */}
            <button 
              onClick={handleExport}
              className="btn-outline flex items-center gap-2"
            >
              <Download className="h-4 w-4" />
              Export
            </button>
          </div>
        </div>

        {/* Filters */}
        <div className="bg-white rounded-xl shadow-lg p-4 md:p-6">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-5 w-5 text-gray-400" />
              <input
                type="text"
                placeholder="Search by name, ID, or phone..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="input-field pl-10"
              />
            </div>
            
            <select
              value={selectedGrade}
              onChange={(e) => setSelectedGrade(e.target.value)}
              className="input-field"
            >
              <option value="all">All Grades</option>
              {[1,2,3,4,5,6,7,8].map(grade => (
                <option key={grade} value={grade}>Grade {grade}</option>
              ))}
            </select>
            
            <button className="btn-outline flex items-center justify-center gap-2">
              <Filter className="h-4 w-4" />
              More Filters
            </button>
          </div>
        </div>

        {/* Students Table */}
        <div className="bg-white rounded-xl shadow-lg overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50">
                <tr>
                  <th className="table-header">Student</th>
                  <th className="table-header">ID</th>
                  <th className="table-header">Grade</th>
                  <th className="table-header">Parent</th>
                  <th className="table-header">Phone</th>
                  <th className="table-header">Status</th>
                  <th className="table-header">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {paginatedStudents.map((student) => (
                  <tr key={student.id} className="table-row">
                    <td className="table-cell">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 bg-primary-100 rounded-full flex items-center justify-center">
                          <span className="text-primary-600 font-semibold">
                            {student.full_name?.charAt(0) || '?'}
                          </span>
                        </div>
                        <span className="font-medium">{student.full_name}</span>
                      </div>
                    </td>
                    <td className="table-cell font-mono text-sm">{student.student_id}</td>
                    <td className="table-cell">Grade {student.grade}</td>
                    <td className="table-cell">{student.father_name || 'N/A'}</td>
                    <td className="table-cell">{student.parent_phone}</td>
                    <td className="table-cell">
                      <span className={`badge ${
                        student.status === 'active' ? 'badge-success' : 'badge-warning'
                      }`}>
                        {student.status}
                      </span>
                    </td>
                    <td className="table-cell">
                      <div className="flex items-center gap-2">
                        <button 
                          onClick={() => {
                            setEditStudent(student);
                            setShowRegistrationForm(true);
                          }}
                          className="p-1 hover:bg-gray-100 rounded transition-colors"
                          title="Edit Student"
                        >
                          <Edit className="h-4 w-4 text-gray-600" />
                        </button>
                        <button 
                          onClick={() => handleDeleteStudent(student.id)}
                          className="p-1 hover:bg-gray-100 rounded transition-colors"
                          title="Delete Student"
                        >
                          <Trash2 className="h-4 w-4 text-red-600" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          {filteredStudents.length > 0 && (
            <div className="px-6 py-4 bg-gray-50 border-t border-gray-200">
              <div className="flex items-center justify-between">
                <p className="text-sm text-gray-600">
                  Showing {((currentPage - 1) * itemsPerPage) + 1} to {Math.min(currentPage * itemsPerPage, filteredStudents.length)} of {filteredStudents.length} students
                </p>
                <div className="flex gap-2">
                  <button
                    onClick={() => setCurrentPage(prev => Math.max(prev - 1, 1))}
                    disabled={currentPage === 1}
                    className={`p-2 bg-white rounded border hover:bg-gray-50 ${
                      currentPage === 1 ? 'opacity-50 cursor-not-allowed' : ''
                    }`}
                  >
                    <ChevronLeft className="h-4 w-4" />
                  </button>
                  
                  {[...Array(totalPages)].map((_, i) => (
                    <button
                      key={i + 1}
                      onClick={() => setCurrentPage(i + 1)}
                      className={`px-3 py-1 rounded ${
                        currentPage === i + 1
                          ? 'bg-primary-600 text-white'
                          : 'bg-white border hover:bg-gray-50'
                      }`}
                    >
                      {i + 1}
                    </button>
                  ))}
                  
                  <button
                    onClick={() => setCurrentPage(prev => Math.min(prev + 1, totalPages))}
                    disabled={currentPage === totalPages}
                    className={`p-2 bg-white rounded border hover:bg-gray-50 ${
                      currentPage === totalPages ? 'opacity-50 cursor-not-allowed' : ''
                    }`}
                  >
                    <ChevronRight className="h-4 w-4" />
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Registration Form Modal */}
      <AnimatePresence>
        {showRegistrationForm && (
          <StudentRegistrationForm
            editStudent={editStudent}
            onClose={() => {
              setShowRegistrationForm(false);
              setEditStudent(null);
            }}
            onSuccess={() => {
              fetchStudents();
              setShowRegistrationForm(false);
              setEditStudent(null);
            }}
          />
        )}
      </AnimatePresence>

      {/* Bulk Import Modal */}
      <AnimatePresence>
        {showBulkImport && (
          <BulkImport
            onClose={() => setShowBulkImport(false)}
            onSuccess={() => {
              fetchStudents();
              setShowBulkImport(false);
            }}
          />
        )}
      </AnimatePresence>
    </>
  );
}

export default AdminStudents;