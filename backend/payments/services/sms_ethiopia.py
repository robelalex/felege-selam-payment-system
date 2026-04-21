# backend/payments/services/sms_ethiopia.py
import africastalking
from django.conf import settings
import logging

logger = logging.getLogger(__name__)

class EthiopiaSMSService:
    def __init__(self):
        self.username = getattr(settings, 'AFRICASTALKING_USERNAME', None)
        self.api_key = getattr(settings, 'AFRICASTALKING_API_KEY', None)
        
        print("="*50)
        print("ETHIOPIA SMS SERVICE")
        print(f"Username: {self.username}")
        print(f"API Key exists: {'Yes' if self.api_key else 'No'}")
        print("="*50)
        
        if not self.username or not self.api_key:
            print("❌ Missing credentials")
            self.sms = None
            self.application = None
            return
            
        try:
            africastalking.initialize(self.username, self.api_key)
            self.sms = africastalking.SMS
            self.application = africastalking.Application
            print("✅ SMS initialized successfully")
        except Exception as e:
            print(f"❌ Initialization Error: {e}")
            import traceback
            traceback.print_exc()
            self.sms = None
            self.application = None
    
    def get_balance(self):
        """Get wallet balance using fetch_application_data()"""
        print("✅ get_balance called")
        
        if not self.application:
            return {'success': False, 'error': 'Application not initialized'}
            
        try:
            # This is the CORRECT method from your SDK output
            data = self.application.fetch_application_data()
            print(f"✅ Balance data: {data}")
            return {'success': True, 'balance': data}
        except Exception as e:
            print(f"❌ Balance error: {e}")
            import traceback
            traceback.print_exc()
            return {'success': False, 'error': str(e)}
    
    def send_sms(self, phone_number, message):
        """Send SMS using Ethiopia format (251)"""
        print(f"📱 send_sms called with: {phone_number}")
        
        if not self.sms:
            return {'success': False, 'error': 'SMS not initialized'}
        
        try:
            # Format Ethiopian number correctly
            # Remove any non-digits
            cleaned = ''.join(filter(str.isdigit, phone_number))
            
            if cleaned.startswith('0'):
                formatted = '251' + cleaned[1:]
            elif cleaned.startswith('251'):
                formatted = cleaned
            elif cleaned.startswith('251'):
                formatted = cleaned
            else:
                formatted = '251' + cleaned
                
            print(f"📱 Sending to Ethiopia: {formatted}")
            
            # Use the CORRECT send method from your SDK
            response = self.sms.send(message, [formatted])
            print(f"✅ Response: {response}")
            
            return {'success': True, 'response': response}
            
        except Exception as e:
            print(f"❌ Error: {e}")
            import traceback
            traceback.print_exc()
            return {'success': False, 'error': str(e)}