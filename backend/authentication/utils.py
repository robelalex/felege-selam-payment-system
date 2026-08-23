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

MAX_OTP_ATTEMPTS = 5
OTP_LOCKOUT_MINUTES = 15


def verify_otp(user_profile, entered_otp):
    """
    Verify OTP code.

    ✅ SECURITY FIX: this previously had no limit on how many times a
    code could be retried within its 10-minute validity window — only
    the generic per-IP request rate applied, which is not tight enough
    to safely protect a 6-digit code. Now: 5 wrong attempts locks
    verification for this user for 15 minutes, independent of whether
    the OTP itself has expired. The counter (and any active lock) is
    cleared automatically whenever a fresh OTP is generated for this
    profile — see generate_and_send_otp()/OTP request views, which must
    call reset_otp_attempts(user_profile) when issuing a new code.
    """
    # Locked out from a prior burst of wrong attempts — reject even a
    # correct code until the lock expires, otherwise a lock is trivially
    # bypassed by just... entering the right code once you finally guess it.
    if user_profile.otp_locked_until and user_profile.otp_locked_until > timezone.now():
        return False, "Too many incorrect attempts. Please try again later."

    if not user_profile.otp_code:
        return False, "No OTP code found"

    # Check if OTP expired (10 minutes)
    if user_profile.otp_created_at < timezone.now() - timedelta(minutes=10):
        return False, "OTP code has expired"

    if user_profile.otp_code != entered_otp:
        user_profile.otp_attempts = (user_profile.otp_attempts or 0) + 1
        if user_profile.otp_attempts >= MAX_OTP_ATTEMPTS:
            user_profile.otp_locked_until = timezone.now() + timedelta(minutes=OTP_LOCKOUT_MINUTES)
            user_profile.save(update_fields=['otp_attempts', 'otp_locked_until'])
            return False, "Too many incorrect attempts. Please try again later."
        user_profile.save(update_fields=['otp_attempts'])
        return False, "Invalid OTP code"

    return True, "OTP verified"


def reset_otp_attempts(user_profile):
    """Call whenever a fresh OTP is generated/sent, so a new code always
    gets a clean set of attempts rather than inheriting a near-lockout
    count (or an existing lock) from the previous code."""
    user_profile.otp_attempts = 0
    user_profile.otp_locked_until = None

