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
import api from '../services/api';
import StudentRegistrationForm from '../components/Admin/StudentRegistrationForm';
import BulkImport from '../components/Admin/BulkImport';
import { useYear } from '../context/YearContext';

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
  
  // Get selectedYear from context
  const { selectedYear } = useYear();

  // Fetch students when year changes
  useEffect(() => {
    fetchStudents();
  }, [selectedYear]); // Re-fetch when selectedYear changes

  const fetchStudents = async () => {
    setLoading(true);
    try {
      // ✅ FIXED: Add academic year filter to API call
      const params = new URLSearchParams();
      
      if (selectedYear && selectedYear.id) {
        params.append('academic_year_id', selectedYear.id);
        params.append('academic_year', selectedYear.year_ec);
        params.append('year_id', selectedYear.id);
      }
      
      const queryString = params.toString();
      const url = queryString ? `/students/?${queryString}` : '/students/';
      
      console.log('📚 Fetching students for year:', selectedYear?.name);
      console.log('🔗 URL:', url);
      
      const response = await api.get(url);
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
      // ✅ FIXED: Add academic year filter to export
      const params = new URLSearchParams();
      
      if (selectedYear && selectedYear.id) {
        params.append('academic_year_id', selectedYear.id);
        params.append('academic_year', selectedYear.year_ec);
      }
      
      const queryString = params.toString();
      const url = queryString ? `/students/export/?${queryString}` : '/students/export/';
      
      const response = await api.get(url, {
        responseType: 'blob'
      });
      
      const url_blob = window.URL.createObjectURL(new Blob([response.data]));
      const link = document.createElement('a');
      link.href = url_blob;
      link.setAttribute('download', `students_${selectedYear?.name || 'all'}_${new Date().toISOString().slice(0,10)}.xlsx`);
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
        {/* Header with Academic Year Info */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl md:text-3xl font-bold text-gray-900">Students Management</h1>
            <p className="text-sm md:text-base text-gray-600 mt-1">
              {selectedYear ? (
                <span className="text-primary-600 font-medium">
                  📅 Academic Year: {selectedYear.name || selectedYear.year_ec + ' E.C.'}
                </span>
              ) : (
                'No academic year selected'
              )}
            </p>
            <p className="text-sm text-gray-500">
              Total {students.length} students enrolled
            </p>
          </div>
          
          <div className="flex items-center gap-2 flex-wrap">
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
            
            <button
              onClick={() => setShowBulkImport(true)}
              className="btn-outline flex items-center gap-2"
            >
              <Upload className="h-4 w-4" />
              Bulk Import
            </button>
            
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
            
            <button 
              onClick={fetchStudents}
              className="btn-outline flex items-center justify-center gap-2"
            >
              <RefreshCw className="h-4 w-4" />
              Refresh
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
                {paginatedStudents.length === 0 ? (
                  <tr>
                    <td colSpan="7" className="text-center py-12 text-gray-500">
                      <Users className="h-12 w-12 mx-auto mb-3 text-gray-300" />
                      <p>No students found for {selectedYear?.name || 'selected academic year'}</p>
                      <p className="text-sm mt-1">Click "Add Student" to register a new student</p>
                    </td>
                  </tr>
                ) : (
                  paginatedStudents.map((student) => (
                    <tr key={student.id} className="table-row hover:bg-gray-50">
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
                      <td className="table-cell">{student.father_name || student.parent_full_name || 'N/A'}</td>
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
                  ))
                )}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          {filteredStudents.length > 0 && (
            <div className="px-6 py-4 bg-gray-50 border-t border-gray-200">
              <div className="flex items-center justify-between flex-wrap gap-2">
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
                  
                  {[...Array(Math.min(totalPages, 5))].map((_, i) => {
                    let pageNum;
                    if (totalPages <= 5) {
                      pageNum = i + 1;
                    } else if (currentPage <= 3) {
                      pageNum = i + 1;
                    } else if (currentPage >= totalPages - 2) {
                      pageNum = totalPages - 4 + i;
                    } else {
                      pageNum = currentPage - 2 + i;
                    }
                    
                    return (
                      <button
                        key={pageNum}
                        onClick={() => setCurrentPage(pageNum)}
                        className={`px-3 py-1 rounded ${
                          currentPage === pageNum
                            ? 'bg-primary-600 text-white'
                            : 'bg-white border hover:bg-gray-50'
                        }`}
                      >
                        {pageNum}
                      </button>
                    );
                  })}
                  
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