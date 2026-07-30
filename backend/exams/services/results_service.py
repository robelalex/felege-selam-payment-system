# exams/services/results_service.py
#
# Phase 4 — computes SubjectTermResult and StudentTermResult from
# accepted Mark rows. Mark stays the source of truth; everything here is
# a derived cache, safe to delete and recompute at any time.
#
# Calculation rules for Phase 4:
#   - A subject's term average = sum of the student's accepted Mark
#     scores for that subject/term, divided by the sum of those
#     assessments' max_scores, as a percentage. (NOT a simple average of
#     per-assessment percentages — that would weight a 5-point quiz the
#     same as a 50-point final exam. Sum-based average matches the
#     gradebook's own Total/100 column exactly.)
#   - A student's overall term average = simple average of their
#     SubjectTermResult.average_percentage values across all subjects.
#
# Entry points meant to be called from views:
#   - recompute_for_class(school, subject, term, grade, section, student_ids=None)
#     Called right after a homeroom_accept action. Recomputes
#     SubjectTermResult + StudentTermResult for the affected students,
#     then re-ranks the whole homeroom class and the whole school-wide
#     band (elementary/high school) those students belong to.
#
#   - recompute_for_term(school, academic_year, term)
#     Full recompute for every student in the school for that term —
#     for the "Recalculate results" admin button, or after marks are
#     edited post-acceptance.

from decimal import Decimal, ROUND_HALF_UP
from django.db.models import Avg

from .. import models as exam_models


def _round2(value):
    if value is None:
        return None
    return Decimal(value).quantize(Decimal('0.01'), rounding=ROUND_HALF_UP)


def recompute_subject_term_result(student, subject, term):
    """
    One student's average for one subject in one term, from their
    accepted Marks.

    ✅ Sum-based (weighted) average: sum(score) / sum(max_score) * 100 —
    NOT a simple average of each assessment's percentage. This matters:
    a simple average would treat a 5-point quiz as equally important as
    a 50-point final exam, which disagrees with the gradebook's own
    Total/100 column (which is naturally weighted by each assessment's
    points). Sum-based average always matches that Total column exactly.
    """
    marks = exam_models.Mark.objects.filter(
        student=student, subject=subject, assessment_type__term=term, status='accepted',
        score__isnull=False,
    ).select_related('assessment_type')

    total_score = sum(m.score for m in marks if m.assessment_type.max_score)
    total_max = sum(m.assessment_type.max_score for m in marks if m.assessment_type.max_score)
    marks_counted = sum(1 for m in marks if m.assessment_type.max_score)

    average_percentage = _round2((total_score / total_max) * 100) if total_max else None
    school = term.school
    is_passing = school.is_passing_score(average_percentage) if average_percentage is not None else None

    result, _ = exam_models.SubjectTermResult.objects.update_or_create(
        student=student, subject=subject, term=term,
        defaults={
            'school': school,
            'academic_year': term.academic_year,
            'grade': student.grade,
            'section': student.section,
            'average_percentage': average_percentage,
            'marks_counted': marks_counted,
            'is_passing': is_passing,
        }
    )
    return result


def recompute_student_term_result(student, term, computed_by=None):
    """
    A student's overall term result — the simple average of their
    SubjectTermResult.average_percentage values across every subject
    they have a result for. Ranks are NOT set here (see
    recompute_ranks) since a rank depends on the whole class, not one
    student in isolation.
    """
    subject_results = exam_models.SubjectTermResult.objects.filter(
        student=student, term=term, average_percentage__isnull=False,
    )
    values = [r.average_percentage for r in subject_results]
    overall_average = _round2(sum(values) / len(values)) if values else None

    school = term.school
    is_passing = school.is_passing_score(overall_average) if overall_average is not None else None
    letter_grade = school.letter_grade_for(overall_average) if overall_average is not None else ''

    result, _ = exam_models.StudentTermResult.objects.update_or_create(
        student=student, term=term,
        defaults={
            'school': school,
            'academic_year': term.academic_year,
            'grade': student.grade,
            'section': student.section,
            'overall_average': overall_average,
            'subjects_counted': len(values),
            'is_passing': is_passing,
            'letter_grade': letter_grade,
            'computed_by': computed_by,
        }
    )
    return result


def _assign_ranks(queryset):
    """
    Shared helper: given a StudentTermResult queryset (already scoped to
    one ranking pool — a homeroom class, or a school-wide elementary/high
    school band), sort by overall_average descending and write rank +
    rank_total back with one bulk_update. Students with no
    overall_average yet (nothing accepted for them this term) are left
    unranked (rank stays null) rather than counted at the bottom, since
    they don't have a result to be ranked ON.
    """
    ranked = [r for r in queryset if r.overall_average is not None]
    ranked.sort(key=lambda r: r.overall_average, reverse=True)
    total = len(ranked)

    # Ties share the same rank (standard competition ranking: 1,2,2,4).
    updates = []
    prev_average = None
    current_rank = 0
    for i, result in enumerate(ranked, start=1):
        if result.overall_average != prev_average:
            current_rank = i
            prev_average = result.overall_average
        updates.append((result, current_rank))

    return updates, total


