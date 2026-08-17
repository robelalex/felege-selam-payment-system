# report_cards/services/generation_service.py
#
# Phase 6 (continued) — the piece that actually creates/updates a
# ReportCard row: builds the frozen snapshot from already-computed
# exams data (or from cumulative_service for year-end cards), renders
# the PDF, and saves both together. Generating is idempotent per
# student+term (or student+year for cumulative) — regenerating replaces
# the snapshot and PDF on the SAME row rather than creating a duplicate,
# since the model's unique constraints only allow one of each anyway.
#
# Generating does NOT release. A freshly generated/regenerated report
# card is always left in (or reset to) 'draft' status — release is a
# separate, explicit admin action (release_report_card below), same
# design decision noted in models.py.
from django.utils import timezone
from django.db import transaction

from exams.models import StudentTermResult, SubjectTermResult, StudentSemesterResult, SubjectSemesterResult, DailyAttendance
from academics.models import HomeroomAssignment
from students.models import Student

from .cumulative_service import compute_cumulative_for_student, compute_cumulative_school_ranks
from .pdf_service import render_report_card_pdf
from ..models import ReportCard


def _homeroom_teacher_name(school, academic_year, grade, section):
    assignment = HomeroomAssignment.objects.filter(
        school=school, academic_year=academic_year, grade=grade, section__name=section,
    ).select_related('teacher').first()
    return assignment.teacher.full_name if assignment else ''


def _attendance_summary(student, academic_year):
    """
    Year-to-date attendance counts. Returns (None, None, None) when no
    attendance has been recorded at all — so the report card shows "—"
    rather than "2 present · 0 absent · 0 late" which confuses parents
    into thinking the school only tracked 2 days.
    """
    qs = DailyAttendance.objects.filter(student=student, academic_year=academic_year)
    total = qs.count()
    if total == 0:
        return None, None, None
    present = qs.filter(status='present').count()
    absent = qs.filter(status='absent').count()
    late = qs.filter(status='late').count()
    return present, absent, late


def _build_term_snapshot(student, term, school):
    subject_results = (
        SubjectTermResult.objects.filter(student=student, term=term)
        .select_related('subject')
        .exclude(average_percentage__isnull=True)
        .order_by('subject__name')
    )
    subjects = []
    for sr in subject_results:
        subjects.append({
            'subject_name': sr.subject.name,
            'average_percentage': float(sr.average_percentage) if sr.average_percentage is not None else None,
            'letter_grade': school.letter_grade_for(sr.average_percentage),
            'is_passing': sr.is_passing,
        })
    return {'subjects': subjects, 'term_name': term.name}


def generate_term_report_card(student, term, generated_by=None):
    """
    Snapshots the student's ALREADY-COMPUTED StudentTermResult/
    SubjectTermResult rows for this term (computed by exams.results_service,
    triggered from homeroom_accept or a manual recalculate — nothing here
    (re)computes results). Raises ValueError if no StudentTermResult
    exists yet for this student/term — nothing to snapshot.
    """
    result = StudentTermResult.objects.filter(student=student, term=term).select_related('term').first()
    if not result:
        raise ValueError(
            f"No results have been computed yet for {student} in {term.name}. "
            "Marks must be accepted (or recalculated) before a report card can be generated."
        )

    school = result.school
    present, absent, late = _attendance_summary(student, result.academic_year)
    homeroom_name = _homeroom_teacher_name(school, result.academic_year, result.grade, result.section)
    snapshot = _build_term_snapshot(student, term, school)

    with transaction.atomic():
        report_card, _created = ReportCard.objects.update_or_create(
            student=student, term=term, report_type='term',
            defaults={
                'school': school,
                'academic_year': result.academic_year,
                'status': 'draft',
                'grade': result.grade,
                'section': result.section,
                'homeroom_teacher_name': homeroom_name,
                'overall_average': result.overall_average,
                'is_passing': result.is_passing,
                'letter_grade': result.letter_grade,
                'homeroom_rank': result.homeroom_rank,
                'homeroom_rank_total': result.homeroom_rank_total,
                'school_rank': result.school_rank,
                'school_rank_total': result.school_rank_total,
                'attendance_present_days': present,
                'attendance_absent_days': absent,
                'attendance_late_days': late,
                'snapshot_data': snapshot,
                'generated_by': generated_by,
                'released_at': None,
                'released_by': None,
            },
        )
        report_card.pdf_file = render_report_card_pdf(report_card)
        report_card.save()

    return report_card


