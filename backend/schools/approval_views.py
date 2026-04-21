# backend/schools/approval_views.py
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import IsAdminUser
from rest_framework.response import Response
from django.contrib.auth.models import User
from schools.models import School, SchoolAdminProfile


@api_view(['GET'])
@permission_classes([IsAdminUser])
def pending_approvals(request):
    """Get all pending school registrations"""
    pending_users = User.objects.filter(is_active=False, is_staff=True)
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
@permission_classes([IsAdminUser])
def approve_school(request, user_id):
    """Approve a school registration"""
    try:
        user = User.objects.get(id=user_id)
        user.is_active = True
        user.save()
        
        profile = SchoolAdminProfile.objects.get(user=user)
        profile.school.subscription_active = True
        profile.school.save()
        
        return Response({
            'success': True,
            'message': f'School {profile.school.name} approved successfully'
        })
    except User.DoesNotExist:
        return Response({'error': 'User not found'}, status=404)
    except SchoolAdminProfile.DoesNotExist:
        return Response({'error': 'School admin profile not found'}, status=404)


@api_view(['POST'])
@permission_classes([IsAdminUser])
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