def recompute_homeroom_ranks(school, academic_year, term, grade, section):
    """Rank pool: same school + academic_year + term + grade + section."""
    qs = list(exam_models.StudentTermResult.objects.filter(
        school=school, academic_year=academic_year, term=term, grade=grade, section=section,
    ))
    updates, total = _assign_ranks(qs)

    to_save = []
    for result, rank in updates:
        result.homeroom_rank = rank
        result.homeroom_rank_total = total
        to_save.append(result)
    # Students with no average this term: clear stale rank rather than leaving old numbers.
    ranked_ids = {r.id for r, _ in updates}
    for result in qs:
        if result.id not in ranked_ids and (result.homeroom_rank is not None or result.homeroom_rank_total is not None):
            result.homeroom_rank = None
            result.homeroom_rank_total = None
            to_save.append(result)

    if to_save:
        exam_models.StudentTermResult.objects.bulk_update(
            to_save, ['homeroom_rank', 'homeroom_rank_total']
        )
    return total


def recompute_school_ranks(school, academic_year, term, is_elementary):
    """
    Rank pool: whole school, same academic_year + term, split by
    elementary (grade <= ELEMENTARY_MAX_GRADE) vs high school.
    """
    max_grade = exam_models.StudentTermResult.ELEMENTARY_MAX_GRADE
    grade_filter = {'grade__lte': max_grade} if is_elementary else {'grade__gt': max_grade}

    qs = list(exam_models.StudentTermResult.objects.filter(
        school=school, academic_year=academic_year, term=term, **grade_filter,
    ))
    updates, total = _assign_ranks(qs)

    to_save = []
    for result, rank in updates:
        result.school_rank = rank
        result.school_rank_total = total
        to_save.append(result)
    ranked_ids = {r.id for r, _ in updates}
    for result in qs:
        if result.id not in ranked_ids and (result.school_rank is not None or result.school_rank_total is not None):
            result.school_rank = None
            result.school_rank_total = None
            to_save.append(result)

    if to_save:
        exam_models.StudentTermResult.objects.bulk_update(
            to_save, ['school_rank', 'school_rank_total']
        )
    return total


def recompute_for_class(school, subject, term, grade, section, student_ids=None, computed_by=None):
    """
    Main entry point — call this right after a homeroom_accept action.
    Recomputes results for the affected students in this one subject,
    then re-ranks the class they belong to and the school-wide band.

    student_ids: optional — if the accept action was for a single
    student (the per-row accept button), pass just that ID so we don't
    needlessly recompute the whole class's subject result; the class
    and school rank pools still cover everyone, since one student's
    result moving affects everyone else's rank too.
    """
    from students.models import Student

    students_qs = Student.objects.filter(school=school, grade=grade, section=section, status='active')
    if student_ids:
        students_qs = students_qs.filter(id__in=student_ids)

    affected_students = list(students_qs)
    for student in affected_students:
        recompute_subject_term_result(student, subject, term)
        recompute_student_term_result(student, term, computed_by=computed_by)

    recompute_homeroom_ranks(school, term.academic_year, term, grade, section)
    is_elementary = grade <= exam_models.StudentTermResult.ELEMENTARY_MAX_GRADE
    recompute_school_ranks(school, term.academic_year, term, is_elementary)

    return len(affected_students)


def recompute_for_term(school, academic_year, term, computed_by=None):
    """
    Full recompute for every active student in the school, this term —
    for the admin 'Recalculate results' button, or after marks are
    corrected post-acceptance. Heavier than recompute_for_class; not
    meant to run on every single mark acceptance.
    """
    from students.models import Student
    from academics.models import Subject

    students = list(Student.objects.filter(school=school, status='active'))
    subjects = list(Subject.objects.filter(school=school))

    for student in students:
        for subject in subjects:
            recompute_subject_term_result(student, subject, term)
        recompute_student_term_result(student, term, computed_by=computed_by)

    # Re-rank every homeroom class present, plus both school-wide bands.
    class_keys = {(s.grade, s.section) for s in students}
    for grade, section in class_keys:
        recompute_homeroom_ranks(school, academic_year, term, grade, section)

    recompute_school_ranks(school, academic_year, term, is_elementary=True)
    recompute_school_ranks(school, academic_year, term, is_elementary=False)

    return len(students)
