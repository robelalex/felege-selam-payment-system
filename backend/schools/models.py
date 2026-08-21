from django.db import models
from django.core.validators import MinValueValidator, MaxValueValidator

class School(models.Model):
    name = models.CharField(max_length=200)
    code = models.CharField(max_length=20, unique=True, help_text="e.g., FS for Felege Selam")
    address = models.TextField()
    phone = models.CharField(max_length=20)
    email = models.EmailField(blank=True)

    # ✅ Jimma item 6 — School location. `address` above stays exactly as
    # it was (free-text, already used on report cards / old admin_dashboard
    # templates) — these are additive fields, not a replacement.
    # region/city are separate free-text fields rather than folded into
    # `address` so they can be filtered/searched on later (e.g. a future
    # "schools in Jimma zone" list) without parsing free text.
    region = models.CharField(
        max_length=100, blank=True,
        help_text="e.g. Oromia, Addis Ababa",
    )
    city = models.CharField(
        max_length=100, blank=True,
        help_text="e.g. Jimma",
    )
    # Nullable: not every school will have GPS coordinates immediately.
    # 6 decimal places is ~11cm precision at the equator — far more than
    # needed here, but it's the conventional default for lat/long and
    # costs nothing.
    latitude = models.DecimalField(
        max_digits=9, decimal_places=6, null=True, blank=True,
        validators=[MinValueValidator(-90), MaxValueValidator(90)],
        help_text="GPS latitude, optional",
    )
    longitude = models.DecimalField(
        max_digits=9, decimal_places=6, null=True, blank=True,
        validators=[MinValueValidator(-180), MaxValueValidator(180)],
        help_text="GPS longitude, optional",
    )
    # Future-proofing only — nothing reads this field yet. There is
    # currently no endpoint that exposes School data to anyone other than
    # a super admin or that school's own authenticated staff (SchoolViewSet
    # requires IsAuthenticated and scopes non-super-admins to their own
    # school in get_queryset()), so location data is already internal-only
    # by construction. This flag exists so that IF a public-facing school
    # page/directory is ever built, it has an explicit switch to check —
    # defaulting to False means such a feature is hidden-by-default rather
    # than accidentally public. Do not flip the default without confirming
    # with the developer first (Jimma's explicit instruction).
    location_public = models.BooleanField(
        default=False,
        help_text=(
            "Whether region/city/coordinates may be shown outside this "
            "school's own admin/staff and super admins. Not currently used "
            "by any endpoint — reserved for a future public-facing feature. "
            "Leave False unless specifically told to enable a public page."
        ),
    )

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
        help_text=(
            "Letter grade boundaries, e.g. [{'min': 90, 'max': 100, 'grade': 'A', "
            "'is_passing': true}, ...]. The 'is_passing' flag on each band is what "
            "Phase 4 pass/fail uses when grading_system is 'letter_grade' — schools "
            "mark which bands count as a pass (e.g. F is not passing). Ignored if "
            "grading_system is 'percentage'."
        ),
    )

    # ✅ Phase 4 — Pass/fail threshold. Pass/fail is decided differently
    # depending on grading_system:
    #   - 'percentage' -> a student passes a subject/term if their average
    #     percentage is >= pass_mark.
    #   - 'letter_grade' -> pass/fail comes from the 'is_passing' flag on
    #     the matching band in grade_scale instead; pass_mark is ignored.
    #   - 'both' -> pass_mark is used (percentage is always computed even
    #     when a letter grade is also shown), so behavior matches
    #     'percentage' rather than 'letter_grade'.
    pass_mark = models.DecimalField(
        max_digits=5, decimal_places=2, default=50,
        validators=[MinValueValidator(0), MaxValueValidator(100)],
        help_text="Minimum percentage to pass a subject/term. Used when grading_system is 'percentage' or 'both'; ignored for 'letter_grade'.",
    )

    # ✅ Item 7 — term structure. Same pattern as grading_system: a
    # school-level choice that changes how results/report cards behave,
    # not a data-model change for the common case. 'semester' (default)
    # is today's behavior exactly as it's always worked — a school just
    # defines its own exams.Term rows (2 semesters, 3 trimesters,
    # whatever) with no grouping above them. 'quarter' means the school
    # uses 4 exams.Term rows per year that get paired into two
    # exams.Semester rows (Q1+Q2 -> Semester 1, Q3+Q4 -> Semester 2),
    # which unlocks semester-level results/rank/report cards on top of
    # the existing term-level ones. This field only toggles which
    # screens/controls show up (quarter/semester grouping UI) and which
    # extra result tables get populated — it never changes how a
    # 'semester' school's existing Term/AssessmentType/Mark data works.
    TERM_STRUCTURE_CHOICES = [
        ('semester', 'Semesters only (no quarters)'),
        ('quarter', 'Quarters grouped into semesters'),
    ]
    term_structure = models.CharField(
        max_length=20,
        choices=TERM_STRUCTURE_CHOICES,
        default='semester',
        help_text=(
            "'semester' = this school's Terms are used as-is, ungrouped (today's "
            "behavior — 2 semesters, 3 trimesters, etc). 'quarter' = this school's "
            "4 Terms are grouped in pairs into 2 Semesters, unlocking semester-level "
            "results, ranking and report cards. Should be locked once the current "
            "academic year already has Terms set up — switching mid-year is not "
            "supported."
        ),
    )
    
    # ✅ Add logo field
    logo = models.ImageField(upload_to='school_logos/', blank=True, null=True, help_text="School logo (JPG, PNG)")

    # ✅ Report card branding — director/principal's signature and the
    # school's official stamp/seal, printed on report card PDFs near the
    # bottom signature line. Same upload pattern as `logo` above (single
    # image, uploaded once from School Settings, reused on every report
    # card generated afterward). Optional — a school that hasn't uploaded
    # either yet still gets a report card, just with a blank signature
    # line / stamp box instead of an image.
    director_signature = models.ImageField(
        upload_to='school_signatures/', blank=True, null=True,
        help_text="Director/principal's signature image, printed on report cards (JPG, PNG)."
    )
    school_stamp = models.ImageField(
        upload_to='school_stamps/', blank=True, null=True,
        help_text="Official school stamp/seal image, printed on report cards (JPG, PNG)."
    )

    # ✅ Naming convention — controls how Student.formatted_name is composed
    # everywhere it's used (ID cards, report cards, receipts, lists), without
    # touching how first_name/father_name/last_name are stored. Ethiopian
    # schools print "First Name + Father Name"; international schools using
    # this system print "First Name + Last Name" instead.
    NAMING_CONVENTION_CHOICES = [
        ('ethiopian', 'Ethiopian (First Name + Father Name)'),
        ('international', 'International (First Name + Last Name)'),
    ]
    naming_convention = models.CharField(
        max_length=20,
        choices=NAMING_CONVENTION_CHOICES,
        default='ethiopian',
        help_text="How student names are displayed/printed on ID cards, report cards and receipts.",
    )
    
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

    # ✅ NEW — Platform billing enforcement. Matches the Service Agreement:
    # a school is only ever locked out of the SCHOOL-ADMIN/STAFF/TEACHER
    # side of the platform (not deleted, not touched for parents) — and
    # only after subscription_expiry plus this grace period has fully
    # passed. See authentication/views.py:admin_login_step1 for where
    # this is enforced.
    GRACE_PERIOD_DAYS = 7

    @property
    def is_access_suspended(self):
        """
        True when school_admin/staff/teacher logins for this school should
        be blocked. Deliberately narrow: 'suspended'/'rejected' status
        blocks immediately (a platform-owner decision), but an expired
        subscription_expiry only blocks after GRACE_PERIOD_DAYS — matching
        Section 4 of the Service Agreement ("grace period of 7 days...
        before any access is limited").
        """
        from django.utils import timezone
        if self.subscription_status in ('suspended', 'rejected'):
            return True
        if self.subscription_expiry:
            days_overdue = (timezone.now().date() - self.subscription_expiry).days
            if days_overdue > self.GRACE_PERIOD_DAYS:
                return True
        return False

    @property
    def days_until_access_suspended(self):
        """
        None if not applicable/already suspended, else how many days of
        grace period remain — used to show an admin a warning before
        they're actually locked out.
        """
        from django.utils import timezone
        if self.is_access_suspended or not self.subscription_expiry:
            return None
        days_overdue = (timezone.now().date() - self.subscription_expiry).days
        if days_overdue < 0:
            return None  # not even expired yet
        return max(0, self.GRACE_PERIOD_DAYS - days_overdue)

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
    
    def is_passing_score(self, percentage):
        """
        Single source of truth for 'did this percentage pass', respecting
        this school's grading_system:
          - percentage / both -> compare against pass_mark
          - letter_grade      -> find the matching band in grade_scale and
            use its 'is_passing' flag (defaults to True if the band exists
            but the flag wasn't set, so old grade_scale data without the
            flag doesn't silently start failing everyone)
        Returns None if percentage is None, or if grading_system is
        'letter_grade' but no matching band is found in grade_scale.
        """
        if percentage is None:
            return None

        if self.grading_system == 'letter_grade':
            for band in self.grade_scale or []:
                try:
                    if band['min'] <= percentage <= band['max']:
                        return bool(band.get('is_passing', True))
                except (KeyError, TypeError):
                    continue
            return None

        return percentage >= self.pass_mark

    def letter_grade_for(self, percentage):
        """
        Companion to is_passing_score() — returns the 'grade' string (e.g.
        'A', 'B') from the matching grade_scale band for this percentage,
        or '' if grading_system is 'percentage' (no letters configured) or
        no band matches. Used by Phase 4 results to fill in
        StudentTermResult.letter_grade when the school shows letters.
        """
        if percentage is None or self.grading_system not in ('letter_grade', 'both'):
            return ''
        for band in self.grade_scale or []:
            try:
                if band['min'] <= percentage <= band['max']:
                    return band.get('grade', '')
            except (KeyError, TypeError):
                continue
        return ''

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
# ── Multiple bank accounts (Phase 7 addition) ─────────────────────────────
from .bank_account_models import SchoolBankAccount  # noqa: F401


