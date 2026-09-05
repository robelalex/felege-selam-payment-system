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


def round2(value):
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

    average_percentage = round2((total_score / total_max) * 100) if total_max else None
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
    overall_average = round2(sum(values) / len(values)) if values else None

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


def rank_by_value(items, get_value):
    """
    Generic, reusable ranking core — no dependency on any particular
    model. Given a list of arbitrary items and a function to pull a
    numeric value out of each one, returns (ranked_items, total) where
    ranked_items is [(item, rank), ...] sorted descending by value, with
    DENSE ranking for ties: two students tied for 2nd both get rank 2,
    and the next student gets rank 3 — not 4. (This used to be
    "competition ranking" — 2, 2, 4 — which is standard in some
    contexts, but not what Ethiopian class-rank report cards expect;
    fixed after seeing it produce exactly that wrong-looking 2, 2, 4
    sequence on a real homeroom.) Items whose value is None are dropped
    entirely — you can't rank someone with no score.

    This is the same logic that was previously private to this file
    (only used for StudentTermResult); pulled out to a standalone
    function so report_cards' cumulative-year ranking can reuse the
    exact same, already-tested tie-handling instead of a second
    hand-rolled copy.
    """
    scored = [(item, get_value(item)) for item in items]
    scored = [(item, value) for item, value in scored if value is not None]
    scored.sort(key=lambda pair: pair[1], reverse=True)
    total = len(scored)

    ranked_items = []
    prev_value = None
    current_rank = 0
    for item, value in scored:
        if value != prev_value:
            current_rank += 1  # ✅ dense: only advances on an actual value change, never jumps to a position index
            prev_value = value
        ranked_items.append((item, current_rank))

    return ranked_items, total


def _assign_ranks(queryset):
    """Thin wrapper around rank_by_value for StudentTermResult querysets — see rank_by_value for the actual logic."""
    return rank_by_value(list(queryset), lambda r: r.overall_average)


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


def get_final_term(school, academic_year):
    """
    Shared helper — resolves 'the term whose results decide promotion /
    the school-wide admin view' for a given academic year: whichever
    Term has the highest 'order' (the school's own idea of its final
    term). Returns None if the year has no terms set up at all.
    Used by both the Promote endpoint and the admin results list, so the
    definition of "final term" can't drift between the two.
    """
    return exam_models.Term.objects.filter(school=school, academic_year=academic_year).order_by('-order').first()


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

    # ✅ Item 7 — a quarter-structure school's Term optionally belongs to
    # a Semester (see Term.semester). Keep the semester layer in sync
    # whenever its child term's results change, so a homeroom accepting
    # one Q1 mark doesn't leave Semester 1's numbers stale until someone
    # remembers to hit a separate "recalculate semester" button.
    # Semester-structure schools never set Term.semester, so this is a
    # no-op for them.
    if term.semester_id:
        recompute_for_semester(school, term.academic_year, term.semester, computed_by=computed_by)

    return len(affected_students)


# ============================================================================
# Item 7 — Semester-level compute/rank (quarter-structure schools only)
# ============================================================================
#
# Mirrors everything above, one level up: a Semester's numbers are
# derived from the SubjectTermResult/StudentTermResult rows of its own
# child Terms (Semester.terms), never straight from Mark. Only ever
# called for schools with School.term_structure == 'quarter' — a
# semester-structure school has no Semester rows to compute, so these
# are simply never invoked for it.

def recompute_subject_semester_result(student, subject, semester):
    """
    One student's average for one subject across a Semester's child
    terms — simple average of that subject's already-computed
    SubjectTermResult.average_percentage values. A child term with no
    result yet (e.g. Q2 hasn't happened) is excluded, not counted as
    zero — same rule the year-end cumulative already uses.
    """
    child_terms = list(exam_models.Term.objects.filter(semester=semester))
    subject_results = exam_models.SubjectTermResult.objects.filter(
        student=student, subject=subject, term__in=child_terms, average_percentage__isnull=False,
    )
    values = [r.average_percentage for r in subject_results]
    average_percentage = round2(sum(values) / len(values)) if values else None

    school = semester.school
    is_passing = school.is_passing_score(average_percentage) if average_percentage is not None else None

    result, _ = exam_models.SubjectSemesterResult.objects.update_or_create(
        student=student, subject=subject, semester=semester,
        defaults={
            'school': school,
            'academic_year': semester.academic_year,
            'grade': student.grade,
            'section': student.section,
            'average_percentage': average_percentage,
            'terms_counted': len(values),
            'is_passing': is_passing,
        }
    )
    return result


