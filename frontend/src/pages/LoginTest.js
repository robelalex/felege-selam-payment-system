// src/pages/LoginTest.js
import React, { useState } from 'react';
import api from '../services/api';

function LoginTest() {
  const [username, setUsername] = useState('robelalex');
  const [password, setPassword] = useState('Ru1744/15');
  const [result, setResult] = useState(null);

  const handleLogin = async () => {
    try {
      // Try to access a protected endpoint
      const response = await api.get('/slips/pending/');
      setResult({ success: true, data: response.data });
    } catch (err) {
      setResult({ 
        success: false, 
        error: err.message,
        status: err.response?.status,
        data: err.response?.data
      });
    }
  };

  const checkCookies = () => {
    console.log('All cookies:', document.cookie);
    alert('Check console for cookies');
  };

  return (
    <div className="p-8 max-w-md mx-auto">
      <h1 className="text-2xl font-bold mb-4">Login Test</h1>
      
      <div className="space-y-4 mb-4">
        <div>
          <label className="block mb-1">Username</label>
          <input
            type="text"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            className="w-full p-2 border rounded"
          />
        </div>
        <div>
          <label className="block mb-1">Password</label>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="w-full p-2 border rounded"
          />
        </div>
      </div>

      <div className="flex gap-2">
        <button
          onClick={handleLogin}
          className="px-4 py-2 bg-blue-600 text-white rounded"
        >
          Test API Access
        </button>
        <button
          onClick={checkCookies}
          className="px-4 py-2 bg-gray-600 text-white rounded"
        >
          Check Cookies
        </button>
      </div>

      {result && (
        <div className="mt-4 p-4 border rounded">
          <h3 className="font-bold">Result:</h3>
          <pre className="mt-2 text-sm overflow-auto">
            {JSON.stringify(result, null, 2)}
          </pre>
        </div>
      )}
    </div>
  );
}

export default LoginTest;