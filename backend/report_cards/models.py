# report_cards/models.py
"""
Phase 6 — Digital report cards.

One ReportCard row = one document (PDF) for one student, either for a
single term or the year's cumulative result. The numbers on it are a
FROZEN SNAPSHOT taken at generation time (see snapshot_data) — if a mark
gets corrected after a report card is released, that released PDF does
NOT silently change. Regenerating is a deliberate, explicit action.

Design decisions from the Phase 6 planning conversation:
  - Real PDF file (not a tokenized webpage like payment receipts),
    stored via the school's existing file storage (Cloudinary).
  - Both per-term AND a year-end cumulative report card are supported,
    distinguished by `report_type`.
  - Admin-gated release: generating a report card does NOT make it
    visible to parents — a separate, explicit release step does.
  - Homeroom teacher gets a free-text comment field.
  - "Signed" = an official footer naming who released it and when, plus
    a secure access token — same trust model as payments.receipt_token,
    not a scanned signature image (that can be added later as a School
    field if wanted).
"""
import uuid
from django.db import models
from django.core.validators import MinValueValidator, MaxValueValidator

from schools.models import School
from students.models import Student
from academics.models import AcademicYear
from exams.models import Term, Semester


class ReportCard(models.Model):
    REPORT_TYPE_CHOICES = [
        ('term', 'Term Report Card'),
        # ✅ Item 7 — sits between 'term' and 'cumulative'. Only ever
        # created for quarter-structure schools (School.term_structure
        # == 'quarter'); a quarter still gets its own 'term' report card
        # exactly like today, this is an additional layer on top, not a
        # replacement.
        ('semester', 'Semester Report Card'),
        ('cumulative', 'Year-End Cumulative Report Card'),
    ]
    STATUS_CHOICES = [
        ('draft', 'Draft — not visible to parents'),
        ('released', 'Released — visible to parents'),
    ]

    school = models.ForeignKey(School, on_delete=models.CASCADE, related_name='report_cards')
    academic_year = models.ForeignKey(AcademicYear, on_delete=models.CASCADE, related_name='report_cards')
    student = models.ForeignKey(Student, on_delete=models.CASCADE, related_name='report_cards')

    report_type = models.CharField(max_length=12, choices=REPORT_TYPE_CHOICES)
    # Set for 'term' report cards, null for 'cumulative' (a cumulative
    # card isn't tied to one term — it summarizes every term in the year).
    term = models.ForeignKey(
        Term, on_delete=models.CASCADE, null=True, blank=True, related_name='report_cards',
        help_text="Set for term report cards. Left blank for a year-end cumulative report card."
    )
    # ✅ Item 7 — set only for 'semester' report cards (quarter-structure
    # schools). Null for every 'term' and 'cumulative' card, same
    # optional-FK convention as `term` above.
    semester = models.ForeignKey(
        Semester, on_delete=models.CASCADE, null=True, blank=True, related_name='report_cards',
        help_text="Set for semester report cards (quarter-structure schools only). Left blank otherwise."
    )

    status = models.CharField(max_length=10, choices=STATUS_CHOICES, default='draft')

    # Denormalized at generation time — same convention as
    # SubjectTermResult/StudentTermResult, so a student moving classes
    # mid-year doesn't retroactively change a report card already made.
    grade = models.IntegerField()
    section = models.CharField(max_length=10, blank=True)
    homeroom_teacher_name = models.CharField(max_length=200, blank=True)

    # ── The frozen numbers ──────────────────────────────────────────
    overall_average = models.DecimalField(
        max_digits=5, decimal_places=2, null=True, blank=True,
        validators=[MinValueValidator(0), MaxValueValidator(100)]
    )
    is_passing = models.BooleanField(null=True, blank=True)
    letter_grade = models.CharField(max_length=5, blank=True)
    homeroom_rank = models.PositiveIntegerField(null=True, blank=True)
    homeroom_rank_total = models.PositiveIntegerField(null=True, blank=True)
    school_rank = models.PositiveIntegerField(null=True, blank=True)
    school_rank_total = models.PositiveIntegerField(null=True, blank=True)

    attendance_present_days = models.PositiveIntegerField(null=True, blank=True)
    attendance_absent_days = models.PositiveIntegerField(null=True, blank=True)
    attendance_late_days = models.PositiveIntegerField(null=True, blank=True)

    # Full per-subject breakdown (name, average, letter grade, pass/fail),
    # and for cumulative cards, the per-term breakdown that fed into the
    # cumulative average. Kept as JSON rather than more tables — this is
    # a point-in-time snapshot, never queried row-by-row, always rendered
    # as a whole document.
    snapshot_data = models.JSONField(default=dict, blank=True)

    homeroom_comment = models.TextField(
        blank=True, help_text="Homeroom teacher's free-text remark, shown on the report card."
    )
    comment_by = models.ForeignKey(
        'staff.StaffMember', on_delete=models.SET_NULL, null=True, blank=True,
        related_name='report_card_comments'
    )

    pdf_file = models.FileField(upload_to='report_cards/%Y/%m/', null=True, blank=True)

    access_token = models.UUIDField(default=uuid.uuid4, unique=True, editable=False)

    generated_at = models.DateTimeField(auto_now_add=True)
    generated_by = models.ForeignKey(
        'staff.StaffMember', on_delete=models.SET_NULL, null=True, blank=True,
        related_name='report_cards_generated'
    )
    released_at = models.DateTimeField(null=True, blank=True)
    released_by = models.ForeignKey(
        'staff.StaffMember', on_delete=models.SET_NULL, null=True, blank=True,
        related_name='report_cards_released'
    )

    class Meta:
        ordering = ['-generated_at']
        constraints = [
            # One term report card per student per term, one cumulative
            # report card per student per year. term=NULL rows (the
            # cumulative ones) are naturally exempt from the term-based
            # collision since NULL != NULL in a unique index.
            models.UniqueConstraint(
                fields=['student', 'term'],
                condition=models.Q(report_type='term'),
                name='unique_term_report_card',
            ),
            # ✅ Item 7 — one semester report card per student per
            # Semester, same pattern as the term constraint above.
            models.UniqueConstraint(
                fields=['student', 'semester'],
                condition=models.Q(report_type='semester'),
                name='unique_semester_report_card',
            ),
            models.UniqueConstraint(
                fields=['student', 'academic_year'],
                condition=models.Q(report_type='cumulative'),
                name='unique_cumulative_report_card',
            ),
        ]
        indexes = [
            models.Index(fields=['school', 'academic_year', 'grade', 'section']),
            models.Index(fields=['student', 'academic_year']),
        ]

    def __str__(self):
        if self.term:
            label = self.term.name
        elif self.semester:
            label = self.semester.name
        else:
            label = f"{self.academic_year.name} Cumulative"
        return f"{self.student} - {label} ({self.get_status_display()})"
