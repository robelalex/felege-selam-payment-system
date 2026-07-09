# backend/payments/services/sms_otp_service.py
"""
High-priority OTP SMS sender for anti-spoofing payment links.
Uses Afro Message REST API independently from reminder quotas.
This service is ONLY for security-critical OTP codes — never for marketing or reminders.

✅ FIXED: Afro Message's beta account applies a content filter that masks
any message resembling a bank/financial transaction alert (confirmed
directly by their support team) — replacing the real code with `<<...>>`.
Trigger phrases included "Payment verification required" and "security
code". The message below uses the plain "one time password" phrasing
Afro Message support confirmed passes through correctly.
"""
import logging
import requests
from schools.models import School

logger = logging.getLogger(__name__)

AFRO_MESSAGE_SEND_URL = "https://api.afromessage.com/api/send"

# ✅ Must match OTP_CODE_TTL_SECONDS in anti_spoofing_views.py (10 minutes).
# The old message said "Expires in 2 hours" while the actual cache TTL was
# 10 minutes — a parent who waited past 10 min would get "invalid code"
# with no idea why. Keep this string in sync with the real TTL.
OTP_EXPIRY_TEXT = "10 minutes"


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

    # ✅ REWORDED: plain "one time password" phrasing, no "Payment",
    # "verification required", or "security code" — those trigger Afro
    # Message's bank-transaction content filter (confirmed by their support).
    message = (
        f"{school.name} - Your one time password is {code}. "
        f"Do not share this with anyone. Valid for {OTP_EXPIRY_TEXT}."
    )

    headers = {
        "Authorization": f"Bearer {school.at_api_key}"
    }

    # ✅ SIMPLIFIED: earlier testing confirmed this account only accepts
    # `sender_name` (not `sender`) — sending `sender` first was wasting an
    # extra API call (and possibly an extra SMS credit) on every OTP send.
    if school.sms_sender_id:
        params = {"to": formatted_number, "message": message, "sender_name": school.sms_sender_id}
    else:
        params = {"to": formatted_number, "message": message}

    try:
        response = requests.get(
            AFRO_MESSAGE_SEND_URL,
            headers=headers,
            params=params,
            timeout=10
        )
        data = response.json()
    except requests.exceptions.Timeout:
        logger.error(f"❌ OTP send timeout for {school.name}")
        return {'success': False, 'message': 'Connection timeout'}
    except ValueError:
        logger.error(f"❌ OTP send: non-JSON response for {school.name}: {response.text[:200]}")
        return {'success': False, 'message': f'Unexpected response from Afro Message: {response.text[:200]}'}
    except Exception as e:
        logger.error(f"❌ OTP send error for {school.name}: {e}")
        return {'success': False, 'message': str(e)}

    if response.status_code == 200 and data.get("acknowledge") == "success":
        logger.info(f"✅ Payment OTP sent to {formatted_number} for school {school.name}")
        return {'success': True, 'message': 'OTP sent successfully'}

    error_detail = data.get("response") or data.get("errors") or "Unknown API Error"
    last_error = f"Afro Message error: {error_detail}"
    logger.error(f"❌ OTP send failed for {school.name}: {last_error} | raw response: {data}")
    return {'success': False, 'message': last_error}