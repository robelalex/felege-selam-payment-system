# backend/common/email_service.py
from django.core.mail import send_mail
from django.conf import settings
import logging

logger = logging.getLogger(__name__)

def send_otp_email(recipient_email, otp_code, user_type='admin'):
    """
    Send OTP verification email using Gmail SMTP
    """
    if user_type == 'admin':
        subject = "Admin Login Verification Code"
        html_message = f"""
        <!DOCTYPE html>
        <html>
        <body style="font-family: Arial, sans-serif; text-align: center; padding: 20px;">
            <h2>Admin Login Verification</h2>
            <p>Your verification code is:</p>
            <h1 style="font-size: 36px; letter-spacing: 5px; color: #4F46E5;">{otp_code}</h1>
            <p>This code expires in 10 minutes.</p>
        </body>
        </html>
        """
        plain_message = f"Your verification code is: {otp_code}\n\nThis code expires in 10 minutes."
    else:
        subject = "Parent Portal Access Code"
        html_message = f"""
        <!DOCTYPE html>
        <html>
        <body style="font-family: Arial, sans-serif; text-align: center; padding: 20px;">
            <h2>Parent Portal Access</h2>
            <p>Your verification code is:</p>
            <h1 style="font-size: 36px; letter-spacing: 5px; color: #10B981;">{otp_code}</h1>
            <p>This code expires in 10 minutes.</p>
        </body>
        </html>
        """
        plain_message = f"Your verification code is: {otp_code}\n\nThis code expires in 10 minutes."

    try:
        send_mail(
            subject=subject,
            message=plain_message,
            from_email=settings.DEFAULT_FROM_EMAIL,
            recipient_list=[recipient_email],
            fail_silently=False,
            html_message=html_message,
        )
        logger.info(f"✅ OTP email sent to {recipient_email}")
        return True, "Email sent successfully"
    except Exception as e:
        logger.error(f"❌ Failed to send OTP email: {e}")
        return False, str(e)


def send_approval_notification(recipient_email, school_name):
    """
    Send notification when school is approved
    """
    subject = f"School Approved - {school_name}"
    html_message = f"""
    <!DOCTYPE html>
    <html>
    <body style="font-family: Arial, sans-serif; text-align: center; padding: 20px;">
        <h2>Congratulations!</h2>
        <p>Your school <strong>{school_name}</strong> has been approved.</p>
        <p>You can now login to your admin dashboard.</p>
        <a href="https://felege-selam-payment-system.vercel.app/admin/login" 
           style="background: #4F46E5; color: white; padding: 10px 20px; text-decoration: none; border-radius: 5px;">
            Login Here
        </a>
    </body>
    </html>
    """
    plain_message = f"Your school {school_name} has been approved! You can now login."

    try:
        send_mail(
            subject=subject,
            message=plain_message,
            from_email=settings.DEFAULT_FROM_EMAIL,
            recipient_list=[recipient_email],
            fail_silently=False,
            html_message=html_message,
        )
        return True, "Email sent successfully"
    except Exception as e:
        return False, str(e)


def send_reset_password_email(recipient_email, token):
    """
    Send password reset email with link
    """
    frontend_url = getattr(settings, 'FRONTEND_URL', 'https://felege-selam-payment-system.vercel.app')
    reset_link = f"{frontend_url}/admin/reset-password?token={token}"
    
    subject = "Password Reset Request - School Payment System"
    html_message = f"""
    <!DOCTYPE html>
    <html>
    <body style="font-family: Arial, sans-serif; text-align: center; padding: 20px;">
        <h2>Password Reset Request</h2>
        <p>Click the link below to reset your password:</p>
        <a href="{reset_link}" style="background: #4F46E5; color: white; padding: 10px 20px; text-decoration: none; border-radius: 5px;">
            Reset Password
        </a>
        <p>This link expires in 24 hours.</p>
    </body>
    </html>
    """
    plain_message = f"Reset your password here: {reset_link}"

    try:
        send_mail(
            subject=subject,
            message=plain_message,
            from_email=settings.DEFAULT_FROM_EMAIL,
            recipient_list=[recipient_email],
            fail_silently=False,
            html_message=html_message,
        )
        logger.info(f"✅ Password reset email sent to {recipient_email}")
        return True, "Reset email sent successfully"
    except Exception as e:
        logger.error(f"❌ Failed to send reset password email: {e}")
        return False, str(e)