# students/models.py
from django.db import models
from django.core.validators import MinValueValidator
from django.core.exceptions import ValidationError
from schools.models import School
import re
from datetime import datetime

# ✅ Single source of truth for the graduation threshold.
# Grades < GRADUATION_GRADE promote to grade+1.
# Grade == GRADUATION_GRADE becomes 'graduated'.
GRADUATION_GRADE = 12


class Student(models.Model):
    STATUS_CHOICES = [
        ('active', 'Active'),
        ('graduated', 'Graduated'),
        ('transferred', 'Transferred'),
        ('suspended', 'Suspended'),
    ]

    GRADE_CHOICES = [(i, f'Grade {i}') for i in range(1, 13)]  # 1-12

    student_id = models.CharField(
        max_length=50,
        unique=True,
        blank=True,
        null=True,
        help_text="Format: SCHOOLCODE-YEAR-SEQUENCE (e.g., FS-2024-1001). Auto-generated if left blank."
    )

    # ✅ Student profile photo — shown on ID cards, report cards, and parent/teacher portals
    photo = models.ImageField(
        upload_to='student_photos/%Y/%m/',
        blank=True,
        null=True,
        help_text="Student profile photo (JPG, PNG)"
    )

    school = models.ForeignKey(
        School,
        on_delete=models.CASCADE,
        related_name='students'
    )

    first_name = models.CharField(max_length=100)
    last_name = models.CharField(max_length=100)
    father_name = models.CharField(max_length=100, blank=True)
    mother_name = models.CharField(max_length=100, blank=True)

    grade = models.IntegerField(choices=GRADE_CHOICES)
    section = models.CharField(max_length=10, blank=True)
    academic_year = models.CharField(max_length=20, help_text="e.g., 2016 E.C.")

    parent_full_name = models.CharField(max_length=200)
    parent_phone = models.CharField(max_length=20)
    parent_alternative_phone = models.CharField(max_length=20, blank=True)
    parent_email = models.EmailField(blank=True)

    monthly_fee = models.DecimalField(
        max_digits=10,
        decimal_places=2,
        validators=[MinValueValidator(0)]
    )

    city = models.CharField(max_length=100, default="Jimma")
    subcity = models.CharField(max_length=100, blank=True)
    kebele = models.CharField(max_length=50, blank=True)
    house_number = models.CharField(max_length=50, blank=True)

    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default='active')

    enrollment_date = models.DateField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['grade', 'first_name']
        indexes = [
            models.Index(fields=['student_id']),
            models.Index(fields=['parent_phone']),
            models.Index(fields=['status']),
        ]

    def __str__(self):
        return f"{self.student_id} - {self.first_name} {self.last_name}"

    @property
    def full_name(self):
        return f"{self.first_name} {self.last_name}"

    @property
    def formatted_name(self):
        """
        ✅ Display name used on ID cards, report cards, receipts and lists.
        Respects the owning school's naming_convention:
          - 'ethiopian'      -> "First Name + Father Name" (standard Ethiopian
            convention; last_name is typically the grandfather's name and is
            not printed).
          - 'international'  -> "First Name + Last Name" (unchanged/default
            behavior for non-Ethiopian schools using this system).
        Falls back to full_name if father_name is missing so nothing breaks
        for existing records that predate this field.
        """
        convention = getattr(self.school, 'naming_convention', 'ethiopian')
        if convention == 'ethiopian' and self.father_name:
            return f"{self.first_name} {self.father_name}"
        return self.full_name

    @property
    def school_level(self):
        """'elementary' for grades 1-8, 'high_school' for grades 9-12"""
        return 'elementary' if self.grade <= 8 else 'high_school'

    @property
    def school_level_label(self):
        return '🏫 Elementary School' if self.grade <= 8 else '🎓 High School'

    def _format_academic_year(self, year_str):
        """Convert any format to 'YYYY E.C.' format"""
        year_str = str(year_str).strip()

        if re.match(r'^\d{4}\s+E\.C\.$', year_str):
            return year_str
        if re.match(r'^\d{4}\s+E\.C$', year_str):
            return year_str.replace('E.C', 'E.C.')
        if re.match(r'^\d{4}\s+EC$', year_str):
            return year_str.replace('EC', 'E.C.')
        if re.match(r'^\d{4}$', year_str):
            return f"{year_str} E.C."
        if re.match(r'^\d{4}\s+E\s+C$', year_str):
            return year_str.replace('E C', 'E.C.')
        if re.match(r'^\d{4}E\.C\.$', year_str):
            return f"{year_str[:4]} E.C."

        return year_str

    def _generate_student_id(self):
        """Auto-generate student ID based on school code and academic year"""
        if not self.academic_year:
            return None

        school_code = self.school.code if self.school.code else self.school.name[:2].upper()

        # Extract year from academic_year
        year_match = re.search(r'(\d{4})', self.academic_year)
        year = year_match.group(1) if year_match else str(datetime.now().year)

        # Get the next sequence number for this school and year
        last_student = Student.objects.filter(
            school=self.school,
            student_id__startswith=f"{school_code}-{year}-"
        ).order_by('-student_id').first()

        if last_student and last_student.student_id:
            try:
                last_seq = int(last_student.student_id.split('-')[-1])
                next_seq = last_seq + 1
            except (ValueError, IndexError):
                next_seq = 1
        else:
            next_seq = 1

        return f"{school_code}-{year}-{next_seq:04d}"

    def clean(self):
        """Auto-format academic_year to standard format"""
        if self.academic_year:
            self.academic_year = self._format_academic_year(self.academic_year)

    def save(self, *args, **kwargs):
        """Auto-format academic_year and auto-generate student_id ONLY for new students"""
        self.clean()

        # ✅ Check if this is a NEW student (not yet saved to database)
        is_new = self.pk is None

        if is_new:
            # Only generate ID for new students
            if not self.student_id or self.student_id == '':
                new_id = self._generate_student_id()
                if new_id:
                    self.student_id = new_id
                    print(f"✅ Generated NEW student ID: {self.student_id}")
        else:
            # For existing students, NEVER change the ID
            # Get the original ID from database before save
            original = Student.objects.get(pk=self.pk)
            if original.student_id != self.student_id:
                # Restore the original ID if it was changed
                self.student_id = original.student_id
                print(f"⚠️ Attempted to change ID from {original.student_id} to {self.student_id} - REVERTED")

        super().save(*args, **kwargs)

    def update_monthly_fee(self, new_fee):
        """Update student's monthly fee"""
        self.monthly_fee = new_fee
        self.save()
        return True


