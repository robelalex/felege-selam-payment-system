# backend/authentication/models.py
from django.db import models
from django.contrib.auth.models import User
from django.utils import timezone
import uuid

class UserProfile(models.Model):
    ROLE_CHOICES = [
        ('super_admin', 'Super Admin'),
        ('school_admin', 'School Admin'),
        ('staff', 'Staff'),
        ('parent', 'Parent'),  # ✅ ADDED Parent role
    ]
    
    user = models.OneToOneField(User, on_delete=models.CASCADE, related_name='profile')
    role = models.CharField(max_length=20, choices=ROLE_CHOICES, default='staff')
    phone = models.CharField(max_length=20, blank=True)

    # ✅ Jimma item 5 — HR: "salutation applies to school admins too".
    # A self-registered school_admin has NO StaffMember record at all
    # (see authentication/serializers.py RegisterSerializer — only a
    # User + UserProfile get created), so StaffMember.salutation alone
    # can't cover them. This mirrors the same salutation choice set
    # here. Whichever record an account has (StaffMember if linked,
    # else this) is treated as the source of truth for display — see
    # get_current_user's 'salutation' field and update_profile below.
    SALUTATION_CHOICES = [
        ('mr', 'Mr.'),
        ('mrs', 'Mrs.'),
        ('ms', 'Ms.'),
        ('dr', 'Dr.'),
    ]
    salutation = models.CharField(max_length=10, choices=SALUTATION_CHOICES, blank=True)

    # Personal profile photo for the logged-in account itself. Added
    # because StaffMember.photo only exists for staff created through the
    # Staff module — a school_admin created via self-registration has no
    # StaffMember record at all, so their own "my profile" photo needs a
    # home that every account actually has.
    photo = models.ImageField(upload_to='profile_photos/%Y/%m/', blank=True, null=True)
    
    # For email verification
    is_email_verified = models.BooleanField(default=False)
    email_verification_token = models.UUIDField(default=uuid.uuid4, editable=False)
    
    # For password reset
    reset_password_token = models.UUIDField(blank=True, null=True)
    reset_password_expires = models.DateTimeField(blank=True, null=True)
    
    # School association (for school_admin and staff)
    school_id = models.IntegerField(blank=True, null=True)
    
    # ✅ NEW: OTP Fields for 2FA
    otp_code = models.CharField(max_length=6, blank=True, null=True)
    otp_created_at = models.DateTimeField(blank=True, null=True)
    otp_verified = models.BooleanField(default=False)
    
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    
    class Meta:
        db_table = 'auth_user_profiles'
        ordering = ['-created_at']
    
    def __str__(self):
        return f"{self.user.email} ({self.role})"
    
    @property
    def is_super_admin(self):
        return self.role == 'super_admin'
    
    @property
    def is_school_admin(self):
        return self.role == 'school_admin'
    
    @property
    def is_parent(self):
        return self.role == 'parent'


# ✅ Password History Model for security
class PasswordHistory(models.Model):
    """Track user password history to prevent password reuse"""
    user = models.ForeignKey(User, on_delete=models.CASCADE, related_name='password_history')
    password_hash = models.CharField(max_length=255)  # Store hashed password
    created_at = models.DateTimeField(auto_now_add=True)
    
    class Meta:
        db_table = 'auth_password_history'
        ordering = ['-created_at']
        indexes = [
            models.Index(fields=['user', '-created_at']),
        ]
    
    def __str__(self):
        return f"{self.user.username} - {self.created_at.strftime('%Y-%m-%d %H:%M')}"