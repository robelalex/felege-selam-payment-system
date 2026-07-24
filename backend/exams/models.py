# exams/models.py
#
# Phase 2: marks entry (by subject teachers) + daily attendance (by
# homeroom teachers) + the homeroom accept/reject workflow.
#
# Nothing here is hardcoded: every school defines its own assessment
# types (Mid Term, Final, Quiz 1, Homework...) with its own max scores,
# exactly like Subject in the academics app.

from django.db import models
from django.core.validators import MinValueValidator, MaxValueValidator
from schools.models import School
from academics.models import AcademicYear, Subject


class Term(models.Model):
    """
    A grading period within an academic year — Semester 1, Semester 2,
    Trimester 1/2/3, whatever a school actually uses. Each school defines
    its own terms per academic year — nothing hardcoded, since schools
    split their year differently (some do 2 semesters, some do 3 terms).
    Assessment types (Mid Term, Final, Quiz...) belong to a term, so
    marks can be grouped and totaled per-term instead of dumped into one
    flat list for the whole year.
    """
    school = models.ForeignKey(School, on_delete=models.CASCADE, related_name='terms')
    academic_year = models.ForeignKey(AcademicYear, on_delete=models.CASCADE, related_name='terms')
    name = models.CharField(max_length=50, help_text="e.g., Semester 1, Semester 2, Trimester 1")
    order = models.IntegerField(default=0, help_text="Controls display order — 1st term, 2nd term...")
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['order', 'name']
        unique_together = ['school', 'academic_year', 'name']

    def __str__(self):
        return f"{self.name} ({self.academic_year.name}) - {self.school.name}"


class AssessmentType(models.Model):
    """
    A gradable event a school defines for itself — 'Mid Term Exam',
    'Final Exam', 'Quiz 1', 'Homework 3'... Each school (and each
    academic year) sets its own list and its own max score per item,
    since this varies a lot school to school.
    """
    school = models.ForeignKey(School, on_delete=models.CASCADE, related_name='assessment_types')
    academic_year = models.ForeignKey(AcademicYear, on_delete=models.CASCADE, related_name='assessment_types')
    # ✅ Nullable for backward compatibility — assessment types created
    # before Term existed (e.g. "Assignment", "Quiz" from earlier testing)
    # keep working ungrouped rather than breaking. New ones should always
    # set this from the admin UI going forward.
    term = models.ForeignKey(
        Term, on_delete=models.CASCADE, related_name='assessment_types',
        null=True, blank=True,
        help_text="Which term this belongs to, e.g. Semester 1"
    )
    name = models.CharField(max_length=100, help_text="e.g., Mid Term Exam, Final Exam, Quiz 1")
    max_score = models.DecimalField(
        max_digits=6, decimal_places=2, default=100,
        validators=[MinValueValidator(1)],
        help_text="The score this assessment is out of, e.g. 100 or 50"
    )
    weight_percent = models.DecimalField(
        max_digits=5, decimal_places=2, null=True, blank=True,
        validators=[MinValueValidator(0), MaxValueValidator(100)],
        help_text="Optional — how much this counts toward the final grade (e.g. Final Exam = 40%). Leave blank if not using weighted grading yet."
    )
    order = models.IntegerField(default=0, help_text="Controls display order")
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['order', 'name']
        unique_together = ['school', 'academic_year', 'name']

    def __str__(self):
        return f"{self.name} ({self.academic_year.name}) - {self.school.name}"


