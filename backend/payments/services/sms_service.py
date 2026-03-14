# backend/payments/services/sms_service.py
import africastalking
from django.conf import settings
import logging
from ..models import SMSHistory

logger = logging.getLogger(__name__)

class SMSService:
    """Production SMS service using Africa's Talking"""
    
    def __init__(self):
        # Initialize Africa's Talking
        self.username = getattr(settings, 'AFRICASTALKING_USERNAME', 'sandbox')
        self.api_key = getattr(settings, 'AFRICASTALKING_API_KEY', '')
        self.is_sandbox = getattr(settings, 'SMS_SANDBOX', True)
        
        try:
            africastalking.initialize(self.username, self.api_key)
            self.sms = africastalking.SMS
            logger.info(f"✅ SMS Service initialized in {'SANDBOX' if self.is_sandbox else 'PRODUCTION'} mode")
        except Exception as e:
            logger.error(f"❌ Failed to initialize SMS service: {e}")
            self.sms = None
    
    def format_phone(self, phone_number):
        """
        Format Ethiopian phone number to international format
        Example: 0912345678 → 254912345678
        """
        # Remove any spaces or special characters
        phone = str(phone_number).strip().replace(' ', '').replace('-', '')
        
        # If it starts with 0, replace with 254 (Kenya format - Africa's Talking uses this)
        # For Ethiopia, you may need to use 251
        if phone.startswith('0'):
            return '254' + phone[1:]  # 0912... → 254912...
        elif phone.startswith('+251'):
            return '254' + phone[4:]  # +251912... → 254912...
        elif phone.startswith('251'):
            return '254' + phone[3:]  # 251912... → 254912...
        else:
            return phone
    
    def send_sms(self, phone_number, message, related_to=None):
        """
        Send a single SMS message
        Args:
            phone_number: Ethiopian phone number (e.g., 0912345678)
            message: Text message to send
            related_to: Optional reference (e.g., 'payment_123')
        Returns:
            dict with success status and details
        """
        if not self.sms:
            return {'success': False, 'error': 'SMS service not initialized'}
        
        # Format phone number
        formatted_number = self.format_phone(phone_number)
        
        try:
            response = self.sms.send(message, [formatted_number])
            logger.info(f"📱 SMS sent to {formatted_number}: {response}")
            
            # Save to history
            sms_record = SMSHistory.objects.create(
                recipient=phone_number,
                message=message,
                status='sent',
                message_id=response.get('SMSMessageData', {}).get('Message', [{}])[0].get('messageId'),
                related_to=related_to
            )
            
            return {
                'success': True,
                'message_id': response.get('SMSMessageData', {}).get('Message', [{}])[0].get('messageId'),
                'recipient': phone_number,
                'formatted_recipient': formatted_number,
                'status': 'sent',
                'record_id': sms_record.id
            }
        except Exception as e:
            logger.error(f"❌ SMS failed: {e}")
            
            # Save failed attempt
            SMSHistory.objects.create(
                recipient=phone_number,
                message=message,
                status='failed',
                related_to=related_to
            )
            
            return {'success': False, 'error': str(e)}
    
    def send_bulk_sms(self, recipients):
        """
        Send bulk SMS to multiple recipients
        Args:
            recipients: List of dicts with 'phone', 'message', and optional 'related_to'
        Returns:
            List of results
        """
        results = []
        for recipient in recipients:
            result = self.send_sms(
                recipient['phone'], 
                recipient['message'],
                recipient.get('related_to')
            )
            results.append({
                'phone': recipient['phone'],
                'message': recipient['message'],
                'success': result['success'],
                'message_id': result.get('message_id'),
                'error': result.get('error')
            })
        return results
    
    def get_balance(self):
        """Check SMS account balance"""
        if not self.sms:
            return {'success': False, 'error': 'SMS service not initialized'}
        
        try:
            balance = self.sms.get_balance()
            return {'success': True, 'balance': balance}
        except Exception as e:
            logger.error(f"❌ Failed to get balance: {e}")
            return {'success': False, 'error': str(e)}