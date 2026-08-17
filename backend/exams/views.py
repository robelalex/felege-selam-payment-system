# exams/views.py
from rest_framework import viewsets, serializers as drf_serializers
from rest_framework.decorators import action
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from django.utils import timezone
from django.db import transaction, models
from decimal import Decimal

from .models import (
    Term, Semester, AssessmentType, Mark, DailyAttendance, SubjectAttendance,
    SubjectTermResult, StudentTermResult, SubjectSemesterResult, StudentSemesterResult,
)
from .serializers import (
    TermSerializer, SemesterSerializer, AssessmentTypeSerializer, MarkSerializer,
    DailyAttendanceSerializer, SubjectAttendanceSerializer,
    SubjectTermResultSerializer, StudentTermResultSerializer,
    SubjectSemesterResultSerializer, StudentSemesterResultSerializer,
)
from academics.models import AcademicYear, Subject, HomeroomAssignment
from staff.models import TeacherClassAssignment
from students.models import Student
from common.utils import get_verified_school_id, get_effective_role
from authentication.permissions import CanManageAcademics, IsTeacherOrAdmin
from .services import results_service


def _get_staff_profile(request):
    """The StaffMember linked to this user, if any (None for admins with no staff record)."""
    return getattr(request.user, 'staff_profile', None)


def _is_admin(request):
    role = get_effective_role(request.user)
    return role in ('school_admin', 'super_admin')


def _teacher_owns_subject(staff, subject_id, grade, section, academic_year_name):
    """Does this teacher have a TeacherClassAssignment covering this
    subject/grade/section? A blank section on the assignment means
    'the whole grade', so it covers every section."""
    qs = TeacherClassAssignment.objects.filter(
        staff=staff, subject_id=subject_id, grade=grade, is_active=True,
        academic_year=academic_year_name,
    )
    return qs.filter(section='').exists() or qs.filter(section=section).exists()


def _teacher_owns_homeroom(staff, grade, section, academic_year_id):
    return HomeroomAssignment.objects.filter(
        teacher=staff, grade=grade, section__name=section, academic_year_id=academic_year_id
    ).exists()


def _can_view_gradebook(request, staff, subject_id, grade, section, academic_year_name, academic_year_id):
    """
    Shared gate for the gradebook table: a subject teacher can view/edit
    their own subject's column of marks; a homeroom teacher can view any
    subject for their own class (they're reviewing, not entering, so no
    ownership of that specific subject is required — just of the class).
    Returns (allowed: bool, is_homeroom_viewer: bool).
    """
    if _is_admin(request):
        return True, True
    if not staff:
        return False, False
    if _teacher_owns_homeroom(staff, grade, section, academic_year_id):
        return True, True
    if _teacher_owns_subject(staff, subject_id, grade, section, academic_year_name):
        return True, False
    return False, False


class TermViewSet(viewsets.ModelViewSet):
    """
    Grading periods a school defines for itself — Semester 1, Semester 2,
    Trimester 1/2/3. Admin/registrar managed; every other role just reads
    the list to know which term they're currently entering marks for.
    """
    serializer_class = TermSerializer
    permission_classes = [IsAuthenticated]

    def get_permissions(self):
        if self.action in ('create', 'update', 'partial_update', 'destroy'):
            return [IsAuthenticated(), CanManageAcademics()]
        return [IsAuthenticated()]

    def get_queryset(self):
        school_id = get_verified_school_id(self.request)
        if not school_id:
            return Term.objects.none()
        queryset = Term.objects.filter(school_id=school_id, is_active=True)
        year_id = self.request.query_params.get('academic_year_id')
        if year_id:
            queryset = queryset.filter(academic_year_id=year_id)
        return queryset

    def _validate_semester(self, serializer, school_id):
        # ✅ Item 7 — a Term's `semester` (if set) must belong to the
        # same school and academic_year as the Term itself, or a
        # careless client could pair a term with another year's/school's
        # semester and silently corrupt semester-level results.
        semester = serializer.validated_data.get('semester')
        if not semester:
            return
        academic_year = serializer.validated_data.get(
            'academic_year', getattr(serializer.instance, 'academic_year', None)
        )
        if semester.school_id != school_id or (academic_year and semester.academic_year_id != academic_year.id):
            raise drf_serializers.ValidationError({
                "semester": "This semester does not belong to the same school/academic year as this term."
            })

    def perform_create(self, serializer):
        school_id = get_verified_school_id(self.request)
        if not school_id:
            raise drf_serializers.ValidationError({"error": "Could not resolve your school"})
        academic_year = serializer.validated_data.get('academic_year')
        if academic_year and academic_year.school_id != school_id:
            raise drf_serializers.ValidationError({"error": "Academic year does not belong to your school"})
        self._validate_semester(serializer, school_id)
        serializer.save(school_id=school_id)

    def perform_update(self, serializer):
        school_id = get_verified_school_id(self.request)
        self._validate_semester(serializer, school_id)
        serializer.save()

    def destroy(self, request, *args, **kwargs):
        obj = self.get_object()
        obj.is_active = False
        obj.save(update_fields=['is_active'])
        return Response({'success': True})


