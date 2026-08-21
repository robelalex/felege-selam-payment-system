# backend/schools/approval_views.py
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import BasePermission
from rest_framework.response import Response
from django.contrib.auth.models import User
from django.db import models, transaction, IntegrityError
from schools.models import School, SchoolAdminProfile
from common.email_service import send_approval_notification, send_rejection_notification
from common.utils import log_action


def _force_delete_school(school):
    """
    ✅ FIX — reject_school() was crashing with a 500 (ForeignKeyViolation)
    whenever a school already had related rows (AcademicYear, deadlines,
    subjects, etc.) pointing at it. Every one of those relations is
    defined with on_delete=models.CASCADE on the model, so in theory
    school.delete() alone should already cascade — but in practice the
    live database's FK constraints were out of sync with that (a
    migration drift issue independent of this code, e.g.
    "academics_academicyear_school_id_fkey" not actually set to
    ON DELETE CASCADE in Postgres even though the Django migration says
    it is).
    Rather than depend on the database enforcing the cascade correctly,
    this explicitly walks every reverse relation defined on School and
    clears it first, in Python, before deleting the school itself. This
    makes the delete work correctly regardless of what the live DB
    constraint actually is, and needs no manual DB changes.
    """
    for related in school._meta.related_objects:
        # Only auto-clear relations the model itself says are CASCADE —
        # anything else (PROTECT, SET_NULL, etc.) is a deliberate choice
        # elsewhere in the codebase and shouldn't be silently overridden
        # here.
        if related.on_delete is not models.CASCADE:
            continue
        accessor_name = related.get_accessor_name()
        if not accessor_name:
            continue
        related_manager = getattr(school, accessor_name, None)
        if related_manager is not None and hasattr(related_manager, 'all'):
            related_manager.all().delete()
    school.delete()


class IsPlatformOwner(BasePermission):
    """
    ✅ SECURITY FIX: this used to be DRF's built-in IsAdminUser, which only
    checks is_staff. is_staff can end up set on more than one account over
    time (it's also Django admin's own "can log into /admin/" flag), so
    approving/rejecting schools — the platform owner's key decision — is now
    tied specifically to is_superuser, which only Robel's account has.
    """
    def has_permission(self, request, view):
        return bool(request.user and request.user.is_authenticated and request.user.is_superuser)


@api_view(['GET'])
@permission_classes([IsPlatformOwner])
def pending_approvals(request):
    """
    Get all pending school registrations.

    ✅ SECURITY/CORRECTNESS FIX: this used to filter on is_staff=True, but
    registration (authentication/views.py:register) never sets is_staff on
    a new school admin — only is_active=False. That meant this filter was
    matching nobody, ever. Filtering by SchoolAdminProfile existence
    instead matches how registration actually creates pending accounts.
    """
    pending_users = User.objects.filter(is_active=False, school_profile__isnull=False)
    data = []
    for user in pending_users:
        profile = SchoolAdminProfile.objects.filter(user=user).first()
        if profile:
            data.append({
                'user_id': user.id,
                'username': user.username,
                'email': user.email,
                'first_name': user.first_name,
                'last_name': user.last_name,
                'school_name': profile.school.name,
                'school_code': profile.school.code,
                'registered_at': user.date_joined,
                'logo': profile.school.logo.url if profile.school.logo else None,
                # ✅ NEW: surfaces whether the registrant has confirmed their
                # email yet (see authentication/views.py register() and
                # common/email_service.py send_registration_confirmation_email).
                # A super admin can see this before deciding to approve.
                'email_verified': getattr(user.profile, 'is_email_verified', False) if hasattr(user, 'profile') else False,
            })
    return Response(data)