# ========== PlatformPayment ==========
# ✅ NEW — this is Robel's own business billing (a school paying HIM for
# the platform subscription), completely separate from that school's
# parents paying school fees (payments.models.Payment). Gives the Super
# Admin dashboard a real record of what a school has paid the platform
# and when, instead of subscription_expiry being edited with no history.
class PlatformPayment(models.Model):
    METHOD_CHOICES = [
        ('chapa', 'Chapa (online)'),
        ('bank_transfer', 'Bank Transfer'),
        ('cash', 'Cash'),
        ('other', 'Other'),
    ]
    school = models.ForeignKey(School, on_delete=models.CASCADE, related_name='platform_payments')
    amount = models.DecimalField(max_digits=12, decimal_places=2)
    method = models.CharField(max_length=20, choices=METHOD_CHOICES, default='bank_transfer')
    period_months = models.PositiveIntegerField(
        default=1, help_text="How many months of access this payment covers"
    )
    paid_on = models.DateField(help_text="Date the school actually paid")
    note = models.CharField(max_length=255, blank=True)
    recorded_by = models.ForeignKey(
        'auth.User', on_delete=models.SET_NULL, null=True, blank=True,
        related_name='platform_payments_recorded',
    )
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['-paid_on', '-created_at']

    def __str__(self):
        return f"{self.school.name} — {self.amount} ETB ({self.paid_on})"
