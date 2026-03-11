// src/pages/ReminderManager.js
import React, { useState, useEffect } from 'react';
import axios from 'axios';
import 'bootstrap/dist/css/bootstrap.min.css';

function ReminderManager() {
  const [students, setStudents] = useState([]);
  const [selectedStudents, setSelectedStudents] = useState([]);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');
  const [smsStatus, setSmsStatus] = useState('');

  useEffect(() => {
    fetchStudentsWithPendingPayments();
  }, []);

  const fetchStudentsWithPendingPayments = async () => {
    try {
      const response = await axios.get('http://127.0.0.1:8000/api/students/');
      // Filter students with pending payments (you'll need an API endpoint for this)
      setStudents(response.data);
    } catch (err) {
      console.error('Error fetching students:', err);
    }
  };

  const toggleStudent = (studentId) => {
    setSelectedStudents(prev => 
      prev.includes(studentId) 
        ? prev.filter(id => id !== studentId)
        : [...prev, studentId]
    );
  };

  const selectAll = () => {
    if (selectedStudents.length === students.length) {
      setSelectedStudents([]);
    } else {
      setSelectedStudents(students.map(s => s.id));
    }
  };

  const sendReminders = async () => {
    if (selectedStudents.length === 0) {
      alert('Please select at least one student');
      return;
    }

    setLoading(true);
    setSmsStatus('Sending reminders...');

    try {
      // This would call your Django backend to send SMS
      await axios.post('http://127.0.0.1:8000/api/send-reminders/', {
        student_ids: selectedStudents,
        custom_message: message
      });
      
      setSmsStatus('Reminders sent successfully!');
      setSelectedStudents([]);
      setMessage('');
    } catch (err) {
      setSmsStatus('Failed to send reminders');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="container mt-4">
      <h2 className="mb-4">SMS Reminder Manager</h2>

      <div className="row">
        <div className="col-md-8">
          <div className="card mb-4">
            <div className="card-header bg-primary text-white">
              <h5>Students with Pending Payments</h5>
            </div>
            <div className="card-body">
              <div className="mb-3">
                <button 
                  className="btn btn-sm btn-info me-2"
                  onClick={selectAll}
                >
                  {selectedStudents.length === students.length ? 'Deselect All' : 'Select All'}
                </button>
                <span className="text-muted">
                  {selectedStudents.length} students selected
                </span>
              </div>

              <div className="table-responsive" style={{maxHeight: '400px', overflowY: 'auto'}}>
                <table className="table table-hover">
                  <thead>
                    <tr>
                      <th>Select</th>
                      <th>Student ID</th>
                      <th>Name</th>
                      <th>Grade</th>
                      <th>Parent Phone</th>
                      <th>Pending Amount</th>
                    </tr>
                  </thead>
                  <tbody>
                    {students.map(student => (
                      <tr key={student.id}>
                        <td>
                          <input 
                            type="checkbox"
                            checked={selectedStudents.includes(student.id)}
                            onChange={() => toggleStudent(student.id)}
                          />
                        </td>
                        <td>{student.student_id}</td>
                        <td>{student.full_name}</td>
                        <td>{student.grade}</td>
                        <td>{student.parent_phone}</td>
                        <td>{student.monthly_fee} Birr</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </div>

        <div className="col-md-4">
          <div className="card">
            <div className="card-header bg-success text-white">
              <h5>Send Reminders</h5>
            </div>
            <div className="card-body">
              <div className="mb-3">
                <label className="form-label">Custom Message (Optional)</label>
                <textarea 
                  className="form-control"
                  rows="4"
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  placeholder="Enter custom message or leave blank for default reminder..."
                ></textarea>
              </div>

              <button 
                className="btn btn-success w-100"
                onClick={sendReminders}
                disabled={loading}
              >
                {loading ? (
                  <>
                    <span className="spinner-border spinner-border-sm me-2"></span>
                    Sending...
                  </>
                ) : (
                  'Send SMS Reminders'
                )}
              </button>

              {smsStatus && (
                <div className={`alert mt-3 ${smsStatus.includes('success') ? 'alert-success' : 'alert-info'}`}>
                  {smsStatus}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default ReminderManager;