class Section(models.Model):
    """
    Admin-managed section names, scoped per school + grade.
    Student.section stays a free-text CharField (unchanged) — this model
    only controls what appears in the dropdown / what admins can add.
    """
    school = models.ForeignKey(School, on_delete=models.CASCADE, related_name='sections')
    grade = models.IntegerField(choices=Student.GRADE_CHOICES)
    name = models.CharField(max_length=1, help_text="Single letter A-Z")
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        unique_together = ['school', 'grade', 'name']
        ordering = ['grade', 'name']

    def __str__(self):
        return f"{self.school.name} - Grade {self.grade} - Section {self.name}"

    def clean(self):
        if self.name:
            self.name = self.name.strip().upper()
            if not re.match(r'^[A-Z]$', self.name):
                raise ValidationError({'name': 'Section name must be a single letter A-Z.'})

    def save(self, *args, **kwargs):
        self.clean()
        super().save(*args, **kwargs)


class StudentDocument(models.Model):
    """
    ✅ Enrollment documents — birth certificate for new Grade 1 entrants,
    grade 6/8 leaving (completion) certificates required by the Ethiopian
    system at those transition points, general transfer certificates
    for students joining from another school, and yearly educational
    documents (e.g. a promotion/report-card style record for the year,
    or a document that needs re-submitting after the student passes to
    the next grade).

    Kept as a generic document_type + file model (rather than separate
    fixed fields on Student) so new document types can be added later
    without another migration, and so a student can hold more than one
    document (e.g. both a grade 8 leaving certificate AND a transfer
    certificate).
    """
    DOCUMENT_TYPE_CHOICES = [
        ('birth_certificate', 'Birth Certificate'),
        ('leaving_certificate_grade6', 'Grade 6 Leaving Certificate'),
        ('leaving_certificate_grade8', 'Grade 8 Leaving Certificate'),
        ('transfer_certificate', 'Transfer Certificate'),
        ('grade12_certificate', 'Grade 12 Certificate'),
        # ✅ NEW: yearly educational document (report card / promotion
        # record / any document that needs re-submitting after the
        # student passes to the next grade) — tagged with academic_year
        # below so this year's copy is tracked separately from last
        # year's, instead of one upload silently standing in for every
        # year.
        ('educational_document', 'Educational Document (Yearly)'),
        ('other', 'Other'),
    ]

    # ✅ NEW: pending/verified/rejected — the admin-review workflow
    # requested alongside document uploads. `verified` (below) is kept
    # as-is for backward compatibility with any existing code/UI that
    # reads it directly, and is kept in sync with this: True only when
    # status == 'verified'. New code (the review action, the parent-
    # facing rejection notice) should read/write `status`, not
    # `verified`, directly.
    STATUS_CHOICES = [
        ('pending', 'Pending Review'),
        ('verified', 'Verified'),
        ('rejected', 'Rejected'),
    ]

    student = models.ForeignKey(
        Student,
        on_delete=models.CASCADE,
        related_name='documents'
    )
    document_type = models.CharField(max_length=40, choices=DOCUMENT_TYPE_CHOICES)
    # ✅ NEW: only meaningful for document_type='other' (or to add a
    # specific note to 'educational_document') — lets an admin's manual
    # request, or a parent's "other" upload, carry a plain-language label
    # like "Kebele ID letter" instead of just "Other".
    custom_label = models.CharField(max_length=100, blank=True)
    # ✅ NEW: which academic year this document belongs to. Nullable so
    # existing rows (uploaded before this field existed) aren't broken.
    # Set automatically to the student's current academic year at
    # upload time for anything uploaded from now on.
    academic_year = models.ForeignKey(
        'academics.AcademicYear',
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='student_documents'
    )
    file = models.FileField(
        upload_to='student_documents/%Y/%m/',
        help_text="Scanned copy or photo of the document (PDF, JPG, PNG)"
    )
    # ✅ Registrar can mark a document as verified once the physical/original
    # copy has been checked — useful for inspection/audit readiness, which
    # regional education bureaus do check for this exact set of documents.
    verified = models.BooleanField(default=False)
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default='pending')
    # ✅ NEW: why a document was rejected (or any reviewer comment) —
    # shown to the parent so a rejected upload isn't a dead end with no
    # explanation.
    review_note = models.CharField(max_length=255, blank=True)
    reviewed_at = models.DateTimeField(null=True, blank=True)
    notes = models.CharField(max_length=255, blank=True)
    uploaded_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['-uploaded_at']
        indexes = [
            models.Index(fields=['student', 'document_type']),
        ]

    def __str__(self):
        return f"{self.student.student_id or self.student.full_name} - {self.get_document_type_display()}"


