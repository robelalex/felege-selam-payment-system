# backend/payments/services/sms_new.py
import africastalking
from django.conf import settings
import logging

logger = logging.getLogger(__name__)

class SMSService:
    def __init__(self):
        self.username = getattr(settings, 'AFRICASTALKING_USERNAME', None)
        self.api_key = getattr(settings, 'AFRICASTALKING_API_KEY', None)
        
        print("="*50)
        print("CREATING NEW SMS SERVICE")
        print(f"Username: {self.username}")
        print(f"API Key exists: {'Yes' if self.api_key else 'No'}")
        print("="*50)
        
        if not self.username or not self.api_key:
            self.sms = None
            return
            
        try:
            africastalking.initialize(self.username, self.api_key)
            self.sms = africastalking.SMS
            print("✅ SMS initialized successfully")
        except Exception as e:
            print(f"❌ Error: {e}")
            self.sms = None
    
    def get_balance(self):
        print("✅ get_balance method was called!")
        if not self.sms:
            return {'success': False, 'error': 'SMS not initialized'}
        try:
            balance = self.sms.get_balance()
            return {'success': True, 'balance': balance}
        except Exception as e:
            return {'success': False, 'error': str(e)}