// src/components/Admin/StudentRegistrationForm.js
import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  X, 
  Save, 
  User, 
  Phone, 
  MapPin, 
  GraduationCap,
  DollarSign,
  CheckCircle,
  AlertCircle,
  Loader,
  Mail,
  Home,
  Calendar
} from 'lucide-react';
import api from '../../services/api';

const StudentRegistrationForm = ({ onClose, onSuccess, editStudent }) => {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [schoolId, setSchoolId] = useState(null);
  const [availableYears, setAvailableYears] = useState([]);
  const [generatedId, setGeneratedId] = useState('');
  
  const [formData, setFormData] = useState({
    student_id: editStudent?.student_id || '',
    first_name: editStudent?.first_name || '',
    last_name: editStudent?.last_name || '',
    father_name: editStudent?.father_name || '',
    mother_name: editStudent?.mother_name || '',
    grade: editStudent?.grade || 1,
    section: editStudent?.section || 'A',
    academic_year: editStudent?.academic_year || '',
    parent_full_name: editStudent?.parent_full_name || '',
    parent_phone: editStudent?.parent_phone || '',
    parent_alternative_phone: editStudent?.parent_alternative_phone || '',
    parent_email: editStudent?.parent_email || '',
    monthly_fee: editStudent?.monthly_fee || 200,
    city: editStudent?.city || 'Jimma',
    subcity: editStudent?.subcity || '',
    kebele: editStudent?.kebele || '',
    house_number: editStudent?.house_number || '',
    status: editStudent?.status || 'active'
  });

  // Fetch available academic years
  useEffect(() => {
    fetchAcademicYears();
    fetchSchoolId();
  }, []);

  const fetchAcademicYears = async () => {
    try {
      const response = await api.get('/academic-years/');
      setAvailableYears(response.data);
      // Set default academic year if not editing
      if (!editStudent && response.data.length > 0) {
        const currentYear = response.data.find(y => y.is_current) || response.data[0];
        setFormData(prev => ({ ...prev, academic_year: currentYear.name }));
      }
    } catch (err) {
      console.error('Error fetching academic years:', err);
    }
  };

  const fetchSchoolId = async () => {
    try {
      const response = await api.get('/schools/');
      if (response.data && response.data.length > 0) {
        setSchoolId(response.data[0].id);
      }
    } catch (err) {
      console.error('Error fetching school:', err);
    }
  };

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
    
    // Clear messages when user types
    setError('');
    setSuccess('');
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    setSuccess('');

    // Validate required fields
    if (!formData.first_name || !formData.last_name || !formData.parent_phone) {
      setError('Please fill in all required fields');
      setLoading(false);
      return;
    }

    if (!formData.academic_year) {
      setError('Please select an academic year');
      setLoading(false);
      return;
    }

    if (!schoolId) {
      setError('No school found. Please add a school first.');
      setLoading(false);
      return;
    }

    try {
      const studentData = {
        student_id: '', // Send empty to let backend generate
        school: schoolId,
        first_name: formData.first_name,
        last_name: formData.last_name,
        father_name: formData.father_name || '',
        mother_name: formData.mother_name || '',
        grade: parseInt(formData.grade),
        section: formData.section || '',
        academic_year: formData.academic_year,
        parent_full_name: formData.parent_full_name || `${formData.first_name} ${formData.last_name}'s Parent`,
        parent_phone: formData.parent_phone,
        parent_alternative_phone: formData.parent_alternative_phone || '',
        parent_email: formData.parent_email || '',
        monthly_fee: parseFloat(formData.monthly_fee),
        city: formData.city || 'Jimma',
        subcity: formData.subcity || '',
        kebele: formData.kebele || '',
        house_number: formData.house_number || '',
        status: formData.status || 'active'
      };

      console.log('Sending data:', studentData);

      let response;
      if (editStudent) {
        response = await api.put(`/students/${editStudent.id}/`, studentData);
      } else {
        response = await api.post('/students/', studentData);
      }
      
      console.log('Response:', response.data);
      
      // ✅ Store the generated ID
      if (response.data && response.data.student_id) {
        setGeneratedId(response.data.student_id);
      }
      
      setSuccess(editStudent ? 'Student updated successfully!' : `Student registered successfully! ID: ${response.data.student_id}`);
      
      setTimeout(() => {
        onSuccess();
        onClose();
      }, 2000);
      
    } catch (err) {
      console.error('Registration error:', err);
      console.error('Error response:', err.response?.data);
      
      if (err.response?.data) {
        const errorData = err.response.data;
        let errorMessage = '';
        
        if (typeof errorData === 'object') {
          Object.keys(errorData).forEach(key => {
            errorMessage += `${key}: ${errorData[key]}\n`;
          });
        } else {
          errorMessage = errorData;
        }
        
        setError(errorMessage);
      } else {
        setError('Failed to connect to server. Make sure Django is running.');
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4 overflow-y-auto"
      onClick={onClose}
    >
      <motion.div
        initial={{ scale: 0.9, y: 20 }}
        animate={{ scale: 1, y: 0 }}
        exit={{ scale: 0.9, y: 20 }}
        className="bg-white rounded-xl shadow-2xl max-w-4xl w-full max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="sticky top-0 bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between">
          <h2 className="text-xl font-bold text-gray-900">
            {editStudent ? 'Edit Student' : 'Register New Student'}
          </h2>
          <button
            onClick={onClose}
            className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
          >
            <X className="h-5 w-5 text-gray-600" />
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="p-6">
          <div className="space-y-6">
            {/* Student ID Section */}
            <div className="bg-primary-50 rounded-lg p-4 border border-primary-100">
              <div className="flex items-center justify-between">
                <div className="flex-1">
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Student ID
                  </label>
                  <input
                    type="text"
                    value={generatedId || (editStudent ? formData.student_id : 'Will be generated after save')}
                    className="input-field font-mono bg-gray-100 w-64"
                    readOnly
                    disabled
                  />
                  <p className="text-xs text-gray-500 mt-1">
                    ID will be generated automatically based on selected academic year
                  </p>
                </div>
              </div>
            </div>

            {/* Personal Information */}
            <div>
              <h3 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
                <User className="h-5 w-5 text-primary-600" />
                Personal Information
              </h3>
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    First Name *
                  </label>
                  <input
                    type="text"
                    name="first_name"
                    value={formData.first_name}
                    onChange={handleChange}
                    className="input-field"
                    required
                  />
                </div>
                
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Last Name *
                  </label>
                  <input
                    type="text"
                    name="last_name"
                    value={formData.last_name}
                    onChange={handleChange}
                    className="input-field"
                    required
                  />
                </div>
                
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Father's Name
                  </label>
                  <input
                    type="text"
                    name="father_name"
                    value={formData.father_name}
                    onChange={handleChange}
                    className="input-field"
                  />
                </div>
                
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Mother's Name
                  </label>
                  <input
                    type="text"
                    name="mother_name"
                    value={formData.mother_name}
                    onChange={handleChange}
                    className="input-field"
                  />
                </div>
              </div>
            </div>

            {/* Academic Information */}
            <div>
              <h3 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
                <GraduationCap className="h-5 w-5 text-primary-600" />
                Academic Information
              </h3>
              
              <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Grade *
                  </label>
                  <select
                    name="grade"
                    value={formData.grade}
                    onChange={handleChange}
                    className="input-field"
                    required
                  >
                    {[1,2,3,4,5,6,7,8].map(g => (
                      <option key={g} value={g}>Grade {g}</option>
                    ))}
                  </select>
                </div>
                
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Section
                  </label>
                  <select
                    name="section"
                    value={formData.section}
                    onChange={handleChange}
                    className="input-field"
                  >
                    {['A','B','C','D','E'].map(s => (
                      <option key={s} value={s}>Section {s}</option>
                    ))}
                  </select>
                </div>
                
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Academic Year *
                  </label>
                  <select
                    name="academic_year"
                    value={formData.academic_year}
                    onChange={handleChange}
                    className="input-field"
                    required
                  >
                    <option value="">Select Academic Year</option>
                    {availableYears.map(year => (
                      <option key={year.id} value={year.name}>
                        {year.name} {year.is_current && '(Current)'}
                      </option>
                    ))}
                  </select>
                </div>
                
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Monthly Fee (Birr) *
                  </label>
                  <input
                    type="number"
                    name="monthly_fee"
                    value={formData.monthly_fee}
                    onChange={handleChange}
                    className="input-field"
                    min="0"
                    step="50"
                    required
                  />
                </div>
              </div>
            </div>

            {/* Parent Information */}
            <div>
              <h3 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
                <Phone className="h-5 w-5 text-primary-600" />
                Parent/Guardian Information
              </h3>
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Parent Full Name *
                  </label>
                  <input
                    type="text"
                    name="parent_full_name"
                    value={formData.parent_full_name}
                    onChange={handleChange}
                    className="input-field"
                    required
                  />
                </div>
                
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Phone Number *
                  </label>
                  <input
                    type="tel"
                    name="parent_phone"
                    value={formData.parent_phone}
                    onChange={handleChange}
                    className="input-field"
                    placeholder="0912345678"
                    required
                  />
                </div>
                
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Alternative Phone
                  </label>
                  <input
                    type="tel"
                    name="parent_alternative_phone"
                    value={formData.parent_alternative_phone}
                    onChange={handleChange}
                    className="input-field"
                    placeholder="0987654321"
                  />
                </div>
                
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Email Address
                  </label>
                  <input
                    type="email"
                    name="parent_email"
                    value={formData.parent_email}
                    onChange={handleChange}
                    className="input-field"
                    placeholder="parent@email.com"
                  />
                </div>
              </div>
            </div>

            {/* Address Information */}
            <div>
              <h3 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
                <MapPin className="h-5 w-5 text-primary-600" />
                Address Information
              </h3>
              
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    City
                  </label>
                  <input
                    type="text"
                    name="city"
                    value={formData.city}
                    onChange={handleChange}
                    className="input-field"
                  />
                </div>
                
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Subcity
                  </label>
                  <input
                    type="text"
                    name="subcity"
                    value={formData.subcity}
                    onChange={handleChange}
                    className="input-field"
                  />
                </div>
                
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Kebele
                  </label>
                  <input
                    type="text"
                    name="kebele"
                    value={formData.kebele}
                    onChange={handleChange}
                    className="input-field"
                  />
                </div>
              </div>
            </div>

            {/* Status */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Status
              </label>
              <select
                name="status"
                value={formData.status}
                onChange={handleChange}
                className="input-field w-48"
              >
                <option value="active">Active</option>
                <option value="graduated">Graduated</option>
                <option value="transferred">Transferred</option>
                <option value="suspended">Suspended</option>
              </select>
            </div>

            {/* Messages */}
            <AnimatePresence>
              {error && (
                <motion.div
                  initial={{ opacity: 0, y: -10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0 }}
                  className="bg-red-50 border-l-4 border-red-500 p-4 rounded"
                >
                  <div className="flex items-center gap-2">
                    <AlertCircle className="h-5 w-5 text-red-500" />
                    <p className="text-red-700 whitespace-pre-wrap">{error}</p>
                  </div>
                </motion.div>
              )}

              {success && (
                <motion.div
                  initial={{ opacity: 0, y: -10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0 }}
                  className="bg-green-50 border-l-4 border-green-500 p-4 rounded"
                >
                  <div className="flex items-center gap-2">
                    <CheckCircle className="h-5 w-5 text-green-500" />
                    <p className="text-green-700">{success}</p>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          {/* Form Actions */}
          <div className="sticky bottom-0 bg-white border-t border-gray-200 mt-6 pt-4 flex justify-end gap-3">
            <button
              type="button"
              onClick={onClose}
              className="px-6 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50 transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading}
              className="btn-primary flex items-center gap-2 px-6 py-2"
            >
              {loading ? (
                <>
                  <Loader className="h-4 w-4 animate-spin" />
                  Saving...
                </>
              ) : (
                <>
                  <Save className="h-4 w-4" />
                  {editStudent ? 'Update Student' : 'Register Student'}
                </>
              )}
            </button>
          </div>
        </form>
      </motion.div>
    </motion.div>
  );
};

export default StudentRegistrationForm;