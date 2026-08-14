# backend/payments/models.py
import uuid
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

    # ✅ NEW (Jimma request #2 — registration fees). 'monthly' is every
    # deadline that existed before this feature (unchanged behavior).
    # 'registration' is a new one-time-per-academic-year charge — see
    # RegistrationFeeConfig below for why it isn't just another monthly
    # row with a bigger amount: the amount differs per student (new vs.
    # continuing), which a flat PaymentDeadline.amount can't express.
    DEADLINE_TYPE_CHOICES = [
        ('monthly', 'Monthly Fee'),
        ('registration', 'One-Time Registration Fee'),
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

    deadline_type = models.CharField(
        max_length=20, choices=DEADLINE_TYPE_CHOICES, default='monthly',
        help_text="'monthly' = a regular monthly fee deadline. 'registration' "
                   "= the one-time per-academic-year registration charge."
    )

    # ✅ CHANGED: nullable so a 'registration' deadline (one-time, not tied
    # to a Meskerem/Tikimt/... month) can leave this blank. Still required
    # in practice for 'monthly' deadlines — enforced in clean() below
    # rather than at the DB level, since the DB-level requirement differs
    # per deadline_type and Django doesn't support conditional NOT NULL.
    month = models.IntegerField(choices=MONTH_CHOICES, null=True, blank=True)
    due_date = models.DateField()
    amount = models.DecimalField(
        max_digits=10, decimal_places=2,
        help_text="For 'monthly': the amount due. For 'registration': "
                   "informational only — the real per-student amount comes "
                   "from RegistrationFeeConfig (new vs. continuing), not this field."
    )
    description = models.TextField(blank=True)
    is_active = models.BooleanField(default=True)
    grade = models.IntegerField(
        choices=Student.GRADE_CHOICES, null=True, blank=True,
        help_text="Leave blank to apply to all grades. Registration deadlines "
                   "must leave this blank — registration isn't grade-specific."
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        # ✅ UPDATED for registration deadlines: adding deadline_type to the
        # tuple is what lets one registration row (month=None, grade=None)
        # coexist with monthly rows for the same school/academic_year
        # without the old ['school','academic_year','month','grade']
        # constraint treating (school, year, None, None) as already taken
        # after the first grade-less monthly deadline. Existing monthly
        # rows are unaffected: their uniqueness behavior is identical
        # because deadline_type is constant ('monthly') across all of them.
        unique_together = ['school', 'academic_year', 'deadline_type', 'month', 'grade']
        ordering = ['academic_year', 'month', 'grade']

    def clean(self):
        from django.core.exceptions import ValidationError
        if self.deadline_type == 'monthly' and self.month is None:
            raise ValidationError({'month': "Monthly deadlines require a month."})
        if self.deadline_type == 'registration':
            if self.month is not None:
                raise ValidationError({'month': "Registration deadlines must not set a month."})
            if self.grade is not None:
                raise ValidationError({'grade': "Registration deadlines must not be grade-specific."})

    def save(self, *args, **kwargs):
        self.clean()
        super().save(*args, **kwargs)

    def __str__(self):
        year_name = self.academic_year.name if self.academic_year else 'No Year'
        if self.deadline_type == 'registration':
            return f"{year_name} - Registration Fee"
        month_name = dict(self.MONTH_CHOICES)[self.month]
        if self.grade:
            return f"{year_name} - {month_name} (Grade {self.grade})"
        return f"{year_name} - {month_name} (All Grades)"

    @property
    def display_label(self):
        """
        ✅ FIX: label for SMS/email reminder text and reports. A
        'registration' deadline has month=None by design, so the plain
        get_month_display() call every reminder/report call site already
        uses would render as a blank value or the literal word "None" —
        e.g. an SMS reading "None - 1500 Birr" instead of "Registration
        Fee - 1500 Birr". This doesn't change get_month_display() itself
        (still correct for monthly deadlines, and anything else that
        calls it directly is unaffected) — it's a separate property call
        sites can opt into.
        """
        if self.deadline_type == 'registration':
            return 'Registration Fee'
        return self.get_month_display()


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

    # ✅ FIX (money-safety): every tx_ref this Payment row has ever used,
    # oldest first. Chapa payments reuse the same pending row on retry, and
    # `transaction_reference` above only ever holds the CURRENT tx_ref — a
    # retry overwrites it. Without this history, if a parent's first
    # attempt actually succeeded on Chapa's side but arrived late (webhook
    # lag), and they'd already retried in the meantime, the first tx_ref's
    # webhook could never find this row again — the money would be
    # deducted from the parent with zero record of it in our system.
    # Every lookup-by-tx_ref (webhook, verify, status) now checks both
    # this field and the current one, so no tx_ref this row ever generated
    # can go untraceable.
    previous_tx_refs = models.JSONField(default=list, blank=True)

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
    # ✅ NEW: unguessable public receipt identifier (separate from invoice_number,
    # which stays human-readable). This is what goes in the receipt URL.
    receipt_token = models.UUIDField(
        default=None, null=True, blank=True, unique=True, editable=False,
        help_text="Public token for the receipt page — generated only after payment is verified."
    )

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
        """
        ✅ FIXED: scoped PER SCHOOL, not globally sequential.
        Old behavior: INV-2026-0001 shared across ALL schools — a school
        with few payments could see numbers jump unpredictably depending
        on other schools' activity, and it gave no visual indication of
        which school issued the receipt.
        New behavior: INV-{SCHOOLCODE}-{YEAR}-{SEQUENCE}, sequence counted
        only within that school. Two schools can both have INV-XX-2026-0001
        with zero collision risk, and the receipt is self-describing.
        """
        from django.utils import timezone
        school = self.student.school
        school_code = school.code or f"S{school.id}"
        year = timezone.now().year
        prefix = f'INV-{school_code}-{year}-'

        last = Payment.objects.filter(
            invoice_number__startswith=prefix,
            student__school=school
        ).order_by('-invoice_number').first()

        if last and last.invoice_number:
            try:
                new_num = int(last.invoice_number.split('-')[-1]) + 1
            except (ValueError, IndexError):
                new_num = 1
        else:
            new_num = 1

        return f'{prefix}{new_num:04d}'

    def generate_receipt_token(self):
        """Called once, when a payment becomes verified. Idempotent."""
        if not self.receipt_token:
            self.receipt_token = uuid.uuid4()
        return self.receipt_token


class StudentFeeOverride(models.Model):
    """
    ✅ NEW (Jimma request #1 — fee exceptions & flexible payment plans).

    A per-student, per-academic-year exception to the normal monthly fee
    (PaymentDeadline.amount / Student.monthly_fee), for students the
    school has approved a reduced arrangement for. Two kinds:

      - 'waiver'  — one single one-time amount for the WHOLE year,
        replacing every monthly charge. Modeled as applying to only the
        first active deadline of that academic year (for the student's
        grade) — every other month in that year is $0 due. This keeps
        the existing month-by-month PaymentDeadline architecture intact
        instead of inventing a parallel non-monthly billing concept.
      - 'partial' — a reduced amount charged EVERY month instead of the
        normal deadline amount (e.g. deadline says 500 Birr, this
        student pays 200 Birr/month all year).

    Deliberately its own table rather than reusing Student.monthly_fee:
    monthly_fee is silently overwritten by
    payments.signals.sync_student_fees_on_deadline_change every time an
    admin edits ANY PaymentDeadline for that grade (see that file's
    docstring) — any customization stored there would be wiped out by
    the next unrelated deadline edit. This table is never touched by
    that signal.

    Only one ACTIVE override per student per academic year — a school
    either grants a waiver or a partial arrangement for a given year,
    not both at once. Deactivate (is_active=False) rather than delete,
    to keep the approval history and the supporting document on file
    for audit/inspection purposes, same convention as StudentDocument.
    """
    OVERRIDE_TYPE_CHOICES = [
        ('waiver', 'One-Time Waiver Amount (replaces all monthly fees for the year)'),
        ('partial', 'Partial Monthly Payment (reduced amount every month)'),
    ]

    student = models.ForeignKey(
        Student, on_delete=models.CASCADE, related_name='fee_overrides'
    )
    academic_year = models.ForeignKey(
        'academics.AcademicYear', on_delete=models.CASCADE, related_name='fee_overrides'
    )
    override_type = models.CharField(max_length=10, choices=OVERRIDE_TYPE_CHOICES)
    amount = models.DecimalField(
        max_digits=10, decimal_places=2, validators=[MinValueValidator(0)],
        help_text=(
            "For 'waiver': the single total amount charged for the whole "
            "academic year. For 'partial': the reduced amount charged "
            "every month instead of the normal deadline amount."
        )
    )
    supporting_document = models.FileField(
        upload_to='fee_exception_documents/%Y/%m/',
        help_text="Required — kebele/NGO letter or other proof supporting this exception."
    )
    reason = models.CharField(max_length=255, blank=True)
    is_active = models.BooleanField(default=True)
    created_by = models.ForeignKey(
        'auth.User', on_delete=models.SET_NULL, null=True, blank=True,
        related_name='fee_overrides_created'
    )
    deactivated_by = models.ForeignKey(
        'auth.User', on_delete=models.SET_NULL, null=True, blank=True,
        related_name='fee_overrides_deactivated'
    )
    deactivated_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['-created_at']
        constraints = [
            models.UniqueConstraint(
                fields=['student', 'academic_year'],
                condition=models.Q(is_active=True),
                name='unique_active_fee_override_per_student_year',
            )
        ]
        indexes = [
            models.Index(fields=['student', 'academic_year', 'is_active']),
        ]

    def __str__(self):
        return f"{self.student.student_id} - {self.get_override_type_display()} ({self.academic_year}) - {self.amount} Birr"


class RegistrationFeeConfig(models.Model):
    """
    ✅ NEW (Jimma request #2 — registration fees).

    School-configurable, one row per school per academic year — set fresh
    every year (NOT hardcoded), matching the request: "different for new
    vs. continuing/senior students, settable fresh every academic year."

    Deliberately separate from PaymentDeadline.amount: a registration
    PaymentDeadline exists (deadline_type='registration') so registration
    charges flow through the exact same Payment/Chapa/reminder/report
    machinery every monthly fee already uses, but the AMOUNT a given
    student owes depends on whether they're new or continuing — a single
    flat deadline.amount can't express that, so the real amount is looked
    up here via registration_fee_service.get_effective_registration_amount(),
    which fee_override_service.get_effective_deadline_amount() (the one
    function ~15 call sites already go through) now delegates to whenever
    deadline_type == 'registration'. No existing call site needed to
    change to support registration fees.
    """
    school = models.ForeignKey(School, on_delete=models.CASCADE, related_name='registration_fee_configs')
    academic_year = models.ForeignKey(
        'academics.AcademicYear', on_delete=models.CASCADE, related_name='registration_fee_configs'
    )
    new_student_amount = models.DecimalField(
        max_digits=10, decimal_places=2, validators=[MinValueValidator(0)],
        help_text="One-time registration fee for a NEW student this academic year."
    )
    continuing_student_amount = models.DecimalField(
        max_digits=10, decimal_places=2, validators=[MinValueValidator(0)],
        help_text="One-time registration fee for a CONTINUING/senior student this academic year."
    )
    created_by = models.ForeignKey(
        'auth.User', on_delete=models.SET_NULL, null=True, blank=True,
        related_name='registration_fee_configs_created'
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        unique_together = ['school', 'academic_year']
        ordering = ['-academic_year']

    def __str__(self):
        return f"{self.school.name} - {self.academic_year} Registration Fees (New: {self.new_student_amount}, Continuing: {self.continuing_student_amount})"


class StudentRegistrationType(models.Model):
    """
    ✅ NEW (Jimma request #2 — registration fees).

    Whether a specific student is billed the 'new' or 'continuing' rate
    for a specific academic year. Rows are created two ways:

      - Auto-detected and cached (is_manual_override=False) the first
        time registration_fee_service needs a type for a student who
        doesn't have a row yet: 'continuing' if the student has any
        VERIFIED payment in a strictly earlier academic year at this
        school, otherwise 'new'. Cached so the classification doesn't
        silently change mid-year if the student's payment history
        changes later (e.g. an old payment gets archived).
      - Explicitly set by an admin (is_manual_override=True) via
        StudentRegistrationTypeViewSet — e.g. a transfer student who is
        new to THIS school but the auto-detection logic can't know that
        from payment history alone, or any other case staff want to
        correct by hand.

    One row per student per academic year — a student is unambiguously
    one or the other for a given year.
    """
    REGISTRATION_TYPE_CHOICES = [
        ('new', 'New Student'),
        ('continuing', 'Continuing/Senior Student'),
    ]

    student = models.ForeignKey(
        Student, on_delete=models.CASCADE, related_name='registration_types'
    )
    academic_year = models.ForeignKey(
        'academics.AcademicYear', on_delete=models.CASCADE, related_name='student_registration_types'
    )
    registration_type = models.CharField(max_length=20, choices=REGISTRATION_TYPE_CHOICES)
    is_manual_override = models.BooleanField(
        default=False,
        help_text="True if an admin explicitly set this. False if it was auto-detected from payment history."
    )
    set_by = models.ForeignKey(
        'auth.User', on_delete=models.SET_NULL, null=True, blank=True,
        related_name='registration_types_set',
        help_text="Which admin set this manually. Null for auto-detected rows."
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        unique_together = ['student', 'academic_year']
        ordering = ['-created_at']

    def __str__(self):
        origin = 'manual' if self.is_manual_override else 'auto'
        return f"{self.student.student_id} - {self.academic_year} - {self.get_registration_type_display()} ({origin})"


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


import uuid
from django.utils import timezone


class PaymentLinkToken(models.Model):
    """
    One row per payment reminder sent (SMS or Email).
    The signed token embeds only `jti` — everything else (expiry, consumption,
    device binding) is authoritative in the DB, so a cryptographically valid 
    but stale or already-used token is still rejected.
    """
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)

    # ✅ Links directly to your existing Payment model (replaces Claude's billing.Invoice)
    payment = models.ForeignKey(
        "payments.Payment",
        on_delete=models.CASCADE,
        related_name="link_tokens"
    )

    parent_phone = models.CharField(max_length=20)  # E.164 format from DB — never from request
    jti = models.CharField(max_length=64, unique=True, db_index=True)
    verification_code = models.CharField(max_length=6)
    created_at = models.DateTimeField(auto_now_add=True)
    expires_at = models.DateTimeField()
    consumed_at = models.DateTimeField(null=True, blank=True)
    first_device_fingerprint = models.CharField(max_length=64, null=True, blank=True)
    first_seen_ip_prefix = models.CharField(max_length=45, null=True, blank=True)
    otp_required = models.BooleanField(default=False)
    otp_verified_at = models.DateTimeField(null=True, blank=True)
    failed_attempts = models.PositiveSmallIntegerField(default=0)
    delivery_channel = models.CharField(
        max_length=10,
        choices=[("sms", "SMS"), ("email", "Email")],
        default="sms",
        help_text="Which channel this link was sent through — determines where the OTP is delivered."
    )

    class Meta:
        indexes = [models.Index(fields=["jti"])]
        verbose_name = "Payment Link Token"
        verbose_name_plural = "Payment Link Tokens"

    def is_expired(self) -> bool:
        return timezone.now() > self.expires_at

    def is_consumed(self) -> bool:
        return self.consumed_at is not None

    def requires_otp(self, high_value_threshold) -> bool:
        return (
            self.otp_required
            or self.payment.amount >= high_value_threshold
            or self.first_device_fingerprint is None
        )

    def __str__(self):
        return f"Token for {self.payment.student.full_name} - {self.payment.amount} ETB"