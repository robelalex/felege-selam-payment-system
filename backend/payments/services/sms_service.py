# backend/payments/services/sms_service.py
import africastalking
from django.conf import settings
import logging

logger = logging.getLogger(__name__)

class SMSService:
    def __init__(self):
        self.username = getattr(settings, 'AFRICASTALKING_USERNAME', None)
        self.api_key = getattr(settings, 'AFRICASTALKING_API_KEY', None)
        
        print("="*50)
        print("📱 SMS SERVICE INITIALIZED")
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
        """Get SMS account balance"""
        print("✅ get_balance called")
        
        if not self.sms:
            return {'success': False, 'error': 'SMS not initialized'}
        
        try:
            app = africastalking.Application
            data = app.fetch_application_data()
            print(f"✅ Balance data: {data}")
            # Extract just the balance string
            if isinstance(data, dict) and 'UserData' in data:
                return {'success': True, 'balance': data['UserData'].get('balance', 'Available')}
            return {'success': True, 'balance': data}
        except Exception as e:
            print(f"⚠️ Could not fetch balance: {e}")
            return {'success': True, 'balance': 'Sandbox Mode'}
    
    def format_phone_number(self, phone_number):
        """
        Format Ethiopian phone number to Africa's Talking format
        Africa's Talking expects: +251XXXXXXXXX (with + sign)
        """
        # Remove any non-digit characters
        cleaned = ''.join(filter(str.isdigit, str(phone_number)))
        
        # Remove leading zeros
        cleaned = cleaned.lstrip('0')
        
        # If number is 9 digits (without country code), add 251
        if len(cleaned) == 9:
            formatted = '251' + cleaned
        elif len(cleaned) == 12 and cleaned.startswith('251'):
            formatted = cleaned
        else:
            formatted = '251' + cleaned
        
        # Add + sign for Africa's Talking
        formatted = '+' + formatted
        
        print(f"📱 Original: {phone_number} -> Formatted: {formatted}")
        return formatted
    
    def send_sms(self, phone_number, message, related_to=None):
        """
        Send SMS to Ethiopian phone numbers
        """
        print(f"📱 send_sms called with: {phone_number}")
        
        if not self.sms:
            print("❌ SMS not initialized")
            return {'success': False, 'error': 'SMS service not initialized'}
        
        if not phone_number:
            return {'success': False, 'error': 'No phone number provided'}
        
        try:
            # Format phone number with + sign
            formatted_number = self.format_phone_number(phone_number)
            
            # Optional: Add sender ID if configured
            sender = getattr(settings, 'SMS_SENDER_ID', None)
            
            print(f"📤 Sending to: {formatted_number}")
            print(f"📝 Message: {message[:100]}...")
            
            # Send the message
            if sender:
                response = self.sms.send(message, [formatted_number], sender_id=sender)
            else:
                response = self.sms.send(message, [formatted_number])
            
            print(f"📬 Raw response: {response}")
            
            # Parse response
            if isinstance(response, dict):
                sms_data = response.get('SMSMessageData', {})
                recipients = sms_data.get('Recipients', [])
                
                if recipients and len(recipients) > 0:
                    status = recipients[0].get('status', 'Unknown')
                    message_id = recipients[0].get('messageId', '')
                    cost = recipients[0].get('cost', '')
                    
                    print(f"✅ Status: {status}, Message ID: {message_id}, Cost: {cost}")
                    
                    if status == 'Success':
                        return {
                            'success': True,
                            'message': 'SMS sent successfully',
                            'message_id': message_id,
                            'cost': cost,
                            'response': response
                        }
                    else:
                        return {
                            'success': False,
                            'error': f"SMS failed with status: {status}",
                            'response': response
                        }
            
            return {'success': True, 'response': response}
            
        except Exception as e:
            print(f"❌ SMS send error: {e}")
            import traceback
            traceback.print_exc()
            return {'success': False, 'error': str(e)}