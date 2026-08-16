# staff/models.py
from datetime import datetime
from django.db import models
from django.contrib.auth.models import User
from django.core.validators import MinValueValidator
from schools.models import School
from students.models import Student


class StaffMember(models.Model):
    """
    The actual HR/employment record for a school employee — teacher,
    registrar, accountant, librarian, etc. This is separate from
    authentication.UserProfile.role: UserProfile controls what a *login
    account* can access in the system, while StaffMember is the underlying
    person/employment record (salary, hire date, subjects taught...).
    A StaffMember can optionally be linked to a User if they need to log in
    (e.g. a teacher marking attendance) — not every staff member needs to.
    """
    ROLE_CHOICES = [
        ('school_admin', 'School Admin'),
        ('teacher', 'Teacher'),
        ('registrar', 'Registrar'),
        ('accountant', 'Accountant / Payment Manager'),
        ('librarian', 'Librarian'),
        ('reporting_manager', 'Reporting Manager'),
        ('reminder_manager', 'Reminder Manager'),
        ('other', 'Other Staff'),
    ]
    STATUS_CHOICES = [
        ('active', 'Active'),
        ('on_leave', 'On Leave'),
        ('terminated', 'Terminated'),
    ]
    # ✅ Jimma item 5 — HR. Generic salutation set (not Ethiopian-specific
    # titles like Ato/W/ro — the school asked for the plain Mr/Mrs/Ms/Dr
    # set). Blank is allowed: this is being added to existing records via
    # migration, so nobody's data becomes invalid just because they
    # haven't set a title yet.
    SALUTATION_CHOICES = [
        ('mr', 'Mr.'),
        ('mrs', 'Mrs.'),
        ('ms', 'Ms.'),
        ('dr', 'Dr.'),
    ]

    school = models.ForeignKey(School, on_delete=models.CASCADE, related_name='staff_members')

    # Optional link to a login account. SET_NULL so deleting a user account
    # doesn't wipe out the HR record — it just disconnects portal access.
    user = models.OneToOneField(
        User, on_delete=models.SET_NULL, null=True, blank=True,
        related_name='staff_profile',
        help_text="Linked login account, if this staff member has portal/app access"
    )

    staff_id = models.CharField(
        max_length=50, unique=True, blank=True, null=True,
        help_text="Format: SCHOOLCODE-STF-YEAR-SEQUENCE (e.g., FS-STF-2024-0001). Auto-generated if left blank."
    )

    first_name = models.CharField(max_length=100)
    last_name = models.CharField(max_length=100)

    # ✅ Staff/teacher profile photo — shown on staff ID cards and directories
    photo = models.ImageField(
        upload_to='staff_photos/%Y/%m/',
        blank=True,
        null=True,
        help_text="Staff/teacher profile photo (JPG, PNG)"
    )

    salutation = models.CharField(
        max_length=10, choices=SALUTATION_CHOICES, blank=True,
        help_text="Title shown before the name (Mr./Mrs./Ms./Dr.) — optional"
    )
    role = models.CharField(max_length=30, choices=ROLE_CHOICES, default='teacher')
    phone = models.CharField(max_length=20)
    email = models.EmailField(blank=True)
    national_id = models.CharField(max_length=50, blank=True, help_text="National ID / Kebele ID number")

    hire_date = models.DateField()
    base_salary = models.DecimalField(
        max_digits=10, decimal_places=2, default=0,
        validators=[MinValueValidator(0)],
        help_text="Monthly base salary in Birr — feeds the payroll module"
    )
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default='active')

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['first_name', 'last_name']
        indexes = [
            models.Index(fields=['staff_id']),
            models.Index(fields=['role']),
            models.Index(fields=['status']),
        ]

    def __str__(self):
        return f"{self.staff_id} - {self.full_name} ({self.get_role_display()})"

    @property
    def full_name(self):
        return f"{self.first_name} {self.last_name}"

    @property
    def display_name(self):
        """Full name with salutation prefixed, e.g. 'Dr. Abebe Kebede'.
        Kept separate from full_name (used all over the codebase in log
        messages, __str__, staff_id generation context, etc.) so adding
        salutation doesn't change the meaning of existing full_name call
        sites — this is purely for UI display."""
        if self.salutation:
            return f"{self.get_salutation_display()} {self.full_name}"
        return self.full_name

    def _generate_staff_id(self):
        """Auto-generate staff ID: SCHOOLCODE-STF-YEAR-SEQUENCE, scoped per school."""
        school_code = self.school.code if self.school.code else f"S{self.school.id}"
        year = self.hire_date.year if self.hire_date else datetime.now().year
        prefix = f"{school_code}-STF-{year}-"

        last_staff = StaffMember.objects.filter(
            school=self.school,
            staff_id__startswith=prefix
        ).order_by('-staff_id').first()

        if last_staff and last_staff.staff_id:
            try:
                next_seq = int(last_staff.staff_id.split('-')[-1]) + 1
            except (ValueError, IndexError):
                next_seq = 1
        else:
            next_seq = 1

        return f"{prefix}{next_seq:04d}"

    def save(self, *args, **kwargs):
        is_new = self.pk is None
        if is_new and not self.staff_id:
            self.staff_id = self._generate_staff_id()
        super().save(*args, **kwargs)


