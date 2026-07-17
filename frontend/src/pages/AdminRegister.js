// src/pages/AdminRegister.js
import React, { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { Lock, Mail, ArrowRight, AlertCircle, Loader, User, Phone, Building2, CheckCircle, Image } from 'lucide-react';
import api from '../services/api';
import AuthSplitLayout from '../components/Auth/AuthSplitLayout';
import { useLanguage } from '../context/LanguageContext';
import { PLATFORM_NAME } from '../config/brand';

function AdminRegister() {
  const { t } = useLanguage();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);
  const [logoPreview, setLogoPreview] = useState(null);
  const [formData, setFormData] = useState({
    email: '',
    username: '',
    password: '',
    confirm_password: '',
    first_name: '',
    last_name: '',
    phone: '',
    role: 'school_admin',
    school_name: '',
    school_code: ''
  });
  const [logoFile, setLogoFile] = useState(null);

  const handleChange = (e) => {
    setFormData({
      ...formData,
      [e.target.name]: e.target.value
    });
  };

  const handleLogoChange = (e) => {
    const file = e.target.files[0];
    if (file) {
      // Validate file type
      if (!file.type.startsWith('image/')) {
        setError('Please upload an image file (JPG, PNG, etc.)');
        return;
      }
      
      // Validate file size (max 2MB)
      if (file.size > 2 * 1024 * 1024) {
        setError('Logo file must be less than 2MB');
        return;
      }
      
      setLogoFile(file);
      
      // Create preview
      const reader = new FileReader();
      reader.onloadend = () => {
        setLogoPreview(reader.result);
      };
      reader.readAsDataURL(file);
    }
  };

const handleSubmit = async (e) => {
  e.preventDefault();
  
  // Check password match
  if (formData.password !== formData.confirm_password) {
    setError('Passwords do not match');
    return;
  }

  setLoading(true);
  setError('');

  try {
    const submitData = new FormData();
    submitData.append('email', formData.email);
    submitData.append('username', formData.username);
    submitData.append('password', formData.password);
    submitData.append('confirm_password', formData.confirm_password);
    submitData.append('first_name', formData.first_name);
    submitData.append('last_name', formData.last_name);
    submitData.append('phone', formData.phone);
    submitData.append('role', formData.role);
    submitData.append('school_name', formData.school_name);
    submitData.append('school_code', formData.school_code);
    
    if (logoFile) {
      submitData.append('logo', logoFile);
    }

    const response = await api.post('/admin/register/', submitData);

    // ✅ FIX: Check response.data.success, not just response.status
    if (response.data && response.data.success === true) {
      setSuccess(true);
      setTimeout(() => {
        navigate('/admin/login');
      }, 3000);
    } else {
      // Handle error response
      const errorMsg = response.data?.error || response.data?.message || 'Registration failed';
      setError(errorMsg);
    }
  } catch (err) {
    console.error('Registration error:', err);
    // ✅ Check if there's a response with error data
    if (err.response && err.response.data) {
      const errorMsg = err.response.data.error || 
                       err.response.data.message || 
                       JSON.stringify(err.response.data.errors) ||
                       'Registration failed. Please try again.';
      setError(errorMsg);
    } else {
      setError('Registration failed. Please try again.');
    }
  } finally {
    setLoading(false);
  }
};
  if (success) {
    return (
      <AuthSplitLayout
        panelTitle={`Welcome to ${PLATFORM_NAME}.`}
        panelSubtitle="Your school's dashboard is one step away."
      >
        <div className="text-center">
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-8">
            <div className="inline-flex items-center justify-center p-3 bg-green-100 rounded-full mb-4">
              <CheckCircle className="h-8 w-8 text-green-600" />
            </div>
            <h2 className="text-2xl font-bold text-gray-900 mb-2">Registration Successful!</h2>
            <p className="text-gray-600 mb-4">
              Please check your email to verify your account before logging in.
            </p>
            <Link to="/admin/login" className="btn-primary inline-flex items-center gap-2">
              Go to Login
              <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
        </div>
      </AuthSplitLayout>
    );
  }

  return (
    <AuthSplitLayout
      panelTitle="Bring your school online in minutes."
      panelSubtitle="Set up tuition tracking, reminders, and secure payment links for your school — no paperwork, no waiting."
    >
      <div className="text-center mb-6">
        <h1 className="text-2xl font-bold text-gray-900">{t('register_title')}</h1>
        <p className="text-gray-500 mt-2 text-sm">{t('register_subtitle')}</p>
      </div>

      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6 sm:p-8">
        <form onSubmit={handleSubmit} className="space-y-6">

          {/* ===== Section: School Information ===== */}
          <div className="space-y-4">
            <p className="text-xs font-semibold text-primary-600 uppercase tracking-wider">
              {t('register_school_info')}
            </p>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                {t('register_school_name')} *
              </label>
              <div className="relative">
                <Building2 className="absolute left-3 top-1/2 transform -translate-y-1/2 h-5 w-5 text-gray-400" />
                <input
                  type="text"
                  name="school_name"
                  value={formData.school_name}
                  onChange={handleChange}
                  className="input-field pl-10"
                  placeholder="Enter school name"
                  required
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  {t('register_school_code')}
                </label>
                <input
                  type="text"
                  name="school_code"
                  value={formData.school_code}
                  onChange={handleChange}
                  className="input-field"
                  placeholder="e.g., FS"
                />
                <p className="text-xs text-gray-500 mt-1">{t('register_school_code_hint')}</p>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  {t('register_phone')}
                </label>
                <div className="relative">
                  <Phone className="absolute left-3 top-1/2 transform -translate-y-1/2 h-5 w-5 text-gray-400" />
                  <input
                    type="tel"
                    name="phone"
                    value={formData.phone}
                    onChange={handleChange}
                    className="input-field pl-10"
                    placeholder="0912345678"
                  />
                </div>
              </div>
            </div>

            {/* Logo Upload Field */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                {t('register_logo')}
              </label>
              <div className="mt-1 flex items-center space-x-4">
                <div className="flex-shrink-0">
                  {logoPreview ? (
                    <img
                      src={logoPreview}
                      alt="Logo preview"
                      className="h-16 w-16 object-cover rounded-lg border border-gray-200"
                    />
                  ) : (
                    <div className="h-16 w-16 bg-gray-100 rounded-lg border border-gray-200 flex items-center justify-center">
                      <Image className="h-7 w-7 text-gray-400" />
                    </div>
                  )}
                </div>
                <div className="flex-1">
                  <input
                    type="file"
                    name="logo"
                    accept="image/*"
                    onChange={handleLogoChange}
                    className="block w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-sm file:font-semibold file:bg-primary-50 file:text-primary-700 hover:file:bg-primary-100"
                  />
                  <p className="text-xs text-gray-500 mt-1">
                    JPG or PNG, max 2MB
                  </p>
                </div>
              </div>
            </div>
          </div>

          <div className="border-t border-gray-100" />

          {/* ===== Section: Admin Account ===== */}
          <div className="space-y-4">
            <p className="text-xs font-semibold text-primary-600 uppercase tracking-wider">
              {t('register_admin_account')}
            </p>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  {t('register_first_name')}
                </label>
                <input
                  type="text"
                  name="first_name"
                  value={formData.first_name}
                  onChange={handleChange}
                  className="input-field"
                  placeholder="John"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  {t('register_last_name')}
                </label>
                <input
                  type="text"
                  name="last_name"
                  value={formData.last_name}
                  onChange={handleChange}
                  className="input-field"
                  placeholder="Doe"
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                {t('login_email')} *
              </label>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 transform -translate-y-1/2 h-5 w-5 text-gray-400" />
                <input
                  type="email"
                  name="email"
                  value={formData.email}
                  onChange={handleChange}
                  className="input-field pl-10"
                  placeholder="admin@school.com"
                  required
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                {t('register_username')} *
              </label>
              <div className="relative">
                <User className="absolute left-3 top-1/2 transform -translate-y-1/2 h-5 w-5 text-gray-400" />
                <input
                  type="text"
                  name="username"
                  value={formData.username}
                  onChange={handleChange}
                  className="input-field pl-10"
                  placeholder="Choose a username"
                  required
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  {t('login_password')} *
                </label>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 transform -translate-y-1/2 h-5 w-5 text-gray-400" />
                  <input
                    type="password"
                    name="password"
                    value={formData.password}
                    onChange={handleChange}
                    className="input-field pl-10"
                    placeholder="Create a password"
                    required
                  />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  {t('register_confirm_password')} *
                </label>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 transform -translate-y-1/2 h-5 w-5 text-gray-400" />
                  <input
                    type="password"
                    name="confirm_password"
                    value={formData.confirm_password}
                    onChange={handleChange}
                    className="input-field pl-10"
                    placeholder="Confirm password"
                    required
                  />
                </div>
              </div>
            </div>
          </div>

          {error && (
            <div className="bg-red-50 border-l-4 border-red-500 p-4 rounded">
              <div className="flex items-center">
                <AlertCircle className="h-5 w-5 text-red-500 mr-2" />
                <p className="text-red-700 text-sm">{error}</p>
              </div>
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="btn-primary w-full flex items-center justify-center gap-2 py-3"
          >
            {loading ? (
              <>
                <Loader className="h-5 w-5 animate-spin" />
                {t('register_creating')}
              </>
            ) : (
              <>
                {t('register_submit')}
                <ArrowRight className="h-5 w-5" />
              </>
            )}
          </button>

          <p className="text-center text-sm text-gray-600">
            {t('register_have_account')}{' '}
            <Link to="/admin/login" className="text-primary-600 hover:text-primary-700 font-medium">
              {t('register_sign_in')}
            </Link>
          </p>
        </form>
      </div>
    </AuthSplitLayout>
  );
}

export default AdminRegister;