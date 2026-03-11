// src/components/Admin/ClassDetails.js
import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { 
  ArrowLeft, 
  Search, 
  Filter, 
  Download,
  CheckCircle,
  Clock,
  AlertCircle,
  Mail,
  Phone,
  MoreVertical
} from 'lucide-react';

const ClassDetails = ({ grade, students, onBack }) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [filterMonth, setFilterMonth] = useState('all');
  const [filterStatus, setFilterStatus] = useState('all');

  const months = [
    'Meskerem', 'Tikimt', 'Hidar', 'Tahsas', 'Tir', 'Yekatit',
    'Megabit', 'Miazia', 'Ginbot', 'Sene', 'Hamle', 'Nehase', 'Pagume'
  ];

  const filteredStudents = students.filter(student => {
    const matchesSearch = 
      student.full_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      student.student_id.toLowerCase().includes(searchTerm.toLowerCase());
    
    return matchesSearch;
  });

  return (
    <motion.div
      initial={{ opacity: 0, x: 20 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -20 }}
    >
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <button
          onClick={onBack}
          className="flex items-center gap-2 text-gray-600 hover:text-gray-900 transition-colors"
        >
          <ArrowLeft className="h-5 w-5" />
          Back to Classes
        </button>
        
        <div className="flex items-center gap-3">
          <button className="flex items-center gap-2 px-4 py-2 bg-white rounded-lg shadow-sm hover:shadow transition-all">
            <Download className="h-4 w-4" />
            Export
          </button>
        </div>
      </div>

      {/* Title */}
      <div className="mb-6">
        <h1 className="text-3xl font-bold text-gray-900">Grade {grade}</h1>
        <p className="text-gray-600 mt-1">{students.length} students enrolled</p>
      </div>

      {/* Filters */}
      <div className="bg-white rounded-xl shadow-lg p-6 mb-6">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-5 w-5 text-gray-400" />
            <input
              type="text"
              placeholder="Search by name or ID..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="input-field pl-10"
            />
          </div>
          
          <select
            value={filterMonth}
            onChange={(e) => setFilterMonth(e.target.value)}
            className="input-field"
          >
            <option value="all">All Months</option>
            {months.map(month => (
              <option key={month} value={month}>{month}</option>
            ))}
          </select>
          
          <select
            value={filterStatus}
            onChange={(e) => setFilterStatus(e.target.value)}
            className="input-field"
          >
            <option value="all">All Status</option>
            <option value="paid">Paid</option>
            <option value="pending">Pending</option>
            <option value="overdue">Overdue</option>
          </select>
        </div>
      </div>

      {/* Students Table */}
      <div className="bg-white rounded-xl shadow-lg overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-4 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Student
                </th>
                <th className="px-6 py-4 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  ID
                </th>
                <th className="px-6 py-4 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Parent Contact
                </th>
                {months.slice(0, 3).map(month => (
                  <th key={month} className="px-6 py-4 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">
                    {month}
                  </th>
                ))}
                <th className="px-6 py-4 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {filteredStudents.map((student) => (
                <tr key={student.id} className="hover:bg-gray-50 transition-colors">
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 bg-primary-100 rounded-full flex items-center justify-center">
                        <span className="text-primary-600 font-semibold">
                          {student.full_name.charAt(0)}
                        </span>
                      </div>
                      <span className="font-medium text-gray-900">{student.full_name}</span>
                    </div>
                  </td>
                  <td className="px-6 py-4 text-sm text-gray-600">
                    {student.student_id}
                  </td>
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-2">
                      <Phone className="h-4 w-4 text-gray-400" />
                      <span className="text-sm">{student.parent_phone}</span>
                    </div>
                  </td>
                  {months.slice(0, 3).map(month => {
                    const status = student.payments?.[month] || 'pending';
                    return (
                      <td key={month} className="px-6 py-4 text-center">
                        {status === 'paid' ? (
                          <CheckCircle className="h-5 w-5 text-green-500 mx-auto" />
                        ) : status === 'pending' ? (
                          <Clock className="h-5 w-5 text-yellow-500 mx-auto" />
                        ) : (
                          <AlertCircle className="h-5 w-5 text-red-500 mx-auto" />
                        )}
                      </td>
                    );
                  })}
                  <td className="px-6 py-4 text-center">
                    <button className="text-gray-400 hover:text-gray-600">
                      <MoreVertical className="h-5 w-5" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        
        {/* Pagination */}
        <div className="px-6 py-4 bg-gray-50 border-t border-gray-200">
          <div className="flex items-center justify-between">
            <p className="text-sm text-gray-600">
              Showing 1 to {filteredStudents.length} of {students.length} students
            </p>
            <div className="flex gap-2">
              <button className="px-3 py-1 bg-white rounded border hover:bg-gray-50">
                Previous
              </button>
              <button className="px-3 py-1 bg-primary-600 text-white rounded hover:bg-primary-700">
                1
              </button>
              <button className="px-3 py-1 bg-white rounded border hover:bg-gray-50">
                2
              </button>
              <button className="px-3 py-1 bg-white rounded border hover:bg-gray-50">
                3
              </button>
              <button className="px-3 py-1 bg-white rounded border hover:bg-gray-50">
                Next
              </button>
            </div>
          </div>
        </div>
      </div>
    </motion.div>
  );
};

export default ClassDetails;