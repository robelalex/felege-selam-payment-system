// src/components/Common/ProfileMenu.js
//
// Self-contained "who am I / edit my profile" button + modal.
// Fetches its own data from /me/ and saves via /me/update/, so it can be
// dropped into ANY page — school-admin pages already get this inside
// AdminLayout.js, but standalone pages (like SuperAdminDashboard, which
// isn't wrapped in AdminLayout) need their own copy. This component is
// that copy, so a super admin can also see/edit their own name and photo.
import React, { useState, useEffect } from 'react';
import { User, ChevronDown } from 'lucide-react';
import api from '../../services/api';
import { getMediaUrl } from '../../utils/imageUrl';

function ProfileMenu() {
  const [me, setMe] = useState(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const [form, setForm] = useState({ first_name: '', last_name: '', phone: '' });
  const [photoFile, setPhotoFile] = useState(null);
  const [photoPreview, setPhotoPreview] = useState(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetchMe();
  }, []);

  const fetchMe = async () => {
    try {
      const res = await api.get('/me/');
      setMe(res.data.user);
    } catch (err) {
      console.error('Error fetching current user:', err);
    }
  };

  const openModal = () => {
    setForm({
      first_name: me?.first_name || '',
      last_name: me?.last_name || '',
      phone: me?.phone || '',
    });
    setPhotoFile(null);
    setPhotoPreview(me?.photo ? getMediaUrl(me.photo) : null);
    setMenuOpen(false);
    setShowModal(true);
  };

  const handlePhotoChange = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setPhotoFile(file);
    setPhotoPreview(URL.createObjectURL(file));
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const formData = new FormData();
      formData.append('first_name', form.first_name);
      formData.append('last_name', form.last_name);
      formData.append('phone', form.phone);
      if (photoFile) {
        console.log(
          `🖼️ photoFile debug: isFile=${photoFile instanceof File} ` +
          `isBlob=${photoFile instanceof Blob} type=${typeof photoFile} ` +
          `name=${photoFile?.name} size=${photoFile?.size} mime=${photoFile?.type}`
        );
        formData.append('photo', photoFile);
      }
      for (const [key, val] of formData.entries()) {
        console.log(
          `📦 FormData entry: key=${key} isFile=${val instanceof File} ` +
          `value=${val instanceof File ? `[File name=${val.name} size=${val.size}]` : val}`
        );
      }
      // No manual Content-Type header — let axios set the multipart
      // boundary itself (see SchoolSettings.js logo-upload fix for why).
      const res = await api.patch('/me/update/', formData);
      setMe((prev) => ({ ...(prev || {}), ...res.data.user }));
      setShowModal(false);
    } catch (err) {
      console.error('Error saving profile:', err);
      alert('❌ Failed to update profile');
    } finally {
      setSaving(false);
    }
  };

  const avatarUrl = me?.photo ? getMediaUrl(me.photo) : null;

  return (
    <div className="relative">
      <button
        onClick={() => setMenuOpen(!menuOpen)}
        className="flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-gray-50 transition-colors"
      >
        <div className="w-8 h-8 bg-primary-100 rounded-full flex items-center justify-center overflow-hidden">
          {avatarUrl ? (
            <img src={avatarUrl} alt="" className="w-full h-full object-cover" />
          ) : (
            <User className="h-4 w-4 text-primary-600" />
          )}
        </div>
        <div className="text-left">
          <p className="text-sm font-medium text-gray-800 leading-tight">
            {me?.first_name || me?.username || 'Admin'}
          </p>
          <p className="text-[11px] text-gray-400 capitalize leading-tight">
            {me?.role?.replace('_', ' ') || ''}
          </p>
        </div>
        <ChevronDown className={`h-4 w-4 text-gray-400 transition-transform ${menuOpen ? 'rotate-180' : ''}`} />
      </button>

      {menuOpen && (
        <div className="absolute top-full right-0 mt-2 w-40 bg-white rounded-lg shadow-lg border border-gray-100 py-1 z-50">
          <button
            onClick={openModal}
            className="w-full flex items-center gap-2 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50 text-left"
          >
            <User className="h-4 w-4 text-gray-400" />
            My Profile
          </button>
        </div>
      )}

      {showModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[60] p-4">
          <div className="bg-white rounded-xl shadow-2xl max-w-sm w-full">
            <div className="border-b border-gray-100 px-6 py-4 flex items-center justify-between">
              <h2 className="text-lg font-bold text-gray-900">My Profile</h2>
              <button
                onClick={() => setShowModal(false)}
                className="text-gray-400 hover:text-gray-600 text-xl leading-none"
              >
                &times;
              </button>
            </div>

            <div className="p-6 space-y-4">
              <div className="flex flex-col items-center gap-2">
                <div className="w-20 h-20 rounded-full bg-primary-100 flex items-center justify-center overflow-hidden border-2 border-primary-100">
                  {photoPreview ? (
                    <img src={photoPreview} alt="" className="w-full h-full object-cover" />
                  ) : (
                    <User className="h-8 w-8 text-primary-600" />
                  )}
                </div>
                <label className="text-xs font-medium text-primary-600 cursor-pointer hover:underline">
                  Change photo
                  <input
                    type="file"
                    accept="image/jpeg,image/png,image/jpg"
                    className="hidden"
                    onChange={handlePhotoChange}
                  />
                </label>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">First Name</label>
                <input
                  type="text"
                  value={form.first_name}
                  onChange={(e) => setForm({ ...form, first_name: e.target.value })}
                  className="input-field"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Last Name</label>
                <input
                  type="text"
                  value={form.last_name}
                  onChange={(e) => setForm({ ...form, last_name: e.target.value })}
                  className="input-field"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Phone</label>
                <input
                  type="text"
                  value={form.phone}
                  onChange={(e) => setForm({ ...form, phone: e.target.value })}
                  className="input-field"
                />
              </div>
            </div>

            <div className="border-t border-gray-100 px-6 py-4 flex justify-end gap-2">
              <button
                onClick={() => setShowModal(false)}
                className="px-4 py-2 text-sm text-gray-600 hover:bg-gray-50 rounded-lg"
              >
                Cancel
              </button>
              <button
                onClick={handleSave}
                disabled={saving}
                className="px-4 py-2 text-sm bg-primary-600 text-white rounded-lg hover:bg-primary-700 disabled:opacity-50"
              >
                {saving ? 'Saving...' : 'Save'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default ProfileMenu;
