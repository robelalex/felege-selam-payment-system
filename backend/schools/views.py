# schools/views.py
from rest_framework import viewsets
from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated
from rest_framework import status
from .models import School, SchoolAdminProfile
from .serializers import SchoolSerializer

# ✅ Import the SMS service
from payments.services.multi_school_sms_service import MultiSchoolSMSService


class SchoolViewSet(viewsets.ModelViewSet):
    queryset = School.objects.all()
    serializer_class = SchoolSerializer


# ========== HELPER FUNCTION FOR AUTHENTICATION ==========

def get_school_from_request(request):
    """
    Helper function to get the school from the request.
    Handles both SchoolAdminProfile and UserProfile authentication methods.
    Returns (school, error_response) tuple.
    """
    school_id = request.headers.get('X-School-ID')
    if not school_id:
        return None, Response({'error': 'X-School-ID header required'}, status=400)
    
    # Method 1: Check for SchoolAdminProfile
    if hasattr(request.user, 'school_profile'):
        try:
            admin_profile = request.user.school_profile
            if str(admin_profile.school.id) == school_id:
                return admin_profile.school, None
            else:
                return None, Response({'error': 'Access denied - wrong school'}, status=403)
        except Exception as e:
            pass  # Fall through to next method
    
    # Method 2: Check for UserProfile (for production)
    try:
        from authentication.models import UserProfile
        profile = UserProfile.objects.get(user=request.user)
        if profile.school_id and str(profile.school_id) == school_id:
            school = School.objects.get(id=school_id)
            return school, None
        else:
            return None, Response({'error': 'No school associated with this user'}, status=403)
    except Exception as e:
        return None, Response({'error': f'Authentication error: {str(e)}'}, status=403)


# ========== SMS CONFIGURATION VIEWS ==========

class SchoolSMSConfigView(APIView):
    """View for schools to update their SMS credentials"""
    permission_classes = [IsAuthenticated]
    
    def get(self, request):
        """Get current SMS configuration for the school"""
        school, error_response = get_school_from_request(request)
        if error_response:
            return error_response
        
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
        school, error_response = get_school_from_request(request)
        if error_response:
            return error_response
        
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
        school, error_response = get_school_from_request(request)
        if error_response:
            return error_response
        
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