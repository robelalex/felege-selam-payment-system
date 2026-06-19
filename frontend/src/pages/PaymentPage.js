// src/pages/PaymentPage.js
import React, { useState, useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { initiatePayment } from '../services/api';
import api from '../services/api'; // ✅ Import generic api for slip upload/status
import 'bootstrap/dist/css/bootstrap.min.css';

function PaymentPage() {
  const location = useLocation();
  const navigate = useNavigate();
  const { studentId, deadline, studentName } = location.state || {};

  const [paymentMethod, setPaymentMethod] = useState('telebirr');
  const [paidBy, setPaidBy] = useState('');
  const [paidByPhone, setPaidByPhone] = useState('');
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState('');
  const [paymentResponse, setPaymentResponse] = useState(null);

  // ✅ NEW: Bank Transfer / Slip Upload State
  const [slipFile, setSlipFile] = useState(null);
  const [slipPreview, setSlipPreview] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [verificationStatus, setVerificationStatus] = useState(null); // 'queued', 'verified', 'failed'
  const [verificationMessage, setVerificationMessage] = useState('');
  const [currentSlipId, setCurrentSlipId] = useState(null);

  if (!studentId || !deadline) {
    return (
      <div className="container mt-5">
        <div className="alert alert-danger">No payment information found.</div>
        <button className="btn btn-primary" onClick={() => navigate('/')}>Back</button>
      </div>
    );
  }

  // ✅ Handle file selection & preview
  const handleFileChange = (e) => {
    const file = e.target.files[0];
    if (file) {
      setSlipFile(file);
      setSlipPreview(URL.createObjectURL(file));
      setVerificationStatus(null); // Reset status on new file
    }
  };

  // ✅ Upload slip & trigger async verification
  const handleSlipUpload = async () => {
    if (!slipFile) {
      setError('Please select a bank slip image first.');
      return;
    }

    setUploading(true);
    setError('');
    setVerificationStatus('queued');
    setVerificationMessage('⏳ Uploading and verifying with CBE... This happens automatically.');

    const formData = new FormData();
    formData.append('slip_image', slipFile);
    formData.append('student_id', studentId);
    formData.append('deadline_id', deadline.id);
    formData.append('amount', deadline.amount);
    formData.append('bank_name', 'CBE');
    formData.append('uploaded_by', paidBy || 'Parent');

    try {
      const response = await api.post('/slips/upload/', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });

      const { slip_id, verification_status, ai_details } = response.data;
      setCurrentSlipId(slip_id);

      if (verification_status === 'manual_review') {
        setVerificationStatus('failed');
        setVerificationMessage(`❌ ${ai_details?.message || 'Could not detect reference number. Please enter it manually or contact school.'}`);
      } else {
        setVerificationStatus('queued');
        setVerificationMessage('✅ Slip uploaded! Verifying transaction with CBE in background. You will be notified via SMS/email when done.');
        startStatusPolling(slip_id);
      }
    } catch (err) {
      console.error('Upload error:', err);
      setVerificationStatus('failed');
      setVerificationMessage(err.response?.data?.error || 'Upload failed. Please try again.');
    } finally {
      setUploading(false);
    }
  };

  // ✅ Poll backend for verification result (every 5s)
  const startStatusPolling = (slipId) => {
    const interval = setInterval(async () => {
      try {
        const res = await api.get(`/slips/${slipId}/status/`);
        const { verification_status, verify_et_status, error, payer_name, bank_amount } = res.data;

        if (verification_status === 'verified') {
          clearInterval(interval);
          setVerificationStatus('verified');
          setVerificationMessage(
            `✅ VERIFIED! Payer: ${payer_name || 'N/A'}, Amount: ${bank_amount || 'N/A'} Birr. ` +
            `You will receive an SMS confirmation shortly.`
          );
        } else if (['failed', 'timeout', 'manual_review'].includes(verification_status)) {
          clearInterval(interval);
          setVerificationStatus('failed');
          setVerificationMessage(`❌ Verification ${verification_status}: ${error || 'Please contact school for manual verification.'}`);
        }
        // If still 'queued' or 'pending', keep polling silently
      } catch (e) {
        console.warn('Polling error:', e);
      }
    }, 5000);

    // Cleanup on unmount
    return () => clearInterval(interval);
  };

  // ✅ Main payment submission (for Telebirr/Cash)
  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!paidBy || !paidByPhone) {
      setError('Please fill in all fields');
      return;
    }

    setLoading(true);
    setError('');

    const paymentData = {
      student_id: studentId,
      deadline_id: deadline.id,
      amount: deadline.amount,
      payment_method: paymentMethod,
      paid_by: paidBy,
      paid_by_phone: paidByPhone
    };

    try {
      const response = await initiatePayment(paymentData);
      setPaymentResponse(response.data);
      setSuccess(true);
    } catch (err) {
      console.error('Payment error:', err);
      setError('Failed to initiate payment. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  // ✅ Success Screen
  if (success) {
    return (
      <div className="container mt-5">
        <div className="card">
          <div className="card-header bg-success text-white"><h4>Payment Initiated!</h4></div>
          <div className="card-body">
            <div className="alert alert-success">
              <p><strong>ID:</strong> {paymentResponse.payment.id}</p>
              <p><strong>Amount:</strong> {paymentResponse.payment.amount} Birr</p>
              <p><strong>Status:</strong> {paymentResponse.payment.status}</p>
            </div>
            <div className="alert alert-info">
              <h5>Instructions:</h5>
              <p>{paymentResponse.instructions}</p>
              <hr />
              <p><strong>Bank:</strong> Commercial Bank of Ethiopia</p>
              <p><strong>Account:</strong> 10000001234567</p>
              <p><strong>Name:</strong> Klego Solar School</p>
              <p><strong>Ref:</strong> Student ID: {studentId}</p>
            </div>
            <button className="btn btn-primary" onClick={() => navigate(`/student/${studentId}`)}>Back to Dashboard</button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="container mt-5">
      <div className="row justify-content-center">
        <div className="col-md-8"> {/* Wider column for slip upload */}
          <div className="card shadow-sm">
            <div className="card-header bg-primary text-white"><h4>Make Payment</h4></div>
            <div className="card-body">
              <div className="mb-4 p-3 bg-light rounded">
                <p className="mb-1"><strong>Student:</strong> {studentName}</p>
                <p className="mb-1"><strong>ID:</strong> {studentId}</p>
                <p className="mb-1"><strong>For:</strong> {deadline.month_name} {deadline.academic_year}</p>
                <p className="mb-0 text-primary fw-bold fs-5">Amount: {deadline.amount} Birr</p>
              </div>

              <form onSubmit={handleSubmit}>
                <div className="mb-3">
                  <label className="form-label fw-semibold">Payment Method</label>
                  <select 
                    className="form-select form-select-lg"
                    value={paymentMethod}
                    onChange={(e) => {
                      setPaymentMethod(e.target.value);
                      setVerificationStatus(null); // Reset when switching methods
                    }}
                  >
                    <option value="telebirr">Telebirr (Online)</option>
                    <option value="bank_transfer">Bank Transfer (Upload Slip)</option>
                    <option value="cash">Cash (Pay at School)</option>
                  </select>
                </div>

                {/* ✅ BANK TRANSFER SLIP UPLOAD SECTION */}
                {paymentMethod === 'bank_transfer' && (
                  <div className="mb-4 p-4 border rounded bg-white">
                    <h5 className="mb-3">📤 Upload Bank Transfer Slip</h5>
                    <p className="text-muted small mb-3">
                      Our system automatically verifies your slip with CBE bank servers. 
                      No admin needed. You'll get SMS confirmation within minutes.
                    </p>
                    
                    <div className="mb-3">
                      <input 
                        type="file" 
                        className="form-control" 
                        accept="image/*"
                        onChange={handleFileChange}
                        disabled={uploading || verificationStatus === 'verified'}
                      />
                    </div>

                    {slipPreview && (
                      <div className="mb-3 text-center">
                        <img src={slipPreview} alt="Slip Preview" className="img-fluid rounded border" style={{maxHeight: '200px'}} />
                      </div>
                    )}

                    {verificationStatus && (
                      <div className={`alert ${
                        verificationStatus === 'verified' ? 'alert-success' : 
                        verificationStatus === 'queued' ? 'alert-info' : 'alert-warning'
                      }`}>
                        {verificationMessage}
                      </div>
                    )}

                    <button 
                      type="button"
                      className="btn btn-outline-primary w-100"
                      onClick={handleSlipUpload}
                      disabled={!slipFile || uploading || verificationStatus === 'verified'}
                    >
                      {uploading ? (
                        <><span className="spinner-border spinner-border-sm me-2"></span>Uploading...</>
                      ) : verificationStatus === 'verified' ? (
                        '✅ Verified Successfully'
                      ) : (
                        'Upload & Auto-Verify Slip'
                      )}
                    </button>
                  </div>
                )}

                <div className="mb-3">
                  <label className="form-label fw-semibold">Payer Full Name</label>
                  <input type="text" className="form-control" value={paidBy} onChange={(e) => setPaidBy(e.target.value)} required />
                </div>

                <div className="mb-4">
                  <label className="form-label fw-semibold">Payer Phone Number</label>
                  <input type="tel" className="form-control" value={paidByPhone} onChange={(e) => setPaidByPhone(e.target.value)} placeholder="0912345678" required />
                </div>

                {error && <div className="alert alert-danger">{error}</div>}

                <button type="submit" className="btn btn-success btn-lg w-100" disabled={loading}>
                  {loading ? <><span className="spinner-border spinner-border-sm me-2"></span>Processing...</> : 'Proceed to Payment'}
                </button>
              </form>

              <button className="btn btn-secondary w-100 mt-3" onClick={() => navigate(`/student/${studentId}`)}>Cancel</button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default PaymentPage;