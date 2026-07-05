# backend/payments/services/sms_otp_service.py
"""
High-priority OTP SMS sender for anti-spoofing payment links.
Uses Afro Message REST API independently from reminder quotas.
This service is ONLY for security-critical OTP codes — never for marketing or reminders.
"""
import logging
import requests
from schools.models import School

logger = logging.getLogger(__name__)

AFRO_MESSAGE_SEND_URL = "https://api.afromessage.com/api/send"


def send_payment_otp(school_id: int, phone_number: str, code: str) -> dict:
    """
    Send a 6-digit OTP code via Afro Message for payment link verification.

    Args:
        school_id: The school's ID (to load their Afro Message credentials)
        phone_number: Parent's phone number (already formatted as 251XXXXXXXXX)
        code: The 6-digit verification code to send

    Returns:
        dict: {'success': bool, 'message': str}
    """
    try:
        school = School.objects.get(id=school_id)
    except School.DoesNotExist:
        logger.error(f"❌ OTP send failed: School {school_id} not found")
        return {'success': False, 'message': 'School not found'}

    if not school.at_api_key:
        logger.error(f"❌ OTP send failed: No Afro Message API key for {school.name}")
        return {'success': False, 'message': 'SMS not configured for this school'}

    # Format phone number safely
    cleaned = ''.join(filter(str.isdigit, str(phone_number)))
    cleaned = cleaned.lstrip('0')

    if len(cleaned) == 9:
        formatted_number = '251' + cleaned
    elif len(cleaned) == 10 and cleaned.startswith('9'):
        formatted_number = '251' + cleaned
    elif len(cleaned) == 12 and cleaned.startswith('251'):
        formatted_number = cleaned
    else:
        logger.error(f"❌ OTP send failed: Invalid phone format: {phone_number}")
        return {'success': False, 'message': 'Invalid phone number format'}

    # Build OTP-specific message (no amount, no student name — per anti-spoofing design)
    message = (
        f"{school.name}: A payment request is ready for review.\n"
        f"Code: {code}\n\n"
        f"Never share this code by phone or reply to this SMS. Valid 2 hours."
    )

    headers = {
        "Authorization": f"Bearer {school.at_api_key}"
    }

    params = {
        "to": formatted_number,
        "message": message,
        "sender": school.sms_sender_id or "INFO"
    }

    try:
        response = requests.get(
            AFRO_MESSAGE_SEND_URL,
            headers=headers,
            params=params,
            timeout=10
        )

        data = response.json()

        if response.status_code == 200 and data.get("acknowledge") == "success":
            logger.info(f"✅ Payment OTP sent to {formatted_number} for school {school.name}")
            return {'success': True, 'message': 'OTP sent successfully'}
        else:
            error_detail = data.get("response", "Unknown API Error")
            logger.error(f"❌ OTP send failed for {school.name}: {error_detail}")
            return {'success': False, 'message': f'Afro Message error: {error_detail}'}

    except requests.exceptions.Timeout:
        logger.error(f"❌ OTP send timeout for {school.name}")
        return {'success': False, 'message': 'Connection timeout'}
    except Exception as e:
        logger.error(f"❌ OTP send error for {school.name}: {e}")
        return {'success': False, 'message': str(e)}