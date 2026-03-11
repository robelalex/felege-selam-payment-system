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