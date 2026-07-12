// frontend/src/pages/SchoolSettings.js
import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import api from '../services/api';
import { getMediaUrl } from '../utils/imageUrl';

const SchoolSettings = () => {
    const { getAuthHeader } = useAuth();
    const [loading, setLoading] = useState(false);
    const [testing, setTesting] = useState({ sms: false, email: false });
    
    // SMS Configuration State
    const [smsConfig, setSmsConfig] = useState({
        at_username: '',
        at_api_key: '',
        sms_sender_id: '',
        sms_enabled: false,
        sms_test_status: '',
        sms_monthly_limit: 0,
        sms_current_month_count: 0
    });

    // ✅ NEW: Email Configuration State (Brevo)
    const [emailConfig, setEmailConfig] = useState({
        brevo_api_key: '',
        brevo_sender_email: '',
        brevo_sender_name: '',
        email_enabled: false,
        email_test_status: '',
        email_monthly_limit: 0,
        email_current_month_count: 0
    });

    // ✅ NEW: Branding (logo) + Grading System state
    const [schoolId, setSchoolId] = useState(null);
    const [logoFile, setLogoFile] = useState(null);
    const [logoPreview, setLogoPreview] = useState(null);
    const [savingBranding, setSavingBranding] = useState(false);
    const [gradingSystem, setGradingSystem] = useState('percentage');
    const [savingGrading, setSavingGrading] = useState(false);

    useEffect(() => {
        fetchAllConfigs();
        fetchSchoolProfile();
    }, []);

    // ✅ NEW: load current school (logo + grading system) — this account's own school
    const fetchSchoolProfile = async () => {
        try {
            const res = await api.get('/schools/');
            const school = Array.isArray(res.data) ? res.data[0] : res.data;
            if (school) {
                setSchoolId(school.id);
                setLogoPreview(school.logo ? getMediaUrl(school.logo) : null);
                setGradingSystem(school.grading_system || 'percentage');
            }
        } catch (error) {
            console.error('Error fetching school profile:', error);
        }
    };

    const handleLogoChange = (e) => {
        const file = e.target.files?.[0];
        if (!file) return;
        if (!['image/jpeg', 'image/png', 'image/jpg'].includes(file.type)) {
            alert('Logo must be a JPG or PNG image');
            return;
        }
        if (file.size > 3 * 1024 * 1024) {
            alert('Logo must be smaller than 3MB');
            return;
        }
        setLogoFile(file);
        setLogoPreview(URL.createObjectURL(file));
    };

    const handleLogoSave = async () => {
        if (!logoFile || !schoolId) return;
        setSavingBranding(true);
        try {
            const formData = new FormData();
            formData.append('logo', logoFile);
            const res = await api.patch(`/schools/${schoolId}/`, formData, {
                headers: { 'Content-Type': 'multipart/form-data' }
            });
            alert('✅ School logo updated successfully!');
            await fetchSchoolProfile();

            // ✅ Keep the sidebar's cached school info in sync immediately —
            // without this, AdminLayout kept showing the OLD logo (or the
            // default icon) until logout/login cleared its stale cache.
            const cached = JSON.parse(localStorage.getItem('selectedSchool') || '{}');
            localStorage.setItem('selectedSchool', JSON.stringify({ ...cached, logo: res.data.logo }));
            window.dispatchEvent(new Event('schoolInfoUpdated'));
        } catch (error) {
            console.error('Error saving logo:', error);
            alert('❌ Failed to update logo');
        } finally {
            setSavingBranding(false);
        }
    };

    const handleGradingSystemSave = async () => {
        if (!schoolId) return;
        setSavingGrading(true);
        try {
            await api.patch(`/schools/${schoolId}/`, { grading_system: gradingSystem });
            alert('✅ Grading system saved! Exam results will now display using this format.');
        } catch (error) {
            console.error('Error saving grading system:', error);
            alert('❌ Failed to save grading system');
        } finally {
            setSavingGrading(false);
        }
    };

    const fetchAllConfigs = async () => {
        setLoading(true);
        try {
            // Fetch both configs in parallel
            const [smsRes, emailRes] = await Promise.all([
                api.get('/schools/sms-config/'),
                api.get('/schools/email-config/') // ✅ NEW endpoint
            ]);
            setSmsConfig(smsRes.data);
            setEmailConfig(emailRes.data);
        } catch (error) {
            console.error('Error fetching configs:', error);
            alert('Failed to load configurations');
        } finally {
            setLoading(false);
        }
    };

    const handleSmsChange = (e) => {
        const { name, value, type, checked } = e.target;
        setSmsConfig(prev => ({
            ...prev,
            [name]: type === 'checkbox' ? checked : value
        }));
    };

    // ✅ NEW: Email field handler
    const handleEmailChange = (e) => {
        const { name, value, type, checked } = e.target;
        setEmailConfig(prev => ({
            ...prev,
            [name]: type === 'checkbox' ? checked : value
        }));
    };

    const handleSmsSubmit = async (e) => {
        e.preventDefault();
        setLoading(true);
        try {
            await api.post('/schools/sms-config/', smsConfig);
            alert('✅ SMS configuration saved successfully! Please test your credentials.');
            await fetchAllConfigs();
        } catch (error) {
            console.error('Error saving SMS config:', error);
            alert('❌ Failed to save SMS configuration');
        } finally {
            setLoading(false);
        }
    };

    // ✅ NEW: Email submit handler
    const handleEmailSubmit = async (e) => {
        e.preventDefault();
        setLoading(true);
        try {
            await api.post('/schools/email-config/', emailConfig);
            alert('✅ Email configuration saved successfully! Please test your credentials.');
            await fetchAllConfigs();
        } catch (error) {
            console.error('Error saving Email config:', error);
            alert('❌ Failed to save Email configuration');
        } finally {
            setLoading(false);
        }
    };

    const handleSmsTest = async () => {
        setTesting(prev => ({ ...prev, sms: true }));
        try {
            const response = await api.post('/schools/sms-test/', {});
            if (response.data && response.data.success) {
                alert(response.data.message || '✅ Test SMS sent successfully!');
            } else {
                alert(response.data?.message || '✅ Test SMS sent successfully!');
            }
            await fetchAllConfigs();
        } catch (error) {
            let errorMessage = 'Test failed. Please check your credentials.';
            if (error.response?.data?.error) errorMessage = error.response.data.error;
            else if (error.response?.data?.detail) errorMessage = error.response.data.detail;
            else if (error.response?.data?.message) errorMessage = error.response.data.message;
            else if (error.message) errorMessage = error.message;
            alert(`❌ ${errorMessage}`);
            await fetchAllConfigs();
        } finally {
            setTesting(prev => ({ ...prev, sms: false }));
        }
    };

    // ✅ NEW: Email test handler
    const handleEmailTest = async () => {
        setTesting(prev => ({ ...prev, email: true }));
        try {
            const response = await api.post('/schools/email-test/', {});
            if (response.data && response.data.success) {
                alert(response.data.message || '✅ Test email sent successfully!');
            } else {
                alert(response.data?.message || '✅ Test email sent successfully!');
            }
            await fetchAllConfigs();
        } catch (error) {
            let errorMessage = 'Test failed. Please check your credentials.';
            if (error.response?.data?.error) errorMessage = error.response.data.error;
            else if (error.response?.data?.detail) errorMessage = error.response.data.detail;
            else if (error.response?.data?.message) errorMessage = error.response.data.message;
            else if (error.message) errorMessage = error.message;
            alert(`❌ ${errorMessage}`);
            await fetchAllConfigs();
        } finally {
            setTesting(prev => ({ ...prev, email: false }));
        }
    };

    if (loading && !smsConfig.at_username && !emailConfig.brevo_api_key) {
        return <div className="text-center py-8">Loading...</div>;
    }

    return (
        <div className="max-w-4xl mx-auto p-6 space-y-8">
            <h1 className="text-2xl font-bold mb-6">School Settings</h1>

            {/* ==================== BRANDING (LOGO) SECTION — NEW ==================== */}
            <div className="bg-white shadow rounded-lg overflow-hidden">
                <div className="bg-purple-50 border-l-4 border-purple-400 p-4">
                    <p className="text-purple-800">
                        🏫 Your school logo appears on receipts, report cards, and the parent portal.
                    </p>
                </div>
                <div className="p-6 flex items-center gap-6">
                    <div className="h-24 w-24 rounded-lg bg-gray-100 border border-gray-200 overflow-hidden flex items-center justify-center flex-shrink-0">
                        {logoPreview ? (
                            <img src={logoPreview} alt="School logo" className="h-full w-full object-cover" />
                        ) : (
                            <span className="text-xs text-gray-400 text-center px-2">No logo yet</span>
                        )}
                    </div>
                    <div className="flex-1">
                        <label className="block text-sm font-medium text-gray-700 mb-2">Upload School Logo</label>
                        <input
                            type="file"
                            accept="image/jpeg,image/png,image/jpg"
                            onChange={handleLogoChange}
                            className="text-sm text-gray-600 mb-3"
                        />
                        <p className="text-xs text-gray-500 mb-3">JPG or PNG, up to 3MB.</p>
                        <button
                            onClick={handleLogoSave}
                            disabled={!logoFile || savingBranding}
                            className="px-6 py-2 bg-purple-600 text-white rounded-md hover:bg-purple-700 disabled:opacity-50"
                        >
                            {savingBranding ? 'Saving...' : 'Save Logo'}
                        </button>
                    </div>
                </div>
            </div>

            {/* ==================== GRADING SYSTEM SECTION — NEW ==================== */}
            <div className="bg-white shadow rounded-lg overflow-hidden">
                <div className="bg-teal-50 border-l-4 border-teal-400 p-4">
                    <p className="text-teal-800">
                        📊 Choose how exam results are graded and displayed for your school. This applies to report cards and the grade-entry screens teachers use.
                    </p>
                </div>
                <div className="p-6 space-y-4">
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-2">Grading System</label>
                        <select
                            value={gradingSystem}
                            onChange={(e) => setGradingSystem(e.target.value)}
                            className="w-full md:w-96 px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-teal-500 focus:border-teal-500"
                        >
                            <option value="percentage">Percentage (out of 100)</option>
                            <option value="letter_grade">Letter Grade (A, B, C...)</option>
                            <option value="both">Both — show percentage and letter grade</option>
                        </select>
                        <p className="text-xs text-gray-500 mt-1">
                            {gradingSystem === 'percentage' && 'Results will show raw marks out of 100, e.g. "87/100".'}
                            {gradingSystem === 'letter_grade' && 'Results will show a letter grade based on your school\'s scale (default: 90+=A, 80-89=B, etc). Editable later in exam settings.'}
                            {gradingSystem === 'both' && 'Results will show both, e.g. "87/100 (B)".'}
                        </p>
                    </div>
                    <button
                        onClick={handleGradingSystemSave}
                        disabled={savingGrading}
                        className="px-6 py-2 bg-teal-600 text-white rounded-md hover:bg-teal-700 disabled:opacity-50"
                    >
                        {savingGrading ? 'Saving...' : 'Save Grading System'}
                    </button>
                </div>
            </div>

            {/* ==================== SMS CONFIGURATION SECTION ==================== */}
            <div className="bg-white shadow rounded-lg overflow-hidden">
                <div className="bg-yellow-50 border-l-4 border-yellow-400 p-4">
<p className="text-yellow-800">
    ⚠️ Each school needs its own <strong>Afro Message</strong> API Key. 
    Enter your credentials below to enable SMS for this school.
</p>
                </div>

                <form onSubmit={handleSmsSubmit} className="p-6 space-y-6">
                    <h2 className="text-xl font-semibold">Afro Message Credentials</h2>
                    
                    <div className="space-y-4">

                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-2">API Key</label>
                            <input
                                type="password"
                                name="at_api_key"
                                value={smsConfig.at_api_key === '********' ? '' : smsConfig.at_api_key || ''}
                                onChange={handleSmsChange}
                                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                                placeholder="Enter your Afro Message API Key"
                                required
                            />
                        </div>

                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-2">Sender ID (Optional)</label>
                            <input
                                type="text"
                                name="sms_sender_id"
                                value={smsConfig.sms_sender_id || ''}
                                onChange={handleSmsChange}
                                maxLength="11"
                                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                                placeholder="e.g., SCHOOLNAME (max 11 chars)"
                            />
                            <p className="text-xs text-gray-500 mt-1">Must be approved by Afro Message. Leave empty to use system default.</p>
                        </div>

                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-2">Monthly SMS Limit</label>
                            <input
                                type="number"
                                name="sms_monthly_limit"
                                value={smsConfig.sms_monthly_limit || 0}
                                onChange={handleSmsChange}
                                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                            />
                            <p className="text-xs text-gray-500 mt-1">0 = unlimited. Set a limit to control costs.</p>
                        </div>
                    </div>

                    {smsConfig.sms_test_status && (
                        <div className={`p-4 rounded-lg ${smsConfig.sms_enabled ? 'bg-green-50 border-green-400' : 'bg-red-50 border-red-400'} border`}>
                            <p className={`font-medium ${smsConfig.sms_enabled ? 'text-green-800' : 'text-red-800'}`}>
                                Status: {smsConfig.sms_enabled ? '✅ Configured & Working' : '❌ Not Configured or Test Failed'}
                            </p>
                            {smsConfig.sms_test_status !== 'success' && (
                                <p className="text-sm text-red-600 mt-1">Last test result: {smsConfig.sms_test_status}</p>
                            )}
                            {smsConfig.sms_monthly_limit > 0 && (
                                <p className="text-sm text-gray-600 mt-2">SMS Used This Month: {smsConfig.sms_current_month_count} / {smsConfig.sms_monthly_limit}</p>
                            )}
                        </div>
                    )}

                    <div className="flex space-x-4 pt-4">
                        <button
                            type="submit"
                            disabled={loading}
                            className="px-6 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50"
                        >
                            {loading ? 'Saving...' : 'Save SMS Configuration'}
                        </button>
                        <button
                            type="button"
                            onClick={handleSmsTest}
                            disabled={testing.sms || !smsConfig.at_api_key}
                            className="px-6 py-2 bg-green-600 text-white rounded-md hover:bg-green-700 disabled:opacity-50"
                        >
                            {testing.sms ? 'Testing...' : 'Test SMS Credentials'}
                        </button>
                    </div>
                </form>
            </div>

            {/* ==================== EMAIL CONFIGURATION SECTION (NEW) ==================== */}
            <div className="bg-white shadow rounded-lg overflow-hidden">
                <div className="bg-blue-50 border-l-4 border-blue-400 p-4">
                    <p className="text-blue-800">
                        📧 Each school can configure their own <strong>Brevo</strong> account for payment receipts and overdue reminders. 
                        Emails will be sent from YOUR school's branded address.
                    </p>
                </div>

                <form onSubmit={handleEmailSubmit} className="p-6 space-y-6">
                    <h2 className="text-xl font-semibold">Brevo Email Credentials</h2>
                    
                    <div className="space-y-4">
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-2">Brevo v3 API Key <span className="text-red-500">*</span></label>
                            <input
                                type="password"
                                name="brevo_api_key"
                                value={emailConfig.brevo_api_key === '********' ? '' : emailConfig.brevo_api_key || ''}
                                onChange={handleEmailChange}
                                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                                placeholder="Enter your Brevo v3 API key (starts with xkeysib-)"
                                required={!emailConfig.email_enabled}
                            />
                            <p className="text-xs text-gray-500 mt-1">Get your v3 API key from Brevo Dashboard → SMTP & API → API Keys</p>
                        </div>

                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-2">Verified Sender Email <span className="text-red-500">*</span></label>
                            <input
                                type="email"
                                name="brevo_sender_email"
                                value={emailConfig.brevo_sender_email || ''}
                                onChange={handleEmailChange}
                                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                                placeholder="e.g., finance@yourschool.edu.et"
                                required={!emailConfig.email_enabled}
                            />
                            <p className="text-xs text-gray-500 mt-1">This email MUST be verified in your Brevo dashboard under Senders & IP</p>
                        </div>

                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-2">Sender Display Name</label>
                            <input
                                type="text"
                                name="brevo_sender_name"
                                value={emailConfig.brevo_sender_name || ''}
                                onChange={handleEmailChange}
                                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                                placeholder="e.g., Greenfield Academy Finance"
                            />
                            <p className="text-xs text-gray-500 mt-1">Name displayed to parents in their inbox. Defaults to school name if empty.</p>
                        </div>

                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-2">Monthly Email Limit</label>
                            <input
                                type="number"
                                name="email_monthly_limit"
                                value={emailConfig.email_monthly_limit || 0}
                                onChange={handleEmailChange}
                                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                            />
                            <p className="text-xs text-gray-500 mt-1">0 = unlimited. Brevo free tier allows 300/day. Set a limit to avoid surprises.</p>
                        </div>
                    </div>

                    {emailConfig.email_test_status && (
                        <div className={`p-4 rounded-lg ${emailConfig.email_enabled ? 'bg-green-50 border-green-400' : 'bg-red-50 border-red-400'} border`}>
                            <p className={`font-medium ${emailConfig.email_enabled ? 'text-green-800' : 'text-red-800'}`}>
                                Status: {emailConfig.email_enabled ? '✅ Configured & Working' : '❌ Not Configured or Test Failed'}
                            </p>
                            {emailConfig.email_test_status !== 'success' && (
                                <p className="text-sm text-red-600 mt-1">Last test result: {emailConfig.email_test_status}</p>
                            )}
                            {emailConfig.email_monthly_limit > 0 && (
                                <p className="text-sm text-gray-600 mt-2">Emails Sent This Month: {emailConfig.email_current_month_count} / {emailConfig.email_monthly_limit}</p>
                            )}
                        </div>
                    )}

                    <div className="flex space-x-4 pt-4">
                        <button
                            type="submit"
                            disabled={loading}
                            className="px-6 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50"
                        >
                            {loading ? 'Saving...' : 'Save Email Configuration'}
                        </button>
                        <button
                            type="button"
                            onClick={handleEmailTest}
                            disabled={testing.email || !emailConfig.brevo_api_key || !emailConfig.brevo_sender_email}
                            className="px-6 py-2 bg-green-600 text-white rounded-md hover:bg-green-700 disabled:opacity-50"
                        >
                            {testing.email ? 'Testing...' : 'Test Email Credentials'}
                        </button>
                    </div>
                </form>
            </div>

            {/* ==================== INSTRUCTIONS ==================== */}
            <div className="mt-8 grid md:grid-cols-2 gap-6">
<div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
    <h3 className="font-semibold text-blue-900 mb-2">How to Get Afro Message Credentials:</h3>
    <ol className="list-decimal list-inside text-sm text-blue-800 space-y-1">
        <li>Sign up at <a href="https://afromessage.com" target="_blank" rel="noopener noreferrer" className="underline">afromessage.com</a></li>
        <li>Go to your dashboard → API section → generate/copy your API Key</li>
        <li>Under Sender Names, request approval for your school's sender name (max 11 chars)</li>
        <li>Top up credit before testing — a zero balance will cause sends to fail</li>
        <li>Paste the API Key and Sender Name above, then click "Test SMS Credentials"</li>
    </ol>
</div>

                <div className="bg-indigo-50 border border-indigo-200 rounded-lg p-4">
                    <h3 className="font-semibold text-indigo-900 mb-2">How to Get Brevo Credentials:</h3>
                    <ol className="list-decimal list-inside text-sm text-indigo-800 space-y-1">
                        <li>Sign up at <a href="https://www.brevo.com" target="_blank" rel="noopener noreferrer" className="underline">Brevo.com</a> (Free, no card)</li>
                        <li>Go to "SMTP & API" → "API Keys" → Create v3 Key</li>
                        <li>Go to "Senders & IP" → Add and verify your sender email</li>
                        <li>Disable "Restrict access to specific IP addresses" on your API key</li>
                        <li>Free tier: 300 emails/day forever</li>
                    </ol>
                </div>
            </div>
        </div>
    );
};

export default SchoolSettings;