import React from 'react';

function PrivacyPolicy() {
  return (
    <div className="min-h-screen bg-gray-50 py-12 px-4">
      <div className="max-w-3xl mx-auto bg-white rounded-xl shadow-lg p-8">
        <h1 className="text-2xl font-bold mb-4">Privacy Policy</h1>
        <p className="text-gray-600 mb-4">Last updated: May 2026</p>
        
        <h2 className="text-xl font-semibold mt-6 mb-2">1. Information We Collect</h2>
        <p>We collect parent email addresses, student information, and payment records to facilitate school fee management.</p>
        
        <h2 className="text-xl font-semibold mt-6 mb-2">2. How We Use Your Information</h2>
        <p>We use your email to send OTP codes for login verification, password reset links, and payment confirmations.</p>
        
        <h2 className="text-xl font-semibold mt-6 mb-2">3. Data Security</h2>
        <p>We implement industry-standard security measures to protect your personal information.</p>
        
        <h2 className="text-xl font-semibold mt-6 mb-2">4. Contact Us</h2>
        <p>Email: robelalex90@gmail.com</p>
        
        <div className="mt-8 pt-4 border-t text-gray-500 text-sm">
          <p>Felege Selam Payment System</p>
        </div>
      </div>
    </div>
  );
}

export default PrivacyPolicy;