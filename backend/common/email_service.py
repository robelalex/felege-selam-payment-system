# backend/common/email_service.py
from django.conf import settings
import logging
import resend
import os

logger = logging.getLogger(__name__)

# Initialize Resend with API key
resend.api_key = os.getenv('RESEND_API_KEY', '')

def send_otp_email(recipient_email, otp_code, user_type='admin'):
    """
    Send OTP verification email using Resend
    """
    if user_type == 'admin':
        subject = "Admin Login Verification Code"
        html_content = f"""
        <!DOCTYPE html>
        <html>
        <head><meta charset="UTF-8"></head>
        <body style="font-family: Arial, sans-serif; text-align: center; padding: 20px;">
            <div style="max-width: 500px; margin: 0 auto; background: #ffffff; border-radius: 10px; padding: 30px; box-shadow: 0 2px 10px rgba(0,0,0,0.1);">
                <h2 style="color: #4F46E5;">Admin Login Verification</h2>
                <p style="color: #333; font-size: 16px;">Your verification code is:</p>
                <h1 style="font-size: 48px; letter-spacing: 8px; color: #4F46E5; margin: 20px 0;">{otp_code}</h1>
                <p style="color: #666; font-size: 14px;">This code expires in 10 minutes.</p>
                <hr style="margin: 20px 0;">
                <p style="color: #999; font-size: 12px;">Felege Selam Payment System</p>
            </div>
        </body>
        </html>
        """
    else:
        subject = "Parent Portal Access Code"
        html_content = f"""
        <!DOCTYPE html>
        <html>
        <head><meta charset="UTF-8"></head>
        <body style="font-family: Arial, sans-serif; text-align: center; padding: 20px;">
            <div style="max-width: 500px; margin: 0 auto; background: #ffffff; border-radius: 10px; padding: 30px; box-shadow: 0 2px 10px rgba(0,0,0,0.1);">
                <h2 style="color: #10B981;">Parent Portal Access</h2>
                <p style="color: #333; font-size: 16px;">Your verification code is:</p>
                <h1 style="font-size: 48px; letter-spacing: 8px; color: #10B981; margin: 20px 0;">{otp_code}</h1>
                <p style="color: #666; font-size: 14px;">This code expires in 10 minutes.</p>
                <hr style="margin: 20px 0;">
                <p style="color: #999; font-size: 12px;">Felege Selam School Payment System</p>
            </div>
        </body>
        </html>
        """

    try:
        params = {
            "from": settings.DEFAULT_FROM_EMAIL,
            "to": [recipient_email],
            "subject": subject,
            "html": html_content,
        }
        email = resend.Emails.send(params)
        logger.info(f"✅ OTP email sent to {recipient_email}")
        return True, "Email sent successfully"
    except Exception as e:
        logger.error(f"❌ Failed to send OTP email to {recipient_email}: {e}")
        return False, str(e)


def send_approval_notification(recipient_email, school_name):
    """
    Send notification when school is approved
    """
    subject = f"School Approved - {school_name}"
    html_content = f"""
    <!DOCTYPE html>
    <html>
    <head><meta charset="UTF-8"></head>
    <body style="font-family: Arial, sans-serif; text-align: center; padding: 20px;">
        <div style="max-width: 500px; margin: 0 auto; background: #ffffff; border-radius: 10px; padding: 30px; box-shadow: 0 2px 10px rgba(0,0,0,0.1);">
            <h2 style="color: #4F46E5;">Congratulations!</h2>
            <p style="color: #333; font-size: 16px;">Your school <strong>{school_name}</strong> has been approved.</p>
            <p style="color: #555;">You can now login to your admin dashboard.</p>
            <a href="https://felege-selam-payment-system.vercel.app/admin/login" 
               style="display: inline-block; background: #4F46E5; color: white; padding: 12px 30px; text-decoration: none; border-radius: 5px; margin-top: 20px;">
                Login Here
            </a>
            <hr style="margin: 30px 0 20px;">
            <p style="color: #999; font-size: 12px;">Felege Selam Payment System</p>
        </div>
    </body>
    </html>
    """

    try:
        params = {
            "from": settings.DEFAULT_FROM_EMAIL,
            "to": [recipient_email],
            "subject": subject,
            "html": html_content,
        }
        email = resend.Emails.send(params)
        logger.info(f"✅ Approval email sent to {recipient_email}")
        return True, "Email sent successfully"
    except Exception as e:
        logger.error(f"❌ Failed to send approval email: {e}")
        return False, str(e)


def send_reset_password_email(recipient_email, token):
    """
    Send password reset email with link using Resend
    """
    frontend_url = getattr(settings, 'FRONTEND_URL', 'https://felege-selam-payment-system.vercel.app')
    reset_link = f"{frontend_url}/admin/reset-password?token={token}"
    
    subject = "Password Reset Request - School Payment System"
    html_content = f"""
    <!DOCTYPE html>
    <html>
    <head><meta charset="UTF-8"></head>
    <body style="font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; background-color: #f4f7fc; margin: 0; padding: 20px;">
        <div style="max-width: 600px; margin: 0 auto; background-color: #ffffff; border-radius: 10px; box-shadow: 0 4px 12px rgba(0,0,0,0.1); overflow: hidden;">
            <div style="background: linear-gradient(135deg, #4F46E5 0%, #7C3AED 100%); padding: 30px 20px; text-align: center;">
                <h1 style="color: white; margin: 0; font-size: 24px;">🔐 Password Reset Request</h1>
            </div>
            
            <div style="padding: 30px 25px;">
                <p style="color: #333; font-size: 16px; line-height: 1.5;">Hello,</p>
                <p style="color: #555; font-size: 15px; line-height: 1.5; margin: 15px 0;">
                    We received a request to reset your password for your School Payment System account.
                    Click the button below to create a new password:
                </p>
                
                <div style="text-align: center; margin: 30px 0;">
                    <a href="{reset_link}" 
                       style="display: inline-block; background: linear-gradient(135deg, #4F46E5 0%, #7C3AED 100%); color: white; padding: 12px 32px; text-decoration: none; border-radius: 8px; font-weight: 600; font-size: 16px;">
                        Reset Password
                    </a>
                </div>
                
                <p style="color: #555; font-size: 14px; line-height: 1.5;">
                    This link will expire in <strong>24 hours</strong> for security reasons.
                </p>
                
                <p style="color: #888; font-size: 13px; line-height: 1.5; margin-top: 25px; padding-top: 20px; border-top: 1px solid #e0e0e0;">
                    If you didn't request this password reset, please ignore this email. Your password will remain unchanged.
                </p>
                
                <p style="color: #888; font-size: 12px; text-align: center; margin-top: 20px;">
                    &copy; 2025 Felege Selam Payment System. All rights reserved.
                </p>
            </div>
        </div>
    </body>
    </html>
    """

    try:
        params = {
            "from": settings.DEFAULT_FROM_EMAIL,
            "to": [recipient_email],
            "subject": subject,
            "html": html_content,
        }
        email = resend.Emails.send(params)
        logger.info(f"✅ Password reset email sent to {recipient_email}")
        return True, "Reset email sent successfully"
    except Exception as e:
        logger.error(f"❌ Failed to send reset password email: {e}")
        return False, str(e)