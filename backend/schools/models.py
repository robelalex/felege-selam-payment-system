from django.db import models

class School(models.Model):
    name = models.CharField(max_length=200)
    code = models.CharField(max_length=20, unique=True, help_text="e.g., FS for Felege Selam")
    address = models.TextField()
    phone = models.CharField(max_length=20)
    email = models.EmailField(blank=True)
    
    # ✅ Add logo field
    logo = models.ImageField(upload_to='school_logos/', blank=True, null=True, help_text="School logo (JPG, PNG)")
    
    # Subscription information
    subscription_active = models.BooleanField(default=True)
    subscription_expiry = models.DateField(null=True, blank=True)
    
    # Bank account details (for parents to pay into)
    bank_name = models.CharField(max_length=100)
    bank_account_number = models.CharField(max_length=50)
    bank_account_holder = models.CharField(max_length=200)
    
    # Telebirr details
    telebirr_merchant_id = models.CharField(max_length=100, blank=True)
    
    # ========== Africa's Talking SMS Configuration ==========
    at_username = models.CharField(
        max_length=100, 
        blank=True, 
        null=True, 
        help_text="Africa's Talking username (e.g., sandbox or your username)"
    )
    at_api_key = models.CharField(
        max_length=200, 
        blank=True, 
        null=True, 
        help_text="Africa's Talking API key"
    )
    sms_sender_id = models.CharField(
        max_length=11, 
        blank=True, 
        null=True, 
        help_text="SMS sender ID (max 11 chars) - must be approved by Africa's Talking"
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
        max_length=50, 
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
    
    # ========== NEW: Verify.ET API Configuration ==========
    # Each school registers their OWN Verify.ET account
    verify_et_api_key = models.CharField(
        max_length=200,
        blank=True,
        null=True,
        help_text="Verify.ET API key for this school (from https://verify.et)"
    )
    verify_et_enabled = models.BooleanField(
        default=False,
        help_text="Is Verify.ET API configured and working for this school?"
    )
    verify_et_last_test = models.DateTimeField(
        blank=True,
        null=True,
        help_text="Last time Verify.ET API credentials were tested"
    )
    verify_et_test_status = models.CharField(
        max_length=50,
        blank=True,
        help_text="Status of last API test (success/failed/pending)"
    )
    
    # CBE Account Details for this school (for Verify.ET)
    cbe_account_number = models.CharField(
        max_length=50,
        blank=True,
        help_text="School's CBE account number (e.g., 1000137267900)"
    )
    cbe_account_suffix = models.CharField(
        max_length=8,
        blank=True,
        help_text="Last 8 digits of CBE account (e.g., 13726790)"
    )
    
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    
    def __str__(self):
        return self.name
    
    @property
    def has_verify_et_credentials(self):
        """Check if Verify.ET is properly configured"""
        return bool(self.verify_et_api_key and self.verify_et_enabled and self.cbe_account_suffix)
    
    class Meta:
        ordering = ['name']


# ========== SchoolAdminProfile Model ==========
class SchoolAdminProfile(models.Model):
    """Link between Django User and School - each school admin belongs to one school"""
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