class RequiredDocumentRequest(models.Model):
    """
    ✅ NEW: lets an admin manually flag that a SPECIFIC student needs to
    submit a document beyond whatever the grade-based rule
    (RECOMMENDED_DOC_TYPES_BY_GRADE in students/views.py) already
    covers — e.g. a birth certificate that turned out to be blurry, a
    one-off letter from the kebele, or an educational document for a
    student who transferred mid-year. Shows up on the parent dashboard's
    "Finish Registration" checklist exactly like the automatic
    requirements do, so nothing needs a separate admin-only page for the
    parent to see it.

    A request is considered fulfilled once a matching StudentDocument
    exists for a named type (birth_certificate, leaving_certificate_*,
    etc.); for 'other' — where the label is free text and multiple
    unrelated "other" uploads could exist — the admin marks it resolved
    manually instead of relying on an automatic match.
    """
    student = models.ForeignKey(
        Student,
        on_delete=models.CASCADE,
        related_name='document_requests'
    )
    document_type = models.CharField(max_length=40, choices=StudentDocument.DOCUMENT_TYPE_CHOICES)
    custom_label = models.CharField(
        max_length=100, blank=True,
        help_text="Required when document_type is 'other' — e.g. 'Kebele ID letter'"
    )
    note = models.CharField(
        max_length=255, blank=True,
        help_text="Shown to the parent — why this document is needed"
    )
    requested_by = models.CharField(max_length=150, blank=True)
    is_resolved = models.BooleanField(default=False)
    created_at = models.DateTimeField(auto_now_add=True)
    resolved_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        ordering = ['-created_at']

    def __str__(self):
        label = self.custom_label or self.get_document_type_display()
        return f"{self.student.student_id or self.student.full_name} — {label}"