def recompute_student_semester_result(student, semester, computed_by=None):
    """
    A student's overall semester result — simple average of their
    SubjectSemesterResult.average_percentage values across every subject
    they have one for. Ranks are NOT set here (see recompute_ranks-style
    functions below) since a rank depends on the whole class.
    """
    subject_results = exam_models.SubjectSemesterResult.objects.filter(
        student=student, semester=semester, average_percentage__isnull=False,
    )
    values = [r.average_percentage for r in subject_results]
    overall_average = round2(sum(values) / len(values)) if values else None

    school = semester.school
    is_passing = school.is_passing_score(overall_average) if overall_average is not None else None
    letter_grade = school.letter_grade_for(overall_average) if overall_average is not None else ''

    result, _ = exam_models.StudentSemesterResult.objects.update_or_create(
        student=student, semester=semester,
        defaults={
            'school': school,
            'academic_year': semester.academic_year,
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


def _assign_semester_ranks(queryset):
    return rank_by_value(list(queryset), lambda r: r.overall_average)


def recompute_homeroom_semester_ranks(school, academic_year, semester, grade, section):
    """Rank pool: same school + academic_year + semester + grade + section."""
    qs = list(exam_models.StudentSemesterResult.objects.filter(
        school=school, academic_year=academic_year, semester=semester, grade=grade, section=section,
    ))
    updates, total = _assign_semester_ranks(qs)

    to_save = []
    for result, rank in updates:
        result.homeroom_rank = rank
        result.homeroom_rank_total = total
        to_save.append(result)
    ranked_ids = {r.id for r, _ in updates}
    for result in qs:
        if result.id not in ranked_ids and (result.homeroom_rank is not None or result.homeroom_rank_total is not None):
            result.homeroom_rank = None
            result.homeroom_rank_total = None
            to_save.append(result)

    if to_save:
        exam_models.StudentSemesterResult.objects.bulk_update(
            to_save, ['homeroom_rank', 'homeroom_rank_total']
        )
    return total


def recompute_school_semester_ranks(school, academic_year, semester, is_elementary):
    """Rank pool: whole school, same academic_year + semester, split elementary vs high school."""
    max_grade = exam_models.StudentSemesterResult.ELEMENTARY_MAX_GRADE
    grade_filter = {'grade__lte': max_grade} if is_elementary else {'grade__gt': max_grade}

    qs = list(exam_models.StudentSemesterResult.objects.filter(
        school=school, academic_year=academic_year, semester=semester, **grade_filter,
    ))
    updates, total = _assign_semester_ranks(qs)

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
        exam_models.StudentSemesterResult.objects.bulk_update(
            to_save, ['school_rank', 'school_rank_total']
        )
    return total


def recompute_for_semester(school, academic_year, semester, computed_by=None):
    """
    Full recompute of a Semester's results for every active student in
    the school, from that semester's child Terms' already-computed
    SubjectTermResult/StudentTermResult rows. Meant to be called right
    after recompute_for_term() runs for either child term (a semester
    accept/recalculate should always keep the semester layer in sync
    with its terms), or from an admin "Recalculate" button scoped to a
    semester.
    """
    from students.models import Student
    from academics.models import Subject

    students = list(Student.objects.filter(school=school, status='active'))
    subjects = list(Subject.objects.filter(school=school))

    for student in students:
        for subject in subjects:
            recompute_subject_semester_result(student, subject, semester)
        recompute_student_semester_result(student, semester, computed_by=computed_by)

    class_keys = {(s.grade, s.section) for s in students}
    for grade, section in class_keys:
        recompute_homeroom_semester_ranks(school, academic_year, semester, grade, section)

    recompute_school_semester_ranks(school, academic_year, semester, is_elementary=True)
    recompute_school_semester_ranks(school, academic_year, semester, is_elementary=False)

    return len(students)


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

    # ✅ Item 7 — same sync as recompute_for_class above: if this term
    # belongs to a Semester, refresh that semester's numbers too. No-op
    # for semester-structure schools (term.semester is always None there).
    if term.semester_id:
        recompute_for_semester(school, academic_year, term.semester, computed_by=computed_by)

    return len(students)
