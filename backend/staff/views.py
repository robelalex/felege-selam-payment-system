# staff/views.py
import secrets

from django.contrib.auth.hashers import make_password
from django.contrib.auth.models import User
from rest_framework import viewsets, status
from rest_framework import serializers as drf_serializers
from rest_framework.decorators import action
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from .models import StaffMember, TeacherClassAssignment
from .serializers import StaffMemberSerializer, TeacherClassAssignmentSerializer
from schools.models import School
from common.utils import get_verified_school_id, is_super_admin, log_action
from authentication.models import UserProfile
from authentication.permissions import CanManageStaff


def _generate_temp_password(length=10):
    """Readable-ish random password: letters + digits, no ambiguous chars."""
    alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789'
    return ''.join(secrets.choice(alphabet) for _ in range(length))


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

    def get_permissions(self):
        # Only a school_admin (or super_admin) can add/edit/remove staff
        # or grant/revoke their portal logins. Every other role can only
        # read the list (e.g. a teacher looking up a colleague).
        if self.action in (
            'create', 'update', 'partial_update', 'destroy',
            'create_login', 'revoke_login',
        ):
            return [IsAuthenticated(), CanManageStaff()]
        return [IsAuthenticated()]

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
        staff = serializer.save(school=school)
        log_action(
            self.request.user, 'STAFF_CREATE',
            f"Added staff member {staff.full_name} ({staff.get_role_display()})",
            self.request,
        )

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
        updated = serializer.save(school=staff.school)
        log_action(
            self.request.user, 'STAFF_EDIT',
            f"Edited staff member {updated.full_name}",
            self.request,
        )

    def perform_destroy(self, instance):
        log_action(
            self.request.user, 'STAFF_DELETE',
            f"Removed staff member {instance.full_name}",
            self.request,
        )
        instance.delete()

    @action(detail=False, methods=['get'], url_path='teachers')
    def teachers(self, request):
        """Active teachers only — convenience endpoint for attendance/exam grade-entry dropdowns."""
        queryset = self.get_queryset().filter(role='teacher', status='active')
        serializer = self.get_serializer(queryset, many=True)
        return Response(serializer.data)

    @action(detail=True, methods=['post'], url_path='create_login')
    def create_login(self, request, pk=None):
        """
        Grant portal/app login access to this staff member: creates a User
        + UserProfile (role='staff'), links it via StaffMember.user, and
        returns the generated credentials ONCE (password is never stored
        in retrievable form, only its hash).
        """
        staff = self.get_object()

        if staff.user_id:
            return Response({'error': 'This staff member already has a login.'}, status=400)

        email = (request.data.get('email') or staff.email or '').strip().lower()
        if not email:
            return Response({'error': 'An email address is required to create a login.'}, status=400)

        if User.objects.filter(email__iexact=email).exists():
            return Response({'error': 'A user with this email already exists.'}, status=400)

        # Build a unique username from the staff_id (falls back to email prefix).
        base_username = (staff.staff_id or email.split('@')[0]).lower().replace(' ', '')
        username = base_username
        suffix = 1
        while User.objects.filter(username=username).exists():
            suffix += 1
            username = f"{base_username}{suffix}"

        password = _generate_temp_password()

        user = User.objects.create(
            username=username,
            email=email,
            password=make_password(password),
            first_name=staff.first_name,
            last_name=staff.last_name,
            is_active=True,
        )
        UserProfile.objects.create(
            user=user,
            role='staff',
            phone=staff.phone,
            school_id=staff.school_id,
            is_email_verified=True,  # skip the email-verification gate — admin already vetted them
        )

        staff.user = user
        staff.email = staff.email or email
        staff.save(update_fields=['user', 'email'])

        log_action(
            request.user, 'STAFF_LOGIN_GRANTED',
            f"Granted portal login to {staff.full_name} ({email})",
            request,
        )

        return Response({
            'credentials': {
                'email': email,
                'username': username,
                'password': password,
                'role_display': staff.get_role_display(),
            }
        }, status=201)

    @action(detail=True, methods=['post'], url_path='revoke_login')
    def revoke_login(self, request, pk=None):
        """Remove portal access without deleting the underlying HR record."""
        staff = self.get_object()

        if not staff.user_id:
            return Response({'error': 'This staff member does not have a login.'}, status=400)

        user = staff.user
        staff.user = None
        staff.save(update_fields=['user'])
        user.is_active = False
        user.save(update_fields=['is_active'])

        log_action(
            request.user, 'STAFF_LOGIN_REVOKED',
            f"Revoked portal login for {staff.full_name}",
            request,
        )

        return Response({'success': True})


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
