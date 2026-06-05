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
            # Try to get actual balance from Africa's Talking
            app = africastalking.Application
            data = app.fetch_application_data()
            print(f"✅ Balance data: {data}")
            return {'success': True, 'balance': data}
        except Exception as e:
            print(f"⚠️ Could not fetch balance: {e}")
            # Fallback for sandbox mode
            return {'success': True, 'balance': 'Sandbox Mode - Check Africa\'s Talking Dashboard'}
    
    def format_phone_number(self, phone_number):
        """
        Format Ethiopian phone number to international format
        Supports: 0912345678 -> 251912345678
                 0912345678 -> 251912345678
                 251912345678 -> 251912345678
        """
        # Remove any non-digit characters
        cleaned = ''.join(filter(str.isdigit, str(phone_number)))
        
        # Ethiopian numbers start with 0 (e.g., 0912345678)
        if cleaned.startswith('0'):
            # Remove leading 0 and add 251
            formatted = '251' + cleaned[1:]
        # Already has 251 at start
        elif cleaned.startswith('251'):
            formatted = cleaned
        # Has 251 without leading something
        elif cleaned.startswith('251') and len(cleaned) == 12:
            formatted = cleaned
        else:
            # Default: assume it's Ethiopian and add 251
            formatted = '251' + cleaned
        
        print(f"📱 Formatted: {phone_number} -> {formatted}")
        return formatted
    
    def send_sms(self, phone_number, message, related_to=None):
        """
        Send SMS to Ethiopian phone numbers
        
        Args:
            phone_number: Ethiopian phone number (e.g., 0912345678)
            message: SMS message content
            related_to: Optional reference string for logging
        
        Returns:
            dict: {'success': bool, 'message': str, 'response': dict}
        """
        print(f"📱 send_sms called with: {phone_number}")
        
        if not self.sms:
            print("❌ SMS not initialized")
            return {'success': False, 'error': 'SMS service not initialized'}
        
        if not phone_number:
            return {'success': False, 'error': 'No phone number provided'}
        
        try:
            # Format phone number for Ethiopia
            formatted_number = self.format_phone_number(phone_number)
            
            # Optional: Add sender ID if configured
            sender = getattr(settings, 'SMS_SENDER_ID', None)
            
            # Send the message
            if sender:
                response = self.sms.send(message, [formatted_number], sender_id=sender)
            else:
                response = self.sms.send(message, [formatted_number])
            
            print(f"✅ SMS sent successfully to {formatted_number}")
            print(f"✅ Response: {response}")
            
            # Parse response to check if successful
            if isinstance(response, dict):
                sms_data = response.get('SMSMessageData', {})
                recipients = sms_data.get('Recipients', [])
                
                if recipients and len(recipients) > 0:
                    status = recipients[0].get('status', 'Unknown')
                    if status == 'Success':
                        return {
                            'success': True,
                            'message': 'SMS sent successfully',
                            'response': response,
                            'message_id': recipients[0].get('messageId'),
                            'cost': recipients[0].get('cost')
                        }
                    else:
                        return {
                            'success': False,
                            'error': f"Failed with status: {status}",
                            'response': response
                        }
            
            return {'success': True, 'response': response}
            
        except Exception as e:
            print(f"❌ SMS send error: {e}")
            import traceback
            traceback.print_exc()
            return {'success': False, 'error': str(e)}