class Mark(models.Model):
    """
    One student's score for one subject, for one assessment. Entered by
    the subject teacher assigned to that subject/grade/section.

    Edit rights, in order:
      draft/rejected  -> the subject teacher (entered_by) can edit
      submitted       -> locked, waiting on the homeroom teacher
      accepted        -> locked for the subject teacher; only the
                          homeroom teacher (or admin) can correct it
                          from here, since they now own the class record
    """
    STATUS_CHOICES = [
        ('draft', 'Draft'),
        ('submitted', 'Submitted — awaiting homeroom review'),
        ('accepted', 'Accepted by homeroom'),
        ('rejected', 'Sent back by homeroom'),
    ]

    school = models.ForeignKey(School, on_delete=models.CASCADE, related_name='marks')
    academic_year = models.ForeignKey(AcademicYear, on_delete=models.CASCADE, related_name='marks')
    student = models.ForeignKey('students.Student', on_delete=models.CASCADE, related_name='marks')
    subject = models.ForeignKey(Subject, on_delete=models.CASCADE, related_name='marks')
    assessment_type = models.ForeignKey(AssessmentType, on_delete=models.CASCADE, related_name='marks')

    # Denormalized at entry time so a mid-year grade/section change on the
    # Student record doesn't retroactively move historical marks around.
    # CharField (not a FK) to match how Student.section and
    # TeacherClassAssignment.section already store it — e.g. "A".
    grade = models.IntegerField()
    section = models.CharField(max_length=10, blank=True)

    score = models.DecimalField(
        max_digits=6, decimal_places=2, null=True, blank=True,
        validators=[MinValueValidator(0)],
        help_text="Null until the subject teacher enters it"
    )

    entered_by = models.ForeignKey(
        'staff.StaffMember', on_delete=models.SET_NULL, null=True, related_name='marks_entered',
        limit_choices_to={'role': 'teacher'}
    )
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default='draft')

    reviewed_by = models.ForeignKey(
        'staff.StaffMember', on_delete=models.SET_NULL, null=True, blank=True, related_name='marks_reviewed',
        help_text="The homeroom teacher who accepted/rejected this"
    )
    reviewed_at = models.DateTimeField(null=True, blank=True)
    homeroom_note = models.TextField(blank=True, help_text="Optional note from homeroom, e.g. why a mark was sent back")

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['student__first_name', 'subject__name']
        unique_together = ['student', 'subject', 'assessment_type']
        indexes = [
            models.Index(fields=['school', 'academic_year', 'grade', 'section']),
            models.Index(fields=['subject', 'assessment_type', 'status']),
        ]

    def __str__(self):
        return f"{self.student} - {self.subject.name} - {self.assessment_type.name}: {self.score}"


class DailyAttendance(models.Model):
    """
    One student's attendance for one day. Entered by the homeroom
    teacher for their own grade+section — daily attendance is a
    homeroom responsibility, not a per-subject one.
    """
    STATUS_CHOICES = [
        ('present', 'Present'),
        ('absent', 'Absent'),
        ('late', 'Late'),
        ('excused', 'Excused'),
    ]

    school = models.ForeignKey(School, on_delete=models.CASCADE, related_name='attendance_records')
    academic_year = models.ForeignKey(AcademicYear, on_delete=models.CASCADE, related_name='attendance_records')
    student = models.ForeignKey('students.Student', on_delete=models.CASCADE, related_name='attendance_records')
    grade = models.IntegerField()
    section = models.CharField(max_length=10, blank=True)

    date = models.DateField()
    status = models.CharField(max_length=10, choices=STATUS_CHOICES, default='present')

    recorded_by = models.ForeignKey(
        'staff.StaffMember', on_delete=models.SET_NULL, null=True, related_name='attendance_recorded',
        limit_choices_to={'role': 'teacher'}
    )

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['-date', 'student__first_name']
        unique_together = ['student', 'date']
        indexes = [
            models.Index(fields=['school', 'academic_year', 'grade', 'section', 'date']),
        ]

    def __str__(self):
        return f"{self.student} - {self.date} - {self.get_status_display()}"


class SubjectAttendance(models.Model):
    """
    One student's attendance for one SUBJECT PERIOD on one day — 'was
    this student in today's Math class' — entered by the subject teacher.

    Deliberately a separate model from DailyAttendance (homeroom's daily
    attendance = 'was this student in school today at all'). They answer
    different questions and are owned by different people, so they don't
    share a table — a student can be marked present for homeroom but
    absent from a specific period, or vice versa.
    """
    STATUS_CHOICES = [
        ('present', 'Present'),
        ('absent', 'Absent'),
        ('late', 'Late'),
        ('excused', 'Excused'),
    ]

    school = models.ForeignKey(School, on_delete=models.CASCADE, related_name='subject_attendance_records')
    academic_year = models.ForeignKey(AcademicYear, on_delete=models.CASCADE, related_name='subject_attendance_records')
    student = models.ForeignKey('students.Student', on_delete=models.CASCADE, related_name='subject_attendance_records')
    subject = models.ForeignKey(Subject, on_delete=models.CASCADE, related_name='attendance_records')
    grade = models.IntegerField()
    section = models.CharField(max_length=10, blank=True)

    date = models.DateField()
    status = models.CharField(max_length=10, choices=STATUS_CHOICES, default='present')

    recorded_by = models.ForeignKey(
        'staff.StaffMember', on_delete=models.SET_NULL, null=True, related_name='subject_attendance_recorded',
        limit_choices_to={'role': 'teacher'}
    )

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['-date', 'student__first_name']
        unique_together = ['student', 'subject', 'date']
        indexes = [
            models.Index(fields=['school', 'academic_year', 'subject', 'grade', 'section', 'date']),
        ]

    def __str__(self):
        return f"{self.student} - {self.subject.name} - {self.date} - {self.get_status_display()}"
