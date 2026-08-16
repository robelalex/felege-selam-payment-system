# staff/views.py
import secrets
from datetime import date

from django.contrib.auth.hashers import make_password
from django.contrib.auth.models import User
from django.utils import timezone
from rest_framework import viewsets, status
from rest_framework import serializers as drf_serializers
from rest_framework.decorators import action, api_view, permission_classes
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from .models import StaffMember, TeacherClassAssignment, StaffDocument, StaffCareerEvent
from .serializers import (
    StaffMemberSerializer, TeacherClassAssignmentSerializer,
    StaffDocumentSerializer, StaffCareerEventSerializer,
)
from schools.models import School
from common.utils import get_verified_school_id, is_super_admin, log_action
from authentication.models import UserProfile
from authentication.permissions import CanManageStaff


@api_view(['GET'])
@permission_classes([IsAuthenticated])
def my_assignments(request):
    """
    Called right after a teacher logs into the mobile app: 'what are my
    classes'. Combines their homeroom assignment (if any) and their
    subject-teaching assignments in one call, so the app can build its
    home screen without five separate requests.
    """
    staff = getattr(request.user, 'staff_profile', None)
    if not staff or staff.role != 'teacher':
        return Response({'error': 'This account is not set up as a teacher'}, status=403)

    from academics.models import HomeroomAssignment, AcademicYear

    current_year = AcademicYear.objects.filter(school_id=staff.school_id, is_current=True).first()

    homeroom = None
    if current_year:
        homeroom_assignment = HomeroomAssignment.objects.filter(
            teacher=staff, academic_year=current_year
        ).select_related('section').first()
        if homeroom_assignment:
            homeroom = {
                'grade': homeroom_assignment.grade,
                'section': homeroom_assignment.section.name,
                'academic_year': current_year.name,
            }

    subject_assignments = TeacherClassAssignment.objects.filter(
        staff=staff, is_active=True,
        academic_year=current_year.name if current_year else None,
    ).select_related('subject').values(
        'id', 'grade', 'section', 'subject_id', 'subject__name'
    )

    return Response({
        'teacher_name': staff.full_name,
        'is_homeroom_teacher': homeroom is not None,
        'homeroom': homeroom,
        'subject_assignments': list(subject_assignments),
        'current_academic_year': current_year.name if current_year else None,
        'current_academic_year_id': current_year.id if current_year else None,
    })


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
            'create_login', 'revoke_login', 'add_career_note',
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
        # Previously this only deleted the StaffMember HR record and left
        # the linked login (User) account behind, inactive but still
        # occupying that email forever — so re-creating a login with the
        # same email later always failed with "already exists", even
        # though the staff member looked fully deleted. Delete the login
        # too so the email is genuinely freed up.
        linked_user = instance.user
        instance.delete()
        if linked_user:
            linked_user.delete()

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

        # ✅ FIX: a parent's email (used only by the separate
        # parent_login_step1 OTP system, in a totally different school
        # potentially) was blocking staff-login creation here. admin_login
        # already correctly excludes 'parent' role accounts when resolving
        # staff/admin logins by email (see admin_login_step1) — this check
        # needs the same exclusion, or it treats an unrelated parent
        # account as if it were a staff/admin conflict.
        if User.objects.exclude(profile__role='parent').filter(email__iexact=email).exists():
            return Response({'error': 'A staff or admin account with this email already exists.'}, status=400)

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

    @action(detail=True, methods=['post'], url_path='career-notes')
    def add_career_note(self, request, pk=None):
        # Permission for this action is resolved via get_permissions()
        # above (added to the CanManageStaff-gated action tuple) — not a
        # decorator-level permission_classes kwarg, which would be
        # silently ignored since this ViewSet overrides get_permissions().
        """
        ✅ Jimma item 5 — HR: manual career-history entries (e.g.
        "Promoted to Head Teacher, effective next term — performance
        review"), alongside the automatic role/title/status/salary
        entries logged by staff/signals.py. Same permission as
        create/update — only a school_admin (or super_admin) can add
        one, same as everything else that touches a staff record.
        """
        staff = self.get_object()
        note = (request.data.get('note') or '').strip()
        if not note:
            return Response({'error': 'A note is required.'}, status=400)

        effective_date = request.data.get('effective_date') or date.today().isoformat()

        event = StaffCareerEvent.objects.create(
            staff=staff,
            event_type='note',
            note=note,
            is_manual=True,
            recorded_by=request.user,
            effective_date=effective_date,
        )
        log_action(
            request.user, 'STAFF_CAREER_NOTE',
            f"Added career note for {staff.full_name}",
            request,
        )
        return Response(StaffCareerEventSerializer(event).data, status=201)