@api_view(['POST'])
@permission_classes([IsPlatformOwner])
def approve_school(request, user_id):
    """Approve a school registration"""
    try:
        user = User.objects.get(id=user_id)
        user.is_active = True
        user.save()
        
        profile = SchoolAdminProfile.objects.get(user=user)
        profile.school.subscription_active = True
        profile.school.subscription_status = 'approved'
        profile.school.save()
        
        # ✅ NEW — this action was never logged before, despite
        # SCHOOL_APPROVE existing in AuditLog.ACTION_CHOICES. It's the
        # platform owner's single most important decision (who gets onto
        # the platform at all), so it belongs in the Activity Log same as
        # everything else here.
        log_action(
            request.user, 'SCHOOL_APPROVE',
            details=f"Approved {profile.school.name} ({profile.school.code}) — admin: {user.email}",
            request=request,
        )
        
        # ✅ Send approval notification email
        send_approval_notification(user.email, profile.school.name)
        
        return Response({
            'success': True,
            'message': f'School {profile.school.name} approved successfully'
        })
    except User.DoesNotExist:
        return Response({'error': 'User not found'}, status=404)
    except SchoolAdminProfile.DoesNotExist:
        return Response({'error': 'School admin profile not found'}, status=404)

@api_view(['POST'])
@permission_classes([IsPlatformOwner])
def reject_school(request, user_id):
    """
    Reject a school registration.

    ✅ FIX — this used to 500 whenever the school had related rows
    (see _force_delete_school above), and never sent the school admin
    any notification email or read a rejection reason. Both are fixed
    below. Everything else (log_action, response shape, URL, method)
    is unchanged so nothing calling this endpoint needs to change.
    """
    # ✅ NEW — optional free-text reason from the request body, e.g.
    # {"reason": "Missing required documentation"}. Frontend can send
    # this or omit it entirely; the email just skips the reason line
    # if it's blank, same as before.
    reason = request.data.get('reason', '')

    try:
        user = User.objects.get(id=user_id)
        profile = SchoolAdminProfile.objects.get(user=user)
        school = profile.school

        # Captured BEFORE deletion — user/school are about to be removed,
        # so we can't read these off them afterwards.
        admin_email = user.email
        school_name = school.name
        school_code = school.code

        # ✅ FIX — log_action + both delete()s now all happen inside one
        # transaction. Previously log_action ran, then the plain
        # user.delete(); school.delete() crashed — so a "SCHOOL_REJECT"
        # entry landed in the audit log for a school that, because of the
        # crash, never actually got deleted. Wrapping all three in
        # atomic() means either everything succeeds together, or nothing
        # is written/deleted at all. _force_delete_school replaces the
        # old two-line `user.delete(); school.delete()` that crashed.
        with transaction.atomic():
            log_action(
                request.user, 'SCHOOL_REJECT',
                details=f"Rejected {school_name} ({school_code}) — admin: {admin_email}"
                        + (f" — reason: {reason}" if reason else ""),
                request=request,
            )
            user.delete()
            _force_delete_school(school)

        # ✅ NEW — send the rejection email only after the delete
        # succeeded, using the values captured above (school/user
        # objects are gone at this point).
        send_rejection_notification(admin_email, school_name, reason)

        return Response({
            'success': True,
            'message': 'School registration rejected and removed'
        })
    except User.DoesNotExist:
        return Response({'error': 'User not found'}, status=404)
    except SchoolAdminProfile.DoesNotExist:
        # ✅ NEW — approve_school already handles this case; reject_school
        # was missing it, so a user with no profile caused an unhandled
        # 500 instead of a clean 404 like everywhere else in this file.
        return Response({'error': 'School admin profile not found'}, status=404)
    except IntegrityError as e:
        # ✅ NEW — last-resort safety net. If the database still refuses
        # the delete for some reason _force_delete_school didn't
        # anticipate (e.g. a new related model added later without
        # CASCADE), this returns a clean, understandable error instead
        # of a raw 500 stack trace.
        return Response({
            'error': 'Could not reject this school because other records still '
                      'reference it. Please check for related data and try again, '
                      'or contact support.',
            'detail': str(e),
        }, status=409)