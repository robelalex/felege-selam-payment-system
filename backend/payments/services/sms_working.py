# backend/payments/services/sms_working.py
import africastalking
from django.conf import settings
import logging

logger = logging.getLogger(__name__)

class SMSService:
    def __init__(self):
        self.username = getattr(settings, 'AFRICASTALKING_USERNAME', None)
        self.api_key = getattr(settings, 'AFRICASTALKING_API_KEY', None)
        
        print("="*50)
        print(f"Username: {self.username}")
        print(f"API Key exists: {'Yes' if self.api_key else 'No'}")
        print("="*50)
        
        if not self.username or not self.api_key:
            print("❌ Missing credentials")
            self.sms = None
            return
            
        try:
            africastalking.initialize(self.username, self.api_key)
            self.sms = africastalking.SMS
            print("✅ SMS initialized successfully")
        except Exception as e:
            print(f"❌ Initialization Error: {e}")
            self.sms = None
    
    def get_balance(self):
        """Simple balance check for sandbox"""
        print("✅ get_balance called")
        return {'success': True, 'balance': 'Sandbox Mode'}
    
    def send_sms(self, phone_number, message, related_to=None):
        """Send SMS - using Kenyan format for sandbox"""
        print(f"📱 send_sms called with: {phone_number}")
        
        if not self.sms:
            print("❌ SMS not initialized")
            return {'success': False, 'error': 'SMS not initialized'}
        
        try:
            # For sandbox, use Kenyan format (254)
            # Remove any non-digits and format
            cleaned = ''.join(filter(str.isdigit, phone_number))
            
            if cleaned.startswith('0'):
                # Convert 07... to 2547...
                formatted = '254' + cleaned[1:]
            elif cleaned.startswith('254'):
                formatted = cleaned
            else:
                formatted = '254' + cleaned
                
            print(f"📱 Sending to: {formatted}")
            
            response = self.sms.send(message, [formatted])
            print(f"✅ Response: {response}")
            
            return {'success': True, 'response': response}
            
        except Exception as e:
            print(f"❌ Error: {e}")
            import traceback
            traceback.print_exc()
            return {'success': False, 'error': str(e)}