# schools/views.py
from rest_framework import viewsets
from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated
from rest_framework import status
from django.core.exceptions import ObjectDoesNotExist
from .models import School, SchoolAdminProfile
from .serializers import SchoolSerializer
from .utils import get_school_for_user

# Import the SMS service
from payments.services.multi_school_sms_service import MultiSchoolSMSService


class SchoolViewSet(viewsets.ModelViewSet):
    queryset = School.objects.all()
    serializer_class = SchoolSerializer


# ========== DEBUG ENDPOINT - TO FIND THE PROBLEM ==========
from rest_framework.decorators import api_view, permission_classes

@api_view(['GET'])
@permission_classes([IsAuthenticated])
def sms_config_preflight(request):
    """Safe diagnostic endpoint — remove after debugging."""
    user = request.user
    
    result = {
        'user_id': user.id,
        'username': user.username,
        'email': user.email,
        'x_school_id_header': request.headers.get('X-School-ID'),
        'authenticator': str(getattr(request, 'successful_authenticator', 'Not available')),
        'is_authenticated': user.is_authenticated,
        'profiles': {}
    }
    
    # Check SchoolAdminProfile
    try:
        sp = user.school_profile
        result['profiles']['school_admin_profile'] = {
            'id': sp.id, 
            'school_id': sp.school_id,
            'school_name': sp.school.name
        }
    except Exception as e:
        result['profiles']['school_admin_profile'] = f'{type(e).__name__}: {str(e)}'
    
    # Check UserProfile
    try:
        up = user.userprofile
        result['profiles']['user_profile'] = {
            'id': up.id, 
            'school_id': up.school_id
        }
    except Exception as e:
        result['profiles']['user_profile'] = f'{type(e).__name__}: {str(e)}'

    return Response(result)


# ========== TEMPORARY FIX ENDPOINT - REMOVE AFTER RUNNING ==========
from django.contrib.auth import get_user_model
from authentication.models import UserProfile

User = get_user_model()

@api_view(['POST'])
@permission_classes([IsAuthenticated])
def fix_missing_profiles(request):
    """TEMPORARY: Fix missing SchoolAdminProfiles - REMOVE THIS AFTER RUNNING ONCE"""
    # Only super admin can run this
    if not request.user.is_superuser:
        return Response({'error': 'Only super admin can run this'}, status=403)
    
    migrated = 0
    already_exists = 0
    
    for profile in UserProfile.objects.filter(school_id__isnull=False).select_related('user'):
        user = profile.user
        if not hasattr(user, 'school_profile'):
            SchoolAdminProfile.objects.create(
                user=user,
                school_id=profile.school_id,
                is_active=True
            )
            migrated += 1
        else:
            already_exists += 1
    
    return Response({
        'message': f'✅ Created {migrated} SchoolAdminProfiles',
        'already_existed': already_exists,
        'migrated': migrated
    })


# ========== SMS CONFIGURATION VIEWS ==========

class SchoolSMSConfigView(APIView):
    """View for schools to update their SMS credentials"""
    permission_classes = [IsAuthenticated]
    
    def get(self, request):
        """Get current SMS configuration for the school"""
        try:
            school = get_school_for_user(request)
        except ObjectDoesNotExist as e:
            return Response(
                {
                    'error': 'School association not found.',
                    'detail': str(e),
                    'hint': 'Please contact support to fix your profile.'
                },
                status=status.HTTP_403_FORBIDDEN
            )
        
        # Return SMS config (hide sensitive data partially)
        return Response({
            'at_username': school.at_username or '',
            'at_api_key': '********' if school.at_api_key else '',
            'sms_sender_id': school.sms_sender_id or '',
            'sms_enabled': school.sms_enabled,
            'sms_test_status': school.sms_test_status or '',
            'sms_last_test': school.sms_last_test,
            'sms_monthly_limit': school.sms_monthly_limit or 0,
            'sms_current_month_count': school.sms_current_month_count or 0,
        })
    
    def post(self, request):
        """Save SMS credentials"""
        try:
            school = get_school_for_user(request)
        except ObjectDoesNotExist as e:
            return Response(
                {'error': 'School association not found.', 'detail': str(e)},
                status=status.HTTP_403_FORBIDDEN
            )
        
        # Update fields
        if 'at_username' in request.data:
            school.at_username = request.data['at_username']
        if 'at_api_key' in request.data and request.data['at_api_key'] != '********':
            school.at_api_key = request.data['at_api_key']
        if 'sms_sender_id' in request.data:
            school.sms_sender_id = request.data['sms_sender_id']
        if 'sms_monthly_limit' in request.data:
            school.sms_monthly_limit = request.data['sms_monthly_limit']
        
        # Reset enabled flag since credentials changed
        school.sms_enabled = False
        school.sms_test_status = 'pending'
        
        school.save()
        
        return Response({
            'message': 'SMS credentials saved. Please test them.',
            'sms_enabled': school.sms_enabled,
        })


