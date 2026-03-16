from django.db import models
from django.core.validators import MinValueValidator
from students.models import Student
from schools.models import School

class PaymentDeadline(models.Model):
    MONTH_CHOICES = [
        (1, 'Meskerem'),
        (2, 'Tikimt'),
        (3, 'Hidar'),
        (4, 'Tahsas'),
        (5, 'Tir'),
        (6, 'Yekatit'),
        (7, 'Megabit'),
        (8, 'Miazia'),
        (9, 'Ginbot'),
        (10, 'Sene'),
        (11, 'Hamle'),
        (12, 'Nehase'),
        (13, 'Pagume'),
    ]
    
    school = models.ForeignKey(School, on_delete=models.CASCADE, related_name='deadlines')
    academic_year = models.CharField(max_length=20)
    month = models.IntegerField(choices=MONTH_CHOICES)
    due_date = models.DateField()
    amount = models.DecimalField(max_digits=10, decimal_places=2)
    description = models.TextField(blank=True)
    is_active = models.BooleanField(default=True)
    
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    
    class Meta:
        unique_together = ['school', 'academic_year', 'month']
        ordering = ['academic_year', 'month']
    
    def __str__(self):
        month_name = dict(self.MONTH_CHOICES)[self.month]
        return f"{self.academic_year} - {month_name}"

class Payment(models.Model):
    PAYMENT_METHODS = [
        ('cash', 'Cash'),
        ('telebirr', 'Telebirr'),
        ('bank_transfer', 'Bank Transfer'),
        ('other', 'Other'),
    ]
    
    STATUS_CHOICES = [
        ('pending', 'Pending Verification'),
        ('verified', 'Verified'),
        ('rejected', 'Rejected'),
    ]
    
    student = models.ForeignKey(
        Student, 
        on_delete=models.CASCADE, 
        related_name='payments'
    )
    
    deadline = models.ForeignKey(
        PaymentDeadline, 
        on_delete=models.CASCADE, 
        related_name='payments'
    )
    
    amount = models.DecimalField(
        max_digits=10, 
        decimal_places=2,
        validators=[MinValueValidator(0)]
    )
    payment_method = models.CharField(max_length=20, choices=PAYMENT_METHODS)
    
    transaction_reference = models.CharField(max_length=200, blank=True)
    
    payment_proof = models.FileField(
        upload_to='payment_proofs/%Y/%m/', 
        blank=True, 
        null=True
    )
    
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default='pending')
    verified_by = models.ForeignKey(
        'auth.User', 
        on_delete=models.SET_NULL, 
        null=True, 
        blank=True,
        related_name='verified_payments'
    )
    verified_at = models.DateTimeField(null=True, blank=True)
    rejection_reason = models.TextField(blank=True)
    
    paid_by = models.CharField(max_length=200)
    paid_by_phone = models.CharField(max_length=20)
    
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    
    class Meta:
        ordering = ['-created_at']
        indexes = [
            models.Index(fields=['status']),
            models.Index(fields=['transaction_reference']),
            models.Index(fields=['student', 'deadline']),
        ]
    
    def __str__(self):
        return f"{self.student.student_id} - {self.amount} Birr"

class PaymentReminder(models.Model):
    student = models.ForeignKey(Student, on_delete=models.CASCADE, related_name='reminders')
    deadline = models.ForeignKey(PaymentDeadline, on_delete=models.CASCADE)
    sent_at = models.DateTimeField(auto_now_add=True)
    sent_to = models.CharField(max_length=20)
    message = models.TextField()
    status = models.CharField(max_length=20)
    
    class Meta:
        ordering = ['-sent_at']

class SMSHistory(models.Model):
    """Track all sent SMS messages"""
    
    STATUS_CHOICES = [
        ('sent', 'Sent'),
        ('delivered', 'Delivered'),
        ('failed', 'Failed'),
    ]
    
    recipient = models.CharField(max_length=20)
    message = models.TextField()
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default='sent')
    message_id = models.CharField(max_length=100, blank=True)
    related_to = models.CharField(max_length=50, blank=True, help_text="e.g., payment_123, reminder_bulk")
    
    created_at = models.DateTimeField(auto_now_add=True)
    delivered_at = models.DateTimeField(null=True, blank=True)
    
    class Meta:
        ordering = ['-created_at']
    
    def __str__(self):
        return f"SMS to {self.recipient} - {self.status}"
class PaymentSlip(models.Model):
    STATUS_CHOICES = [
        ('pending', 'Pending Verification'),
        ('verified', 'Verified'),
        ('rejected', 'Rejected'),
    ]
    
    student = models.ForeignKey('students.Student', on_delete=models.CASCADE, related_name='slips')
    deadline = models.ForeignKey('payments.PaymentDeadline', on_delete=models.CASCADE)
    amount = models.DecimalField(max_digits=10, decimal_places=2)
    slip_image = models.ImageField(upload_to='slips/%Y/%m/')
    bank_name = models.CharField(max_length=100, blank=True)
    transaction_date = models.DateField(null=True, blank=True)
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default='pending')
    uploaded_by = models.CharField(max_length=200)
    uploaded_at = models.DateTimeField(auto_now_add=True)
    verified_by = models.ForeignKey('auth.User', on_delete=models.SET_NULL, null=True, blank=True)
    verified_at = models.DateTimeField(null=True, blank=True)
    
    # ✅ These fields are now properly indented inside the class
    ai_confidence = models.IntegerField(default=0, help_text="AI confidence score (0-100)")
    ai_extracted_amount = models.DecimalField(max_digits=10, decimal_places=2, null=True, blank=True)
    ai_message = models.TextField(blank=True)
    ai_reviewed = models.BooleanField(default=False, help_text="Whether AI has reviewed this slip")
    auto_verified = models.BooleanField(default=False, help_text="Whether AI auto-verified this slip")

    class Meta:
        ordering = ['-uploaded_at']
    
    def __str__(self):
        return f"Slip for {self.student.full_name} - {self.amount} Birr"