class SemesterViewSet(viewsets.ModelViewSet):
    """
    Item 7 — groupings of two Terms (e.g. Q1+Q2 -> "Semester 1"), only
    ever used by quarter-structure schools (School.term_structure ==
    'quarter'). A semester-structure school simply never creates any of
    these. Admin/registrar managed, same permission shape as TermViewSet.
    """
    serializer_class = SemesterSerializer
    permission_classes = [IsAuthenticated]

    def get_permissions(self):
        if self.action in ('create', 'update', 'partial_update', 'destroy'):
            return [IsAuthenticated(), CanManageAcademics()]
        return [IsAuthenticated()]

    def get_queryset(self):
        school_id = get_verified_school_id(self.request)
        if not school_id:
            return Semester.objects.none()
        queryset = Semester.objects.filter(school_id=school_id, is_active=True)
        year_id = self.request.query_params.get('academic_year_id')
        if year_id:
            queryset = queryset.filter(academic_year_id=year_id)
        return queryset

    def perform_create(self, serializer):
        school_id = get_verified_school_id(self.request)
        if not school_id:
            raise drf_serializers.ValidationError({"error": "Could not resolve your school"})
        from schools.models import School
        school = School.objects.filter(id=school_id).first()
        if school and school.term_structure != 'quarter':
            raise drf_serializers.ValidationError({
                "error": "This school isn't set to a quarter term structure. Set School.term_structure to 'quarter' before creating semesters."
            })
        academic_year = serializer.validated_data.get('academic_year')
        if academic_year and academic_year.school_id != school_id:
            raise drf_serializers.ValidationError({"error": "Academic year does not belong to your school"})
        serializer.save(school_id=school_id)

    def destroy(self, request, *args, **kwargs):
        obj = self.get_object()
        if Term.objects.filter(semester=obj).exists():
            return Response(
                {'error': 'This semester still has terms assigned to it. Unassign or reassign them first.'},
                status=400,
            )
        obj.is_active = False
        obj.save(update_fields=['is_active'])
        return Response({'success': True})


class AssessmentTypeViewSet(viewsets.ModelViewSet):
    """School-defined gradable events (Mid Term, Final, Quiz 1...).
    Admin/registrar manage the list; teachers need read access too,
    since picking an assessment type is the first step of entering marks."""
    serializer_class = AssessmentTypeSerializer
    permission_classes = [IsAuthenticated]

    def get_permissions(self):
        if self.action in ('create', 'update', 'partial_update', 'destroy'):
            return [IsAuthenticated(), CanManageAcademics()]
        return [IsAuthenticated()]

    def get_queryset(self):
        school_id = get_verified_school_id(self.request)
        if not school_id:
            return AssessmentType.objects.none()
        queryset = AssessmentType.objects.filter(school_id=school_id, is_active=True)
        year_id = self.request.query_params.get('academic_year_id')
        if year_id:
            queryset = queryset.filter(academic_year_id=year_id)
        term_id = self.request.query_params.get('term_id')
        if term_id:
            queryset = queryset.filter(term_id=term_id)

        # ✅ NEW: optional ?grade= filter — assessment types are now
        # class(grade)-based. Not passing this param keeps the old behavior
        # (every active assessment type for the year/term), so existing
        # callers (e.g. the Flutter app's mark entry screen before it's
        # updated to pass grade) keep working unchanged.
        grade = self.request.query_params.get('grade')
        if grade:
            try:
                queryset = queryset.filter(
                    models.Q(grade=int(grade)) | models.Q(grade__isnull=True)
                )
            except ValueError:
                pass
        return queryset

    def perform_create(self, serializer):
        school_id = get_verified_school_id(self.request)
        if not school_id:
            raise drf_serializers.ValidationError({"error": "Could not resolve your school"})
        academic_year = serializer.validated_data.get('academic_year')
        if academic_year and academic_year.school_id != school_id:
            raise drf_serializers.ValidationError({"error": "Academic year does not belong to your school"})
        term = serializer.validated_data.get('term')
        if term and term.school_id != school_id:
            raise drf_serializers.ValidationError({"error": "Term does not belong to your school"})
        serializer.save(school_id=school_id)

    def destroy(self, request, *args, **kwargs):
        obj = self.get_object()
        obj.is_active = False
        obj.save(update_fields=['is_active'])
        return Response({'success': True})


