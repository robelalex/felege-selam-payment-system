import React, { useState, useEffect } from 'react';
import { CreditCard, Key, CheckCircle, XCircle, Loader, Save, RefreshCw, AlertTriangle } from 'lucide-react';
import api from '../services/api';

function SchoolChapaSettings() {
  const [loading, setLoading] = useState(true);
  const [testing, setTesting] = useState(false);
  const [saving, setSaving] = useState(false);
  const [apiKey, setApiKey] = useState('');
  const [status, setStatus] = useState(null);
  const [message, setMessage] = useState('');

  useEffect(() => {
    fetchConfig();
  }, []);

  const fetchConfig = async () => {
    setLoading(true);
    try {
      const response = await api.get('/schools/chapa-config/');
      setStatus(response.data);
      if (response.data.chapa_test_status === 'success') {
        setMessage('✅ Chapa is configured and working!');
      } else if (response.data.chapa_test_status === 'pending') {
        setMessage('⏳ Credentials saved. Please test them.');
      } else if (response.data.chapa_test_status) {
        setMessage(`❌ ${response.data.chapa_test_status}`);
      }
    } catch (err) {
      console.error('Error fetching config:', err);
      setMessage('❌ Could not load Chapa configuration. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    if (!apiKey) {
      alert('Please enter your Chapa API key');
      return;
    }
    
    if (!apiKey.startsWith('CHASECK_')) {
      alert('Invalid API key format. It should start with CHASECK_');
      return;
    }
    
    setSaving(true);
    try {
      await api.post('/schools/chapa-config/', { chapa_api_key: apiKey });
      setMessage('⏳ Credentials saved. Click "Test Credentials" to verify.');
      setStatus({ ...status, chapa_enabled: false, chapa_test_status: 'pending' });
      alert('Credentials saved successfully! Please test them.');
    } catch (err) {
      console.error('Save error:', err);
      alert('Failed to save credentials. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  const handleTest = async () => {
    setTesting(true);
    try {
      const response = await api.post('/schools/chapa-test/');
      if (response.data.success) {
        setMessage('✅ ' + response.data.message);
        setStatus({ ...status, chapa_enabled: true, chapa_test_status: 'success' });
        alert('✅ Chapa credentials are valid! Online payments are now enabled.');
      } else {
        setMessage('❌ ' + response.data.message);
        setStatus({ ...status, chapa_enabled: false, chapa_test_status: 'failed' });
        alert('❌ ' + response.data.message);
      }
    } catch (err) {
      console.error('Test error:', err);
      const errorMsg = err.response?.data?.message || err.response?.data?.error || 'Test failed';
      setMessage('❌ ' + errorMsg);
      setStatus({ ...status, chapa_enabled: false, chapa_test_status: 'failed' });
      alert('❌ ' + errorMsg);
    } finally {
      setTesting(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader className="h-8 w-8 animate-spin text-purple-600" />
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto p-6">
      <div className="flex items-center gap-3 mb-6">
        <CreditCard className="h-8 w-8 text-purple-600" />
        <h1 className="text-2xl font-bold text-gray-900">Chapa Payment Configuration</h1>
      </div>

      {/* Status Banner */}
      {status && (
        <div className={`p-4 rounded-lg mb-6 ${
          status.chapa_enabled ? 'bg-green-50 border border-green-200' : 'bg-yellow-50 border border-yellow-200'
        }`}>
          <div className="flex items-center gap-3">
            {status.chapa_enabled ? (
              <CheckCircle className="h-5 w-5 text-green-600" />
            ) : (
              <AlertTriangle className="h-5 w-5 text-yellow-600" />
            )}
            <div>
              <p className={`font-semibold ${status.chapa_enabled ? 'text-green-800' : 'text-yellow-800'}`}>
                {status.chapa_enabled ? '✅ Online Payments Enabled' : '⚠️ Online Payments Disabled'}
              </p>
              <p className={`text-sm ${status.chapa_enabled ? 'text-green-700' : 'text-yellow-700'}`}>
                {status.chapa_enabled 
                  ? 'Parents can make online payments using Chapa.' 
                  : 'Parents cannot make online payments until you configure and test your Chapa credentials.'}
              </p>
            </div>
          </div>
          {message && (
            <p className={`text-sm mt-2 ${message.includes('✅') ? 'text-green-700' : message.includes('❌') ? 'text-red-700' : 'text-gray-600'}`}>
              {message}
            </p>
          )}
        </div>
      )}

      {/* Configuration Form */}
      <div className="bg-white rounded-xl shadow-lg p-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
          <Key className="h-5 w-5 text-purple-600" />
          Chapa API Credentials
        </h2>

        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Chapa API Key <span className="text-red-500">*</span>
            </label>
            <input
              type="password"
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              placeholder="CHASECK_live_xxxxxxxxxxxxxxxxxxxxx"
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-purple-500"
            />
            <p className="text-xs text-gray-500 mt-1">
              Get your API key from <a href="https://dashboard.chapa.co" target="_blank" rel="noopener noreferrer" className="text-purple-600 hover:underline">Chapa Dashboard</a> → Settings → API Keys
            </p>
            {status?.chapa_api_key && (
              <p className="text-xs text-green-600 mt-1">
                ✅ Current key is saved (hidden for security)
              </p>
            )}
          </div>

          <div className="flex gap-3 pt-2">
            <button
              onClick={handleSave}
              disabled={saving || !apiKey}
              className="px-6 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition-colors disabled:opacity-50 flex items-center gap-2"
            >
              {saving ? <Loader className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
              Save Credentials
            </button>
            
            <button
              onClick={handleTest}
              disabled={testing || !status?.chapa_api_key}
              className="px-6 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors disabled:opacity-50 flex items-center gap-2"
            >
              {testing ? <Loader className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
              Test Credentials
            </button>
          </div>
        </div>
      </div>

      {/* Instructions */}
      <div className="mt-6 bg-blue-50 border border-blue-200 rounded-lg p-4">
        <h3 className="font-semibold text-blue-900 text-sm mb-2">📌 How to Get Your Chapa API Key</h3>
        <ol className="text-xs text-blue-800 space-y-1 list-decimal list-inside">
          <li>Sign up at <a href="https://chapa.co" target="_blank" rel="noopener noreferrer" className="underline">Chapa.co</a></li>
          <li>Go to <strong>Settings</strong> → <strong>API Keys</strong></li>
          <li>Generate a <strong>Live API Key</strong> (starts with CHASECK_)</li>
          <li>Copy and paste it above</li>
          <li>Click <strong>Save Credentials</strong>, then <strong>Test Credentials</strong></li>
          <li>If test passes, parents can now pay online!</li>
        </ol>
      </div>
    </div>
  );
}

export default SchoolChapaSettings;