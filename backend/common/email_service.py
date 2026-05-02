# backend/common/email_service.py
from django.core.mail import send_mail
from django.conf import settings
import logging

logger = logging.getLogger(__name__)

def send_otp_email(recipient_email, otp_code, user_type='admin'):
    """
    Send OTP verification email using Django's email system
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
            <h1 style="font-size: 36px; letter-spacing: 5px; color: #4F46E5;">{otp_code}</h1>
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
        logger.info(f"OTP email sent to {recipient_email}")
        return True, "Email sent successfully"
    except Exception as e:
        logger.error(f"Failed to send OTP email: {e}")
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
    from django.conf import settings
    
    # Get frontend URL from settings or use default
    frontend_url = getattr(settings, 'FRONTEND_URL', 'http://localhost:3000')
    # ✅ FIXED: Use query parameter instead of path parameter
    reset_link = f"{frontend_url}/admin/reset-password?token={token}"
    
    subject = "Password Reset Request - School Payment System"
    html_message = f"""
    <!DOCTYPE html>
    <html>
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
    </head>
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
                       style="display: inline-block; background: linear-gradient(135deg, #4F46E5 0%, #7C3AED 100%); color: white; padding: 12px 32px; text-decoration: none; border-radius: 8px; font-weight: 600; font-size: 16px; box-shadow: 0 2px 8px rgba(79,70,229,0.3);">
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
                    &copy; 2025 School Payment System. All rights reserved.
                </p>
            </div>
        </div>
    </body>
    </html>
    """
    
    plain_message = f"""
    Password Reset Request
    
    You requested to reset your password. Click the link below to create a new password:
    
    {reset_link}
    
    This link expires in 24 hours.
    
    If you didn't request this, please ignore this email.
    """
    
    try:
        send_mail(
            subject=subject,
            message=plain_message,
            from_email=settings.DEFAULT_FROM_EMAIL,
            recipient_list=[recipient_email],
            fail_silently=False,
            html_message=html_message,
        )
        logger.info(f"Password reset email sent to {recipient_email}")
        return True, "Reset email sent successfully"
    except Exception as e:
        logger.error(f"Failed to send reset password email: {e}")
        return False, str(e)