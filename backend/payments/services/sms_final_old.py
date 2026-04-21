# backend/payments/services/sms_final.py
import africastalking
from django.conf import settings
import logging
import requests
import base64

logger = logging.getLogger(__name__)

class SMSService:
    def __init__(self):
        self.username = getattr(settings, 'AFRICASTALKING_USERNAME', None)
        self.api_key = getattr(settings, 'AFRICASTALKING_API_KEY', None)
        
        print("="*50)
        print("CREATING NEW SMS SERVICE (FINAL VERSION)")
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
        """Get balance via Africa's Talking Payments API"""
        print("✅ get_balance method was called!")
    
        if not self.username or not self.api_key:
            return {'success': False, 'error': 'Missing credentials'}
    
        try:
            url = "https://payments.africastalking.com/query/wallet/balance"
            params = {'username': self.username}
            headers = {
                'Accept': 'application/json',
                'apiKey': self.api_key
            }
    
            print(f"🔍 Calling Payments API for user: {self.username}")
            response = requests.get(url, headers=headers, params=params)
    
            print(f"   Response Status Code: {response.status_code}")
    
            if response.status_code == 200:
                data = response.json()
                print(f"✅ API Response: {data}")
                
                if data.get('status') == 'NotAvailable':
                    return {
                        'success': True, 
                        'balance': 'Available', 
                        'message': 'Balance info not available via API, but SMS sending works',
                        'data': data
                    }
                elif 'balance' in data:
                    return {'success': True, 'balance': data['balance']}
                else:
                    return {'success': True, 'balance': 'Available', 'data': data}
            else:
                print(f"❌ API Error: {response.status_code} - {response.text}")
                return {'success': False, 'error': f"API Error: {response.status_code}: {response.text}"}
    
        except Exception as e:
            print(f"❌ Balance fetch error: {e}")
            return {'success': False, 'error': str(e)}
    
    def send_sms(self, phone_number, message, related_to=None):
        """Send a single SMS message using Africa's Talking API"""
        print(f"🔍 send_sms called with phone: {phone_number}, message: {message}")
        
        if not self.sms:
            print("❌ SMS not initialized")
            return {'success': False, 'error': 'SMS not initialized'}
        
        # Format phone number for Africa's Talking (without + sign)
        if phone_number.startswith('0'):
            formatted_number = '251' + phone_number[1:]
        elif phone_number.startswith('+251'):
            formatted_number = phone_number[1:]
        else:
            formatted_number = phone_number
            
        print(f"📱 Formatted number: {formatted_number}")
        
        try:
            # Africa's Talking expects a list of phone numbers
            response = self.sms.send(message, [formatted_number])
            print(f"✅ Raw response: {response}")
            
            # Parse the response
            if isinstance(response, dict):
                sms_data = response.get('SMSMessageData', {})
                recipients = sms_data.get('Recipients', [])
                
                if recipients and recipients[0].get('status') == 'Success':
                    return {
                        'success': True,
                        'message_id': recipients[0].get('messageId'),
                        'cost': recipients[0].get('cost'),
                        'response': response
                    }
                else:
                    error_msg = recipients[0].get('status') if recipients else 'Unknown error'
                    return {'success': False, 'error': error_msg}
            
            return {'success': True, 'response': response}
            
        except Exception as e:
            print(f"❌ SMS send error: {e}")
            import traceback
            traceback.print_exc()
            return {'success': False, 'error': str(e)}