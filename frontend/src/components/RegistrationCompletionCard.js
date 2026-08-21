// frontend/src/components/RegistrationCompletionCard.js
//
// Shown on the Parent Dashboard when a student's registration is
// incomplete (no photo, and/or missing a grade-required document).
// Lets the parent finish it themselves — same login they already used
// to reach this page (email OTP), no separate link or token.
//
// Talks to three new, narrowly-scoped backend endpoints added to
// StudentViewSet: registration_status (GET), parent_upload_photo (POST),
// parent_upload_document (POST). A parent can only ever act on their own
// child's record — enforced server-side by IsParentOfStudentOrCanManage,
// not just hidden in the UI.

import React, { useState, useEffect, useCallback } from 'react';
import { CheckCircle, Circle, Camera, FileText, Loader, AlertCircle, Upload, XCircle } from 'lucide-react';
import api from '../services/api';
import { getMediaUrl } from '../utils/imageUrl';

function RegistrationCompletionCard({ studentId, onPhotoUploaded }) {
  const [status, setStatus] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const [uploadingDocType, setUploadingDocType] = useState(null);
  const [photoPreview, setPhotoPreview] = useState(null);

  const fetchStatus = useCallback(async () => {
    try {
      const res = await api.get(`/students/${studentId}/registration_status/`);
      setStatus(res.data);
    } catch (err) {
      console.error('Error fetching registration status:', err);
    } finally {
      setLoading(false);
    }
  }, [studentId]);

  useEffect(() => {
    fetchStatus();
  }, [fetchStatus]);

  const handlePhotoChange = async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    if (file.size > 5 * 1024 * 1024) {
      setError('Photo must be smaller than 5MB');
      return;
    }

    setError('');
    setPhotoPreview(URL.createObjectURL(file));
    setUploadingPhoto(true);

    const formData = new FormData();
    formData.append('photo', file);

    try {
      const res = await api.post(`/students/${studentId}/parent_upload_photo/`, formData, {
        headers: { 'Content-Type': 'multipart/form-data' }
      });
      await fetchStatus();
      if (onPhotoUploaded) onPhotoUploaded(res.data.photo);
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to upload photo. Please try again.');
    } finally {
      setUploadingPhoto(false);
    }
  };

  const handleDocumentChange = async (documentType, e, customLabel = '', trackingKey = null) => {
    const file = e.target.files[0];
    if (!file) return;

    if (file.size > 10 * 1024 * 1024) {
      setError('Document must be smaller than 10MB');
      return;
    }

    setError('');
    setUploadingDocType(trackingKey || documentType);

    const formData = new FormData();
    formData.append('file', file);
    formData.append('document_type', documentType);
    if (customLabel) formData.append('custom_label', customLabel);

    try {
      await api.post(`/students/${studentId}/parent_upload_document/`, formData, {
        headers: { 'Content-Type': 'multipart/form-data' }
      });
      await fetchStatus();
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to upload document. Please try again.');
    } finally {
      setUploadingDocType(null);
    }
  };

  if (loading || !status || status.is_complete) {
    return null; // nothing missing — don't clutter the dashboard
  }

  return (
    <div className="bg-white rounded-2xl shadow-lg p-6 border-l-4 border-amber-400">
      <h2 className="text-lg font-semibold text-gray-900 mb-1 flex items-center gap-2">
        <AlertCircle className="h-5 w-5 text-amber-500" />
        Finish {status.student_name}'s Registration
      </h2>
      <p className="text-sm text-gray-500 mb-4">
        A few things are still needed — upload them here, no need to visit the school office.
      </p>

      {error && (
        <div className="bg-red-50 text-red-700 text-sm p-3 rounded-lg mb-4">{error}</div>
      )}

      <div className="space-y-3">
        {/* Photo */}
        <div className="flex items-center justify-between gap-4 p-3 rounded-xl bg-gray-50">
          <div className="flex items-center gap-3">
            {status.has_photo ? (
              <CheckCircle className="h-5 w-5 text-green-500 flex-shrink-0" />
            ) : (
              <Circle className="h-5 w-5 text-gray-300 flex-shrink-0" />
            )}
            {photoPreview ? (
              <img src={photoPreview} alt="Preview" className="w-10 h-10 rounded-full object-cover" />
            ) : (
              <Camera className="h-5 w-5 text-gray-400" />
            )}
            <span className={`text-sm ${status.has_photo ? 'text-gray-500' : 'text-gray-800 font-medium'}`}>
              Student photo
            </span>
          </div>
          <label className="flex items-center gap-1 text-sm text-indigo-600 hover:text-indigo-700 cursor-pointer font-medium">
            {uploadingPhoto ? (
              <Loader className="h-4 w-4 animate-spin" />
            ) : (
              <>
                <Upload className="h-4 w-4" />
                {status.has_photo ? 'Replace' : 'Upload'}
              </>
            )}
            <input
              type="file"
              accept="image/*"
              className="hidden"
              onChange={handlePhotoChange}
              disabled={uploadingPhoto}
            />
          </label>
        </div>

        {/* Required documents (grade-based + anything an admin manually requested) */}
        {status.required_documents.map((doc) => {
          const uploadKey = `${doc.value}-${doc.request_id || 'grade'}`;
          const isRejected = doc.status === 'rejected';
          const uploadFieldKey = doc.value === 'other' ? uploadKey : doc.value;
          return (
            <div key={uploadKey} className="p-3 rounded-xl bg-gray-50">
              <div className="flex items-center justify-between gap-4">
                <div className="flex items-center gap-3 min-w-0">
                  {doc.uploaded && !isRejected ? (
                    <CheckCircle className="h-5 w-5 text-green-500 flex-shrink-0" />
                  ) : isRejected ? (
                    <XCircle className="h-5 w-5 text-red-500 flex-shrink-0" />
                  ) : (
                    <Circle className="h-5 w-5 text-gray-300 flex-shrink-0" />
                  )}
                  <FileText className="h-5 w-5 text-gray-400 flex-shrink-0" />
                  <div className="min-w-0">
                    <span className={`text-sm block truncate ${doc.uploaded && !isRejected ? 'text-gray-500' : 'text-gray-800 font-medium'}`}>
                      {doc.label}
                      {doc.source === 'admin_request' && (
                        <span className="ml-2 text-xs text-purple-600 font-normal">requested by school</span>
                      )}
                    </span>
                    {(doc.admin_note || doc.review_note) && (
                      <span className={`text-xs block truncate ${isRejected ? 'text-red-600' : 'text-gray-500'}`}>
                        {isRejected ? `Reason: ${doc.review_note}` : doc.admin_note}
                      </span>
                    )}
                  </div>
                </div>
                <label className="flex items-center gap-1 text-sm text-indigo-600 hover:text-indigo-700 cursor-pointer font-medium flex-shrink-0">
                  {uploadingDocType === uploadFieldKey ? (
                    <Loader className="h-4 w-4 animate-spin" />
                  ) : (
                    <>
                      <Upload className="h-4 w-4" />
                      {doc.uploaded ? (isRejected ? 'Re-upload' : 'Replace') : 'Upload'}
                    </>
                  )}
                  <input
                    type="file"
                    accept="image/*,.pdf"
                    className="hidden"
                    onChange={(e) => {
                      handleDocumentChange(doc.value, e, doc.value === 'other' ? doc.label : '', uploadFieldKey);
                    }}
                    disabled={uploadingDocType === uploadFieldKey}
                  />
                </label>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default RegistrationCompletionCard;