def _build_semester_snapshot(student, semester, school):
    subject_results = (
        SubjectSemesterResult.objects.filter(student=student, semester=semester)
        .select_related('subject')
        .exclude(average_percentage__isnull=True)
        .order_by('subject__name')
    )
    subjects = []
    for sr in subject_results:
        subjects.append({
            'subject_name': sr.subject.name,
            'average_percentage': float(sr.average_percentage) if sr.average_percentage is not None else None,
            'letter_grade': school.letter_grade_for(sr.average_percentage),
            'is_passing': sr.is_passing,
        })
    return {'subjects': subjects, 'term_name': semester.name}


def generate_semester_report_card(student, semester, generated_by=None):
    """
    Item 7 — snapshots the student's already-computed StudentSemesterResult/
    SubjectSemesterResult rows for this Semester (computed by
    results_service.recompute_for_semester, kept in sync automatically
    whenever either child term's results change). Mirrors
    generate_term_report_card exactly, one level up. Raises ValueError if
    no StudentSemesterResult exists yet — nothing to snapshot.
    """
    result = StudentSemesterResult.objects.filter(student=student, semester=semester).select_related('semester').first()
    if not result:
        raise ValueError(
            f"No results have been computed yet for {student} in {semester.name}. "
            "Both quarters' marks must be accepted (or recalculated) before a semester report card can be generated."
        )

    school = result.school
    present, absent, late = _attendance_summary(student, result.academic_year)
    homeroom_name = _homeroom_teacher_name(school, result.academic_year, result.grade, result.section)
    snapshot = _build_semester_snapshot(student, semester, school)

    with transaction.atomic():
        report_card, _created = ReportCard.objects.update_or_create(
            student=student, semester=semester, report_type='semester',
            defaults={
                'school': school,
                'academic_year': result.academic_year,
                'term': None,
                'status': 'draft',
                'grade': result.grade,
                'section': result.section,
                'homeroom_teacher_name': homeroom_name,
                'overall_average': result.overall_average,
                'is_passing': result.is_passing,
                'letter_grade': result.letter_grade,
                'homeroom_rank': result.homeroom_rank,
                'homeroom_rank_total': result.homeroom_rank_total,
                'school_rank': result.school_rank,
                'school_rank_total': result.school_rank_total,
                'attendance_present_days': present,
                'attendance_absent_days': absent,
                'attendance_late_days': late,
                'snapshot_data': snapshot,
                'generated_by': generated_by,
                'released_at': None,
                'released_by': None,
            },
        )
        report_card.pdf_file = render_report_card_pdf(report_card)
        report_card.save()

    return report_card


