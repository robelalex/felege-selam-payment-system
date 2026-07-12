# staff/views.py
from rest_framework import viewsets, status
from rest_framework import serializers as drf_serializers
from rest_framework.decorators import action
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from .models import StaffMember, TeacherClassAssignment
from .serializers import StaffMemberSerializer, TeacherClassAssignmentSerializer
from schools.models import School
from common.utils import get_verified_school_id, is_super_admin


class StaffMemberViewSet(viewsets.ModelViewSet):
    """
    ✅ Tenant scoping uses get_verified_school_id(), NOT the older
    get_school_id_from_request() header-trusting helper. Non-super-admins
    are always scoped to their OWN school regardless of any header sent —
    see common/utils.py for details.
    """
    serializer_class = StaffMemberSerializer
    permission_classes = [IsAuthenticated]
    # Only used by DRF's router to infer the url basename — get_queryset()
    # below is what actually runs for every real request.
    queryset = StaffMember.objects.all()

    def get_queryset(self):
        queryset = StaffMember.objects.all().select_related('school').prefetch_related('class_assignments')
        user = self.request.user
        school_id = get_verified_school_id(self.request)

        if not is_super_admin(user):
            if not school_id:
                return StaffMember.objects.none()
            queryset = queryset.filter(school_id=school_id)
        elif school_id:
            queryset = queryset.filter(school_id=school_id)

        role = self.request.query_params.get('role')
        if role:
            queryset = queryset.filter(role=role)

        status_filter = self.request.query_params.get('status')
        if status_filter:
            queryset = queryset.filter(status=status_filter)

        return queryset.order_by('first_name', 'last_name')

    def perform_create(self, serializer):
        school_id = get_verified_school_id(self.request)
        if not school_id:
            raise drf_serializers.ValidationError({
                "error": "Could not determine your school. If you manage multiple schools, "
                         "make sure X-School-ID is set; otherwise contact support."
            })
        try:
            school = School.objects.get(id=school_id)
        except School.DoesNotExist:
            raise drf_serializers.ValidationError({"error": "School not found"})
        serializer.save(school=school)

    def perform_update(self, serializer):
        staff = self.get_object()
        user = self.request.user
        if not is_super_admin(user):
            school_id = get_verified_school_id(self.request)
            if str(staff.school_id) != str(school_id):
                raise drf_serializers.ValidationError({
                    "error": "You cannot modify a staff member from another school"
                })
        # Never let school be changed via the update payload
        serializer.save(school=staff.school)

    @action(detail=False, methods=['get'], url_path='teachers')
    def teachers(self, request):
        """Active teachers only — convenience endpoint for attendance/exam grade-entry dropdowns."""
        queryset = self.get_queryset().filter(role='teacher', status='active')
        serializer = self.get_serializer(queryset, many=True)
        return Response(serializer.data)


class TeacherClassAssignmentViewSet(viewsets.ModelViewSet):
    serializer_class = TeacherClassAssignmentSerializer
    permission_classes = [IsAuthenticated]
    queryset = TeacherClassAssignment.objects.all()

    def get_queryset(self):
        queryset = TeacherClassAssignment.objects.filter(is_active=True).select_related('staff', 'school')
        user = self.request.user
        school_id = get_verified_school_id(self.request)

        if not is_super_admin(user):
            if not school_id:
                return TeacherClassAssignment.objects.none()
            queryset = queryset.filter(school_id=school_id)
        elif school_id:
            queryset = queryset.filter(school_id=school_id)

        staff_id = self.request.query_params.get('staff_id')
        if staff_id:
            queryset = queryset.filter(staff_id=staff_id)

        grade = self.request.query_params.get('grade')
        if grade:
            try:
                queryset = queryset.filter(grade=int(grade))
            except ValueError:
                pass

        return queryset

    def perform_create(self, serializer):
        school_id = get_verified_school_id(self.request)
        if not school_id:
            raise drf_serializers.ValidationError({"error": "Could not determine your school."})
        try:
            school = School.objects.get(id=school_id)
        except School.DoesNotExist:
            raise drf_serializers.ValidationError({"error": "School not found"})

        # Also make sure the staff member being assigned actually belongs
        # to this same school — prevents cross-tenant assignment mixups.
        staff = serializer.validated_data.get('staff')
        if staff and staff.school_id != school.id:
            raise drf_serializers.ValidationError({
                "error": "That staff member does not belong to your school."
            })

        serializer.save(school=school)

    def perform_destroy(self, instance):
        # Soft-delete: keep historical attendance/exam records pointing at
        # a real assignment, just remove it from future selection.
        instance.is_active = False
        instance.save()