class MarkViewSet(viewsets.ModelViewSet):
    """
    Subject-teacher mark entry + homeroom accept/reject workflow.
    See models.Mark docstring for the edit-rights lifecycle.
    """
    serializer_class = MarkSerializer
    permission_classes = [IsAuthenticated, IsTeacherOrAdmin]

    def get_queryset(self):
        school_id = get_verified_school_id(self.request)
        if not school_id:
            return Mark.objects.none()

        queryset = Mark.objects.filter(school_id=school_id).select_related(
            'student', 'subject', 'assessment_type', 'entered_by', 'reviewed_by'
        )

        params = self.request.query_params
        for field, param in [('subject_id', 'subject'), ('assessment_type_id', 'assessment_type'),
                              ('grade', 'grade'), ('section', 'section'), ('status', 'status'),
                              ('academic_year_id', 'academic_year')]:
            value = params.get(field)
            if value:
                queryset = queryset.filter(**{param: value})

        return queryset

    # ===== Subject teacher: roster + bulk entry =====

    @action(detail=False, methods=['get'])
    def roster(self, request):
        """The 'empty interactable table' — every student in this
        subject/grade/section, with their existing mark (or null)."""
        school_id = get_verified_school_id(request)
        subject_id = request.query_params.get('subject_id')
        assessment_type_id = request.query_params.get('assessment_type_id')
        grade = request.query_params.get('grade')
        section = request.query_params.get('section', '')

        if not (school_id and subject_id and assessment_type_id and grade):
            return Response({'error': 'subject_id, assessment_type_id, and grade are required'}, status=400)

        try:
            assessment_type = AssessmentType.objects.get(id=assessment_type_id, school_id=school_id)
        except AssessmentType.DoesNotExist:
            return Response({'error': 'Assessment type not found'}, status=404)

        staff = _get_staff_profile(request)
        if not _is_admin(request):
            if not staff or not _teacher_owns_subject(staff, subject_id, int(grade), section, assessment_type.academic_year.name):
                return Response({'error': 'You are not assigned to teach this subject/grade/section'}, status=403)

        students = Student.objects.filter(school_id=school_id, grade=grade, status='active')
        if section:
            students = students.filter(section=section)
        students = students.order_by('first_name', 'last_name')

        existing_marks = {
            m.student_id: m for m in Mark.objects.filter(
                school_id=school_id, subject_id=subject_id, assessment_type_id=assessment_type_id,
                student__in=students,
            )
        }

        rows = []
        for student in students:
            mark = existing_marks.get(student.id)
            rows.append({
                'student_id': student.id,
                'student_name': f"{student.first_name} {student.last_name}",
                'student_id_display': student.student_id,
                'mark_id': mark.id if mark else None,
                'score': mark.score if mark else None,
                'status': mark.status if mark else 'draft',
                'max_score': assessment_type.max_score,
            })

        return Response({
            'assessment_type': AssessmentTypeSerializer(assessment_type).data,
            'students': rows,
        })

    @action(detail=False, methods=['post'])
    def bulk_save(self, request):
        """Upsert a whole class's worth of scores in one call.
        Body: { subject_id, assessment_type_id, grade, section, entries: [{student_id, score}] }"""
        school_id = get_verified_school_id(request)
        if not school_id:
            return Response({'error': 'Could not resolve your school'}, status=400)

        subject_id = request.data.get('subject_id')
        assessment_type_id = request.data.get('assessment_type_id')
        grade = request.data.get('grade')
        section = request.data.get('section', '')
        entries = request.data.get('entries', [])

        if not (subject_id and assessment_type_id and grade and entries):
            return Response({'error': 'subject_id, assessment_type_id, grade, and entries are required'}, status=400)

        try:
            subject = Subject.objects.get(id=subject_id, school_id=school_id)
            assessment_type = AssessmentType.objects.get(id=assessment_type_id, school_id=school_id)
        except (Subject.DoesNotExist, AssessmentType.DoesNotExist):
            return Response({'error': 'Subject or assessment type not found'}, status=404)

        staff = _get_staff_profile(request)
        is_admin = _is_admin(request)
        if not is_admin:
            if not staff or not _teacher_owns_subject(staff, subject_id, int(grade), section, assessment_type.academic_year.name):
                return Response({'error': 'You are not assigned to teach this subject/grade/section'}, status=403)

        saved, skipped_locked, errors = 0, 0, []

        with transaction.atomic():
            for entry in entries:
                student_id = entry.get('student_id')
                score = entry.get('score')
                try:
                    student = Student.objects.get(id=student_id, school_id=school_id)
                except Student.DoesNotExist:
                    errors.append(f"Student {student_id} not found")
                    continue

                if score is not None and float(score) > float(assessment_type.max_score):
                    errors.append(f"{student.first_name}: score exceeds max ({assessment_type.max_score})")
                    continue

                mark, created = Mark.objects.get_or_create(
                    student=student, subject=subject, assessment_type=assessment_type,
                    defaults={
                        'school_id': school_id, 'academic_year': assessment_type.academic_year,
                        'grade': grade, 'section': section, 'entered_by': staff, 'status': 'draft',
                    }
                )

                # Locked once submitted/accepted — subject teacher can't touch it,
                # unless this is an admin doing an authorized override.
                if not created and mark.status in ('submitted', 'accepted') and not is_admin:
                    skipped_locked += 1
                    continue

                mark.score = score
                if not created:
                    mark.status = 'draft'  # editing a rejected mark resets it to draft
                if staff:
                    mark.entered_by = staff
                mark.save()
                saved += 1

        return Response({'saved': saved, 'skipped_locked': skipped_locked, 'errors': errors})

    @action(detail=False, methods=['post'])
    def submit(self, request):
        """Subject teacher marks their entered scores as ready for homeroom review."""
        school_id = get_verified_school_id(request)
        subject_id = request.data.get('subject_id')
        assessment_type_id = request.data.get('assessment_type_id')
        grade = request.data.get('grade')
        section = request.data.get('section', '')

        if not (school_id and subject_id and assessment_type_id and grade):
            return Response({'error': 'subject_id, assessment_type_id, and grade are required'}, status=400)

        staff = _get_staff_profile(request)
        qs = Mark.objects.filter(
            school_id=school_id, subject_id=subject_id, assessment_type_id=assessment_type_id,
            grade=grade, status='draft',
        )
        if section:
            qs = qs.filter(section=section)
        if staff and not _is_admin(request):
            qs = qs.filter(entered_by=staff)

        count = qs.update(status='submitted')
        return Response({'submitted': count})

    @action(detail=False, methods=['post'])
    def submit_student(self, request):
        """
        'Send' for ONE student — submits every draft mark this student has
        for the given subject+term (across all assessment types in it),
        not just one cell. Body: { subject_id, term_id, grade, section, student_id }
        """
        school_id = get_verified_school_id(request)
        subject_id = request.data.get('subject_id')
        term_id = request.data.get('term_id')
        grade = request.data.get('grade')
        section = request.data.get('section', '')
        student_id = request.data.get('student_id')

        if not (school_id and subject_id and term_id and grade and student_id):
            return Response({'error': 'subject_id, term_id, grade, and student_id are required'}, status=400)

        staff = _get_staff_profile(request)
        academic_year_name = None
        if not _is_admin(request):
            year = AcademicYear.objects.filter(school_id=school_id, is_current=True).first()
            academic_year_name = year.name if year else None
            if not staff or not _teacher_owns_subject(staff, subject_id, int(grade), section, academic_year_name):
                return Response({'error': 'You are not assigned to teach this subject/grade/section'}, status=403)

        qs = Mark.objects.filter(
            school_id=school_id, subject_id=subject_id, assessment_type__term_id=term_id,
            grade=grade, student_id=student_id, status='draft',
        )
        if section:
            qs = qs.filter(section=section)
        if staff and not _is_admin(request):
            qs = qs.filter(entered_by=staff)

        count = qs.update(status='submitted')
        return Response({'submitted': count})

    # ===== Gradebook: the shared table both subject teacher and homeroom use =====

    @action(detail=False, methods=['get'])
    def gradebook(self, request):
        """
        One table: every student in this class as a row, every assessment
        type in the given term as a column, plus a computed total. Used by
        BOTH the subject teacher (editable, their own subject) and the
        homeroom teacher (read-only scores, any subject taught in their
        class) — same shape, different permissions and actions on top.
        """
        school_id = get_verified_school_id(request)
        subject_id = request.query_params.get('subject_id')
        term_id = request.query_params.get('term_id')
        grade = request.query_params.get('grade')
        section = request.query_params.get('section', '')

        if not (school_id and subject_id and term_id and grade):
            return Response({'error': 'subject_id, term_id, and grade are required'}, status=400)

        try:
            term = Term.objects.get(id=term_id, school_id=school_id)
        except Term.DoesNotExist:
            return Response({'error': 'Term not found'}, status=404)

        staff = _get_staff_profile(request)
        allowed, is_homeroom_viewer = _can_view_gradebook(
            request, staff, subject_id, int(grade), section, term.academic_year.name, term.academic_year_id
        )
        if not allowed:
            return Response({'error': 'You do not have access to this class'}, status=403)

        assessment_types = list(
            AssessmentType.objects.filter(school_id=school_id, term_id=term_id, is_active=True).order_by('order', 'name')
        )

        students = Student.objects.filter(school_id=school_id, grade=grade, status='active')
        if section:
            students = students.filter(section=section)
        students = students.order_by('first_name', 'last_name')

        marks_by_student = {}
        for m in Mark.objects.filter(
            school_id=school_id, subject_id=subject_id, assessment_type__term_id=term_id, student__in=students,
        ).select_related('assessment_type'):
            marks_by_student.setdefault(m.student_id, {})[m.assessment_type_id] = m

        has_weights = any(a.weight_percent is not None for a in assessment_types)

        rows = []
        for student in students:
            student_marks = marks_by_student.get(student.id, {})
            columns = {}
            raw_total = Decimal('0')
            raw_max = Decimal('0')
            weighted_total = Decimal('0')
            any_score_entered = False

            for a in assessment_types:
                m = student_marks.get(a.id)
                score = m.score if m else None
                columns[a.id] = {
                    'mark_id': m.id if m else None,
                    'score': score,
                    'status': m.status if m else 'draft',
                }
                if score is not None:
                    any_score_entered = True
                    raw_total += score
                    raw_max += a.max_score
                    if a.weight_percent is not None and a.max_score:
                        weighted_total += (score / a.max_score) * a.weight_percent

            rows.append({
                'student_id': student.id,
                'student_name': f"{student.first_name} {student.last_name}",
                'student_id_display': student.student_id,
                'columns': columns,
                'raw_total': raw_total if any_score_entered else None,
                'raw_max_total': raw_max if any_score_entered else None,
                'weighted_percent': weighted_total if (has_weights and any_score_entered) else None,
            })

        return Response({
            'term': TermSerializer(term).data,
            'assessment_types': AssessmentTypeSerializer(assessment_types, many=True).data,
            'is_homeroom_viewer': is_homeroom_viewer,
            'students': rows,
        })

    # ===== Homeroom: review + accept/reject =====

    @action(detail=False, methods=['get'])
    def homeroom_pending(self, request):
        """Everything submitted and waiting on this homeroom teacher, across all subjects."""
        school_id = get_verified_school_id(request)
        grade = request.query_params.get('grade')
        section = request.query_params.get('section', '')

        if not (school_id and grade and section):
            return Response({'error': 'grade and section are required'}, status=400)

        staff = _get_staff_profile(request)
        if not _is_admin(request):
            # ✅ FIX: was reading academic_year_id off a random Mark row
            # (order undefined, could belong to any year) instead of the
            # school's actual current AcademicYear — caused false 403s
            # whenever that arbitrary row happened to be from a past year.
            year = AcademicYear.objects.filter(school_id=school_id, is_current=True).first()
            year_id = year.id if year else None
            if not staff or not _teacher_owns_homeroom(staff, int(grade), section, year_id):
                return Response({'error': 'You are not the homeroom teacher for this class'}, status=403)

        marks = self.get_queryset().filter(grade=grade, section=section, status='submitted')
        return Response(MarkSerializer(marks, many=True).data)

    @action(detail=False, methods=['post'])
    def homeroom_accept(self, request):
        """Body: { subject_id, assessment_type_id, grade, section, student_id? }
        Accepts the whole class's submission for that assessment, or just
        one student's if student_id is provided (the per-row 'Accept' button)."""
        return self._homeroom_decide(request, new_status='accepted')

    @action(detail=False, methods=['post'])
    def homeroom_reject(self, request):
        """Same shape as homeroom_accept — sends it back for correction instead."""
        return self._homeroom_decide(request, new_status='rejected')

    def _homeroom_decide(self, request, new_status):
        school_id = get_verified_school_id(request)
        subject_id = request.data.get('subject_id')
        assessment_type_id = request.data.get('assessment_type_id')
        grade = request.data.get('grade')
        section = request.data.get('section', '')
        note = request.data.get('note', '')
        student_id = request.data.get('student_id')  # optional — per-student action

        if not (school_id and subject_id and assessment_type_id and grade and section):
            return Response({'error': 'subject_id, assessment_type_id, grade, and section are required'}, status=400)

        staff = _get_staff_profile(request)
        if not _is_admin(request):
            # ✅ Same fix as homeroom_pending — real current-year lookup,
            # not a guess from whichever Mark row happened to come back first.
            year = AcademicYear.objects.filter(school_id=school_id, is_current=True).first()
            year_id = year.id if year else None
            if not staff or not _teacher_owns_homeroom(staff, int(grade), section, year_id):
                return Response({'error': 'You are not the homeroom teacher for this class'}, status=403)

        qs = Mark.objects.filter(
            school_id=school_id, subject_id=subject_id, assessment_type_id=assessment_type_id,
            grade=grade, section=section, status='submitted',
        )
        if student_id:
            qs = qs.filter(student_id=student_id)

        affected_student_ids = list(qs.values_list('student_id', flat=True).distinct())
        count = qs.update(status=new_status, reviewed_by=staff, reviewed_at=timezone.now(), homeroom_note=note)

        # ✅ Phase 4 — only 'accepted' marks count toward results, so only
        # recompute on accept. qs.update() is a bulk update and doesn't
        # fire model signals, so this has to be called explicitly here
        # rather than relying on a post_save hook.
        if new_status == 'accepted' and affected_student_ids:
            assessment_type = AssessmentType.objects.select_related('term').filter(
                id=assessment_type_id
            ).first()
            subject_obj = Subject.objects.filter(id=subject_id).first()
            if assessment_type and assessment_type.term_id and subject_obj:
                results_service.recompute_for_class(
                    school=assessment_type.school,
                    subject=subject_obj,
                    term=assessment_type.term,
                    grade=int(grade),
                    section=section,
                    student_ids=affected_student_ids,
                    computed_by=staff,
                )

        return Response({'updated': count, 'status': new_status})


