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
  Upload,
  Phone,
  Mail,
  GraduationCap,
  User,
  MoreVertical
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
  const [viewMode, setViewMode] = useState('table'); // 'table' or 'grid'
  const itemsPerPage = 10;
  
  const { selectedYear } = useYear();

  // Check screen size for default view mode
  useEffect(() => {
    const handleResize = () => {
      if (window.innerWidth < 768) {
        setViewMode('grid');
      } else {
        setViewMode('table');
      }
    };
    
    handleResize();
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  useEffect(() => {
    fetchStudents();
  }, [selectedYear]);

  const fetchStudents = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      
      if (selectedYear && selectedYear.id) {
        params.append('academic_year_id', selectedYear.id);
        params.append('academic_year', selectedYear.year_ec);
        params.append('year_id', selectedYear.id);
      }
      
      const queryString = params.toString();
      const url = queryString ? `/students/?${queryString}` : '/students/';
      
      console.log('📚 Fetching students for year:', selectedYear?.name);
      
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
      const params = new URLSearchParams();
      
      if (selectedYear && selectedYear.id) {
        params.append('academic_year_id', selectedYear.id);
        params.append('academic_year', selectedYear.year_ec);
      }
      
      const queryString = params.toString();
      const url = queryString ? `/students/export/?${queryString}` : '/students/export/';
      
      const response = await api.get(url, { responseType: 'blob' });
      
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

  const totalPages = Math.ceil(filteredStudents.length / itemsPerPage);
  const paginatedStudents = filteredStudents.slice(
    (currentPage - 1) * itemsPerPage,
    currentPage * itemsPerPage
  );

  // Mobile Card View Component
  const StudentCard = ({ student }) => (
    <div className="bg-white rounded-lg border border-gray-200 p-4 mb-3 shadow-sm">
      <div className="flex justify-between items-start mb-3">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-gradient-to-br from-primary-500 to-primary-700 rounded-full flex items-center justify-center">
            <span className="text-white font-semibold text-sm">
              {student.full_name?.charAt(0) || '?'}
            </span>
          </div>
          <div>
            <h3 className="font-semibold text-gray-900">{student.full_name}</h3>
            <p className="text-xs text-gray-500 font-mono">{student.student_id}</p>
          </div>
        </div>
        <div className="flex gap-1">
          <button 
            onClick={() => {
              setEditStudent(student);
              setShowRegistrationForm(true);
            }}
            className="p-2 hover:bg-gray-100 rounded-lg transition-colors tap-target"
          >
            <Edit className="h-4 w-4 text-gray-600" />
          </button>
          <button 
            onClick={() => handleDeleteStudent(student.id)}
            className="p-2 hover:bg-gray-100 rounded-lg transition-colors tap-target"
          >
            <Trash2 className="h-4 w-4 text-red-600" />
          </button>
        </div>
      </div>
      
      <div className="grid grid-cols-2 gap-3 text-sm mb-3">
        <div>
          <p className="text-gray-500 text-xs">Grade</p>
          <p className="font-medium flex items-center gap-1">
            <GraduationCap className="h-3 w-3 text-gray-400" />
            Grade {student.grade}
          </p>
        </div>
        <div>
          <p className="text-gray-500 text-xs">Status</p>
          <span className={`badge text-xs ${
            student.status === 'active' ? 'badge-success' : 'badge-warning'
          }`}>
            {student.status}
          </span>
        </div>
        <div>
          <p className="text-gray-500 text-xs">Parent</p>
          <p className="font-medium text-sm truncate">{student.father_name || student.parent_full_name || 'N/A'}</p>
        </div>
        <div>
          <p className="text-gray-500 text-xs">Phone</p>
          <p className="font-medium text-sm flex items-center gap-1">
            <Phone className="h-3 w-3 text-gray-400" />
            {student.parent_phone}
          </p>
        </div>
      </div>
      
      {student.parent_email && (
        <div className="pt-2 border-t border-gray-100">
          <p className="text-xs text-gray-500 flex items-center gap-1">
            <Mail className="h-3 w-3" />
            {student.parent_email}
          </p>
        </div>
      )}
    </div>
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
      <div className="space-y-6 pb-20 md:pb-0">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl md:text-3xl font-bold text-gray-900">Students Management</h1>
            <p className="text-sm md:text-base text-gray-600 mt-1">
              {selectedYear ? (
                <span className="text-primary-600 font-medium">
                  📅 {selectedYear.name || selectedYear.year_ec + ' E.C.'}
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
              className="btn-primary flex items-center gap-2 tap-target"
            >
              <Plus className="h-4 w-4" />
              <span className="hidden sm:inline">Add Student</span>
              <span className="sm:hidden">Add</span>
            </button>
            
            <button
              onClick={() => setShowBulkImport(true)}
              className="btn-outline flex items-center gap-2 tap-target"
            >
              <Upload className="h-4 w-4" />
              <span className="hidden sm:inline">Bulk Import</span>
            </button>
            
            <button 
              onClick={handleExport}
              className="btn-outline flex items-center gap-2 tap-target"
            >
              <Download className="h-4 w-4" />
              <span className="hidden sm:inline">Export</span>
            </button>
          </div>
        </div>

        {/* Filters */}
        <div className="bg-white rounded-xl shadow-lg p-4 md:p-6">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 md:gap-4">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-5 w-5 text-gray-400" />
              <input
                type="text"
                placeholder="Search by name, ID, or phone..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="input-field pl-10 py-2 md:py-2.5 text-sm"
              />
            </div>
            
            <select
              value={selectedGrade}
              onChange={(e) => setSelectedGrade(e.target.value)}
              className="input-field text-sm"
            >
              <option value="all">All Grades</option>
              {[1,2,3,4,5,6,7,8].map(grade => (
                <option key={grade} value={grade}>Grade {grade}</option>
              ))}
            </select>
            
            <button 
              onClick={fetchStudents}
              className="btn-outline flex items-center justify-center gap-2 tap-target"
            >
              <RefreshCw className="h-4 w-4" />
              Refresh
            </button>
          </div>
        </div>

        {/* View Toggle (Mobile only) */}
        <div className="md:hidden flex justify-end">
          <div className="bg-gray-100 rounded-lg p-1 flex gap-1">
            <button
              onClick={() => setViewMode('grid')}
              className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
                viewMode === 'grid' ? 'bg-white shadow-sm text-primary-600' : 'text-gray-500'
              }`}
            >
              Cards
            </button>
            <button
              onClick={() => setViewMode('table')}
              className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
                viewMode === 'table' ? 'bg-white shadow-sm text-primary-600' : 'text-gray-500'
              }`}
            >
              Table
            </button>
          </div>
        </div>

        {/* Students Content - Responsive */}
        {filteredStudents.length === 0 ? (
          <div className="bg-white rounded-xl shadow-lg p-12 text-center">
            <Users className="h-12 w-12 mx-auto mb-3 text-gray-300" />
            <p className="text-gray-500">No students found for {selectedYear?.name || 'selected academic year'}</p>
            <p className="text-sm text-gray-400 mt-1">Click "Add Student" to register a new student</p>
          </div>
        ) : (
          <>
            {/* Mobile Card View */}
            {viewMode === 'grid' && (
              <div className="space-y-3 md:hidden">
                {paginatedStudents.map((student) => (
                  <StudentCard key={student.id} student={student} />
                ))}
              </div>
            )}

            {/* Desktop Table View */}
            {(viewMode === 'table' || window.innerWidth >= 768) && (
              <div className="bg-white rounded-xl shadow-lg overflow-hidden hidden md:block">
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
                        <tr key={student.id} className="table-row hover:bg-gray-50">
                          <td className="table-cell">
                            <div className="flex items-center gap-3">
                              <div className="w-8 h-8 bg-primary-100 rounded-full flex items-center justify-center">
                                <span className="text-primary-600 font-semibold text-sm">
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
                                className="p-1 hover:bg-gray-100 rounded transition-colors tap-target"
                                title="Edit Student"
                              >
                                <Edit className="h-4 w-4 text-gray-600" />
                              </button>
                              <button 
                                onClick={() => handleDeleteStudent(student.id)}
                                className="p-1 hover:bg-gray-100 rounded transition-colors tap-target"
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
              </div>
            )}

            {/* Pagination - Responsive */}
            {filteredStudents.length > 0 && (
              <div className="bg-white rounded-xl shadow-lg px-4 py-3 md:px-6 md:py-4">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <p className="text-xs sm:text-sm text-gray-600 text-center sm:text-left">
                    Showing {((currentPage - 1) * itemsPerPage) + 1} to {Math.min(currentPage * itemsPerPage, filteredStudents.length)} of {filteredStudents.length} students
                  </p>
                  <div className="flex justify-center gap-1 sm:gap-2">
                    <button
                      onClick={() => setCurrentPage(prev => Math.max(prev - 1, 1))}
                      disabled={currentPage === 1}
                      className={`tap-target px-2 py-1 sm:px-3 sm:py-1.5 bg-white rounded border hover:bg-gray-50 ${
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
                          className={`tap-target px-2 py-1 sm:px-3 sm:py-1.5 rounded text-sm ${
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
                      className={`tap-target px-2 py-1 sm:px-3 sm:py-1.5 bg-white rounded border hover:bg-gray-50 ${
                        currentPage === totalPages ? 'opacity-50 cursor-not-allowed' : ''
                      }`}
                    >
                      <ChevronRight className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              </div>
            )}
          </>
        )}
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