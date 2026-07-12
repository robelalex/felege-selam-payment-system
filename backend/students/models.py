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