class DailyAttendanceViewSet(viewsets.ModelViewSet):
    """Homeroom-only daily attendance entry."""
    serializer_class = DailyAttendanceSerializer
    permission_classes = [IsAuthenticated, IsTeacherOrAdmin]

    def get_queryset(self):
        school_id = get_verified_school_id(self.request)
        if not school_id:
            return DailyAttendance.objects.none()

        queryset = DailyAttendance.objects.filter(school_id=school_id).select_related('student', 'recorded_by')

        params = self.request.query_params
        for field, param in [('grade', 'grade'), ('section', 'section'),
                              ('date', 'date'), ('date_from', 'date__gte'), ('date_to', 'date__lte'),
                              ('student_id', 'student_id'), ('academic_year_id', 'academic_year')]:
            value = params.get(field)
            if value:
                queryset = queryset.filter(**{param: value})

        return queryset

    @action(detail=False, methods=['get'])
    def roster(self, request):
        """Every student in this class for the given date, with existing status if already recorded."""
        school_id = get_verified_school_id(request)
        grade = request.query_params.get('grade')
        section = request.query_params.get('section', '')
        date = request.query_params.get('date')

        if not (school_id and grade and section and date):
            return Response({'error': 'grade, section, and date are required'}, status=400)

        staff = _get_staff_profile(request)
        current_year = AcademicYear.objects.filter(school_id=school_id, is_current=True).first()
        if not _is_admin(request):
            year_id = current_year.id if current_year else None
            if not staff or not _teacher_owns_homeroom(staff, int(grade), section, year_id):
                return Response({'error': 'You are not the homeroom teacher for this class'}, status=403)

        students = Student.objects.filter(
            school_id=school_id, grade=grade, section=section, status='active'
        ).order_by('first_name', 'last_name')

        existing = {
            a.student_id: a for a in DailyAttendance.objects.filter(
                school_id=school_id, grade=grade, section=section, date=date, student__in=students,
            )
        }

        rows = [{
            'student_id': s.id,
            'student_name': f"{s.first_name} {s.last_name}",
            'student_id_display': s.student_id,
            'attendance_id': existing[s.id].id if s.id in existing else None,
            'status': existing[s.id].status if s.id in existing else 'present',
        } for s in students]

        return Response({'date': date, 'students': rows})

    @action(detail=False, methods=['post'])
    def bulk_save(self, request):
        """Body: { grade, section, date, entries: [{student_id, status}] }"""
        school_id = get_verified_school_id(request)
        grade = request.data.get('grade')
        section = request.data.get('section', '')
        date = request.data.get('date')
        entries = request.data.get('entries', [])

        if not (school_id and grade and section and date and entries):
            return Response({'error': 'grade, section, date, and entries are required'}, status=400)

        staff = _get_staff_profile(request)
        current_year = AcademicYear.objects.filter(school_id=school_id, is_current=True).first()
        if not current_year:
            return Response({'error': 'No current academic year set for your school'}, status=400)

        if not _is_admin(request):
            if not staff or not _teacher_owns_homeroom(staff, int(grade), section, current_year.id):
                return Response({'error': 'You are not the homeroom teacher for this class'}, status=403)

        saved, errors = 0, []
        with transaction.atomic():
            for entry in entries:
                student_id = entry.get('student_id')
                status_value = entry.get('status', 'present')
                try:
                    student = Student.objects.get(id=student_id, school_id=school_id)
                except Student.DoesNotExist:
                    errors.append(f"Student {student_id} not found")
                    continue

                DailyAttendance.objects.update_or_create(
                    student=student, date=date,
                    defaults={
                        'school_id': school_id, 'academic_year': current_year,
                        'grade': grade, 'section': section,
                        'status': status_value, 'recorded_by': staff,
                    }
                )
                saved += 1

        return Response({'saved': saved, 'errors': errors})


