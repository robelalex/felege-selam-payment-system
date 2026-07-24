from django.db import models

class School(models.Model):
    name = models.CharField(max_length=200)
    code = models.CharField(max_length=20, unique=True, help_text="e.g., FS for Felege Selam")
    address = models.TextField()
    phone = models.CharField(max_length=20)
    email = models.EmailField(blank=True)

    # ✅ Grading system — the School Settings page already had a working
    # UI (percentage / letter_grade / both) that PATCHed these fields.
    # A previous session had already migrated them into the database
    # (migration 0011) but the model definition got reverted afterward,
    # so every save was silently doing nothing. Restored to match what's
    # already migrated, so no destructive column drop is needed.
    GRADING_SYSTEM_CHOICES = [
        ('percentage', 'Percentage (out of 100)'),
        ('letter_grade', 'Letter Grade (A, B, C...)'),
        ('both', 'Both (show percentage and letter grade)'),
    ]
    grading_system = models.CharField(
        max_length=20,
        choices=GRADING_SYSTEM_CHOICES,
        default='percentage',
        help_text='How this school grades and displays exam results',
    )
    grade_scale = models.JSONField(
        blank=True,
        default=list,
        help_text="Letter grade boundaries, e.g. [{'min': 90, 'max': 100, 'grade': 'A'}, ...]. Ignored if grading_system is 'percentage'.",
    )
    
    # ✅ Add logo field
    logo = models.ImageField(upload_to='school_logos/', blank=True, null=True, help_text="School logo (JPG, PNG)")
    
    # Subscription information
    SUBSCRIPTION_STATUS_CHOICES = [
        ('pending', 'Pending Approval'),
        ('approved', 'Approved'),
        ('rejected', 'Rejected'),
        ('suspended', 'Suspended'),
    ]
    # ✅ NEW: explicit status alongside the existing boolean. subscription_active
    # keeps working exactly as before (nothing that reads it needs to change),
    # this just gives Robel's approval screen a clearer state than a single
    # True/False — e.g. distinguishing "never approved" from "approved, then
    # suspended for non-payment".
    subscription_status = models.CharField(
        max_length=20, choices=SUBSCRIPTION_STATUS_CHOICES, default='approved'
    )
    subscription_active = models.BooleanField(default=True)
    subscription_expiry = models.DateField(null=True, blank=True)
    
    # Bank account details (for parents to pay into)
    bank_name = models.CharField(max_length=100)
    bank_account_number = models.CharField(max_length=50)
    bank_account_holder = models.CharField(max_length=200)
    
    # Telebirr details
    telebirr_merchant_id = models.CharField(max_length=100, blank=True)
    
    # ========== Afro Message SMS Configuration ==========
    # Note: 'at_username' DB column kept for backward compatibility, 
    # but now stores Afro Message API Key or Campaign Name if needed
    at_username = models.CharField(
        max_length=100, 
        blank=True, 
        null=True, 
        help_text="SMSEthiopia Campaign Name or Username (Optional)"
    )
    at_api_key = models.CharField(
        max_length=512, 
        blank=True, 
        null=True, 
        help_text="SMSEthiopia API Key"
    )
    sms_sender_id = models.CharField(
        max_length=11, 
        blank=True, 
        null=True, 
        help_text="SMS Sender ID (max 11 chars) - e.g., SCHOOLPAY"
    )
    sms_enabled = models.BooleanField(
        default=False, 
        help_text="Is SMS configured and working?"
    )
    sms_last_test = models.DateTimeField(
        blank=True, 
        null=True, 
        help_text="Last time SMS credentials were tested"
    )
    sms_test_status = models.CharField(
        max_length=255, 
        blank=True, 
        null=True, 
        help_text="Status of last test (success/failed/pending)"
    )
    
    # Optional: SMS quota tracking to control costs
    sms_monthly_limit = models.IntegerField(
        default=0, 
        help_text="Monthly SMS limit (0 = unlimited)"
    )
    sms_current_month_count = models.IntegerField(
        default=0, 
        help_text="SMS sent this month"
    )
    sms_last_reset = models.DateField(
        blank=True, 
        null=True, 
        help_text="Last time monthly counter was reset"
    )
    
    # ========== NEW: Chapa Payment Configuration ==========
    chapa_api_key = models.CharField(
        max_length=200, 
        blank=True, 
        null=True, 
        help_text="Chapa API key (starts with CHASECK_)"
    )
    chapa_enabled = models.BooleanField(
        default=False, 
        help_text="Is Chapa configured and working for this school?"
    )
    chapa_webhook_secret = models.CharField(
        max_length=200, 
        blank=True, 
        null=True, 
        help_text="Chapa webhook secret for verifying webhook requests"
    )
    chapa_last_test = models.DateTimeField(
        blank=True, 
        null=True, 
        help_text="Last time Chapa credentials were tested"
    )
    chapa_test_status = models.CharField(
        max_length=50, 
        blank=True, 
        null=True, 
        help_text="Status of Chapa test (success/failed/pending)"
    )
    
    # ========== NEW: Verify.ET API Configuration ==========
    verify_et_api_key = models.CharField(
        max_length=200,
        blank=True,
        null=True,
        help_text="Verify.ET API key for this school"
    )
    verify_et_enabled = models.BooleanField(
        default=False,
        help_text="Is Verify.ET API configured and working?"
    )
    verify_et_last_test = models.DateTimeField(
        blank=True,
        null=True,
        help_text="Last time Verify.ET API credentials were tested"
    )
    verify_et_test_status = models.CharField(
        max_length=255,
        blank=True,
        help_text="Status of last API test (success/failed/pending)"
    )
    
    # CBE Account Details for this school (for Verify.ET)
    cbe_account_number = models.CharField(
        max_length=50,
        blank=True,
        help_text="School's CBE account number"
    )
    cbe_account_suffix = models.CharField(
        max_length=8,
        blank=True,
        help_text="Last 8 digits of CBE account"
    )

    # ========== NEW: School Email Configuration (Layer 2 - Brevo) ==========
    brevo_api_key = models.CharField(
        max_length=200,
        blank=True,
        null=True,
        help_text="Brevo v3 API key for transactional emails"
    )
    brevo_sender_email = models.EmailField(
        blank=True,
        null=True,
        help_text="Verified sender email in Brevo"
    )
    brevo_sender_name = models.CharField(
        max_length=100,
        blank=True,
        null=True,
        help_text="Sender display name (e.g., Greenfield Academy)"
    )
    email_enabled = models.BooleanField(
        default=False,
        help_text="Is school email configured and working?"
    )
    email_last_test = models.DateTimeField(
        blank=True,
        null=True,
        help_text="Last time email credentials were tested"
    )
    email_test_status = models.CharField(
        max_length=255,
        blank=True,
        null=True,
        help_text="Status of last email test (success/failed/pending)"
    )
    
    # Optional: Email quota tracking
    email_monthly_limit = models.IntegerField(
        default=0,
        help_text="Monthly email limit (0 = unlimited)"
    )
    email_current_month_count = models.IntegerField(
        default=0,
        help_text="Emails sent this month"
    )
    email_last_reset = models.DateField(
        blank=True,
        null=True,
        help_text="Last time monthly counter was reset"
    )

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    
    def __str__(self):
        return self.name
    
    @property
    def has_chapa_credentials(self):
        """Check if Chapa is properly configured"""
        return bool(self.chapa_api_key and self.chapa_enabled)
    
    @property
    def has_sms_credentials(self):
        """Check if SMS is properly configured for SMSEthiopia"""
        # Only requires API key + enabled status (username/campaign is optional)
        return bool(self.at_api_key and self.sms_enabled)
    
    @property
    def has_verify_et_credentials(self):
        """Check if Verify.ET is properly configured"""
        return bool(self.verify_et_api_key and self.verify_et_enabled and self.cbe_account_suffix)
    
    @property
    def has_email_credentials(self):
        """Check if school email credentials exist"""
        return bool(self.brevo_api_key and self.brevo_sender_email)
    
    class Meta:
        ordering = ['name']


# ========== SchoolAdminProfile Model ==========
class SchoolAdminProfile(models.Model):
    """Link between Django User and School"""
    user = models.OneToOneField('auth.User', on_delete=models.CASCADE, related_name='school_profile')
    school = models.ForeignKey(School, on_delete=models.CASCADE, related_name='admins')
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    
    def __str__(self):
        return f"{self.user.username} - {self.school.name}"
    
    class Meta:
        verbose_name = "School Admin Profile"
        verbose_name_plural = "School Admin Profiles"