# backend/payments/models.py
from django.db import models
from django.core.validators import MinValueValidator
from students.models import Student
from schools.models import School


class PaymentDeadline(models.Model):
    MONTH_CHOICES = [
        (1, 'መስከረም'),
        (2, 'ጥቅምት'),
        (3, 'ህዳር'),
        (4, 'ታህሳስ'),
        (5, 'ጥር'),
        (6, 'የካቲት'),
        (7, 'መጋቢት'),
        (8, 'ሚያዝያ'),
        (9, 'ግንቦት'),
        (10, 'ሰኔ'),
        (11, 'ሐምሌ'),
        (12, 'ነሐሴ'),
        (13, 'ጳጉሜ'),
    ]

    school = models.ForeignKey(School, on_delete=models.CASCADE, related_name='deadlines')

    # ✅ FIX: Changed from CharField to ForeignKey so payments are anchored
    # to the year they were created in — NOT the student's current year.
    # After promotion, students move to 2021 but their 2020 payments stay
    # linked to the 2020 AcademicYear via this FK.
    academic_year = models.ForeignKey(
        'academics.AcademicYear',
        on_delete=models.CASCADE,
        null=True,
        blank=True,
        related_name='payment_deadlines',
        help_text="The academic year this deadline belongs to"
    )

    month = models.IntegerField(choices=MONTH_CHOICES)
    due_date = models.DateField()
    amount = models.DecimalField(max_digits=10, decimal_places=2)
    description = models.TextField(blank=True)
    is_active = models.BooleanField(default=True)
    grade = models.IntegerField(
        choices=Student.GRADE_CHOICES, null=True, blank=True,
        help_text="Leave blank to apply to all grades"
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        # ✅ Updated unique_together to use academic_year FK
        unique_together = ['school', 'academic_year', 'month', 'grade']
        ordering = ['academic_year', 'month', 'grade']

    def __str__(self):
        month_name = dict(self.MONTH_CHOICES)[self.month]
        year_name = self.academic_year.name if self.academic_year else 'No Year'
        if self.grade:
            return f"{year_name} - {month_name} (Grade {self.grade})"
        return f"{year_name} - {month_name} (All Grades)"


class Payment(models.Model):
    PAYMENT_METHODS = [
        ('cash', 'Cash'),
        ('telebirr', 'Telebirr'),
        ('bank_transfer', 'Bank Transfer'),
        ('chapa', 'Chapa'),
        ('other', 'Other'),
    ]

    STATUS_CHOICES = [
        ('pending', 'Pending Verification'),
        ('verified', 'Verified'),
        ('rejected', 'Rejected'),
        ('failed', 'Failed'),
    ]

    student = models.ForeignKey(Student, on_delete=models.CASCADE, related_name='payments')
    deadline = models.ForeignKey(PaymentDeadline, on_delete=models.CASCADE, related_name='payments')
    amount = models.DecimalField(max_digits=10, decimal_places=2, validators=[MinValueValidator(0)])
    payment_method = models.CharField(max_length=20, choices=PAYMENT_METHODS)
    transaction_reference = models.CharField(max_length=200, blank=True)

    invoice_number = models.CharField(max_length=50, blank=True, unique=True, null=True)
    chapa_reference = models.CharField(max_length=200, blank=True)
    webhook_received = models.BooleanField(default=False)
    webhook_received_at = models.DateTimeField(null=True, blank=True)

    # Archive instead of delete — keeps parent portal working correctly
    is_archived = models.BooleanField(default=False)
    archived_at = models.DateTimeField(null=True, blank=True)

    is_from_slip = models.BooleanField(default=False)
    slip = models.ForeignKey('PaymentSlip', on_delete=models.SET_NULL, null=True, blank=True)

    payment_proof = models.FileField(upload_to='payment_proofs/%Y/%m/', blank=True, null=True)
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default='pending')
    verified_by = models.ForeignKey(
        'auth.User', on_delete=models.SET_NULL,
        null=True, blank=True, related_name='verified_payments'
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
            models.Index(fields=['invoice_number']),
            models.Index(fields=['is_archived']),
        ]

    def __str__(self):
        return f"{self.student.student_id} - {self.amount} Birr"

    def generate_invoice_number(self):
        from django.utils import timezone
        year = timezone.now().year
        last = Payment.objects.filter(
            invoice_number__startswith=f'INV-{year}-'
        ).order_by('-invoice_number').first()
        if last and last.invoice_number:
            try:
                new_num = int(last.invoice_number.split('-')[-1]) + 1
            except (ValueError, IndexError):
                new_num = 1
        else:
            new_num = 1
        return f'INV-{year}-{new_num:04d}'


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
    STATUS_CHOICES = [
        ('sent', 'Sent'),
        ('delivered', 'Delivered'),
        ('failed', 'Failed'),
    ]

    recipient = models.CharField(max_length=20)
    message = models.TextField()
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default='sent')
    message_id = models.CharField(max_length=100, blank=True)
    related_to = models.CharField(max_length=50, blank=True)
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

    # AI Extraction Fields (for reference detection only, not approval)
    ai_confidence = models.IntegerField(default=0)
    ai_extracted_amount = models.DecimalField(max_digits=10, decimal_places=2, null=True, blank=True)
    ai_message = models.TextField(blank=True)
    ai_reviewed = models.BooleanField(default=False)

    # Transaction reference (auto-detected from image)
    transaction_reference = models.CharField(
        max_length=100, blank=True,
        help_text="CBE transaction reference number"
    )

    # Verify.ET API Results
    verify_et_status = models.CharField(
        max_length=20,
        choices=[
            ('pending', 'Pending'),
            ('queued', 'Queued'),
            ('verified', 'Verified by API'),
            ('failed', 'Verification Failed'),
            ('invalid', 'Invalid Transaction'),
            ('timeout', 'Timeout'),
            ('error', 'API Error')
        ],
        default='pending',
        help_text="Status from Verify.ET API"
    )
    verify_et_payer_name = models.CharField(max_length=200, blank=True)
    verify_et_amount = models.DecimalField(max_digits=10, decimal_places=2, null=True, blank=True)
    verify_et_date = models.CharField(max_length=50, blank=True)
    verify_et_receiver = models.CharField(max_length=200, blank=True)
    verify_et_response_raw = models.JSONField(default=dict, blank=True)
    verify_et_checked_at = models.DateTimeField(null=True, blank=True)
    verify_et_error = models.TextField(blank=True)

    # Async Background Task Tracking
    verify_et_task_id = models.CharField(max_length=255, blank=True, null=True)
    verification_status = models.CharField(
        max_length=20,
        choices=[
            ('pending', 'Pending Verification'),
            ('queued', 'Queued for Background Check'),
            ('verified', 'Verified by System'),
            ('failed', 'Verification Failed'),
            ('manual_review', 'Needs Manual Review'),
            ('timeout', 'Verification Timed Out'),
        ],
        default='pending'
    )
    verified_at_system = models.DateTimeField(null=True, blank=True)
    verification_error = models.TextField(blank=True)

    # Legacy CBE fields (kept for backward compatibility)
    cbe_verification_status = models.CharField(
        max_length=20,
        choices=[
            ('pending', 'Pending CBE Check'),
            ('cbe_verified', 'CBE Verified'),
            ('cbe_rejected', 'CBE Rejected'),
            ('cbe_check_failed', 'CBE Check Failed')
        ],
        default='pending'
    )
    cbe_verified_by = models.ForeignKey(
        'auth.User', on_delete=models.SET_NULL,
        null=True, blank=True, related_name='cbe_verified_slips'
    )
    cbe_verified_at = models.DateTimeField(null=True, blank=True)
    cbe_verification_notes = models.TextField(blank=True)
    cbe_check_method = models.CharField(
        max_length=20,
        choices=[
            ('ussd', 'USSD *894#'),
            ('call', 'Phone Call 6294'),
            ('manual', 'Manual Check'),
            ('api', 'Verify.ET API')
        ],
        blank=True
    )

    def get_cbe_verification_instructions(self):
        return {
            'ussd_code': '*894#',
            'ussd_instructions': [
                '1. Dial *894# on your phone',
                '2. Select "Transaction Inquiry" or "Payment Status"',
                '3. Choose "Bank Transfer" or "CBE Birr"',
                f'4. Enter transaction reference: {self.transaction_reference or "Not provided"}',
                '5. Verify the amount matches the deposit',
                '6. Confirm the sender name matches parent/student name'
            ],
            'phone_number': '6294',
            'call_instructions': [
                '1. Call 6294 (CBE Customer Service)',
                '2. Select option for "Transaction Verification"',
                f'3. Provide transaction reference: {self.transaction_reference or "Not provided"}',
                '4. Ask them to confirm: Amount, Sender name, Date, Status',
                '5. Note down the verification code they provide'
            ],
            'what_to_check': [
                f'Amount should be: {self.amount} Birr',
                f'Sender name should match: {self.uploaded_by}',
                'Transaction should show "Completed" or "Success"',
                'Date should be recent (within last 7 days)'
            ]
        }

    @property
    def is_api_verified(self):
        return self.verify_et_status == 'verified'

    @property
    def verification_summary(self):
        if self.verification_status == 'verified':
            return f"✅ Verified via API - Payer: {self.verify_et_payer_name}, Amount: {self.verify_et_amount} Birr"
        elif self.verification_status == 'queued':
            return "⏳ Verification queued in background, waiting for CBE..."
        elif self.verification_status == 'failed':
            return f"❌ Verification failed: {self.verification_error or self.verify_et_error}"
        elif self.verification_status == 'manual_review':
            return "⚠️ Needs manual review - API could not verify automatically"
        elif self.verification_status == 'timeout':
            return "⏱️ Verification timed out - please retry or verify manually"
        elif self.verify_et_status == 'invalid':
            return "❌ Invalid transaction reference"
        elif self.verify_et_status == 'error':
            return f"⚠️ API Error: {self.verify_et_error}"
        else:
            return "⏳ Pending verification"

    class Meta:
        ordering = ['-uploaded_at']

    def __str__(self):
        return f"Slip for {self.student.full_name} - {self.amount} Birr"
