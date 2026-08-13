# backend/payments/views/registration_views.py
"""
✅ Jimma request #2 — registration fees.

Admin-facing management of RegistrationFeeConfig (school-configurable
new/continuing amounts per academic year) and StudentRegistrationType
(per-student new-vs-continuing classification, auto-detected but
admin-overridable). Same permission tier and school-scoping pattern as
fee_override_views.py — see that file for the rationale.
"""
from rest_framework import viewsets, status
from rest_framework.decorators import action
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.exceptions import PermissionDenied, NotFound

from ..models import RegistrationFeeConfig, StudentRegistrationType
from ..serializers import RegistrationFeeConfigSerializer, StudentRegistrationTypeSerializer
from ..services.registration_fee_service import (
    get_registration_type,
    set_registration_type_override,
)
from authentication.permissions import CanManagePayments
from common.utils import get_verified_school_id


class RegistrationFeeConfigViewSet(viewsets.ModelViewSet):
    """
    One row per school per academic year. Admins set/update
    new_student_amount and continuing_student_amount here — "settable
    fresh every academic year" per the request, so there's no default
    carried over automatically; each year needs its own row.
    """
    serializer_class = RegistrationFeeConfigSerializer
    permission_classes = [IsAuthenticated, CanManagePayments]

    def get_queryset(self):
        school_id = get_verified_school_id(self.request)
        qs = RegistrationFeeConfig.objects.select_related('academic_year', 'created_by')
        if school_id:
            qs = qs.filter(school_id=school_id)
        else:
            qs = qs.none()

        academic_year_id = self.request.query_params.get('academic_year_id')
        if academic_year_id:
            qs = qs.filter(academic_year_id=academic_year_id)

        return qs

    def get_object(self):
        obj = super().get_object()
        school_id = get_verified_school_id(self.request)
        if school_id and obj.school_id != school_id:
            raise NotFound('Registration fee configuration not found.')
        return obj

    def perform_create(self, serializer):
        school_id = get_verified_school_id(self.request)
        if not school_id:
            raise PermissionDenied("No school associated with this account.")
        serializer.save(school_id=school_id, created_by=self.request.user)


class StudentRegistrationTypeViewSet(viewsets.ModelViewSet):
    """
    Read/override a student's new-vs-continuing classification for a
    given academic year. list()/retrieve() auto-detect-and-cache a row
    if one doesn't exist yet (via get_registration_type), so staff always
    see a real classification rather than a gap. Direct create/update
    through the serializer is intentionally blocked in favor of the
    explicit `set_type` action below, which always goes through
    set_registration_type_override() so is_manual_override/set_by stay
    accurate — a plain PATCH could otherwise silently leave those fields
    stale or wrong.
    """
    serializer_class = StudentRegistrationTypeSerializer
    permission_classes = [IsAuthenticated, CanManagePayments]
    http_method_names = ['get', 'post', 'head', 'options']

    def get_queryset(self):
        school_id = get_verified_school_id(self.request)
        qs = StudentRegistrationType.objects.select_related('student', 'academic_year', 'set_by')
        if school_id:
            qs = qs.filter(student__school_id=school_id)
        else:
            qs = qs.none()

        student_id = self.request.query_params.get('student_id')
        if student_id:
            qs = qs.filter(student__student_id=student_id)

        academic_year_id = self.request.query_params.get('academic_year_id')
        if academic_year_id:
            qs = qs.filter(academic_year_id=academic_year_id)

        return qs

    @action(detail=False, methods=['get'], url_path='for-student')
    def for_student(self, request):
        """
        GET /api/student-registration-types/for-student/?student_id=...&academic_year_id=...
        Returns the (auto-detected-and-cached, or existing) classification
        for one student/year — the endpoint the admin payment screen calls
        to show "New" or "Continuing" next to a student before an admin
        decides whether to override it.
        """
        from students.models import Student
        from academics.models import AcademicYear

        student_id = request.query_params.get('student_id')
        academic_year_id = request.query_params.get('academic_year_id')
        if not student_id or not academic_year_id:
            return Response(
                {'error': 'student_id and academic_year_id are required'},
                status=status.HTTP_400_BAD_REQUEST
            )

        school_id = get_verified_school_id(request)
        try:
            student = Student.objects.get(student_id=student_id, school_id=school_id)
        except Student.DoesNotExist:
            return Response({'error': 'Student not found'}, status=status.HTTP_404_NOT_FOUND)

        try:
            academic_year = AcademicYear.objects.get(id=academic_year_id, school_id=school_id)
        except AcademicYear.DoesNotExist:
            return Response({'error': 'Academic year not found'}, status=status.HTTP_404_NOT_FOUND)

        reg_type = get_registration_type(student, academic_year)
        return Response(StudentRegistrationTypeSerializer(reg_type).data)

    @action(detail=False, methods=['post'], url_path='set-type')
    def set_type(self, request):
        """
        POST /api/student-registration-types/set-type/
        Body: {student_id, academic_year_id, registration_type}
        Admin override — always wins over auto-detection.
        """
        from students.models import Student
        from academics.models import AcademicYear

        student_id = request.data.get('student_id')
        academic_year_id = request.data.get('academic_year_id')
        registration_type = request.data.get('registration_type')

        if not student_id or not academic_year_id or not registration_type:
            return Response(
                {'error': 'student_id, academic_year_id, and registration_type are required'},
                status=status.HTTP_400_BAD_REQUEST
            )
        if registration_type not in ('new', 'continuing'):
            return Response(
                {'error': "registration_type must be 'new' or 'continuing'"},
                status=status.HTTP_400_BAD_REQUEST
            )

        school_id = get_verified_school_id(request)
        try:
            student = Student.objects.get(student_id=student_id, school_id=school_id)
        except Student.DoesNotExist:
            return Response({'error': 'Student not found'}, status=status.HTTP_404_NOT_FOUND)

        try:
            academic_year = AcademicYear.objects.get(id=academic_year_id, school_id=school_id)
        except AcademicYear.DoesNotExist:
            return Response({'error': 'Academic year not found'}, status=status.HTTP_404_NOT_FOUND)

        reg_type = set_registration_type_override(student, academic_year, registration_type, request.user)
        return Response(StudentRegistrationTypeSerializer(reg_type).data)