class SubjectAttendanceViewSet(viewsets.ModelViewSet):
    """
    Subject-teacher attendance — 'was this student in today's Math class'
    — as opposed to DailyAttendanceViewSet, which is homeroom's 'was this
    student in school today at all'. Same shape, different owner: a
    subject teacher needs to be assigned to teach this subject/grade/
    section, not be its homeroom teacher.
    """
    serializer_class = SubjectAttendanceSerializer
    permission_classes = [IsAuthenticated, IsTeacherOrAdmin]

    def get_queryset(self):
        school_id = get_verified_school_id(self.request)
        if not school_id:
            return SubjectAttendance.objects.none()

        queryset = SubjectAttendance.objects.filter(school_id=school_id).select_related('student', 'recorded_by', 'subject')

        params = self.request.query_params
        for field, param in [('subject_id', 'subject_id'), ('grade', 'grade'), ('section', 'section'),
                              ('date', 'date'), ('date_from', 'date__gte'), ('date_to', 'date__lte'),
                              ('student_id', 'student_id'), ('academic_year_id', 'academic_year')]:
            value = params.get(field)
            if value:
                queryset = queryset.filter(**{param: value})

        return queryset

    @action(detail=False, methods=['get'])
    def roster(self, request):
        """Every student in this subject's class for the given date, with existing status if already recorded."""
        school_id = get_verified_school_id(request)
        subject_id = request.query_params.get('subject_id')
        grade = request.query_params.get('grade')
        section = request.query_params.get('section', '')
        date = request.query_params.get('date')

        if not (school_id and subject_id and grade and date):
            return Response({'error': 'subject_id, grade, and date are required'}, status=400)

        staff = _get_staff_profile(request)
        current_year = AcademicYear.objects.filter(school_id=school_id, is_current=True).first()
        if not _is_admin(request):
            academic_year_name = current_year.name if current_year else None
            if not staff or not _teacher_owns_subject(staff, subject_id, int(grade), section, academic_year_name):
                return Response({'error': 'You are not assigned to teach this subject/grade/section'}, status=403)

        students = Student.objects.filter(
            school_id=school_id, grade=grade, status='active'
        )
        if section:
            students = students.filter(section=section)
        students = students.order_by('first_name', 'last_name')

        existing = {
            a.student_id: a for a in SubjectAttendance.objects.filter(
                school_id=school_id, subject_id=subject_id, grade=grade, date=date, student__in=students,
            )
        }

        rows = [{
            'student_id': s.id,
            'student_name': f"{s.first_name} {s.last_name}",
            'student_id_display': s.student_id,
            'attendance_id': existing[s.id].id if s.id in existing else None,
            'status': existing[s.id].status if s.id in existing else 'present',
        } for s in students]

        return Response({'date': date, 'students': rows})

    @action(detail=False, methods=['post'])
    def bulk_save(self, request):
        """Body: { subject_id, grade, section, date, entries: [{student_id, status}] }"""
        school_id = get_verified_school_id(request)
        subject_id = request.data.get('subject_id')
        grade = request.data.get('grade')
        section = request.data.get('section', '')
        date = request.data.get('date')
        entries = request.data.get('entries', [])

        if not (school_id and subject_id and grade and date and entries):
            return Response({'error': 'subject_id, grade, date, and entries are required'}, status=400)

        staff = _get_staff_profile(request)
        current_year = AcademicYear.objects.filter(school_id=school_id, is_current=True).first()
        if not current_year:
            return Response({'error': 'No current academic year set for your school'}, status=400)

        if not _is_admin(request):
            if not staff or not _teacher_owns_subject(staff, subject_id, int(grade), section, current_year.name):
                return Response({'error': 'You are not assigned to teach this subject/grade/section'}, status=403)

        saved, errors = 0, []
        with transaction.atomic():
            for entry in entries:
                student_id = entry.get('student_id')
                status_value = entry.get('status', 'present')
                try:
                    student = Student.objects.get(id=student_id, school_id=school_id)
                except Student.DoesNotExist:
                    errors.append(f"Student {student_id} not found")
                    continue

                SubjectAttendance.objects.update_or_create(
                    student=student, subject_id=subject_id, date=date,
                    defaults={
                        'school_id': school_id, 'academic_year': current_year,
                        'grade': grade, 'section': section,
                        'status': status_value, 'recorded_by': staff,
                    }
                )
                saved += 1

        return Response({'saved': saved, 'errors': errors})


