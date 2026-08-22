// src/components/Layout/SuperAdminProfileMenu.js
//
// ✅ NEW — the sidebar footer previously showed a hardcoded initial in a
// circle ("R") with no way to change it. This fetches the real logged-in
// user (/me/) and lets them upload a photo / edit name+phone (/me/update/)
// — the exact same endpoints ProfileMenu.js already uses for school-admin
// pages, so no new backend surface was needed, just a version of that UI
// that fits the dark sidebar instead of AdminLayout's white top bar.
//
// Two backend bugs were fixed alongside this (see authentication/views.py
// update_profile): it 400'd for any account with no UserProfile row —
// which is exactly what a superuser created via createsuperuser has, since
// nothing auto-creates one for that path — and its response didn't nest
// fields under 'user', so a successful save never actually reflected in
// the UI until a full page reload re-fetched /me/. Both are fixed now,
// which is what makes this component actually work end-to-end.
import React, { useState, useEffect } from 'react';
import { User, LogOut } from 'lucide-react';
import api from '../../services/api';
import { getMediaUrl } from '../../utils/imageUrl';

function SuperAdminProfileMenu({ onLogout }) {
  const [me, setMe] = useState(null);
  const [showModal, setShowModal] = useState(false);
  const [form, setForm] = useState({ first_name: '', last_name: '', phone: '' });
  const [photoFile, setPhotoFile] = useState(null);
  const [photoPreview, setPhotoPreview] = useState(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => { fetchMe(); }, []);

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
      if (photoFile) formData.append('photo', photoFile);
      // No manual Content-Type — let axios set the multipart boundary.
      const res = await api.patch('/me/update/', formData);
      setMe((prev) => ({ ...(prev || {}), ...res.data.user }));
      setShowModal(false);
    } catch (err) {
      console.error('Error saving profile:', err);
      alert('Failed to update profile');
    } finally {
      setSaving(false);
    }
  };

  const avatarUrl = me?.photo ? getMediaUrl(me.photo) : null;
  const displayName = me?.first_name || me?.username || 'Admin';

  return (
    <>
      <button
        onClick={openModal}
        className="w-full flex items-center gap-2 px-3 py-2 rounded-lg hover:bg-slate-800 transition-colors text-left"
      >
        <div className="h-8 w-8 rounded-full bg-indigo-500/20 flex items-center justify-center text-indigo-300 text-sm font-medium overflow-hidden flex-shrink-0">
          {avatarUrl ? (
            <img src={avatarUrl} alt="" className="w-full h-full object-cover" />
          ) : (
            displayName.charAt(0).toUpperCase()
          )}
        </div>
        <div className="min-w-0">
          <p className="text-sm text-white truncate">{displayName}</p>
          <p className="text-xs text-slate-400 truncate">Platform owner · edit profile</p>
        </div>
      </button>
      <button
        onClick={onLogout}
        className="w-full flex items-center gap-2 px-3 py-2 mt-1 rounded-lg text-sm text-red-300 hover:bg-red-500/10 transition-colors"
      >
        <LogOut className="h-4 w-4" />
        Log out
      </button>

      {showModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[70] p-4">
          <div className="bg-white dark:bg-slate-900 rounded-xl shadow-2xl max-w-sm w-full transition-colors">
            <div className="border-b border-gray-100 dark:border-slate-800 px-6 py-4 flex items-center justify-between">
              <h2 className="text-lg font-bold text-gray-900 dark:text-white">My Profile</h2>
              <button
                onClick={() => setShowModal(false)}
                className="text-gray-400 dark:text-slate-500 hover:text-gray-600 dark:hover:text-slate-300 text-xl leading-none"
              >
                &times;
              </button>
            </div>

            <div className="p-6 space-y-4">
              <div className="flex flex-col items-center gap-2">
                <div className="w-20 h-20 rounded-full bg-indigo-100 dark:bg-indigo-500/15 flex items-center justify-center overflow-hidden border-2 border-indigo-100 dark:border-indigo-800/60">
                  {photoPreview ? (
                    <img src={photoPreview} alt="" className="w-full h-full object-cover" />
                  ) : (
                    <User className="h-8 w-8 text-indigo-600 dark:text-indigo-300" />
                  )}
                </div>
                <label className="text-xs font-medium text-indigo-600 dark:text-indigo-400 cursor-pointer hover:underline">
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
                <label className="block text-sm font-medium text-gray-700 dark:text-slate-300 mb-1">First Name</label>
                <input
                  type="text"
                  value={form.first_name}
                  onChange={(e) => setForm({ ...form, first_name: e.target.value })}
                  className="w-full px-3 py-2 rounded-lg border border-gray-200 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-200 dark:focus:ring-indigo-500/40"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-slate-300 mb-1">Last Name</label>
                <input
                  type="text"
                  value={form.last_name}
                  onChange={(e) => setForm({ ...form, last_name: e.target.value })}
                  className="w-full px-3 py-2 rounded-lg border border-gray-200 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-200 dark:focus:ring-indigo-500/40"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-slate-300 mb-1">Phone</label>
                <input
                  type="text"
                  value={form.phone}
                  onChange={(e) => setForm({ ...form, phone: e.target.value })}
                  className="w-full px-3 py-2 rounded-lg border border-gray-200 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-200 dark:focus:ring-indigo-500/40"
                />
              </div>
            </div>

            <div className="border-t border-gray-100 dark:border-slate-800 px-6 py-4 flex justify-end gap-2">
              <button
                onClick={() => setShowModal(false)}
                className="px-4 py-2 text-sm text-gray-600 dark:text-slate-300 hover:bg-gray-50 dark:hover:bg-slate-800 rounded-lg"
              >
                Cancel
              </button>
              <button
                onClick={handleSave}
                disabled={saving}
                className="px-4 py-2 text-sm bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50"
              >
                {saving ? 'Saving...' : 'Save'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

export default SuperAdminProfileMenu;
