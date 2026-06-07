# payments/services/multi_school_sms_service.py
import africastalking
from django.conf import settings
from schools.models import School
from django.utils import timezone
from datetime import date
import logging

logger = logging.getLogger(__name__)

class MultiSchoolSMSService:
    """
    SMS service that loads credentials for each school individually
    Uses the school's own Africa's Talking account, not a shared one
    """
    
    def __init__(self, school_id):
        """
        Initialize with a specific school ID
        
        Args:
            school_id: The ID of the school (int or string)
        """
        self.school = School.objects.get(id=school_id)
        self.sms = None
        self._initialize_africas_talking()
    
    def _initialize_africas_talking(self):
        """Initialize Africa's Talking with this school's credentials"""
        if not self.school.at_username or not self.school.at_api_key:
            raise Exception(f"SMS not configured for school: {self.school.name}. Please add AT credentials in School Settings.")
        
        if not self.school.sms_enabled:
            # Still try to initialize, but warn that it's not tested/enabled
            logger.warning(f"SMS is not enabled for school {self.school.name}, but attempting to initialize")
        
        try:
            # Initialize with school's credentials
            africastalking.initialize(
                username=self.school.at_username,
                api_key=self.school.at_api_key
            )
            self.sms = africastalking.SMS
            logger.info(f"✅ Initialized SMS for school: {self.school.name}")
        except Exception as e:
            logger.error(f"❌ Failed to initialize SMS for school {self.school.name}: {e}")
            raise Exception(f"Failed to initialize Africa's Talking: {str(e)}")
    
    def _check_quota(self):
        """Check if school has SMS quota available"""
        if self.school.sms_monthly_limit == 0:
            return True  # Unlimited
        
        # Reset counter if new month
        today = date.today()
        if self.school.sms_last_reset:
            if self.school.sms_last_reset.month != today.month:
                self.school.sms_current_month_count = 0
                self.school.sms_last_reset = today
                self.school.save(update_fields=['sms_current_month_count', 'sms_last_reset'])
        else:
            # First time - set last reset
            self.school.sms_last_reset = today
            self.school.save(update_fields=['sms_last_reset'])
        
        if self.school.sms_current_month_count >= self.school.sms_monthly_limit:
            raise Exception(f"SMS quota exceeded for {self.school.name}. Limit: {self.school.sms_monthly_limit}")
        
        return True
    
    def _update_quota_count(self):
        """Increment SMS count for this school"""
        if self.school.sms_monthly_limit > 0:
            self.school.sms_current_month_count += 1
            self.school.save(update_fields=['sms_current_month_count'])
    
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
        
        return formatted
    
    def send_sms(self, phone_number, message, related_to=None):
        """
        Send SMS using this school's Africa's Talking account
        
        Args:
            phone_number: Parent's phone number
            message: SMS message content
            related_to: Optional reference string for logging
        
        Returns:
            dict: {'success': bool, 'message': str, 'message_id': str}
        """
        if not self.sms:
            raise Exception("SMS service not initialized")
        
        if not phone_number:
            raise Exception("No phone number provided")
        
        # Check quota before sending
        self._check_quota()
        
        try:
            # Format phone number with + sign
            formatted_number = self.format_phone_number(phone_number)
            
            logger.info(f"📤 Sending SMS for school {self.school.name} to: {formatted_number}")
            
            # Get sender ID from school settings (if available and not empty)
            sender_id = self.school.sms_sender_id if self.school.sms_sender_id and self.school.sms_sender_id.strip() else None
            
            # Send the message
            if sender_id:
                logger.info(f"📛 Using custom sender ID: {sender_id}")
                response = self.sms.send(message, [formatted_number], sender_id=sender_id)
            else:
                logger.info(f"📛 Using default sender (no custom ID)")
                response = self.sms.send(message, [formatted_number])
            
            # Parse response
            if isinstance(response, dict):
                sms_data = response.get('SMSMessageData', {})
                recipients = sms_data.get('Recipients', [])
                
                # Check for error message
                error_msg = sms_data.get('Message', '')
                if error_msg and 'InvalidSenderId' in error_msg:
                    # Disable SMS for this school due to invalid sender ID
                    self.school.sms_enabled = False
                    self.school.sms_test_status = "Failed: Invalid Sender ID"
                    self.school.save(update_fields=['sms_enabled', 'sms_test_status'])
                    
                    raise Exception('Invalid Sender ID. Please remove or change SMS Sender ID in School Settings.')
                
                if recipients and len(recipients) > 0:
                    status = recipients[0].get('status', 'Unknown')
                    message_id = recipients[0].get('messageId', '')
                    cost = recipients[0].get('cost', '')
                    
                    logger.info(f"✅ Status: {status}, Message ID: {message_id}, Cost: {cost}")
                    
                    if status == 'Success':
                        # Update quota count on success
                        self._update_quota_count()
                        
                        return {
                            'success': True,
                            'message': 'SMS sent successfully',
                            'message_id': message_id,
                            'cost': cost,
                            'school': self.school.name
                        }
                    else:
                        raise Exception(f"SMS failed with status: {status}")
            
            # If we get here, response format was unexpected but might still be success
            self._update_quota_count()
            return {'success': True, 'response': response, 'school': self.school.name}
            
        except Exception as e:
            logger.error(f"❌ SMS send error for school {self.school.name}: {e}")
            
            # If authentication error, disable SMS for this school
            error_str = str(e).lower()
            if 'authentication' in error_str or 'invalid' in error_str or 'auth' in error_str:
                self.school.sms_enabled = False
                self.school.sms_test_status = f"Failed: {str(e)[:100]}"
                self.school.save(update_fields=['sms_enabled', 'sms_test_status'])
                logger.warning(f"Disabled SMS for school {self.school.name} due to auth error")
            
            raise Exception(f"SMS failed for {self.school.name}: {str(e)}")
    
    def test_credentials(self):
        """
        Test if school's Africa's Talking credentials work
        Sends a test SMS to the school's own phone number
        """
        if not self.school.phone:
            raise Exception("School phone number is not set. Please add school phone number first.")
        
        try:
            # Re-initialize with fresh credentials
            self._initialize_africas_talking()
            
            # Create test message
            test_message = f"✅ Test SMS from {self.school.name}\n\nYour Africa's Talking credentials are working correctly!\n\nTime: {timezone.now().strftime('%Y-%m-%d %H:%M:%S')}"
            
            # Send test SMS to school's phone
            result = self.send_sms(self.school.phone, test_message, related_to="test_credentials")
            
            # Update school with success
            self.school.sms_enabled = True
            self.school.sms_last_test = timezone.now()
            self.school.sms_test_status = "success"
            self.school.save(update_fields=['sms_enabled', 'sms_last_test', 'sms_test_status'])
            
            logger.info(f"✅ Test SMS successful for school {self.school.name}")
            
            return {
                'success': True,
                'message': f'Test SMS sent successfully to {self.school.phone}',
                'school': self.school.name
            }
            
        except Exception as e:
            # Update school with failure
            self.school.sms_enabled = False
            self.school.sms_test_status = f"Failed: {str(e)[:100]}"
            self.school.save(update_fields=['sms_enabled', 'sms_test_status'])
            
            logger.error(f"❌ Test SMS failed for school {self.school.name}: {e}")
            
            raise Exception(f"Test failed: {str(e)}")
    
    def get_balance(self):
        """Get SMS account balance for this school"""
        if not self.sms:
            raise Exception("SMS service not initialized")
        
        try:
            app = africastalking.Application
            data = app.fetch_application_data()
            
            if isinstance(data, dict) and 'UserData' in data:
                balance = data['UserData'].get('balance', 'Available')
            else:
                balance = data
            
            return {
                'success': True,
                'balance': balance,
                'school': self.school.name
            }
        except Exception as e:
            logger.error(f"Could not fetch balance for {self.school.name}: {e}")
            return {
                'success': False,
                'error': str(e),
                'school': self.school.name
            }