# ============================================================================
# Phase 4 — Results (read-only for now: nothing here writes results, that
# only ever happens via results_service, triggered from homeroom_accept
# above, or the manual recalculate action below)
# ============================================================================

class StudentTermResultViewSet(viewsets.ReadOnlyModelViewSet):
    """
    Staff/admin-facing results + ranking. NOT yet exposed to parents/
    students — the mobile/parent app's auth model (OTP + student_id
    lookup, no full staff account) is different enough from the
    IsAuthenticated + StaffMember pattern used everywhere else in this
    file that it needs its own deliberate design rather than reusing
    this ViewSet as-is. That's a follow-up, not done here.
    """
    serializer_class = StudentTermResultSerializer
    permission_classes = [IsAuthenticated]

    def get_permissions(self):
        # ✅ Security fix — list (and the class_results/school_top actions
        # below) previously only required IsAuthenticated, meaning any
        # staff member — even a subject teacher with no homeroom — could
        # pull every student's results school-wide via GET /results/.
        # Only admins get the unscoped view; everyone else must use
        # retrieve or class_results, which check homeroom ownership.
        if self.action == 'list':
            return [IsAuthenticated(), CanManageAcademics()]
        return [IsAuthenticated()]

    def get_queryset(self):
        school_id = get_verified_school_id(self.request)
        qs = StudentTermResult.objects.select_related('student', 'term').filter(school_id=school_id)
        term_id = self.request.query_params.get('term_id')
        academic_year_id = self.request.query_params.get('academic_year_id')
        if term_id:
            qs = qs.filter(term_id=term_id)
        elif academic_year_id:
            # No specific term given — resolve the school's own "final
            # term" for that year, same rule the Promote button uses, so
            # an admin reviewing results before promoting sees the exact
            # same term the promotion decision will be based on.
            from schools.models import School
            school = School.objects.filter(id=school_id).first()
            year = AcademicYear.objects.filter(id=academic_year_id, school_id=school_id).first()
            if school and year:
                term = results_service.get_final_term(school, year)
                qs = qs.filter(term=term) if term else qs.none()
            else:
                qs = qs.none()
        return qs

    def retrieve(self, request, *args, **kwargs):
        """Single student's result, with the per-subject breakdown included."""
        instance = self.get_object()
        staff = _get_staff_profile(request)
        if not _is_admin(request):
            year_id = instance.academic_year_id
            if not staff or not _teacher_owns_homeroom(staff, instance.grade, instance.section, year_id):
                return Response({'error': 'You are not the homeroom teacher for this class'}, status=403)
        serializer = self.get_serializer(instance, context={'include_subjects': True})
        return Response(serializer.data)

    @action(detail=False, methods=['get'])
    def class_results(self, request):
        """Query params: term_id, grade, section. Ranked list for one homeroom class."""
        school_id = get_verified_school_id(request)
        term_id = request.query_params.get('term_id')
        grade = request.query_params.get('grade')
        section = request.query_params.get('section', '')

        if not (school_id and term_id and grade):
            return Response({'error': 'term_id and grade are required'}, status=400)

        staff = _get_staff_profile(request)
        if not _is_admin(request):
            term = Term.objects.filter(id=term_id).first()
            year_id = term.academic_year_id if term else None
            if not staff or not _teacher_owns_homeroom(staff, int(grade), section, year_id):
                return Response({'error': 'You are not the homeroom teacher for this class'}, status=403)

        qs = StudentTermResult.objects.select_related('student').filter(
            school_id=school_id, term_id=term_id, grade=grade, section=section,
        ).order_by('homeroom_rank')
        return Response(StudentTermResultSerializer(qs, many=True).data)

    @action(detail=False, methods=['get'])
    def class_results_terms(self, request):
        """
        Query params: grade, section, academic_year_id.

        Same homeroom ownership rule as class_results above (admin, or
        the homeroom teacher for this exact grade+section), but instead
        of one term's ranking, returns every term side by side plus the
        average-of-terms figure and the rank based on THAT average — the
        "Term 1 | Term 2 | Average" view for the homeroom's
        "Check Result and Award" screen. Doesn't touch class_results or
        school_top above; this is a new, separate action.
        """
        school_id = get_verified_school_id(request)
        grade = request.query_params.get('grade')
        section = request.query_params.get('section', '')
        academic_year_id = request.query_params.get('academic_year_id')

        if not (school_id and grade and academic_year_id):
            return Response({'error': 'grade and academic_year_id are required'}, status=400)

        try:
            grade = int(grade)
            academic_year_id = int(academic_year_id)
        except (TypeError, ValueError):
            return Response({'error': 'grade and academic_year_id must be numbers'}, status=400)

        staff = _get_staff_profile(request)
        if not _is_admin(request):
            if not staff or not _teacher_owns_homeroom(staff, grade, section, academic_year_id):
                return Response({'error': 'You are not the homeroom teacher for this class'}, status=403)

        from schools.models import School
        school = School.objects.filter(id=school_id).first()
        year = AcademicYear.objects.filter(id=academic_year_id, school_id=school_id).first()
        if not (school and year):
            return Response({'error': 'Academic year not found'}, status=404)

        terms = list(Term.objects.filter(school=school, academic_year=year, is_active=True).order_by('order', 'name'))

        from report_cards.services.cumulative_service import compute_cumulative_for_class_with_terms
        data = compute_cumulative_for_class_with_terms(school, year, grade, section)

        students = Student.objects.filter(school=school, grade=grade, section=section, status='active').order_by('first_name', 'last_name')

        results = []
        for s in students:
            entry = data.get(s.id, {})
            per_term = entry.get('per_term', {})
            results.append({
                'student_id': s.id,
                'student_name': f"{s.first_name} {s.last_name}",
                'student_id_display': s.student_id,
                'terms': [
                    {
                        'term_id': t.id,
                        'term_name': t.name,
                        'average': per_term.get(t.id, {}).get('average'),
                    }
                    for t in terms
                ],
                'average_of_terms': entry.get('overall_average'),
                'terms_counted': entry.get('terms_counted', 0),
                'is_passing': entry.get('is_passing'),
                'letter_grade': entry.get('letter_grade', ''),
                'homeroom_rank': entry.get('homeroom_rank'),
                'homeroom_rank_total': entry.get('homeroom_rank_total'),
            })

        results.sort(key=lambda r: (r['homeroom_rank'] is None, r['homeroom_rank'] or 0))

        return Response({
            'terms': [{'id': t.id, 'name': t.name} for t in terms],
            'results': results,
        })

    @action(detail=False, methods=['get'])
    def school_top(self, request):
        """Query params: term_id, band ('elementary' or 'high_school'), limit (default 3). Admin only — for award/ranking lists."""
        if not _is_admin(request):
            return Response({'error': 'Admin only'}, status=403)

        school_id = get_verified_school_id(request)
        term_id = request.query_params.get('term_id')
        band = request.query_params.get('band', 'elementary')
        limit = int(request.query_params.get('limit', 3))

        if not (school_id and term_id):
            return Response({'error': 'term_id is required'}, status=400)

        max_grade = StudentTermResult.ELEMENTARY_MAX_GRADE
        qs = StudentTermResult.objects.select_related('student').filter(
            school_id=school_id, term_id=term_id, school_rank__isnull=False,
        )
        qs = qs.filter(grade__lte=max_grade) if band == 'elementary' else qs.filter(grade__gt=max_grade)
        qs = qs.order_by('school_rank')[:limit]
        return Response(StudentTermResultSerializer(qs, many=True).data)

    @action(detail=False, methods=['post'])
    def recalculate(self, request):
        """Body: { term_id }. Admin only — full recompute for the whole school, this term."""
        if not _is_admin(request):
            return Response({'error': 'Admin only'}, status=403)

        school_id = get_verified_school_id(request)
        term_id = request.data.get('term_id')
        if not (school_id and term_id):
            return Response({'error': 'term_id is required'}, status=400)

        term = Term.objects.filter(id=term_id, school_id=school_id).first()
        if not term:
            return Response({'error': 'Term not found'}, status=404)

        staff = _get_staff_profile(request)
        count = results_service.recompute_for_term(
            school=term.school, academic_year=term.academic_year, term=term, computed_by=staff,
        )
        return Response({'recomputed_students': count})


