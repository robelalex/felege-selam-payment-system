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
            print("❌ Missing credentials")
            self.sms = None
            return
            
        try:
            africastalking.initialize(self.username, self.api_key)
            self.sms = africastalking.SMS
            print("✅ SMS initialized successfully")
            print(f"✅ SMS object type: {type(self.sms)}")
        except Exception as e:
            print(f"❌ Initialization Error: {e}")
            self.sms = None
    
    def get_balance(self):
        """Get balance via Africa's Talking account API"""
        print("✅ get_balance method was called!")
        
        if not self.sms:
            return {'success': False, 'error': 'SMS not initialized'}
        
        try:
            # Use the application data endpoint directly
            import requests
            import base64
            
            # Africa's Talking API endpoint for user data
            url = "https://api.africastalking.com/version1/user"
            
            # Create basic auth header
            auth_string = f"{self.username}:{self.api_key}"
            auth_bytes = auth_string.encode('ascii')
            base64_auth = base64.b64encode(auth_bytes).decode('ascii')
            
            headers = {
                'Accept': 'application/json',
                'Authorization': f'Basic {base64_auth}'
            }
            
            response = requests.get(url, headers=headers)
            
            if response.status_code == 200:
                data = response.json()
                print(f"✅ API Response: {data}")
                
                # Extract balance from response
                if 'UserData' in data and 'balance' in data['UserData']:
                    balance = data['UserData']['balance']
                    return {'success': True, 'balance': balance}
                else:
                    return {'success': True, 'balance': str(data)}
            else:
                print(f"❌ API Error: {response.status_code} - {response.text}")
                return {'success': False, 'error': f"API Error: {response.status_code}"}
                
        except Exception as e:
            print(f"❌ Balance fetch error: {e}")
            return {'success': False, 'error': str(e)}
    
    def send_sms(self, phone_number, message, related_to=None):
        """Send a single SMS message"""
        if not self.sms:
            return {'success': False, 'error': 'SMS not initialized'}
        
        if phone_number.startswith('0'):
            formatted_number = '251' + phone_number[1:]
        else:
            formatted_number = phone_number
            
        print(f"📱 Sending SMS to {formatted_number}")
        
        try:
            response = self.sms.send(message, [formatted_number])
            print(f"✅ SMS sent: {response}")
            return {'success': True, 'response': response}
        except Exception as e:
            print(f"❌ SMS send error: {e}")
            return {'success': False, 'error': str(e)}