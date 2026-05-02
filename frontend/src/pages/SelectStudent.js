// src/pages/SelectStudent.js
import React from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { Users, ArrowRight, GraduationCap, BookOpen } from 'lucide-react';

function SelectStudent() {
  const navigate = useNavigate();
  const location = useLocation();
  const students = location.state?.students || [];

  const handleSelectStudent = (studentId) => {
    navigate(`/parent/dashboard/${studentId}`);
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-green-50 via-white to-teal-50 flex items-center justify-center p-4">
      <div className="max-w-2xl w-full">
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center p-3 bg-green-100 rounded-full mb-4">
            <Users className="h-8 w-8 text-green-600" />
          </div>
          <h1 className="text-3xl font-bold text-gray-900">Select Student</h1>
          <p className="text-gray-600 mt-2">Choose which child's information you want to access</p>
        </div>

        <div className="grid gap-4">
          {students.map((student) => (
            <button
              key={student.id}
              onClick={() => handleSelectStudent(student.id)}
              className="bg-white rounded-2xl shadow-lg p-6 hover:shadow-xl transition-shadow text-left w-full"
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-4">
                  <div className="p-3 bg-blue-100 rounded-full">
                    <GraduationCap className="h-6 w-6 text-blue-600" />
                  </div>
                  <div>
                    <h3 className="text-xl font-semibold text-gray-900">
                      {student.full_name}
                    </h3>
                    <div className="flex items-center gap-4 mt-1 text-sm text-gray-500">
                      <span className="flex items-center gap-1">
                        <BookOpen className="h-4 w-4" />
                        {student.grade}
                      </span>
                      <span>Section: {student.section || 'A'}</span>
                      <span>ID: {student.student_id}</span>
                    </div>
                  </div>
                </div>
                <ArrowRight className="h-5 w-5 text-gray-400" />
              </div>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

export default SelectStudent;