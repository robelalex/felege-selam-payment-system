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
  Calendar,
  FileText
} from 'lucide-react';
import api from '../../services/api';
import { getMediaUrl } from '../../utils/imageUrl';

const StudentRegistrationForm = ({ onClose, onSuccess, editStudent }) => {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [schoolId, setSchoolId] = useState(null);
  const [availableYears, setAvailableYears] = useState([]);
  const [generatedId, setGeneratedId] = useState('');

  // ✅ NEW: sections available for the currently selected grade
  const [availableSections, setAvailableSections] = useState([]);
  const [loadingSections, setLoadingSections] = useState(false);

  // ✅ NEW: student photo
  const [photoFile, setPhotoFile] = useState(null);
  const [photoPreview, setPhotoPreview] = useState(editStudent?.photo ? getMediaUrl(editStudent.photo) : null);

  // ✅ NEW: enrollment documents (birth certificate, leaving certificate, etc.)
  // selected right here in the form, uploaded automatically right after the
  // student record is created/saved. Keyed by document_type -> File.
  const [documentFiles, setDocumentFiles] = useState({});
  const DOC_TYPE_LABELS = {
    birth_certificate: 'Birth Certificate',
    leaving_certificate_grade6: 'Grade 6 Leaving Certificate',
    leaving_certificate_grade8: 'Grade 8 Leaving Certificate',
    transfer_certificate: 'Transfer Certificate',
    grade12_certificate: 'Grade 12 Certificate',
  };
  // Which document(s) this system recommends for the currently selected
  // grade — mirrors the Ethiopian system's transition points: Grade 1
  // entrants need a birth certificate, Grade 7 entrants need the Grade 6
  // leaving certificate, Grade 9 entrants need the Grade 8 leaving
  // certificate, Grade 12 completers need their Grade 12 certificate.
  const recommendedDocTypes = (() => {
    const g = parseInt(formData.grade, 10);
    const types = [];
    if (g === 1) types.push('birth_certificate');
    if (g === 7) types.push('leaving_certificate_grade6');
    if (g === 9) types.push('leaving_certificate_grade8');
    if (g === 12) types.push('grade12_certificate');
    return types.map(value => ({ value, label: DOC_TYPE_LABELS[value] }));
  })();

  const handleDocumentFileChange = (documentType, file) => {
    if (!file) return;
    if (file.size > 10 * 1024 * 1024) {
      setError('Document must be smaller than 10MB');
      return;
    }
    setDocumentFiles(prev => ({ ...prev, [documentType]: file }));
    setError('');
  };
  
  const [formData, setFormData] = useState({
    student_id: editStudent?.student_id || '',
    first_name: editStudent?.first_name || '',
    last_name: editStudent?.last_name || '',
    father_name: editStudent?.father_name || '',
    mother_name: editStudent?.mother_name || '',
    grade: editStudent?.grade || 1,
    section: editStudent?.section || '',
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

  // ✅ NEW: Fetch sections whenever the selected grade changes
  useEffect(() => {
    if (!formData.grade) return;

    const fetchSections = async () => {
      setLoadingSections(true);
      try {
        const response = await api.get(`/sections/?grade=${formData.grade}`);
        setAvailableSections(response.data);

        // If the current section isn't valid for this grade, reset it
        // (but leave it alone on first load while editing an existing student)
        const validNames = response.data.map(s => s.name);
        if (formData.section && !validNames.includes(formData.section)) {
          setFormData(prev => ({ ...prev, section: response.data[0]?.name || '' }));
        } else if (!formData.section && response.data.length > 0) {
          setFormData(prev => ({ ...prev, section: response.data[0].name }));
        }
      } catch (err) {
        console.error('Error fetching sections:', err);
        setAvailableSections([]);
      } finally {
        setLoadingSections(false);
      }
    };

    fetchSections();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [formData.grade]);

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

  // ✅ NEW: handle photo selection + live preview
  const handlePhotoChange = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!['image/jpeg', 'image/png', 'image/jpg'].includes(file.type)) {
      setError('Photo must be a JPG or PNG image');
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      setError('Photo must be smaller than 5MB');
      return;
    }

    setPhotoFile(file);
    setPhotoPreview(URL.createObjectURL(file));
    setError('');
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
      // ✅ Use FormData so the photo (if any) actually gets uploaded.
      // Same multipart pattern already used for bank slip uploads elsewhere in this app.
      const studentData = new FormData();
      studentData.append('student_id', ''); // Let backend generate
      studentData.append('school', schoolId);
      studentData.append('first_name', formData.first_name);
      studentData.append('last_name', formData.last_name);
      studentData.append('father_name', formData.father_name || '');
      studentData.append('mother_name', formData.mother_name || '');
      studentData.append('grade', parseInt(formData.grade));
      studentData.append('section', formData.section || '');
      studentData.append('academic_year', formData.academic_year);
      studentData.append('parent_full_name', formData.parent_full_name || `${formData.first_name} ${formData.last_name}'s Parent`);
      studentData.append('parent_phone', formData.parent_phone);
      studentData.append('parent_alternative_phone', formData.parent_alternative_phone || '');
      studentData.append('parent_email', formData.parent_email || '');
      studentData.append('monthly_fee', parseFloat(formData.monthly_fee));
      studentData.append('city', formData.city || 'Jimma');
      studentData.append('subcity', formData.subcity || '');
      studentData.append('kebele', formData.kebele || '');
      studentData.append('house_number', formData.house_number || '');
      studentData.append('status', formData.status || 'active');
      if (photoFile) {
        studentData.append('photo', photoFile);
      }

      console.log('Sending data (FormData with photo:', !!photoFile, ')');

      let response;
      const multipartConfig = { headers: { 'Content-Type': 'multipart/form-data' } };
      if (editStudent) {
        response = await api.patch(`/students/${editStudent.id}/`, studentData, multipartConfig);
      } else {
        response = await api.post('/students/', studentData, multipartConfig);
      }
      
      console.log('Response:', response.data);
      
      // ✅ Store the generated ID
      if (response.data && response.data.student_id) {
        setGeneratedId(response.data.student_id);
      }

      // ✅ NEW: upload any selected enrollment documents now that we have
      // a real student id to attach them to (documents need the student
      // to exist first, same as the standalone Documents modal).
      const studentRecordId = editStudent ? editStudent.id : response.data.id;
      const docEntries = Object.entries(documentFiles);
      if (studentRecordId && docEntries.length > 0) {
        await Promise.all(docEntries.map(([docType, file]) => {
          const docData = new FormData();
          docData.append('file', file);
          docData.append('document_type', docType);
          return api.post(`/students/${studentRecordId}/upload_document/`, docData, multipartConfig)
            .catch(err => console.error(`Failed to upload ${docType}:`, err));
        }));
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
              
              {/* ✅ NEW: Student photo upload */}
              <div className="flex items-center gap-4 mb-4">
                <div className="h-20 w-20 rounded-full bg-gray-100 border border-gray-200 overflow-hidden flex items-center justify-center flex-shrink-0">
                  {photoPreview ? (
                    <img src={photoPreview} alt="Student preview" className="h-full w-full object-cover" />
                  ) : (
                    <User className="h-8 w-8 text-gray-400" />
                  )}
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Student Photo
                  </label>
                  <input
                    type="file"
                    accept="image/jpeg,image/png,image/jpg"
                    onChange={handlePhotoChange}
                    className="text-sm text-gray-600"
                  />
                  <p className="text-xs text-gray-500 mt-1">JPG or PNG, up to 5MB. Used on ID cards and report cards.</p>
                </div>
              </div>

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
                    <optgroup label="🏫 Elementary">
                      {[1,2,3,4,5,6,7,8].map(g => (
                        <option key={g} value={g}>Grade {g}</option>
                      ))}
                    </optgroup>
                    <optgroup label="🎓 High School">
                      {[9,10,11,12].map(g => (
                        <option key={g} value={g}>Grade {g}</option>
                      ))}
                    </optgroup>
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
                    disabled={loadingSections}
                  >
                    {availableSections.length === 0 ? (
                      <option value="">
                        {loadingSections ? 'Loading...' : 'No sections yet'}
                      </option>
                    ) : (
                      availableSections.map(s => (
                        <option key={s.id} value={s.name}>Section {s.name}</option>
                      ))
                    )}
                  </select>
                  {availableSections.length === 0 && !loadingSections && (
                    <p className="text-xs text-amber-600 mt-1">
                      No sections exist for Grade {formData.grade} yet. Create one from the Sections page.
                    </p>
                  )}
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

            {/* ✅ NEW: Enrollment Documents — recommended based on selected grade */}
            <div>
              <h3 className="text-lg font-semibold text-gray-900 mb-1 flex items-center gap-2">
                <FileText className="h-5 w-5 text-primary-600" />
                Enrollment Documents
              </h3>
              <p className="text-xs text-gray-500 mb-4">
                Optional here — you can also add these later from the Documents icon on the student list.
              </p>

              <div className="space-y-3">
                {recommendedDocTypes.map(type => (
                  <div
                    key={type.value}
                    className="flex items-center justify-between gap-3 border border-amber-200 bg-amber-50 rounded-lg p-3"
                  >
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-gray-900">
                        {type.label} <span className="text-xs text-amber-700 font-normal">recommended for Grade {formData.grade}</span>
                      </p>
                      {documentFiles[type.value] && (
                        <p className="text-xs text-green-700 truncate">Selected: {documentFiles[type.value].name}</p>
                      )}
                    </div>
                    <label className="btn-outline text-xs px-3 py-1.5 cursor-pointer flex-shrink-0">
                      {documentFiles[type.value] ? 'Change' : 'Upload'}
                      <input
                        type="file"
                        accept=".pdf,.jpg,.jpeg,.png"
                        className="hidden"
                        onChange={(e) => handleDocumentFileChange(type.value, e.target.files?.[0])}
                      />
                    </label>
                  </div>
                ))}

                <div className="flex items-center justify-between gap-3 border border-gray-200 rounded-lg p-3">
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-gray-900">Transfer Certificate</p>
                    <p className="text-xs text-gray-500">If this student is transferring from another school</p>
                    {documentFiles['transfer_certificate'] && (
                      <p className="text-xs text-green-700 truncate">Selected: {documentFiles['transfer_certificate'].name}</p>
                    )}
                  </div>
                  <label className="btn-outline text-xs px-3 py-1.5 cursor-pointer flex-shrink-0">
                    {documentFiles['transfer_certificate'] ? 'Change' : 'Upload'}
                    <input
                      type="file"
                      accept=".pdf,.jpg,.jpeg,.png"
                      className="hidden"
                      onChange={(e) => handleDocumentFileChange('transfer_certificate', e.target.files?.[0])}
                    />
                  </label>
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