class StaffDocumentViewSet(viewsets.ModelViewSet):
    """
    ✅ Jimma item 5 — HR: official documents on file (National ID,
    credentials, contracts — admin-defined type per upload). Tenant
    scoping goes through staff__school, same verified-school-id pattern
    as StaffMemberViewSet, so one school can never see or touch another
    school's staff documents.

    verified/verified_by/verified_at are read-only on the serializer and
    only ever change through the dedicated verify/unverify actions below
    — never a plain PATCH — so uploading a document can't also silently
    mark it verified.
    """
    serializer_class = StaffDocumentSerializer
    permission_classes = [IsAuthenticated]
    queryset = StaffDocument.objects.all()

    def get_permissions(self):
        if self.action in ('create', 'update', 'partial_update', 'destroy', 'verify', 'unverify'):
            return [IsAuthenticated(), CanManageStaff()]
        return [IsAuthenticated()]

    def get_queryset(self):
        queryset = StaffDocument.objects.all().select_related('staff', 'uploaded_by', 'verified_by')
        user = self.request.user
        school_id = get_verified_school_id(self.request)

        if not is_super_admin(user):
            if not school_id:
                return StaffDocument.objects.none()
            queryset = queryset.filter(staff__school_id=school_id)
        elif school_id:
            queryset = queryset.filter(staff__school_id=school_id)

        staff_id = self.request.query_params.get('staff_id')
        if staff_id:
            queryset = queryset.filter(staff_id=staff_id)

        return queryset

    def perform_create(self, serializer):
        staff_id = self.request.data.get('staff')
        if not staff_id:
            raise drf_serializers.ValidationError({"error": "staff is required."})
        try:
            staff = StaffMember.objects.get(pk=staff_id)
        except StaffMember.DoesNotExist:
            raise drf_serializers.ValidationError({"error": "Staff member not found."})

        # Same cross-tenant guard as StaffMemberViewSet.perform_create.
        if not is_super_admin(self.request.user):
            school_id = get_verified_school_id(self.request)
            if str(staff.school_id) != str(school_id):
                raise drf_serializers.ValidationError({
                    "error": "That staff member does not belong to your school."
                })

        uploaded_file = self.request.FILES.get('file')
        original_filename = uploaded_file.name if uploaded_file else ''

        doc = serializer.save(
            staff=staff,
            uploaded_by=self.request.user,
            original_filename=original_filename,
        )
        log_action(
            self.request.user, 'STAFF_DOCUMENT_UPLOAD',
            f"Uploaded {doc.document_type} for {staff.full_name}",
            self.request,
        )

    def perform_destroy(self, instance):
        if not is_super_admin(self.request.user):
            school_id = get_verified_school_id(self.request)
            if str(instance.staff.school_id) != str(school_id):
                raise drf_serializers.ValidationError({
                    "error": "You cannot delete a document from another school's staff member."
                })
        log_action(
            self.request.user, 'STAFF_DOCUMENT_DELETE',
            f"Deleted {instance.document_type} for {instance.staff.full_name}",
            self.request,
        )
        instance.delete()

    @action(detail=True, methods=['post'], url_path='verify')
    def verify(self, request, pk=None):
        doc = self.get_object()
        doc.verified = True
        doc.verified_by = request.user
        doc.verified_at = timezone.now()
        doc.save(update_fields=['verified', 'verified_by', 'verified_at'])
        log_action(
            request.user, 'STAFF_DOCUMENT_VERIFY',
            f"Verified {doc.document_type} for {doc.staff.full_name}",
            request,
        )
        return Response(StaffDocumentSerializer(doc).data)

    @action(detail=True, methods=['post'], url_path='unverify')
    def unverify(self, request, pk=None):
        doc = self.get_object()
        doc.verified = False
        doc.verified_by = None
        doc.verified_at = None
        doc.save(update_fields=['verified', 'verified_by', 'verified_at'])
        log_action(
            request.user, 'STAFF_DOCUMENT_UNVERIFY',
            f"Unverified {doc.document_type} for {doc.staff.full_name}",
            request,
        )
        return Response(StaffDocumentSerializer(doc).data)


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
        if staff and staff.role != 'teacher':
            raise drf_serializers.ValidationError({
                "error": "Selected staff member is not marked as a teacher."
            })

        # ✅ Same check for the subject being assigned — it must belong to
        # this school too, not another tenant's subject list.
        subject = serializer.validated_data.get('subject')
        if subject and subject.school_id != school.id:
            raise drf_serializers.ValidationError({
                "error": "That subject does not belong to your school."
            })

        serializer.save(school=school)

    def perform_destroy(self, instance):
        # Soft-delete: keep historical attendance/exam records pointing at
        # a real assignment, just remove it from future selection.
        instance.is_active = False
        instance.save()
