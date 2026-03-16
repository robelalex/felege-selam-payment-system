// src/pages/SimpleTest.js
import React, { useState, useEffect } from 'react';
import axios from 'axios';

function SimpleTest() {
  const [slips, setSlips] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const testEndpoint = async () => {
    setLoading(true);
    setError('');
    
    try {
      // Direct axios call, no api instance
      const response = await axios.get('http://127.0.0.1:8000/api/slips/pending/', {
        withCredentials: false, // Try with and without
        headers: {
          'Content-Type': 'application/json',
        }
      });
      
      console.log('Success!', response.data);
      setSlips(response.data);
    } catch (err) {
      console.error('Error details:', {
        message: err.message,
        response: err.response?.data,
        status: err.response?.status,
        headers: err.response?.headers
      });
      setError(JSON.stringify(err.response?.data || err.message, null, 2));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ padding: '20px', fontFamily: 'Arial' }}>
      <h1>Simple API Test</h1>
      
      <button 
        onClick={testEndpoint}
        style={{
          padding: '10px 20px',
          background: '#3b82f6',
          color: 'white',
          border: 'none',
          borderRadius: '5px',
          cursor: 'pointer',
          marginBottom: '20px'
        }}
      >
        Test /api/slips/pending/
      </button>

      {loading && <p>Loading...</p>}

      {error && (
        <div style={{
          background: '#fee2e2',
          border: '1px solid #ef4444',
          borderRadius: '5px',
          padding: '15px',
          marginTop: '20px'
        }}>
          <h3 style={{ color: '#b91c1c', marginTop: 0 }}>Error:</h3>
          <pre style={{ whiteSpace: 'pre-wrap', color: '#991b1b' }}>{error}</pre>
        </div>
      )}

      {slips.length > 0 && (
        <div style={{
          background: '#dcfce7',
          border: '1px solid #22c55e',
          borderRadius: '5px',
          padding: '15px',
          marginTop: '20px'
        }}>
          <h3 style={{ color: '#166534', marginTop: 0 }}>Success! Found {slips.length} slips</h3>
          <pre style={{ whiteSpace: 'pre-wrap' }}>{JSON.stringify(slips, null, 2)}</pre>
        </div>
      )}
    </div>
  );
}

export default SimpleTest;