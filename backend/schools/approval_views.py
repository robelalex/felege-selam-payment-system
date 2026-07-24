# backend/schools/approval_views.py
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import BasePermission
from rest_framework.response import Response
from django.contrib.auth.models import User
from schools.models import School, SchoolAdminProfile
from common.email_service import send_approval_notification


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
                'logo': profile.school.logo.url if profile.school.logo else None
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
    """Reject a school registration"""
    try:
        user = User.objects.get(id=user_id)
        profile = SchoolAdminProfile.objects.get(user=user)
        school = profile.school
        user.delete()
        school.delete()
        return Response({
            'success': True,
            'message': 'School registration rejected and removed'
        })
    except User.DoesNotExist:
        return Response({'error': 'User not found'}, status=404)