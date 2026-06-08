// frontend/src/pages/SchoolSettings.js
import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import api from '../services/api';

const SchoolSettings = () => {
    const { getAuthHeader } = useAuth();  // Keep this for X-School-ID if needed
    const [loading, setLoading] = useState(false);
    const [testing, setTesting] = useState(false);
    const [config, setConfig] = useState({
        at_username: '',
        at_api_key: '',
        sms_sender_id: '',
        sms_enabled: false,
        sms_test_status: '',
        sms_monthly_limit: 0,
        sms_current_month_count: 0
    });

    useEffect(() => {
        fetchSMSConfig();
    }, []);

    const fetchSMSConfig = async () => {
        setLoading(true);
        try {
            // ✅ REMOVED manual headers - let interceptor handle it
            const response = await api.get('/sms-config/');
            setConfig(response.data);
        } catch (error) {
            console.error('Error fetching config:', error);
            alert('Failed to load SMS configuration');
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
        
        try {
            // ✅ REMOVED manual headers
            await api.post('/sms-config/', config);
            alert('SMS configuration saved successfully! Please test your credentials.');
            await fetchSMSConfig();
        } catch (error) {
            console.error('Error saving config:', error);
            alert('Failed to save configuration');
        } finally {
            setLoading(false);
        }
    };

    const handleTest = async () => {
        setTesting(true);
        try {
            // ✅ REMOVED manual headers
            const response = await api.post('/sms-test/', {});
            alert(response.data.message || 'Test SMS sent successfully to school phone!');
            await fetchSMSConfig();
        } catch (error) {
            console.error('Test failed:', error);
            alert(error.response?.data?.error || 'Test failed. Please check your credentials.');
        } finally {
            setTesting(false);
        }
    };

    if (loading && !config.at_username) {
        return <div className="text-center py-8">Loading...</div>;
    }

    return (
        <div className="max-w-4xl mx-auto p-6">
            <h1 className="text-2xl font-bold mb-6">SMS Configuration</h1>
            
            <div className="bg-yellow-50 border-l-4 border-yellow-400 p-4 mb-6">
                <p className="text-yellow-800">
                    ⚠️ Each school needs its own <strong>Africa's Talking</strong> account. 
                    Enter your credentials below to enable SMS for this school.
                </p>
            </div>

            <form onSubmit={handleSubmit} className="space-y-6">
                <div className="bg-white shadow rounded-lg p-6">
                    <h2 className="text-xl font-semibold mb-4">Africa's Talking Credentials</h2>
                    
                    <div className="space-y-4">
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-2">
                                Username
                            </label>
                            <input
                                type="text"
                                name="at_username"
                                value={config.at_username || ''}
                                onChange={handleChange}
                                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                                placeholder="e.g., sandbox or your username"
                                required
                            />
                            <p className="text-xs text-gray-500 mt-1">
                                For testing, use "sandbox". For production, use your AT username.
                            </p>
                        </div>

                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-2">
                                API Key
                            </label>
                            <input
                                type="password"
                                name="at_api_key"
                                value={config.at_api_key === '********' ? '' : config.at_api_key || ''}
                                onChange={handleChange}
                                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                                placeholder="Enter your Africa's Talking API key"
                                required={!config.sms_enabled}
                            />
                        </div>

                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-2">
                                Sender ID (Optional)
                            </label>
                            <input
                                type="text"
                                name="sms_sender_id"
                                value={config.sms_sender_id || ''}
                                onChange={handleChange}
                                maxLength="11"
                                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                                placeholder="e.g., SCHOOLNAME (max 11 chars)"
                            />
                            <p className="text-xs text-gray-500 mt-1">
                                Must be approved by Africa's Talking. Leave empty to use default.
                            </p>
                        </div>

                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-2">
                                Monthly SMS Limit
                            </label>
                            <input
                                type="number"
                                name="sms_monthly_limit"
                                value={config.sms_monthly_limit || 0}
                                onChange={handleChange}
                                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                            />
                            <p className="text-xs text-gray-500 mt-1">
                                0 = unlimited. Set a limit to control costs.
                            </p>
                        </div>
                    </div>
                </div>

                {config.sms_test_status && (
                    <div className={`p-4 rounded-lg ${
                        config.sms_enabled ? 'bg-green-50 border-green-400' : 'bg-red-50 border-red-400'
                    } border`}>
                        <p className={`font-medium ${
                            config.sms_enabled ? 'text-green-800' : 'text-red-800'
                        }`}>
                            Status: {config.sms_enabled ? '✅ Configured & Working' : '❌ Not Configured or Test Failed'}
                        </p>
                        {config.sms_test_status !== 'success' && (
                            <p className="text-sm text-red-600 mt-1">
                                Last test result: {config.sms_test_status}
                            </p>
                        )}
                        {config.sms_monthly_limit > 0 && (
                            <p className="text-sm text-gray-600 mt-2">
                                SMS Used This Month: {config.sms_current_month_count} / {config.sms_monthly_limit}
                            </p>
                        )}
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
                        disabled={testing || !config.at_username || !config.at_api_key}
                        className="px-6 py-2 bg-green-600 text-white rounded-md hover:bg-green-700 disabled:opacity-50"
                    >
                        {testing ? 'Testing...' : 'Test Credentials'}
                    </button>
                </div>
            </form>

            <div className="mt-8 bg-blue-50 border border-blue-200 rounded-lg p-4">
                <h3 className="font-semibold text-blue-900 mb-2">How to Get Africa's Talking Credentials:</h3>
                <ol className="list-decimal list-inside text-sm text-blue-800 space-y-1">
                    <li>Sign up at <a href="https://account.africastalking.com" target="_blank" rel="noopener noreferrer" className="underline">Africa's Talking</a></li>
                    <li>Go to "Settings" → "API Key" to get your API key</li>
                    <li>Your username is usually "sandbox" for testing or your account username</li>
                    <li>For production, you need to buy an SMS sender ID (optional but recommended)</li>
                    <li>Fund your account to send real SMS (sandbox can only test to verified numbers)</li>
                </ol>
            </div>
        </div>
    );
};

export default SchoolSettings;