class SchoolSMSTestView(APIView):
    """Test school's Africa's Talking credentials"""
    permission_classes = [IsAuthenticated]
    
    def post(self, request):
        try:
            school = get_school_for_user(request)
        except ObjectDoesNotExist as e:
            return Response(
                {'error': 'School association not found.', 'detail': str(e)},
                status=status.HTTP_403_FORBIDDEN
            )
        
        # Check if credentials exist
        if not school.at_username or not school.at_api_key:
            return Response({'error': 'Please save your Africa\'s Talking credentials first'}, status=400)
        
        # Check if school has a phone number
        if not school.phone:
            return Response({'error': 'School phone number is not set. Please update school phone number first.'}, status=400)
        
        # Send test SMS
        try:
            sms_service = MultiSchoolSMSService(school.id)
            result = sms_service.test_credentials()
            return Response(result)
        except Exception as e:
            return Response({'error': str(e)}, status=400)


# ========== VERIFY.ET CONFIGURATION VIEWS ==========
# Each school configures their own Verify.ET credentials

@api_view(['GET', 'POST'])
@permission_classes([IsAuthenticated])
def verify_et_settings(request):
    """Get or update Verify.ET settings for the school"""
    try:
        school = get_school_for_user(request)
        
        if request.method == 'GET':
            return Response({
                'verify_et_api_key': school.verify_et_api_key or '',
                'verify_et_enabled': school.verify_et_enabled,
                'cbe_account_number': school.cbe_account_number or '',
                'cbe_account_suffix': school.cbe_account_suffix or '',
                'verify_et_test_status': school.verify_et_test_status or '',
                'verify_et_last_test': school.verify_et_last_test
            })
        
        elif request.method == 'POST':
            api_key = request.data.get('verify_et_api_key', '').strip()
            enabled = request.data.get('verify_et_enabled', False)
            account_number = request.data.get('cbe_account_number', '').strip()
            account_suffix = request.data.get('cbe_account_suffix', '').strip()
            
            # Validate account suffix (must be 8 digits)
            if account_suffix:
                if len(account_suffix) != 8:
                    return Response({'error': 'Account suffix must be exactly 8 digits'}, status=400)
                if not account_suffix.isdigit():
                    return Response({'error': 'Account suffix must contain only numbers'}, status=400)
            
            school.verify_et_api_key = api_key
            school.verify_et_enabled = enabled
            school.cbe_account_number = account_number
            school.cbe_account_suffix = account_suffix
            school.save()
            
            return Response({'success': True, 'message': 'Verify.ET settings saved successfully'})
            
    except ObjectDoesNotExist as e:
        return Response(
            {'error': 'School association not found.', 'detail': str(e)},
            status=status.HTTP_403_FORBIDDEN
        )
    except Exception as e:
        return Response({'error': str(e)}, status=500)


@api_view(['POST'])
@permission_classes([IsAuthenticated])
def test_verify_et_connection(request):
    """Test Verify.ET API connection with current settings"""
    import requests
    from django.utils import timezone
    
    try:
        school = get_school_for_user(request)
        
        if not school.verify_et_api_key:
            return Response({'error': 'Verify.ET API key not configured'}, status=400)
        
        if not school.cbe_account_suffix:
            return Response({'error': 'CBE account suffix not configured'}, status=400)
        
        # Test the API with a dummy reference
        api_url = "https://verify.et/api/verify"
        headers = {
            "Content-Type": "application/json",
            "x-api-key": school.verify_et_api_key,
        }
        payload = {
            "bank": "cbe",
            "referenceNumber": "TEST123",
            "accountSuffix": school.cbe_account_suffix,
            "waitMs": 5000,
        }
        
        response = requests.post(api_url, json=payload, headers=headers, timeout=10)
        
        school.verify_et_last_test = timezone.now()
        
        if response.status_code == 200:
            school.verify_et_test_status = 'success'
            school.verify_et_enabled = True
            school.save()
            return Response({'message': '✅ Connection successful! Your Verify.ET API key is valid.'})
        elif response.status_code == 401:
            school.verify_et_test_status = 'failed'
            school.save()
            return Response({'error': 'Invalid API key. Please check your Verify.ET API key.'}, status=401)
        else:
            school.verify_et_test_status = 'failed'
            school.save()
            return Response({'error': f'API returned status {response.status_code}. Please check your credentials.'}, status=400)
            
    except requests.exceptions.Timeout:
        return Response({'error': 'Connection timeout. Please try again.'}, status=408)
    except requests.exceptions.ConnectionError:
        return Response({'error': 'Cannot connect to Verify.ET API. Please check your internet connection.'}, status=503)
    except ObjectDoesNotExist as e:
        return Response(
            {'error': 'School association not found.', 'detail': str(e)},
            status=status.HTTP_403_FORBIDDEN
        )
    except Exception as e:
        return Response({'error': str(e)}, status=500)