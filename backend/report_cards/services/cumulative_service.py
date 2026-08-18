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
#   - A student's overall YEAR average:
#       * 'semester'-structure schools (the default, School.term_structure
#         == 'semester'): FLAT — simple average of their per-term
#         StudentTermResult.overall_average values. Unchanged from
#         before Item 7.
#       * 'quarter'-structure schools: HIERARCHICAL — simple average of
#         their StudentSemesterResult.overall_average values (Semester 1
#         average, Semester 2 average), NOT a flat average of all 4
#         quarters. This is a deliberate decision (not just an
#         implementation detail): when a quarter is missing mid-year
#         (e.g. Q4 hasn't happened yet), a flat average of Q1-Q3 counts
#         each quarter equally, while the hierarchical average counts
#         Semester 1 fully and Semester 2 only on whatever quarters it
#         has so far — weighting a still-incomplete semester the same as
#         a complete one rather than letting extra quarters in one
#         semester silently outweigh the other. Confirmed with the
#         product owner during the Item 7 planning session.
#   - Terms with no result yet for a student (e.g. Term 2 hasn't
#     happened yet) are just excluded — they don't count as zero. Same
#     exclusion rule applies to semesters with no result yet.

from exams.models import StudentTermResult, SubjectTermResult, StudentSemesterResult, SubjectSemesterResult
from exams.services.results_service import round2, rank_by_value


def _hierarchical_overall_average(student, academic_year):
    """
    Quarter-structure schools only: simple average of the student's
    StudentSemesterResult.overall_average values for this academic year.
    A semester with no result yet is excluded, not counted as zero.
    Returns (overall_average, semesters_counted) — semesters_counted is
    reported as 'terms_counted' in the snapshot dict for compatibility
    with everything downstream (report card PDF, generation_service)
    that already reads that key.
    """
    semester_results = list(
        StudentSemesterResult.objects.filter(student=student, academic_year=academic_year)
        .exclude(overall_average__isnull=True)
    )
    if not semester_results:
        return None, 0
    values = [r.overall_average for r in semester_results]
    return round2(sum(values) / len(values)), len(semester_results)


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
            'year_average': float(year_avg) if year_avg is not None else None,
            'per_term': {term_name: float(val) if val is not None else None
                         for term_name, val in data['per_term'].items()},
        })
    subjects_snapshot.sort(key=lambda s: s['subject_name'])

    school = academic_year.school

    # ✅ Item 7 / consolidated cumulative layout — quarter-structure
    # schools only: augment each subject with its two semester averages
    # (SubjectSemesterResult), so the cumulative report card can show
    # Q1-Q4 + Semester 1 + Semester 2 + Year Average side by side for
    # every subject ("big plate" layout). 'per_term' above already holds
    # the per-quarter values (a quarter IS a Term row for these schools),
    # so nothing about that key changes — this only adds a new
    # 'per_semester' key. Semester-structure schools never get this key,
    # and nothing existing reads it, so it's purely additive and doesn't
    # touch their report card at all.
    if school.term_structure == 'quarter':
        semester_results = (
            SubjectSemesterResult.objects.filter(student=student, academic_year=academic_year)
            .select_related('subject', 'semester')
            .exclude(average_percentage__isnull=True)
        )
        per_semester_by_subject = {}
        for sr in semester_results:
            per_semester_by_subject.setdefault(sr.subject.name, {})[sr.semester.name] = float(sr.average_percentage)
        for s in subjects_snapshot:
            s['per_semester'] = per_semester_by_subject.get(s['subject_name'], {})

    if not term_results:
        return {
            'overall_average': None,
            'terms_counted': 0,
            'is_passing': None,
            'letter_grade': '',
            'subjects': subjects_snapshot,
        }

    # ✅ Item 7 — quarter-structure schools compute the year-end average
    # hierarchically (average of semester averages), not as a flat
    # average of every term. See the module-level comment above for why.
    if school.term_structure == 'quarter':
        overall_average, counted = _hierarchical_overall_average(student, academic_year)
        if overall_average is None:
            # No semester results yet even though term results exist
            # (e.g. only Q1 has been accepted, Semester 1 hasn't been
            # recomputed yet) — fall back to "no data" rather than
            # silently reporting a flat average that contradicts the
            # school's own chosen structure.
            return {
                'overall_average': None,
                'terms_counted': 0,
                'is_passing': None,
                'letter_grade': '',
                'subjects': subjects_snapshot,
            }
    else:
        overall_values = [tr.overall_average for tr in term_results if tr.overall_average is not None]
        overall_average = round2(sum(overall_values) / len(overall_values)) if overall_values else None
        counted = len(term_results)

    is_passing = school.is_passing_score(overall_average)
    letter_grade = school.letter_grade_for(overall_average)

    return {
        'overall_average': float(overall_average) if overall_average is not None else None,
        'terms_counted': counted,
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


def compute_cumulative_for_class_with_terms(school, academic_year, grade, section):
    """
    Same ranking/averaging as compute_cumulative_for_class() above — not
    changed, not touched — but each student's dict also gets a
    'per_term' key: { term_id: {'term_name': str, 'average': Decimal|None} }
    for every term in this academic year, so a screen can show Term 1 |
    Term 2 | ... | Average side by side instead of just the final
    average-of-terms figure.

    Built for the homeroom "Check Result and Award" screen, which needs
    to show each term individually next to the cumulative average rather
    than just the cumulative number on its own.
    """
    base = compute_cumulative_for_class(school, academic_year, grade, section)

    term_results = (
        StudentTermResult.objects.filter(
            school=school, academic_year=academic_year, grade=grade, section=section,
        )
        .select_related('term')
    )

    per_term_by_student = {}
    for tr in term_results:
        per_term_by_student.setdefault(tr.student_id, {})[tr.term_id] = {
            'term_name': tr.term.name,
            'average': tr.overall_average,
        }

    for student_id, entry in base.items():
        entry['per_term'] = per_term_by_student.get(student_id, {})

    return base


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
