# backend/common/email_service.py
import logging
from django.core.mail import send_mail
from django.conf import settings

logger = logging.getLogger(__name__)

def send_otp_email(recipient_email, otp_code, user_type='admin'):
    if user_type == 'admin':
        subject = "Admin Login Verification Code"
        color = "#4F46E5"
        title = "Admin Login Verification"
    else:
        subject = "Parent Portal Access Code"
        color = "#10B981"
        title = "Parent Portal Access"

    html_message = f"""
    <!DOCTYPE html>
    <html>
    <body style="font-family: Arial, sans-serif; text-align: center; padding: 20px;">
        <h2>{title}</h2>
        <p>Your verification code is:</p>
        <h1 style="font-size: 36px; letter-spacing: 5px; color: {color};">
            {otp_code}
        </h1>
        <p>This code expires in 10 minutes.</p>
        <p style="color: #999; font-size: 12px;">
            If you did not request this, please ignore this email.
        </p>
    </body>
    </html>
    """
    plain_message = f"{title}\n\nYour code: {otp_code}\n\nExpires in 10 minutes."

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
    html_message = f"""
    <!DOCTYPE html>
    <html>
    <body style="font-family: Arial, sans-serif; text-align: center; padding: 20px;">
        <h2>Congratulations!</h2>
        <p>Your school <strong>{school_name}</strong> has been approved.</p>
        <a href="https://felege-selam-payment-system.vercel.app/admin/login"
           style="background: #4F46E5; color: white; padding: 10px 20px;
                  text-decoration: none; border-radius: 5px;">
            Login Here
        </a>
    </body>
    </html>
    """
    try:
        send_mail(
            subject=f"School Approved - {school_name}",
            message=f"Your school {school_name} has been approved!",
            from_email=settings.DEFAULT_FROM_EMAIL,
            recipient_list=[recipient_email],
            fail_silently=False,
            html_message=html_message,
        )
        logger.info(f"✅ Approval email sent to {recipient_email}")
        return True, "Email sent successfully"
    except Exception as e:
        logger.error(f"❌ Failed to send approval email: {e}")
        return False, str(e)


def send_reset_password_email(recipient_email, token):
    frontend_url = getattr(
        settings, 'FRONTEND_URL',
        'https://felege-selam-payment-system.vercel.app'
    )
    reset_link = f"{frontend_url}/admin/reset-password?token={token}"

    html_message = f"""
    <!DOCTYPE html>
    <html>
    <body style="font-family: Arial, sans-serif; text-align: center; padding: 20px;">
        <h2>Password Reset Request</h2>
        <p>Click the button below to reset your password:</p>
        <a href="{reset_link}"
           style="background: #4F46E5; color: white; padding: 10px 20px;
                  text-decoration: none; border-radius: 5px;">
            Reset Password
        </a>
        <p>This link expires in 24 hours.</p>
    </body>
    </html>
    """
    try:
        send_mail(
            subject="Password Reset - School Payment System",
            message=f"Reset your password: {reset_link}",
            from_email=settings.DEFAULT_FROM_EMAIL,
            recipient_list=[recipient_email],
            fail_silently=False,
            html_message=html_message,
        )
        logger.info(f"✅ Password reset email sent to {recipient_email}")
        return True, "Reset email sent successfully"
    except Exception as e:
        logger.error(f"❌ Failed to send reset email: {e}")
        return False, str(e)


# ✅ NEW: Send payment reminder email
def send_payment_reminder_email(recipient_email, student_name, pending_months, total_due, custom_message=None):
    """
    Send payment reminder email to parent/guardian
    
    Args:
        recipient_email: Parent's email address
        student_name: Full name of the student
        pending_months: Comma-separated list of pending months with amounts
        total_due: Total amount due
        custom_message: Optional custom message to include
    
    Returns:
        tuple: (success: bool, message: str)
    """
    
    if custom_message:
        # Use custom message if provided
        message_body = f"""
        <p>Dear Parent,</p>
        <p>{custom_message}</p>
        <p>This reminder is for your child: <strong>{student_name}</strong></p>
        """
    else:
        # Default message
        message_body = f"""
        <p>Dear Parent,</p>
        <p>This is a friendly reminder that your child <strong>{student_name}</strong> has pending payment for the following month(s):</p>
        <div style="background: #FEF3C7; padding: 15px; border-radius: 8px; margin: 15px 0;">
            <p style="margin: 0; font-size: 16px;"><strong>📅 Pending Months:</strong></p>
            <p style="margin: 10px 0 0 0; font-size: 18px; color: #D97706;">{pending_months}</p>
        </div>
        <div style="background: #EEF2FF; padding: 15px; border-radius: 8px; margin: 15px 0;">
            <p style="margin: 0; font-size: 16px;"><strong>💰 Total Amount Due:</strong></p>
            <p style="margin: 10px 0 0 0; font-size: 24px; font-weight: bold; color: #4F46E5;">{total_due:,.2f} Birr</p>
        </div>
        <p>Please make the payment before the deadline to avoid any late fees.</p>
        <p>Thank you for your cooperation!</p>
        """
    
    html_message = f"""
    <!DOCTYPE html>
    <html>
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Payment Reminder</title>
    </head>
    <body style="font-family: 'Segoe UI', Arial, sans-serif; padding: 20px; background-color: #f4f4f4; margin: 0;">
        <div style="max-width: 600px; margin: 0 auto; background: white; border-radius: 16px; overflow: hidden; box-shadow: 0 4px 20px rgba(0,0,0,0.1);">
            <!-- Header -->
            <div style="background: linear-gradient(135deg, #4F46E5 0%, #7C3AED 100%); padding: 30px 20px; text-align: center;">
                <h1 style="color: white; margin: 0; font-size: 24px;">📚 Payment Reminder</h1>
                <p style="color: rgba(255,255,255,0.9); margin: 10px 0 0 0; font-size: 14px;">School Payment System</p>
            </div>
            
            <!-- Body -->
            <div style="padding: 30px;">
                {message_body}
                
                <!-- Divider -->
                <hr style="margin: 25px 0; border: none; border-top: 1px solid #E5E7EB;">
                
                <!-- Footer -->
                <p style="color: #6B7280; font-size: 12px; text-align: center; margin: 0;">
                    This is an automated reminder from the school payment system.<br>
                    Please do not reply to this email. If you have any questions, contact the school administration.
                </p>
            </div>
        </div>
    </body>
    </html>
    """
    
    plain_message = f"""
Payment Reminder - {student_name}

Dear Parent,

This is a reminder that your child {student_name} has pending payment for:
{pending_months}

Total Amount Due: {total_due:,.2f} Birr

Please make the payment before the deadline to avoid any late fees.

Thank you for your cooperation.

---
School Payment System - Automated Message
    """
    
    try:
        send_mail(
            subject=f"📚 Payment Reminder - {student_name}",
            message=plain_message.strip(),
            from_email=settings.DEFAULT_FROM_EMAIL,
            recipient_list=[recipient_email],
            fail_silently=False,
            html_message=html_message,
        )
        logger.info(f"✅ Payment reminder email sent to {recipient_email} for {student_name}")
        return True, "Email sent successfully"
    except Exception as e:
        logger.error(f"❌ Failed to send payment reminder email to {recipient_email}: {e}")
        return False, str(e)