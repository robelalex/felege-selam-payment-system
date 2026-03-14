// src/pages/SMSDashboard.js
import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  Send, 
  Phone, 
  MessageSquare, 
  History,
  DollarSign,
  CheckCircle,
  AlertCircle,
  Loader,
  RefreshCw,
  Users,
  Calendar
} from 'lucide-react';
import api from '../services/api';

function SMSDashboard() {
  const [balance, setBalance] = useState(null);
  const [history, setHistory] = useState([]);
  const [loading, setLoading] = useState(true);
  const [testPhone, setTestPhone] = useState('');
  const [testMessage, setTestMessage] = useState('');
  const [sending, setSending] = useState(false);
  const [result, setResult] = useState(null);

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    setLoading(true);
    try {
      const [balanceRes, historyRes] = await Promise.all([
        api.get('/sms/balance/'),
        api.get('/sms/history/?limit=50')
      ]);
      setBalance(balanceRes.data);
      setHistory(historyRes.data);
    } catch (err) {
      console.error('Error fetching SMS data:', err);
    } finally {
      setLoading(false);
    }
  };

  const sendTestSMS = async () => {
    if (!testPhone) {
      alert('Please enter a phone number');
      return;
    }

    // Validate Ethiopian phone number
    const phoneRegex = /^09[0-9]{8}$/;
    if (!phoneRegex.test(testPhone)) {
      alert('Please enter a valid Ethiopian phone number (e.g., 0912345678)');
      return;
    }

    setSending(true);
    setResult(null);

    try {
      const response = await api.post('/sms/send-test/', {
        phone: testPhone,
        message: testMessage || 'Test message from Felege Selam School'
      });

      setResult({
        success: response.data.success,
        message: response.data.success ? 'SMS sent successfully! Check your phone.' : 'Failed to send SMS'
      });

      if (response.data.success) {
        setTestPhone('');
        setTestMessage('');
        fetchData(); // Refresh history
      }
    } catch (err) {
      console.error('Error sending SMS:', err);
      setResult({
        success: false,
        message: 'Error sending SMS. Check your configuration.'
      });
    } finally {
      setSending(false);
    }
  };

  const getStatusColor = (status) => {
    switch(status) {
      case 'sent': return 'bg-green-100 text-green-700';
      case 'delivered': return 'bg-blue-100 text-blue-700';
      case 'failed': return 'bg-red-100 text-red-700';
      default: return 'bg-gray-100 text-gray-700';
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader className="h-8 w-8 animate-spin text-primary-600" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h1 className="text-2xl md:text-3xl font-bold text-gray-900">SMS Dashboard</h1>
        <button
          onClick={fetchData}
          className="p-2 bg-white rounded-lg shadow-sm hover:shadow transition-all"
        >
          <RefreshCw className="h-5 w-5 text-gray-600" />
        </button>
      </div>

      {/* Balance Card */}
      <div className="bg-gradient-to-r from-primary-600 to-primary-800 rounded-xl shadow-lg p-6 text-white">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-primary-100">SMS Account Balance</p>
            <p className="text-3xl font-bold mt-2">
              {balance?.success ? balance.balance : 'N/A'}
            </p>
            <p className="text-primary-200 text-sm mt-2">
              {balance?.success ? 'Sandbox mode - testing only' : 'Connect Africa\'s Talking to get balance'}
            </p>
          </div>
          <DollarSign className="h-12 w-12 text-white/30" />
        </div>
      </div>

      {/* Send Test SMS */}
      <div className="bg-white rounded-xl shadow-lg p-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">Send Test SMS</h2>
        
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Ethiopian Phone Number
            </label>
            <input
              type="text"
              value={testPhone}
              onChange={(e) => setTestPhone(e.target.value)}
              placeholder="0912345678"
              className="input-field"
            />
            <p className="text-xs text-gray-500 mt-1">Format: 09XXXXXXXX (10 digits)</p>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Message (Optional)
            </label>
            <textarea
              value={testMessage}
              onChange={(e) => setTestMessage(e.target.value)}
              rows="3"
              className="input-field"
              placeholder="Enter your test message..."
            />
          </div>

          <button
            onClick={sendTestSMS}
            disabled={sending}
            className="btn-primary flex items-center gap-2"
          >
            {sending ? (
              <>
                <Loader className="h-4 w-4 animate-spin" />
                Sending...
              </>
            ) : (
              <>
                <Send className="h-4 w-4" />
                Send Test SMS
              </>
            )}
          </button>

          <AnimatePresence>
            {result && (
              <motion.div
                initial={{ opacity: 0, y: -10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                className={`p-4 rounded-lg ${
                  result.success ? 'bg-green-50' : 'bg-red-50'
                }`}
              >
                <div className="flex items-center gap-2">
                  {result.success ? (
                    <CheckCircle className="h-5 w-5 text-green-600" />
                  ) : (
                    <AlertCircle className="h-5 w-5 text-red-600" />
                  )}
                  <p className={result.success ? 'text-green-700' : 'text-red-700'}>
                    {result.message}
                  </p>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>

      {/* SMS History */}
      <div className="bg-white rounded-xl shadow-lg overflow-hidden">
        <div className="p-4 bg-gray-50 border-b border-gray-200 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-gray-900">SMS History</h2>
          <span className="text-sm text-gray-500">Last 50 messages</span>
        </div>
        
        <div className="divide-y divide-gray-200 max-h-96 overflow-y-auto">
          {history.length === 0 ? (
            <p className="p-4 text-gray-500 text-center">No SMS history yet</p>
          ) : (
            history.map((item) => (
              <div key={item.id} className="p-4 hover:bg-gray-50">
                <div className="flex items-start justify-between">
                  <div className="flex items-start gap-3 flex-1">
                    <Phone className="h-5 w-5 text-gray-400 mt-1" />
                    <div className="flex-1">
                      <p className="font-medium">{item.recipient}</p>
                      <p className="text-sm text-gray-600 mt-1">{item.message}</p>
                      <div className="flex items-center gap-3 mt-2">
                        <span className={`px-2 py-1 rounded-full text-xs ${getStatusColor(item.status)}`}>
                          {item.status}
                        </span>
                        {item.related_to && (
                          <span className="text-xs text-gray-400">
                            Ref: {item.related_to}
                          </span>
                        )}
                        <span className="text-xs text-gray-400">
                          {new Date(item.created_at).toLocaleString()}
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      {/* Quick Actions */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <button className="bg-white rounded-xl shadow-lg p-4 hover:shadow-xl transition-all text-left">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-blue-100 rounded-lg">
              <Users className="h-5 w-5 text-blue-600" />
            </div>
            <div>
              <h3 className="font-semibold">Send to All Defaulters</h3>
              <p className="text-sm text-gray-600">Bulk SMS to parents with pending fees</p>
            </div>
          </div>
        </button>

        <button className="bg-white rounded-xl shadow-lg p-4 hover:shadow-xl transition-all text-left">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-green-100 rounded-lg">
              <Calendar className="h-5 w-5 text-green-600" />
            </div>
            <div>
              <h3 className="font-semibold">Monthly Reminders</h3>
              <p className="text-sm text-gray-600">Schedule reminders for next month</p>
            </div>
          </div>
        </button>
      </div>
    </div>
  );
}

export default SMSDashboard;