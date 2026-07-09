"""
High-priority OTP email sender for anti-spoofing payment links.
Parallel to sms_otp_service.py — used when the link was delivered via email.
"""
import logging
from common.email_service import SchoolEmailService

logger = logging.getLogger(__name__)


def send_payment_otp_email(school_id: int, recipient_email: str, code: str) -> dict:
    """
    Send a 6-digit OTP code via email for payment link verification.

    Args:
        school_id: The school's ID (to load their Brevo credentials)
        recipient_email: Parent's email address
        code: The 6-digit verification code to send

    Returns:
        dict: {'success': bool, 'message': str}
    """
    if not recipient_email:
        return {'success': False, 'message': 'No parent email on file'}

    try:
        email_service = SchoolEmailService(school_id)
    except Exception as e:
        logger.error(f"❌ OTP email send failed: {e}")
        return {'success': False, 'message': str(e)}

    school_name = email_service.school.name

    html_content = f"""
    <!DOCTYPE html>
    <html>
    <body style="font-family: Arial, sans-serif; text-align: center; padding: 20px;">
        <h2>{school_name}: Payment Verification</h2>
        <p>Your security code is:</p>
        <h1 style="font-size: 36px; letter-spacing: 5px; color: #10B981;">{code}</h1>
        <p>Do NOT share this code with anyone. Expires in 2 hours.</p>
    </body>
    </html>
    """
    text_content = f"{school_name}: Payment Verification\n\nYour security code is: {code}\n\nDo NOT share this code with anyone. Expires in 2 hours."

    try:
        result = email_service.send_email(
            recipient_email=recipient_email,
            subject=f"Payment Verification Code - {school_name}",
            html_content=html_content,
            text_content=text_content,
        )
        logger.info(f"✅ Payment OTP emailed to {recipient_email} for school {school_name}")
        return {'success': True, 'message': 'OTP sent successfully'}
    except Exception as e:
        logger.error(f"❌ OTP email send failed for {school_name}: {e}")
        return {'success': False, 'message': str(e)}