def generate_cumulative_report_card(student, academic_year, generated_by=None):
    """
    Year-end cumulative report card — uses cumulative_service (Phase 6's
    year-average calculation over every term), not any single term's
    StudentTermResult row.
    """
    cumulative = compute_cumulative_for_student(student, academic_year)
    if cumulative['overall_average'] is None:
        raise ValueError(
            f"No term results exist yet for {student} in {academic_year.name}. "
            "At least one term must have computed results before a cumulative report card can be generated."
        )

    school = academic_year.school
    is_elementary = student.grade <= StudentTermResult.ELEMENTARY_MAX_GRADE
    school_ranks = compute_cumulative_school_ranks(school, academic_year, is_elementary)
    school_rank, school_rank_total = school_ranks.get(student.id, (None, None))

    present, absent, late = _attendance_summary(student, academic_year)
    homeroom_name = _homeroom_teacher_name(school, academic_year, student.grade, student.section)

    # Collect term names in CORRECT chronological order (Term.order field),
    # not alphabetical — alphabetical puts "Semester 10" before "Semester 2".
    # We query the actual Term rows to get their declared order.
    from exams.models import Term as TermModel
    year_terms = list(
        TermModel.objects.filter(school=school, academic_year=academic_year, is_active=True)
        .order_by('order', 'name')
        .values_list('name', flat=True)
    )
    # Only keep terms that actually appear in this student's subject data.
    subject_term_names = {tn for subj in cumulative['subjects'] for tn in subj['per_term'].keys()}
    ordered_term_names = [t for t in year_terms if t in subject_term_names]
    # Safety: any term in data that isn't in the school's term list (edge case)
    # goes at the end, in alphabetical order.
    extras = sorted(subject_term_names - set(ordered_term_names))
    term_names = ordered_term_names + extras

    snapshot = {'subjects': cumulative['subjects'], 'term_names': term_names}

    # Homeroom rank among the student's own class, using the same
    # class-level cumulative computation the admin/teacher screens use,
    # so the rank on the PDF always matches what's shown on screen.
    from .cumulative_service import compute_cumulative_for_class
    class_results = compute_cumulative_for_class(school, academic_year, student.grade, student.section)
    class_entry = class_results.get(student.id, {})

    with transaction.atomic():
        report_card, _created = ReportCard.objects.update_or_create(
            student=student, academic_year=academic_year, report_type='cumulative',
            defaults={
                'school': school,
                'term': None,
                'status': 'draft',
                'grade': student.grade,
                'section': student.section,
                'homeroom_teacher_name': homeroom_name,
                'overall_average': float(cumulative['overall_average']) if cumulative['overall_average'] is not None else None,
                'is_passing': cumulative['is_passing'],
                'letter_grade': cumulative['letter_grade'],
                'homeroom_rank': class_entry.get('homeroom_rank'),
                'homeroom_rank_total': class_entry.get('homeroom_rank_total'),
                'school_rank': school_rank,
                'school_rank_total': school_rank_total,
                'attendance_present_days': present,
                'attendance_absent_days': absent,
                'attendance_late_days': late,
                'snapshot_data': snapshot,
                'generated_by': generated_by,
                'released_at': None,
                'released_by': None,
            },
        )
        report_card.pdf_file = render_report_card_pdf(report_card)
        report_card.save()

    return report_card


def generate_for_class(school, academic_year, grade, section, report_type, term=None, semester=None, generated_by=None):
    """
    Generates (or regenerates) report cards for every active student in
    one homeroom class at once. Returns (successes: list[ReportCard],
    failures: list[{'student_id', 'student_name', 'error'}]) — a class
    with one student who has no results yet shouldn't block the other
    29 from getting theirs.
    """
    if report_type not in ('term', 'semester', 'cumulative'):
        raise ValueError("report_type must be 'term', 'semester' or 'cumulative'")
    if report_type == 'term' and term is None:
        raise ValueError("term is required when report_type is 'term'")
    if report_type == 'semester' and semester is None:
        raise ValueError("semester is required when report_type is 'semester'")

    students = Student.objects.filter(school=school, grade=grade, section=section, status='active').order_by('first_name', 'last_name')

    successes = []
    failures = []
    for student in students:
        try:
            if report_type == 'term':
                rc = generate_term_report_card(student, term, generated_by=generated_by)
            elif report_type == 'semester':
                rc = generate_semester_report_card(student, semester, generated_by=generated_by)
            else:
                rc = generate_cumulative_report_card(student, academic_year, generated_by=generated_by)
            successes.append(rc)
        except ValueError as exc:
            failures.append({
                'student_id': student.id,
                'student_name': f"{student.first_name} {student.last_name}",
                'error': str(exc),
            })

    return successes, failures


def release_report_card(report_card, released_by):
    """
    Flips a draft report card to released, visible to parents. The PDF's
    footer names who released it and when (see pdf_service), so the PDF
    is re-rendered here too — otherwise a parent's downloaded copy would
    still say "DRAFT — not yet officially released" even after release.
    Only the footer line changes; every number on the document is
    untouched, still the same frozen snapshot from generation time.
    """
    report_card.status = 'released'
    report_card.released_at = timezone.now()
    report_card.released_by = released_by
    report_card.pdf_file = render_report_card_pdf(report_card)
    report_card.save(update_fields=['status', 'released_at', 'released_by', 'pdf_file'])
    return report_card
