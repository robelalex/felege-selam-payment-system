# backend/authentication/utils.py
import random
import string
from django.core.mail import send_mail
from django.conf import settings
from django.utils import timezone
from datetime import timedelta

def generate_otp():
    """Generate 6-digit OTP code"""
    return ''.join(random.choices(string.digits, k=6))

def send_otp_email(email, otp_code, user_type='admin'):
    """Send OTP code via email"""
    if user_type == 'admin':
        subject = 'Login Verification Code'
        message = f"""
        Hello,
        
        Your login verification code is: {otp_code}
        
        This code will expire in 10 minutes.
        
        If you did not request this, please ignore this email.
        
        Thanks,
        Felege Selam Payment System
        """
    else:
        subject = 'Parent Portal Access Code'
        message = f"""
        Hello Parent,
        
        Your access code for the parent portal is: {otp_code}
        
        This code will expire in 10 minutes.
        
        Enter this code to access your child's payment information.
        
        Thanks,
        Felege Selam Payment System
        """
    
    send_mail(
        subject,
        message,
        settings.DEFAULT_FROM_EMAIL,
        [email],
        fail_silently=False,
    )

def verify_otp(user_profile, entered_otp):
    """Verify OTP code"""
    if not user_profile.otp_code:
        return False, "No OTP code found"
    
    if user_profile.otp_code != entered_otp:
        return False, "Invalid OTP code"
    
    # Check if OTP expired (10 minutes)
    if user_profile.otp_created_at < timezone.now() - timedelta(minutes=10):
        return False, "OTP code has expired"
    
    return True, "OTP verified"