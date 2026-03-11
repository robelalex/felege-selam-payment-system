// src/pages/PaymentPage.js
import React, { useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { initiatePayment } from '../services/api';
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

  if (!studentId || !deadline) {
    return (
      <div className="container mt-5">
        <div className="alert alert-danger">
          No payment information found. Please start over.
        </div>
        <button 
          className="btn btn-primary"
          onClick={() => navigate('/')}
        >
          Back to Search
        </button>
      </div>
    );
  }

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

  if (success) {
    return (
      <div className="container mt-5">
        <div className="card">
          <div className="card-header bg-success text-white">
            <h4>Payment Initiated Successfully!</h4>
          </div>
          <div className="card-body">
            <div className="alert alert-success">
              <p><strong>Payment ID:</strong> {paymentResponse.payment.id}</p>
              <p><strong>Amount:</strong> {paymentResponse.payment.amount} Birr</p>
              <p><strong>Status:</strong> {paymentResponse.payment.status}</p>
            </div>
            
            <div className="alert alert-info">
              <h5>Payment Instructions:</h5>
              <p>{paymentResponse.instructions}</p>
              <hr />
              <p><strong>Bank Account:</strong> Commercial Bank of Ethiopia</p>
              <p><strong>Account Number:</strong> 10000001234567</p>
              <p><strong>Account Name:</strong> Klego Solar School</p>
              <p><strong>Reference:</strong> Use Student ID: {studentId}</p>
            </div>

            <button 
              className="btn btn-primary"
              onClick={() => navigate(`/student/${studentId}`)}
            >
              Back to Dashboard
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="container mt-5">
      <div className="row justify-content-center">
        <div className="col-md-6">
          <div className="card">
            <div className="card-header bg-primary text-white">
              <h4>Make Payment</h4>
            </div>
            <div className="card-body">
              <div className="mb-3">
                <p><strong>Student:</strong> {studentName}</p>
                <p><strong>Student ID:</strong> {studentId}</p>
                <p><strong>Paying for:</strong> {deadline.month_name} {deadline.academic_year}</p>
                <p><strong>Amount:</strong> {deadline.amount} Birr</p>
                <p><strong>Due Date:</strong> {new Date(deadline.due_date).toLocaleDateString()}</p>
              </div>

              <form onSubmit={handleSubmit}>
                <div className="mb-3">
                  <label className="form-label">Payment Method</label>
                  <select 
                    className="form-select"
                    value={paymentMethod}
                    onChange={(e) => setPaymentMethod(e.target.value)}
                  >
                    <option value="telebirr">Telebirr</option>
                    <option value="bank_transfer">Bank Transfer</option>
                    <option value="cash">Cash (Pay at School)</option>
                  </select>
                </div>

                <div className="mb-3">
                  <label className="form-label">Payer Full Name</label>
                  <input
                    type="text"
                    className="form-control"
                    value={paidBy}
                    onChange={(e) => setPaidBy(e.target.value)}
                    required
                  />
                </div>

                <div className="mb-3">
                  <label className="form-label">Payer Phone Number</label>
                  <input
                    type="tel"
                    className="form-control"
                    value={paidByPhone}
                    onChange={(e) => setPaidByPhone(e.target.value)}
                    placeholder="0912345678"
                    required
                  />
                </div>

                {error && (
                  <div className="alert alert-danger">
                    {error}
                  </div>
                )}

                <button 
                  type="submit" 
                  className="btn btn-success w-100"
                  disabled={loading}
                >
                  {loading ? (
                    <>
                      <span className="spinner-border spinner-border-sm me-2"></span>
                      Processing...
                    </>
                  ) : (
                    'Proceed to Payment'
                  )}
                </button>
              </form>

              <button 
                className="btn btn-secondary w-100 mt-2"
                onClick={() => navigate(`/student/${studentId}`)}
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default PaymentPage;