class StudentSemesterResultViewSet(viewsets.ReadOnlyModelViewSet):
    """
    Item 7 — mirrors StudentTermResultViewSet exactly, one level up.
    Only ever has rows for quarter-structure schools; a semester-
    structure school's students simply have none of these.
    """
    serializer_class = StudentSemesterResultSerializer
    permission_classes = [IsAuthenticated]

    def get_permissions(self):
        if self.action == 'list':
            return [IsAuthenticated(), CanManageAcademics()]
        return [IsAuthenticated()]

    def get_queryset(self):
        school_id = get_verified_school_id(self.request)
        qs = StudentSemesterResult.objects.select_related('student', 'semester').filter(school_id=school_id)
        semester_id = self.request.query_params.get('semester_id')
        if semester_id:
            qs = qs.filter(semester_id=semester_id)
        return qs

    def retrieve(self, request, *args, **kwargs):
        """Single student's semester result, with the per-subject breakdown included."""
        instance = self.get_object()
        staff = _get_staff_profile(request)
        if not _is_admin(request):
            year_id = instance.academic_year_id
            if not staff or not _teacher_owns_homeroom(staff, instance.grade, instance.section, year_id):
                return Response({'error': 'You are not the homeroom teacher for this class'}, status=403)
        serializer = self.get_serializer(instance, context={'include_subjects': True})
        return Response(serializer.data)

    @action(detail=False, methods=['get'])
    def class_results(self, request):
        """Query params: semester_id, grade, section. Ranked list for one homeroom class."""
        school_id = get_verified_school_id(request)
        semester_id = request.query_params.get('semester_id')
        grade = request.query_params.get('grade')
        section = request.query_params.get('section', '')

        if not (school_id and semester_id and grade):
            return Response({'error': 'semester_id and grade are required'}, status=400)

        staff = _get_staff_profile(request)
        if not _is_admin(request):
            semester = Semester.objects.filter(id=semester_id).first()
            year_id = semester.academic_year_id if semester else None
            if not staff or not _teacher_owns_homeroom(staff, int(grade), section, year_id):
                return Response({'error': 'You are not the homeroom teacher for this class'}, status=403)

        qs = StudentSemesterResult.objects.select_related('student').filter(
            school_id=school_id, semester_id=semester_id, grade=grade, section=section,
        ).order_by('homeroom_rank')
        return Response(StudentSemesterResultSerializer(qs, many=True).data)

    @action(detail=False, methods=['get'])
    def class_results_semesters(self, request):
        """
        Query params: grade, section, academic_year_id.

        Same shape as StudentTermResultViewSet.class_results_terms, one
        level up: every Semester side by side (instead of every Term)
        plus the year-end average and rank, for the homeroom's "Check
        Result and Award" screen on a quarter-structure school. Reads
        StudentSemesterResult directly (already computed + ranked) for
        the semester columns, and report_cards.cumulative_service for
        the hierarchical year-end figure — the exact same function that
        feeds the cumulative report card, so this screen and that PDF
        can never disagree.
        """
        school_id = get_verified_school_id(request)
        grade = request.query_params.get('grade')
        section = request.query_params.get('section', '')
        academic_year_id = request.query_params.get('academic_year_id')

        if not (school_id and grade and academic_year_id):
            return Response({'error': 'grade and academic_year_id are required'}, status=400)

        try:
            grade = int(grade)
            academic_year_id = int(academic_year_id)
        except (TypeError, ValueError):
            return Response({'error': 'grade and academic_year_id must be numbers'}, status=400)

        staff = _get_staff_profile(request)
        if not _is_admin(request):
            if not staff or not _teacher_owns_homeroom(staff, grade, section, academic_year_id):
                return Response({'error': 'You are not the homeroom teacher for this class'}, status=403)

        from schools.models import School
        school = School.objects.filter(id=school_id).first()
        year = AcademicYear.objects.filter(id=academic_year_id, school_id=school_id).first()
        if not (school and year):
            return Response({'error': 'Academic year not found'}, status=404)

        semesters = list(Semester.objects.filter(school=school, academic_year=year, is_active=True).order_by('order', 'name'))

        from report_cards.services.cumulative_service import compute_cumulative_for_class
        cumulative = compute_cumulative_for_class(school, year, grade, section)

        semester_results = StudentSemesterResult.objects.filter(
            school=school, academic_year=year, grade=grade, section=section,
        ).select_related('semester')
        per_student = {}
        for r in semester_results:
            per_student.setdefault(r.student_id, {})[r.semester_id] = r

        students = Student.objects.filter(school=school, grade=grade, section=section, status='active').order_by('first_name', 'last_name')

        results = []
        for s in students:
            entry = cumulative.get(s.id, {})
            student_semesters = per_student.get(s.id, {})
            results.append({
                'student_id': s.id,
                'student_name': f"{s.first_name} {s.last_name}",
                'student_id_display': s.student_id,
                'semesters': [
                    {
                        'semester_id': sem.id,
                        'semester_name': sem.name,
                        'average': (student_semesters[sem.id].overall_average if sem.id in student_semesters else None),
                    }
                    for sem in semesters
                ],
                'average_of_semesters': entry.get('overall_average'),
                'semesters_counted': entry.get('terms_counted', 0),
                'is_passing': entry.get('is_passing'),
                'letter_grade': entry.get('letter_grade', ''),
                'homeroom_rank': entry.get('homeroom_rank'),
                'homeroom_rank_total': entry.get('homeroom_rank_total'),
            })

        results.sort(key=lambda r: (r['homeroom_rank'] is None, r['homeroom_rank'] or 0))

        return Response({
            'semesters': [{'id': sem.id, 'name': sem.name} for sem in semesters],
            'results': results,
        })

    @action(detail=False, methods=['get'])
    def school_top(self, request):
        """Query params: semester_id, band ('elementary' or 'high_school'), limit (default 3). Admin only — for award/ranking lists."""
        if not _is_admin(request):
            return Response({'error': 'Admin only'}, status=403)

        school_id = get_verified_school_id(request)
        semester_id = request.query_params.get('semester_id')
        band = request.query_params.get('band', 'elementary')
        limit = int(request.query_params.get('limit', 3))

        if not (school_id and semester_id):
            return Response({'error': 'semester_id is required'}, status=400)

        max_grade = StudentSemesterResult.ELEMENTARY_MAX_GRADE
        qs = StudentSemesterResult.objects.select_related('student').filter(
            school_id=school_id, semester_id=semester_id, school_rank__isnull=False,
        )
        qs = qs.filter(grade__lte=max_grade) if band == 'elementary' else qs.filter(grade__gt=max_grade)
        qs = qs.order_by('school_rank')[:limit]
        return Response(StudentSemesterResultSerializer(qs, many=True).data)

    @action(detail=False, methods=['post'])
    def recalculate(self, request):
        """Body: { semester_id }. Admin only — full recompute for the whole school, this semester."""
        if not _is_admin(request):
            return Response({'error': 'Admin only'}, status=403)

        school_id = get_verified_school_id(request)
        semester_id = request.data.get('semester_id')
        if not (school_id and semester_id):
            return Response({'error': 'semester_id is required'}, status=400)

        semester = Semester.objects.filter(id=semester_id, school_id=school_id).first()
        if not semester:
            return Response({'error': 'Semester not found'}, status=404)

        staff = _get_staff_profile(request)
        count = results_service.recompute_for_semester(
            school=semester.school, academic_year=semester.academic_year, semester=semester, computed_by=staff,
        )
        return Response({'recomputed_students': count})