class TeacherClassAssignment(models.Model):
    """
    Which teacher teaches which grade/section/subject.
    """
    staff = models.ForeignKey(StaffMember, on_delete=models.CASCADE, related_name='class_assignments')
    school = models.ForeignKey(School, on_delete=models.CASCADE, related_name='class_assignments')
    grade = models.IntegerField(choices=Student.GRADE_CHOICES)
    section = models.CharField(
        max_length=10, blank=True,
        help_text="e.g. 'A' — leave blank if this teacher covers the whole grade regardless of section"
    )
    # ✅ Now a real FK to academics.Subject (each school's own registered
    # subject list) instead of a free-text CharField — exactly the swap
    # this model's original docstring planned for once Subject existed.
    # Nullable at the DB level as a safety net for any pre-existing rows
    # from before this field existed (this table had zero real usage from
    # the frontend, but better safe than dropping data on migrate). The
    # API layer (serializer) still requires it for all new records.
    subject = models.ForeignKey(
        'academics.Subject', on_delete=models.CASCADE, related_name='teacher_assignments',
        null=True, blank=True,
    )
    academic_year = models.CharField(max_length=20, blank=True, help_text="e.g. '2018 E.C.'")
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['grade', 'section', 'subject__name']
        unique_together = ['staff', 'grade', 'section', 'subject', 'academic_year']

    def __str__(self):
        section_label = f" Sec {self.section}" if self.section else ""
        return f"{self.staff.full_name} - Grade {self.grade}{section_label} - {self.subject.name}"


class StaffDocument(models.Model):
    """
    ✅ Jimma item 5 — HR. Official documents on file for a staff member:
    National ID scan, teaching credential, employment contract, etc.

    document_type is deliberately a free-text CharField, not a fixed
    choices list — the school wants to define their own document types
    per upload (e.g. "Teaching License", "Degree Certificate", "Signed
    Contract 2026") rather than being boxed into 3 hardcoded categories.

    verified is a simple boolean + who/when, not a full workflow state
    machine — matches how fee overrides handle "is the document on
    file" elsewhere in this codebase (see StudentFeeOverride).
    """
    staff = models.ForeignKey(StaffMember, on_delete=models.CASCADE, related_name='documents')
    document_type = models.CharField(
        max_length=100,
        help_text="Admin-defined label, e.g. 'National ID', 'Teaching Credential', 'Employment Contract 2026'"
    )
    file = models.FileField(upload_to='staff_documents/%Y/%m/')
    original_filename = models.CharField(max_length=255, blank=True)
    notes = models.TextField(blank=True, help_text="Optional context, e.g. expiry date, issuing authority")

    uploaded_by = models.ForeignKey(
        User, on_delete=models.SET_NULL, null=True, blank=True, related_name='+'
    )
    uploaded_at = models.DateTimeField(auto_now_add=True)

    verified = models.BooleanField(default=False)
    verified_by = models.ForeignKey(
        User, on_delete=models.SET_NULL, null=True, blank=True, related_name='+'
    )
    verified_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        ordering = ['-uploaded_at']
        indexes = [
            models.Index(fields=['staff']),
        ]

    def __str__(self):
        status = "verified" if self.verified else "unverified"
        return f"{self.staff.full_name} - {self.document_type} ({status})"


class StaffCareerEvent(models.Model):
    """
    ✅ Jimma item 5 — HR. Career history: role/title/status changes over
    time, either logged automatically (see staff/signals.py, which
    compares old vs new StaffMember on every save) or added manually by
    an admin as a free-text note (e.g. "Promoted to Head Teacher —
    performance review").

    field_changed/old_value/new_value are only populated for automatic
    entries (event_type != 'note'); a manual note only fills in `note`.
    Both share one timeline so the UI can show a single chronological
    history per staff member instead of two separate lists.
    """
    EVENT_TYPE_CHOICES = [
        ('role_change', 'Role Changed'),
        ('title_change', 'Title Changed'),
        ('status_change', 'Status Changed'),
        ('salary_change', 'Salary Changed'),
        ('note', 'Note'),
    ]

    staff = models.ForeignKey(StaffMember, on_delete=models.CASCADE, related_name='career_events')
    event_type = models.CharField(max_length=20, choices=EVENT_TYPE_CHOICES)

    # Populated only for automatic (non-'note') events.
    field_changed = models.CharField(max_length=30, blank=True)
    old_value = models.CharField(max_length=255, blank=True)
    new_value = models.CharField(max_length=255, blank=True)

    note = models.TextField(blank=True)

    is_manual = models.BooleanField(default=False)
    recorded_by = models.ForeignKey(
        User, on_delete=models.SET_NULL, null=True, blank=True, related_name='+'
    )
    effective_date = models.DateField(help_text="When this change took effect")
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['-effective_date', '-created_at']
        indexes = [
            models.Index(fields=['staff']),
        ]

    def __str__(self):
        if self.event_type == 'note':
            return f"{self.staff.full_name} - note ({self.effective_date})"
        return f"{self.staff.full_name} - {self.field_changed}: {self.old_value} → {self.new_value}"
