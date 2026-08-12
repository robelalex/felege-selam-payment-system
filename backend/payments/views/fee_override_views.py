# backend/payments/views/fee_override_views.py
"""
Admin-facing management of StudentFeeOverride (Jimma request #1 — fee
exceptions & flexible payment plans).

Scoped to CanManagePayments (school_admin/super_admin/accountant), same
tier as the rest of payment administration. Every queryset is filtered
to the caller's own school via get_verified_school_id() — a school_admin
or accountant can never see or edit another school's fee exceptions,
even by guessing IDs (object-level check in get_object() below backs up
the queryset filter).
"""
from django.utils import timezone
from rest_framework import viewsets, status
from rest_framework.decorators import action
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.exceptions import PermissionDenied, NotFound

from ..models import StudentFeeOverride
from ..serializers import StudentFeeOverrideSerializer
from authentication.permissions import CanManagePayments
from common.utils import get_verified_school_id


class StudentFeeOverrideViewSet(viewsets.ModelViewSet):
    serializer_class = StudentFeeOverrideSerializer
    permission_classes = [IsAuthenticated, CanManagePayments]

    def get_queryset(self):
        school_id = get_verified_school_id(self.request)
        qs = StudentFeeOverride.objects.select_related(
            'student', 'academic_year', 'created_by', 'deactivated_by'
        )
        if school_id:
            qs = qs.filter(student__school_id=school_id)
        else:
            # No resolvable school (shouldn't normally happen for a
            # non-super-admin under CanManagePayments) — return nothing
            # rather than accidentally leaking every school's records.
            qs = qs.none()

        student_id = self.request.query_params.get('student_id')
        if student_id:
            qs = qs.filter(student__student_id=student_id)

        academic_year_id = self.request.query_params.get('academic_year_id')
        if academic_year_id:
            qs = qs.filter(academic_year_id=academic_year_id)

        is_active = self.request.query_params.get('is_active')
        if is_active is not None:
            qs = qs.filter(is_active=is_active.lower() in ('1', 'true', 'yes'))

        return qs

    def get_object(self):
        obj = super().get_object()
        school_id = get_verified_school_id(self.request)
        if school_id and obj.student.school_id != school_id:
            raise NotFound('Fee override not found.')
        return obj

    def perform_create(self, serializer):
        student = serializer.validated_data.get('student')
        school_id = get_verified_school_id(self.request)
        if school_id and student and student.school_id != school_id:
            raise PermissionDenied("Student does not belong to your school.")
        serializer.save(created_by=self.request.user)

    @action(detail=True, methods=['post'])
    def deactivate(self, request, pk=None):
        """
        Soft-deactivate rather than delete — keeps the supporting
        document and approval history on file (audit/inspection
        readiness, same convention as StudentDocument.verified).
        """
        override = self.get_object()
        override.is_active = False
        override.deactivated_by = request.user
        override.deactivated_at = timezone.now()
        override.save(update_fields=['is_active', 'deactivated_by', 'deactivated_at'])
        return Response(StudentFeeOverrideSerializer(override).data)
