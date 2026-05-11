// src/pages/ReminderDashboard.js
import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { Bell, Send, MessageSquare, History, Users, Clock, Loader, RefreshCw } from 'lucide-react';
import api from '../services/api';

function ReminderDashboard() {
  const [stats, setStats] = useState({
    pending_reminders: 0,
    sent_today: 0,
    failed: 0
  });
  const [loading, setLoading] = useState(true);
  const [pendingStudents, setPendingStudents] = useState([]);

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    setLoading(true);
    try {
      const schoolId = JSON.parse(localStorage.getItem('selectedSchool') || '{}').id;
      
      // Fetch pending students for reminders
      const pendingRes = await api.get('/reminders/pending/', {
        headers: { 'X-School-ID': schoolId }
      });
      
      setPendingStudents(pendingRes.data?.slice(0, 5) || []);
      setStats({
        pending_reminders: pendingRes.data?.length || 0,
        sent_today: 0,
        failed: 0
      });
      
    } catch (err) {
      console.error('Error fetching data:', err);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <RefreshCw className="h-8 w-8 animate-spin text-primary-600" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl md:text-3xl font-bold text-gray-900">Reminder Manager</h1>
        <p className="text-gray-600 mt-1">Send SMS and email reminders to parents</p>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-white rounded-xl shadow-lg p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-500">Pending Reminders</p>
              <p className="text-3xl font-bold text-yellow-600">{stats.pending_reminders}</p>
            </div>
            <div className="p-3 bg-yellow-100 rounded-full">
              <Bell className="h-6 w-6 text-yellow-600" />
            </div>
          </div>
        </div>

        <div className="bg-white rounded-xl shadow-lg p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-500">Sent Today</p>
              <p className="text-3xl font-bold text-green-600">{stats.sent_today}</p>
            </div>
            <div className="p-3 bg-green-100 rounded-full">
              <Send className="h-6 w-6 text-green-600" />
            </div>
          </div>
        </div>

        <div className="bg-white rounded-xl shadow-lg p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-500">Failed</p>
              <p className="text-3xl font-bold text-red-600">{stats.failed}</p>
            </div>
            <div className="p-3 bg-red-100 rounded-full">
              <MessageSquare className="h-6 w-6 text-red-600" />
            </div>
          </div>
        </div>
      </div>

      {/* Quick Actions */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Link to="/admin/sms" className="bg-gradient-to-r from-blue-500 to-blue-600 rounded-xl shadow-lg p-6 text-white hover:shadow-xl transition-all">
          <Send className="h-8 w-8 mb-3" />
          <h3 className="text-lg font-semibold">Send SMS Reminders</h3>
          <p className="text-blue-100 text-sm mt-1">Send payment reminders to parents</p>
        </Link>

        <Link to="/admin/reminders" className="bg-gradient-to-r from-purple-500 to-purple-600 rounded-xl shadow-lg p-6 text-white hover:shadow-xl transition-all">
          <History className="h-8 w-8 mb-3" />
          <h3 className="text-lg font-semibold">Reminder History</h3>
          <p className="text-purple-100 text-sm mt-1">View all sent reminders</p>
        </Link>
      </div>

      {/* Pending Students */}
      {pendingStudents.length > 0 && (
        <div className="bg-white rounded-xl shadow-lg overflow-hidden">
          <div className="px-6 py-4 border-b border-gray-200">
            <h2 className="text-lg font-semibold text-gray-900">Students with Pending Payments</h2>
          </div>
          <div className="divide-y divide-gray-200">
            {pendingStudents.map((student) => (
              <div key={student.id} className="px-6 py-4 flex justify-between items-center">
                <div>
                  <p className="font-medium text-gray-900">{student.full_name}</p>
                  <p className="text-sm text-gray-500">Grade {student.grade} - {student.parent_phone}</p>
                </div>
                <Link to="/admin/sms" className="text-blue-600 hover:text-blue-800 text-sm font-medium">
                  Send Reminder →
                </Link>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

export default ReminderDashboard;