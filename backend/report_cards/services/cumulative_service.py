# report_cards/services/cumulative_service.py
#
# Phase 6 — computes a student's YEAR-END cumulative result from their
# already-computed term results (exams.StudentTermResult /
# exams.SubjectTermResult). Nothing here writes to the exams app's
# tables — a cumulative result only ever exists as a snapshot baked into
# a ReportCard row when one gets generated. This file only computes; the
# generation service (next step) is what actually saves a ReportCard.
#
# Calculation rule, consistent with the rest of Phase 4/6:
#   - A subject's YEAR average = simple average of that subject's
#     SubjectTermResult.average_percentage across every term the student
#     has a result for. (Same "simple average of already-computed
#     averages" pattern used for a student's per-term overall average —
#     kept consistent rather than inventing a different rule here.)
#   - A student's overall YEAR average = simple average of their
#     SubjectTermResult-derived subject-year-averages — equivalently,
#     also the simple average of their per-term StudentTermResult.
#     overall_average values, which is the simpler way this is actually
#     computed below.
#   - Terms with no result yet for a student (e.g. Term 2 hasn't
#     happened yet) are just excluded — they don't count as zero.

from exams.models import StudentTermResult, SubjectTermResult
from exams.services.results_service import round2, rank_by_value


def compute_cumulative_for_student(student, academic_year):
    """
    Returns a dict snapshot of one student's full-year result:
      {
        'overall_average': Decimal or None,
        'terms_counted': int,
        'is_passing': bool or None,
        'letter_grade': str,
        'subjects': [
          {'subject_name': str, 'year_average': Decimal,
           'per_term': {term_name: Decimal, ...}},
          ...
        ],
      }
    Returns overall_average=None (and empty subjects) if the student has
    no term results at all yet for this year — a report card generated
    at that point would just show "no data," not zero.
    """
    term_results = list(
        StudentTermResult.objects.filter(student=student, academic_year=academic_year)
        .select_related('term')
        .exclude(overall_average__isnull=True)
    )

    subject_results = list(
        SubjectTermResult.objects.filter(student=student, academic_year=academic_year)
        .select_related('subject', 'term')
        .exclude(average_percentage__isnull=True)
    )

    # Per-subject year average = simple average of that subject's
    # per-term averages.
    subjects_by_name = {}
    for sr in subject_results:
        name = sr.subject.name
        subjects_by_name.setdefault(name, {'per_term': {}, 'values': []})
        subjects_by_name[name]['per_term'][sr.term.name] = sr.average_percentage
        subjects_by_name[name]['values'].append(sr.average_percentage)

    subjects_snapshot = []
    for name, data in subjects_by_name.items():
        year_avg = round2(sum(data['values']) / len(data['values']))
        subjects_snapshot.append({
            'subject_name': name,
            'year_average': year_avg,
            'per_term': {term_name: float(val) for term_name, val in data['per_term'].items()},
        })
    subjects_snapshot.sort(key=lambda s: s['subject_name'])

    if not term_results:
        return {
            'overall_average': None,
            'terms_counted': 0,
            'is_passing': None,
            'letter_grade': '',
            'subjects': subjects_snapshot,
        }

    overall_values = [tr.overall_average for tr in term_results]
    overall_average = round2(sum(overall_values) / len(overall_values))

    school = academic_year.school
    is_passing = school.is_passing_score(overall_average)
    letter_grade = school.letter_grade_for(overall_average)

    return {
        'overall_average': overall_average,
        'terms_counted': len(term_results),
        'is_passing': is_passing,
        'letter_grade': letter_grade,
        'subjects': subjects_snapshot,
    }


def compute_cumulative_for_class(school, academic_year, grade, section):
    """
    Computes the cumulative result for every active student in one
    homeroom class, and ranks them against each other by
    overall_average. Returns a dict keyed by student.id:
      { student_id: {**cumulative_dict, 'homeroom_rank': int|None, 'homeroom_rank_total': int|None} }

    This is the version to call when generating report cards for a
    whole class at once — computing each student individually and then
    ranking separately would waste queries and, worse, risk the rank
    pool not actually matching who you just computed for.
    """
    from students.models import Student

    students = list(Student.objects.filter(school=school, grade=grade, section=section, status='active'))
    results = {s.id: compute_cumulative_for_student(s, academic_year) for s in students}

    ranked, total = rank_by_value(students, lambda s: results[s.id]['overall_average'])
    rank_by_student_id = {s.id: rank for s, rank in ranked}

    for s in students:
        results[s.id]['homeroom_rank'] = rank_by_student_id.get(s.id)
        results[s.id]['homeroom_rank_total'] = total if s.id in rank_by_student_id else None

    return results


def compute_cumulative_school_ranks(school, academic_year, is_elementary):
    """
    School-wide cumulative rank, split elementary (grades 1-8) vs high
    school (9-12) — same band convention as the term-level ranking.
    Returns { student_id: (rank, total) } for every active student in
    that band who has a cumulative result.
    """
    from students.models import Student

    max_grade = StudentTermResult.ELEMENTARY_MAX_GRADE
    grade_filter = {'grade__lte': max_grade} if is_elementary else {'grade__gt': max_grade}
    students = list(Student.objects.filter(school=school, status='active', **grade_filter))

    results = {s.id: compute_cumulative_for_student(s, academic_year) for s in students}
    ranked, total = rank_by_value(students, lambda s: results[s.id]['overall_average'])

    return {s.id: (rank, total) for s, rank in ranked}
