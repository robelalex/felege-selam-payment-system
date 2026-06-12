// frontend/src/pages/VerifyETSettings.js
import React, { useState, useEffect } from 'react';
import api from '../services/api';

const VerifyETSettings = () => {
    const [loading, setLoading] = useState(false);
    const [testing, setTesting] = useState(false);
    const [config, setConfig] = useState({
        verify_et_api_key: '',
        verify_et_enabled: false,
        cbe_account_number: '',
        cbe_account_suffix: '',
        verify_et_test_status: '',
        verify_et_last_test: null
    });
    const [testResult, setTestResult] = useState(null);

    useEffect(() => {
        fetchVerifyETConfig();
    }, []);

    const fetchVerifyETConfig = async () => {
        setLoading(true);
        try {
            const response = await api.get('/verify-et-settings/');
            setConfig(response.data);
        } catch (error) {
            console.error('Error fetching Verify.ET config:', error);
            alert('Failed to load Verify.ET configuration');
        } finally {
            setLoading(false);
        }
    };

    const handleChange = (e) => {
        const { name, value, type, checked } = e.target;
        setConfig(prev => ({
            ...prev,
            [name]: type === 'checkbox' ? checked : value
        }));
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        setLoading(true);
        setTestResult(null);
        
        try {
            await api.post('/verify-et-settings/', {
                verify_et_api_key: config.verify_et_api_key,
                verify_et_enabled: config.verify_et_enabled,
                cbe_account_number: config.cbe_account_number,
                cbe_account_suffix: config.cbe_account_suffix
            });
            alert('Verify.ET configuration saved successfully!');
            await fetchVerifyETConfig();
        } catch (error) {
            console.error('Error saving config:', error);
            alert(error.response?.data?.error || 'Failed to save configuration');
        } finally {
            setLoading(false);
        }
    };

    const handleTest = async () => {
        setTesting(true);
        setTestResult(null);
        try {
            const response = await api.post('/verify-et-test/');
            setTestResult({
                success: true,
                message: response.data.message || 'Connection successful! API key is valid.'
            });
            alert('✅ Connection successful! Your Verify.ET credentials are working.');
            await fetchVerifyETConfig();
        } catch (error) {
            console.error('Test failed:', error);
            const errorMsg = error.response?.data?.error || 'Test failed. Please check your credentials.';
            setTestResult({
                success: false,
                message: errorMsg
            });
            alert('❌ ' + errorMsg);
        } finally {
            setTesting(false);
        }
    };

    if (loading && !config.verify_et_api_key) {
        return <div className="text-center py-8">Loading...</div>;
    }

    return (
        <div className="max-w-4xl mx-auto p-6">
            <h1 className="text-2xl font-bold mb-6">Verify.ET Configuration</h1>
            
            <div className="bg-blue-50 border-l-4 border-blue-400 p-4 mb-6">
                <p className="text-blue-800">
                    🔐 <strong>Verify.ET</strong> allows instant online verification of CBE bank transfers.
                    Each school needs its own Verify.ET account. 
                    <a href="https://verify.et" target="_blank" rel="noopener noreferrer" className="underline ml-1">Get your API key here →</a>
                </p>
            </div>

            <form onSubmit={handleSubmit} className="space-y-6">
                <div className="bg-white shadow rounded-lg p-6">
                    <h2 className="text-xl font-semibold mb-4">Verify.ET Credentials</h2>
                    
                    <div className="space-y-4">
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-2">
                                Verify.ET API Key <span className="text-red-500">*</span>
                            </label>
                            <input
                                type="password"
                                name="verify_et_api_key"
                                value={config.verify_et_api_key === '********' ? '' : config.verify_et_api_key || ''}
                                onChange={handleChange}
                                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                                placeholder="Enter your Verify.ET API key (e.g., sk_live_...)"
                                required
                            />
                            <p className="text-xs text-gray-500 mt-1">
                                Get your API key from <a href="https://verify.et/dashboard" target="_blank" rel="noopener noreferrer" className="text-blue-600 underline">verify.et/dashboard</a>
                            </p>
                        </div>

                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-2">
                                CBE Account Number
                            </label>
                            <input
                                type="text"
                                name="cbe_account_number"
                                value={config.cbe_account_number || ''}
                                onChange={handleChange}
                                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                                placeholder="e.g., 1000137267900"
                            />
                            <p className="text-xs text-gray-500 mt-1">
                                Your school's full CBE account number (optional but recommended)
                            </p>
                        </div>

                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-2">
                                CBE Account Suffix <span className="text-red-500">*</span>
                            </label>
                            <input
                                type="text"
                                name="cbe_account_suffix"
                                value={config.cbe_account_suffix || ''}
                                onChange={handleChange}
                                maxLength="8"
                                pattern="[0-9]{8}"
                                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                                placeholder="Last 8 digits (e.g., 13726790)"
                                required
                            />
                            <p className="text-xs text-gray-500 mt-1">
                                Last 8 digits of your school's CBE account number. Required for verification.
                            </p>
                        </div>

                        <div className="flex items-center">
                            <input
                                type="checkbox"
                                name="verify_et_enabled"
                                checked={config.verify_et_enabled}
                                onChange={handleChange}
                                className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
                            />
                            <label className="ml-2 block text-sm text-gray-700">
                                Enable Verify.ET for this school
                            </label>
                        </div>
                    </div>
                </div>

                {/* Status Display */}
                {config.verify_et_test_status && (
                    <div className={`p-4 rounded-lg ${
                        config.verify_et_enabled ? 'bg-green-50 border-green-400' : 'bg-red-50 border-red-400'
                    } border`}>
                        <p className={`font-medium ${
                            config.verify_et_enabled ? 'text-green-800' : 'text-red-800'
                        }`}>
                            Status: {config.verify_et_enabled ? '✅ Configured & Working' : '❌ Not Configured or Test Failed'}
                        </p>
                        {config.verify_et_test_status !== 'success' && config.verify_et_test_status && (
                            <p className="text-sm text-red-600 mt-1">
                                Last test result: {config.verify_et_test_status}
                            </p>
                        )}
                        {config.verify_et_last_test && (
                            <p className="text-xs text-gray-500 mt-1">
                                Last tested: {new Date(config.verify_et_last_test).toLocaleString()}
                            </p>
                        )}
                    </div>
                )}

                {/* Test Result Display */}
                {testResult && (
                    <div className={`p-4 rounded-lg ${testResult.success ? 'bg-green-50' : 'bg-red-50'} border`}>
                        <p className={`font-medium ${testResult.success ? 'text-green-800' : 'text-red-800'}`}>
                            {testResult.success ? '✅ Test Result: Successful' : '❌ Test Result: Failed'}
                        </p>
                        <p className="text-sm mt-1">{testResult.message}</p>
                    </div>
                )}

                <div className="flex space-x-4">
                    <button
                        type="submit"
                        disabled={loading}
                        className="px-6 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50"
                    >
                        {loading ? 'Saving...' : 'Save Configuration'}
                    </button>
                    
                    <button
                        type="button"
                        onClick={handleTest}
                        disabled={testing || !config.verify_et_api_key || !config.cbe_account_suffix}
                        className="px-6 py-2 bg-green-600 text-white rounded-md hover:bg-green-700 disabled:opacity-50"
                    >
                        {testing ? 'Testing...' : 'Test Connection'}
                    </button>
                </div>
            </form>

            <div className="mt-8 bg-gray-50 border border-gray-200 rounded-lg p-4">
                <h3 className="font-semibold text-gray-900 mb-2">How Verify.ET Works:</h3>
                <ul className="list-disc list-inside text-sm text-gray-700 space-y-1">
                    <li>Parents upload bank transfer slips</li>
                    <li>AI automatically detects the transaction reference number</li>
                    <li>Admin clicks "Check Receipt (Online)" button</li>
                    <li>Verify.ET instantly checks with CBE and returns payer name, amount, and date</li>
                    <li>Admin verifies the payment with one click</li>
                </ul>
            </div>

            <div className="mt-4 bg-yellow-50 border border-yellow-200 rounded-lg p-4">
                <h3 className="font-semibold text-yellow-800 mb-2">📋 How to Get Your Verify.ET API Key:</h3>
                <ol className="list-decimal list-inside text-sm text-yellow-800 space-y-1">
                    <li>Go to <a href="https://verify.et" target="_blank" rel="noopener noreferrer" className="underline">https://verify.et</a></li>
                    <li>Click "Sign Up" and create an account</li>
                    <li>Verify your email and log in</li>
                    <li>Go to "Developer Access" or "API Keys" section</li>
                    <li>Click "Create New API Key"</li>
                    <li>Copy your API key (starts with "sk_")</li>
                    <li>Paste it above and click "Test Connection"</li>
                </ol>
            </div>
        </div>
    );
};

export default VerifyETSettings;