// src/pages/Reports.js
import React, { useState, useEffect } from 'react';
import axios from 'axios';
import 'bootstrap/dist/css/bootstrap.min.css';

function Reports() {
  const [reportType, setReportType] = useState('monthly');
  const [month, setMonth] = useState('');
  const [year, setYear] = useState('2016');
  const [grade, setGrade] = useState('');
  const [reportData, setReportData] = useState(null);
  const [loading, setLoading] = useState(false);

  const months = [
    'Meskerem', 'Tikimt', 'Hidar', 'Tahsas', 'Tir', 'Yekatit',
    'Megabit', 'Miazia', 'Ginbot', 'Sene', 'Hamle', 'Nehase', 'Pagume'
  ];

  const generateReport = async () => {
    setLoading(true);
    try {
      let data = {};
      
      if (reportType === 'monthly') {
        const payments = await axios.get('http://127.0.0.1:8000/api/payments/');
        const students = await axios.get('http://127.0.0.1:8000/api/students/');
        
        // Filter by month (you'd need proper filtering in backend)
        const monthlyPayments = payments.data.filter(p => 
          p.deadline_month === months.indexOf(month) + 1
        );
        
        const totalCollected = monthlyPayments.reduce((sum, p) => sum + parseFloat(p.amount), 0);
        const verifiedPayments = monthlyPayments.filter(p => p.status === 'verified');
        
        data = {
          totalStudents: students.data.length,
          totalPayments: monthlyPayments.length,
          verifiedPayments: verifiedPayments.length,
          pendingPayments: monthlyPayments.length - verifiedPayments.length,
          totalCollected: totalCollected,
          averagePerStudent: students.data.length ? (totalCollected / students.data.length).toFixed(2) : 0,
          collectionRate: students.data.length ? ((verifiedPayments.length / students.data.length) * 100).toFixed(2) : 0
        };
      }
      
      setReportData(data);
    } catch (err) {
      console.error('Error generating report:', err);
    } finally {
      setLoading(false);
    }
  };

  const exportToExcel = () => {
    // Convert report data to CSV
    const csvContent = Object.entries(reportData).map(([key, value]) => `${key},${value}`).join('\n');
    
    const blob = new Blob([csvContent], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${reportType}_report_${month || ''}_${year}.csv`;
    a.click();
  };

  return (
    <div className="container mt-4">
      <h2 className="mb-4">Reports & Analytics</h2>

      <div className="row">
        <div className="col-md-4">
          <div className="card mb-4">
            <div className="card-header bg-primary text-white">
              <h5>Report Parameters</h5>
            </div>
            <div className="card-body">
              <div className="mb-3">
                <label className="form-label">Report Type</label>
                <select 
                  className="form-select"
                  value={reportType}
                  onChange={(e) => setReportType(e.target.value)}
                >
                  <option value="monthly">Monthly Collection</option>
                  <option value="grade">By Grade</option>
                  <option value="student">Individual Student</option>
                  <option value="summary">Summary Report</option>
                </select>
              </div>

              {reportType === 'monthly' && (
                <>
                  <div className="mb-3">
                    <label className="form-label">Month</label>
                    <select 
                      className="form-select"
                      value={month}
                      onChange={(e) => setMonth(e.target.value)}
                    >
                      <option value="">Select Month</option>
                      {months.map((m, index) => (
                        <option key={index} value={m}>{m}</option>
                      ))}
                    </select>
                  </div>
                  <div className="mb-3">
                    <label className="form-label">Year (E.C.)</label>
                    <input 
                      type="text" 
                      className="form-control"
                      value={year}
                      onChange={(e) => setYear(e.target.value)}
                      placeholder="e.g., 2016"
                    />
                  </div>
                </>
              )}

              {reportType === 'grade' && (
                <div className="mb-3">
                  <label className="form-label">Grade</label>
                  <select 
                    className="form-select"
                    value={grade}
                    onChange={(e) => setGrade(e.target.value)}
                  >
                    <option value="">All Grades</option>
                    {[1,2,3,4,5,6,7,8].map(g => (
                      <option key={g} value={g}>Grade {g}</option>
                    ))}
                  </select>
                </div>
              )}

              <button 
                className="btn btn-primary w-100"
                onClick={generateReport}
                disabled={loading}
              >
                {loading ? 'Generating...' : 'Generate Report'}
              </button>
            </div>
          </div>
        </div>

        <div className="col-md-8">
          {reportData && (
            <div className="card">
              <div className="card-header bg-success text-white d-flex justify-content-between align-items-center">
                <h5 className="mb-0">Report Results</h5>
                <button 
                  className="btn btn-sm btn-light"
                  onClick={exportToExcel}
                >
                  Export to Excel
                </button>
              </div>
              <div className="card-body">
                <div className="row">
                  <div className="col-md-6">
                    <div className="card mb-3">
                      <div className="card-body">
                        <h6>Total Students</h6>
                        <h3>{reportData.totalStudents}</h3>
                      </div>
                    </div>
                  </div>
                  <div className="col-md-6">
                    <div className="card mb-3">
                      <div className="card-body">
                        <h6>Total Collected</h6>
                        <h3>{reportData.totalCollected} Birr</h3>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="row">
                  <div className="col-md-4">
                    <div className="card mb-3">
                      <div className="card-body">
                        <h6>Verified Payments</h6>
                        <h3>{reportData.verifiedPayments}</h3>
                      </div>
                    </div>
                  </div>
                  <div className="col-md-4">
                    <div className="card mb-3">
                      <div className="card-body">
                        <h6>Pending Payments</h6>
                        <h3>{reportData.pendingPayments}</h3>
                      </div>
                    </div>
                  </div>
                  <div className="col-md-4">
                    <div className="card mb-3">
                      <div className="card-body">
                        <h6>Collection Rate</h6>
                        <h3>{reportData.collectionRate}%</h3>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="alert alert-info">
                  <strong>Average per Student:</strong> {reportData.averagePerStudent} Birr
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default Reports;