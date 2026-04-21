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
    
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    
    def __str__(self):
        return self.name
    
    class Meta:
        ordering = ['name']


# ========== NEW: SchoolAdminProfile Model ==========
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