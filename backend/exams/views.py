# exams/views.py
from rest_framework import viewsets, serializers as drf_serializers
from rest_framework.decorators import action
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from django.utils import timezone
from django.db import transaction

from .models import AssessmentType, Mark, DailyAttendance
from .serializers import AssessmentTypeSerializer, MarkSerializer, DailyAttendanceSerializer
from academics.models import AcademicYear, Subject, HomeroomAssignment
from staff.models import TeacherClassAssignment
from students.models import Student
from common.utils import get_verified_school_id, get_effective_role
from authentication.permissions import CanManageAcademics, IsTeacherOrAdmin


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
        return queryset

    def perform_create(self, serializer):
        school_id = get_verified_school_id(self.request)
        if not school_id:
            raise drf_serializers.ValidationError({"error": "Could not resolve your school"})
        academic_year = serializer.validated_data.get('academic_year')
        if academic_year and academic_year.school_id != school_id:
            raise drf_serializers.ValidationError({"error": "Academic year does not belong to your school"})
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
            year = Mark.objects.filter(school_id=school_id).first()
            year_id = year.academic_year_id if year else None
            if not staff or not _teacher_owns_homeroom(staff, int(grade), section, year_id):
                return Response({'error': 'You are not the homeroom teacher for this class'}, status=403)

        marks = self.get_queryset().filter(grade=grade, section=section, status='submitted')
        return Response(MarkSerializer(marks, many=True).data)

    @action(detail=False, methods=['post'])
    def homeroom_accept(self, request):
        """Body: { subject_id, assessment_type_id, grade, section } — accepts the whole batch."""
        return self._homeroom_decide(request, new_status='accepted')

    @action(detail=False, methods=['post'])
    def homeroom_reject(self, request):
        """Body: { subject_id, assessment_type_id, grade, section, note } — sends it back for correction."""
        return self._homeroom_decide(request, new_status='rejected')

    def _homeroom_decide(self, request, new_status):
        school_id = get_verified_school_id(request)
        subject_id = request.data.get('subject_id')
        assessment_type_id = request.data.get('assessment_type_id')
        grade = request.data.get('grade')
        section = request.data.get('section', '')
        note = request.data.get('note', '')

        if not (school_id and subject_id and assessment_type_id and grade and section):
            return Response({'error': 'subject_id, assessment_type_id, grade, and section are required'}, status=400)

        staff = _get_staff_profile(request)
        if not _is_admin(request):
            qs = Mark.objects.filter(school_id=school_id, subject_id=subject_id, grade=grade)
            year_id = qs.first().academic_year_id if qs.exists() else None
            if not staff or not _teacher_owns_homeroom(staff, int(grade), section, year_id):
                return Response({'error': 'You are not the homeroom teacher for this class'}, status=403)

        count = Mark.objects.filter(
            school_id=school_id, subject_id=subject_id, assessment_type_id=assessment_type_id,
            grade=grade, section=section, status='submitted',
        ).update(status=new_status, reviewed_by=staff, reviewed_at=timezone.now(), homeroom_note=note)

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
