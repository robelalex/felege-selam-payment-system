# backend/common/sms_service.py
import logging
import africastalking
from django.conf import settings

logger = logging.getLogger(__name__)

def send_sms(phone: str, message: str) -> bool:
    """
    Send SMS via Africa's Talking.
    Returns True on success, False on failure.
    """
    try:
        username = getattr(settings, 'AFRICASTALKING_USERNAME', 'sandbox')
        api_key  = getattr(settings, 'AFRICASTALKING_API_KEY', '')

        if not api_key:
            logger.warning("⚠️ AFRICASTALKING_API_KEY not set — SMS not sent")
            return False

        africastalking.initialize(username, api_key)
        sms = africastalking.SMS

        # Normalize Ethiopian phone number to +251 format
        phone = phone.strip().replace(' ', '')
        if phone.startswith('0'):
            phone = '+251' + phone[1:]
        elif phone.startswith('251'):
            phone = '+' + phone
        elif not phone.startswith('+'):
            phone = '+251' + phone

        sender = getattr(settings, 'SMS_SENDER_ID', None)
        response = sms.send(message, [phone], sender_id=sender)
        logger.info(f"✅ SMS sent to {phone}: {response}")
        return True

    except Exception as e:
        logger.error(f"❌ SMS send failed to {phone}: {e}")
        return False