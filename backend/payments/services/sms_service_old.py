# backend/payments/services/sms_service.py
import africastalking
from django.conf import settings
import logging
from ..models import SMSHistory

logger = logging.getLogger(__name__)

class SMSService:
    """Production SMS service using Africa's Talking"""
    
    def __init__(self):
        self.username = getattr(settings, 'AFRICASTALKING_USERNAME', None)
        self.api_key = getattr(settings, 'AFRICASTALKING_API_KEY', None)
        self.is_sandbox = getattr(settings, 'SMS_SANDBOX', True)
        
        print(f"🔧 Initializing SMS with username: {self.username}")
        
        if not self.username or not self.api_key:
            print("❌ No credentials found")
            self.sms = None
            return
            
        try:
            africastalking.initialize(self.username, self.api_key)
            self.sms = africastalking.SMS
            print("✅ SMS initialized successfully")
        except Exception as e:
            print(f"❌ Failed: {e}")
            self.sms = None
    
    def format_phone(self, phone_number):
        phone = str(phone_number).strip().replace(' ', '').replace('-', '')
        if phone.startswith('0'):
            return '251' + phone[1:]
        return phone
    
    def get_balance(self):
        print("🔍 get_balance called")
        if not self.sms:
            print("❌ SMS not initialized")
            return {'success': False, 'error': 'SMS not initialized'}
        
        try:
            balance = self.sms.get_balance()
            print(f"✅ Balance: {balance}")
            return {'success': True, 'balance': balance}
        except Exception as e:
            print(f"❌ Error: {e}")
            return {'success': False, 'error': str(e)}
    
    def send_sms(self, phone_number, message, related_to=None):
        if not self.sms:
            return {'success': False, 'error': 'SMS not initialized'}
        
        formatted_number = self.format_phone(phone_number)
        try:
            response = self.sms.send(message, [formatted_number])
            return {'success': True, 'response': response}
        except Exception as e:
            return {'success': False, 'error': str(e)}