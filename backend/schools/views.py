# schools/views.py
from rest_framework import viewsets
from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated
from rest_framework import status
from rest_framework.exceptions import PermissionDenied
from django.core.exceptions import ObjectDoesNotExist
from .models import School, SchoolAdminProfile, SchoolBankAccount
from .serializers import SchoolSerializer, BankAccountSerializer
from .utils import get_school_for_user
from .security import require_school_admin, generate_reauth_token, verify_reauth_token

# Import the SMS service
from payments.services.multi_school_sms_service import MultiSchoolSMSService


class SchoolViewSet(viewsets.ModelViewSet):
    """
    ✅ SECURITY FIX: previously had no permission_classes, which meant it
    inherited the project-wide default of AllowAny — any unauthenticated
    request could list/create/update/delete ANY school, including other
    schools' bank account numbers and payment gateway API keys.

    Now:
    - Requires authentication for every action.
    - Super admins (is_staff/is_superuser) see and manage all schools.
    - School admins/staff can only see and edit their OWN school — resolved
      from their SchoolAdminProfile/UserProfile, never from a client-sent
      header, so a user can't just send a different school's ID to read
      or modify it.
    - Only super admins can create or delete a School record.
    """
    serializer_class = SchoolSerializer
    permission_classes = [IsAuthenticated]
    # NOTE: this queryset attribute is ONLY used by DRF's router to infer the
    # url basename ('school') — it is NOT what actually runs per-request.
    # get_queryset() below overrides it for every real request, which is what
    # enforces the tenant scoping. Removing this attribute entirely breaks
    # router.register() with "could not automatically determine the name".
    queryset = School.objects.all()

    def get_queryset(self):
        user = self.request.user
        if user.is_staff or user.is_superuser:
            return School.objects.all()

        school_ids = list(
            SchoolAdminProfile.objects.filter(user=user, is_active=True)
            .values_list('school_id', flat=True)
        )
        profile_school_id = getattr(getattr(user, 'profile', None), 'school_id', None)
        if profile_school_id:
            school_ids.append(profile_school_id)

        return School.objects.filter(id__in=school_ids)

    def check_object_permissions(self, request, obj):
        super().check_object_permissions(request, obj)
        # Belt-and-suspenders: even if get_queryset were bypassed somehow,
        # never allow a non-super-admin to touch a school outside their own.
        user = request.user
        if user.is_staff or user.is_superuser:
            return
        if obj.id not in self.get_queryset().values_list('id', flat=True):
            from rest_framework.exceptions import PermissionDenied
            raise PermissionDenied("You do not have access to this school.")

    def create(self, request, *args, **kwargs):
        if not (request.user.is_staff or request.user.is_superuser):
            return Response(
                {'detail': 'Only a super admin can create a new school.'},
                status=status.HTTP_403_FORBIDDEN
            )
        return super().create(request, *args, **kwargs)

    # ✅ SECURITY FIX: update/partial_update had no role check at all — any
    # authenticated staff member of a school (a teacher, a registrar...)
    # could PATCH their own school's row directly, including
    # admin_ip_restriction_enabled, admin_allowed_ip_list, bank details,
    # and branding. get_queryset()/check_object_permissions() above only
    # ever checked "does this user belong to this school", never "is this
    # user actually the school's admin". Only school_admin/super_admin may
    # write here now; every other role gets a clear 403 instead of a
    # silent write.
    def update(self, request, *args, **kwargs):
        if not (request.user.is_staff or request.user.is_superuser):
            from common.utils import get_effective_role
            if get_effective_role(request.user) != 'school_admin':
                return Response(
                    {'detail': 'Only a school admin can change school settings.'},
                    status=status.HTTP_403_FORBIDDEN
                )
        return super().update(request, *args, **kwargs)

    def partial_update(self, request, *args, **kwargs):
        # ✅ Must set partial=True ourselves — we're overriding update()
        # directly rather than relying on DRF's own partial_update, so we
        # need to reproduce that flag or every PATCH (used everywhere in
        # the frontend, e.g. saving just the logo or just grading_system)
        # would suddenly require every required field to be present too.
        kwargs['partial'] = True
        return self.update(request, *args, **kwargs)

    def perform_update(self, serializer):
        # ✅ Item 7 — School.term_structure ('semester' vs 'quarter')
        # changes which result/report-card tables get populated and how
        # the year-end average is computed. Per the Item 7 design
        # decision: switching it once the current academic year already
        # has Terms set up is not supported — flip it after Terms exist
        # and you'd have Terms with no matching Semester grouping (if
        # switching to 'quarter') or Semester rows nothing points at
        # (if switching away from it). Locked here rather than silently
        # allowed and quietly producing wrong report cards.
        instance = serializer.instance
        new_value = serializer.validated_data.get('term_structure', instance.term_structure)
        if new_value != instance.term_structure:
            from exams.models import Term
            from academics.models import AcademicYear
            current_year = AcademicYear.objects.filter(school=instance, is_current=True).first()
            if current_year and Term.objects.filter(school=instance, academic_year=current_year).exists():
                from rest_framework.exceptions import ValidationError
                raise ValidationError({
                    'term_structure': (
                        "This can't be changed — the current academic year already has terms set up. "
                        "term_structure must be decided before creating any Terms for a year."
                    )
                })
        serializer.save()

    def destroy(self, request, *args, **kwargs):
        if not (request.user.is_staff or request.user.is_superuser):
            return Response(
                {'detail': 'Only a super admin can delete a school.'},
                status=status.HTTP_403_FORBIDDEN
            )
        school = self.get_object()
        # Deleting the School cascades to delete its SchoolAdminProfile
        # rows (on_delete=CASCADE on the school FK), but the underlying
        # login (User) accounts are never touched — they'd be left behind,
        # inactive, permanently occupying that email and blocking any
        # future registration with it. Capture them before the cascade
        # runs, then delete them once the school itself is gone.
        admin_user_ids = list(school.admins.values_list('user_id', flat=True))
        response = super().destroy(request, *args, **kwargs)
        if admin_user_ids:
            from django.contrib.auth.models import User
            User.objects.filter(id__in=admin_user_ids).delete()
        return response


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
        up = user.profile
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
    """View for schools to update their SMSEthiopia credentials.

    ✅ SECURITY FIX: previously reachable (read AND write) by any
    authenticated staff member of the school — now school_admin/
    super_admin only (require_school_admin).
    """
    permission_classes = [IsAuthenticated]
    
    def get(self, request):
        """Get current SMS configuration for the school"""
        require_school_admin(request)
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
            'at_username': school.at_username or '',  # Kept for backward compatibility/campaign name
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
        require_school_admin(request)
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
    """Test school's Afro Message credentials.

    ✅ SECURITY FIX: role-gated to school_admin/super_admin.
    """
    permission_classes = [IsAuthenticated]

    def post(self, request):
        require_school_admin(request)
        from django.utils import timezone

        try:
            school = get_school_for_user(request)
        except ObjectDoesNotExist as e:
            return Response(
                {'error': 'School association not found.', 'detail': str(e)},
                status=status.HTTP_403_FORBIDDEN
            )

        if not school.at_api_key:
            return Response({'error': 'Please save your Afro Message API Key first'}, status=400)

        if not school.phone:
            return Response({'error': 'School phone number is not set. Please update school phone number first.'}, status=400)

        try:
            sms_service = MultiSchoolSMSService(school.id)
            result = sms_service.test_credentials()

            school.sms_enabled = True
            school.sms_test_status = 'success'
            school.sms_last_test = timezone.now()
            school.save(update_fields=['sms_enabled', 'sms_test_status', 'sms_last_test'])

            return Response(result)

        except Exception as e:
            error_msg = str(e)
            school.sms_enabled = False
            school.sms_test_status = f"Failed: {error_msg[:100]}"
            school.save(update_fields=['sms_enabled', 'sms_test_status'])

            return Response({'error': error_msg}, status=400)


# ========== VERIFY.ET CONFIGURATION VIEWS ==========
# Each school configures their own Verify.ET credentials

@api_view(['GET', 'POST'])
@permission_classes([IsAuthenticated])
def verify_et_settings(request):
    """Get or update Verify.ET settings for the school.

    ✅ SECURITY FIX (two separate bugs):
    1. This had no role check — any authenticated staff member of the
       school could reach it, not just school_admin/super_admin.
    2. The GET response returned the REAL, unmasked verify_et_api_key
       in plaintext (every other credential view in this file already
       masks its key as '********' — this one didn't). Now masked the
       same way as chapa_api_key/brevo_api_key/at_api_key.
    """
    require_school_admin(request)
    try:
        # Get the school first
        school = get_school_for_user(request)
        
        # FORCE a fresh fetch from database to avoid any caching issues
        from schools.models import School
        school = School.objects.get(pk=school.pk)
        
        print(f"🔍 Working with school: {school.name} (ID: {school.pk})")
        
        if request.method == 'GET':
            return Response({
                'verify_et_api_key': '********' if school.verify_et_api_key else '',
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
            
            print(f"💾 Saving Verify.ET settings for school: {school.name}")
            print(f"   API Key: {'Yes' if api_key else 'No'}")
            print(f"   Enabled: {enabled}")
            print(f"   Suffix: {account_suffix}")
            
            # Validate account suffix (must be 8 digits)
            if account_suffix:
                if len(account_suffix) != 8:
                    return Response({'error': 'Account suffix must be exactly 8 digits'}, status=400)
                if not account_suffix.isdigit():
                    return Response({'error': 'Account suffix must contain only numbers'}, status=400)
            
            # ✅ SECURITY FIX FOLLOW-UP: GET now returns '********' instead of
            # the real key (see fix above). That means if the admin saves
            # this form WITHOUT retyping the key (e.g. only changing
            # cbe_account_suffix), the frontend round-trips the masked
            # placeholder right back here. Without this check, that would
            # silently overwrite the real, working key with the literal
            # string "********" and quietly break Verify.ET. Same pattern
            # already used by chapa_api_key/brevo_api_key/at_api_key above —
            # only overwrite when a real new value was actually submitted.
            if api_key and api_key != '********':
                school.verify_et_api_key = api_key
            school.verify_et_enabled = enabled
            school.cbe_account_number = account_number
            school.cbe_account_suffix = account_suffix
            
            # Save with explicit update_fields
            school.save(update_fields=[
                'verify_et_api_key',
                'verify_et_enabled',
                'cbe_account_number', 
                'cbe_account_suffix'
            ])
            
            print(f"✅ Saved successfully!")
            print(f"   API Key in DB: {'Yes' if school.verify_et_api_key else 'No'}")
            print(f"   Enabled in DB: {school.verify_et_enabled}")
            
            return Response({
                'success': True, 
                'message': 'Verify.ET settings saved successfully'
            })
            
    except ObjectDoesNotExist as e:
        return Response(
            {'error': 'School association not found.', 'detail': str(e)},
            status=status.HTTP_403_FORBIDDEN
        )
    except Exception as e:
        import traceback
        print(f"❌ Error in verify_et_settings: {e}")
        traceback.print_exc()
        return Response({'error': str(e)}, status=500)


@api_view(['POST'])
@permission_classes([IsAuthenticated])
def test_verify_et_connection(request):
    """Test Verify.ET API connection with current settings.

    ✅ SECURITY FIX: role-gated to school_admin/super_admin.
    """
    require_school_admin(request)
    import requests
    from django.utils import timezone
    import time
    
    try:
        school = get_school_for_user(request)
        
        # Force fresh fetch
        from schools.models import School
        school = School.objects.get(pk=school.pk)
        
        print(f"🔍 Testing Verify.ET for school: {school.name}")
        print(f"   API Key exists: {bool(school.verify_et_api_key)}")
        print(f"   Suffix: {school.cbe_account_suffix}")
        
        if not school.verify_et_api_key:
            return Response({'error': 'Verify.ET API key not configured. Please save it first.'}, status=400)
        
        if not school.cbe_account_suffix:
            return Response({'error': 'CBE account suffix not configured. Please save it first.'}, status=400)
        
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
        
        print(f"📡 Calling Verify.ET API...")
        response = requests.post(api_url, json=payload, headers=headers, timeout=30)
        
        school.verify_et_last_test = timezone.now()
        
        # Handle 202 as success (request accepted, will be processed)
        if response.status_code in [200, 202]:
            # Try to parse response
            try:
                data = response.json()
                print(f"📡 Response data: {data}")
            except:
                data = {}
            
            # 202 means request is queued - that's still a valid connection
            if response.status_code == 202:
                school.verify_et_test_status = 'success'
                school.verify_et_enabled = True
                school.save(update_fields=['verify_et_test_status', 'verify_et_enabled', 'verify_et_last_test'])
                print(f"✅ API connection successful (202 - request queued)")
                return Response({'message': '✅ Connection successful! Your API key is valid. (Request queued - this is normal)'})
            else:
                # 200 means immediate verification
                if data.get('success') or data.get('verification', {}).get('status') == 'verified':
                    school.verify_et_test_status = 'success'
                    school.verify_et_enabled = True
                    school.save(update_fields=['verify_et_test_status', 'verify_et_enabled', 'verify_et_last_test'])
                    return Response({'message': '✅ Connection successful! Your Verify.ET API key is valid.'})
                else:
                    school.verify_et_test_status = 'success'
                    school.verify_et_enabled = True
                    school.save(update_fields=['verify_et_test_status', 'verify_et_enabled', 'verify_et_last_test'])
                    return Response({'message': '✅ API key is valid! (Test reference not found in system - this is expected)'})
                    
        elif response.status_code == 401:
            school.verify_et_test_status = 'failed'
            school.save(update_fields=['verify_et_test_status', 'verify_et_last_test'])
            return Response({'error': 'Invalid API key. Please check your Verify.ET API key.'}, status=401)
        else:
            school.verify_et_test_status = 'failed'
            school.save(update_fields=['verify_et_test_status', 'verify_et_last_test'])
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
        import traceback
        print(f"❌ Error: {e}")
        traceback.print_exc()
        return Response({'error': str(e)}, status=500)
    

    # ========== CHAPA CONFIGURATION VIEWS ==========

class ChapaReauthView(APIView):
    """
    ✅ NEW: step-up password re-confirmation, required before viewing or
    editing the school's real Chapa credentials — see SchoolChapaConfigView
    below. Being logged in is not enough here: the caller must correctly
    re-type their OWN account password to get a short-lived (5 minute)
    token. This exists specifically so that someone else sitting down at
    an admin's already-unlocked, already-logged-in computer cannot open
    Chapa Settings and see or change the payment gateway key just because
    the admin forgot to lock their screen.

    POST /api/schools/chapa/reauth/  { "password": "..." }
    -> { "reauth_token": "...", "expires_in": 300 }
    """
    permission_classes = [IsAuthenticated]
    throttle_scope = 'login'

    def get_throttles(self):
        from rest_framework.throttling import ScopedRateThrottle
        return [ScopedRateThrottle()]

    def post(self, request):
        require_school_admin(request)

        password = request.data.get('password', '')
        if not password:
            return Response({'error': 'Password is required.'}, status=400)

        # ✅ Uses Django's own password hasher via check_password — never
        # compares plaintext, and this never touches/returns the user's
        # actual password anywhere.
        if not request.user.check_password(password):
            return Response({'error': 'Incorrect password.'}, status=401)

        token = generate_reauth_token(request.user)
        from .security import REAUTH_MAX_AGE_SECONDS
        return Response({'reauth_token': token, 'expires_in': REAUTH_MAX_AGE_SECONDS})


class SchoolChapaConfigView(APIView):
    """View for schools to update their Chapa credentials.

    ✅ SECURITY FIX: previously reachable by ANY authenticated staff member
    of the school (a teacher, a registrar...) — now requires school_admin/
    super_admin (require_school_admin) AND a fresh password re-confirmation
    (X-Reauth-Token header, see ChapaReauthView above). A logged-in admin
    session alone is no longer enough to see or change this school's real
    Chapa payment gateway credentials.
    """
    permission_classes = [IsAuthenticated]

    def _check_reauth(self, request):
        token = request.headers.get('X-Reauth-Token', '')
        if not verify_reauth_token(token, request.user):
            return Response(
                {'error': 'reauth_required', 'message': 'Please re-enter your password to continue.'},
                status=401,
            )
        return None

    def get(self, request):
        """Get current Chapa configuration for the school"""
        require_school_admin(request)
        reauth_error = self._check_reauth(request)
        if reauth_error:
            return reauth_error

        try:
            school = get_school_for_user(request)
        except ObjectDoesNotExist as e:
            return Response(
                {'error': 'School association not found.', 'detail': str(e)},
                status=status.HTTP_403_FORBIDDEN
            )
        
        return Response({
            'chapa_api_key': '********' if school.chapa_api_key else '',
            'chapa_enabled': school.chapa_enabled,
            'chapa_test_status': school.chapa_test_status or '',
            'chapa_last_test': school.chapa_last_test,
        })
    
    def post(self, request):
        """Save Chapa credentials"""
        require_school_admin(request)
        reauth_error = self._check_reauth(request)
        if reauth_error:
            return reauth_error

        try:
            school = get_school_for_user(request)
        except ObjectDoesNotExist as e:
            return Response(
                {'error': 'School association not found.', 'detail': str(e)},
                status=status.HTTP_403_FORBIDDEN
            )
        
        # Update fields
        if 'chapa_api_key' in request.data and request.data['chapa_api_key'] != '********':
            school.chapa_api_key = request.data['chapa_api_key']
        
        # Reset enabled flag since credentials changed
        school.chapa_enabled = False
        school.chapa_test_status = 'pending'
        
        school.save()
        
        return Response({
            'message': 'Chapa credentials saved. Please test them.',
            'chapa_enabled': school.chapa_enabled,
        })


class SchoolChapaTestView(APIView):
    """Test school's Chapa credentials.

    ✅ SECURITY FIX: role-gated to school_admin/super_admin, same as
    SchoolChapaConfigView above. Deliberately does NOT require the
    password re-auth token — this action only re-tests credentials that
    are already saved (masked from the caller either way) and doesn't
    reveal or change the key itself, so the extra step-up isn't needed
    here.
    """
    permission_classes = [IsAuthenticated]
    
    def post(self, request):
        require_school_admin(request)
        import requests
        from django.utils import timezone
        
        try:
            school = get_school_for_user(request)
        except ObjectDoesNotExist as e:
            return Response(
                {'error': 'School association not found.', 'detail': str(e)},
                status=status.HTTP_403_FORBIDDEN
            )
        
        if not school.chapa_api_key:
            return Response({'error': 'No Chapa API key configured. Please save credentials first.'}, status=400)
        
        try:
            # Test Chapa API by getting banks list
            headers = {
                "Authorization": f"Bearer {school.chapa_api_key}"
            }
            
            response = requests.get(
                "https://api.chapa.co/v1/banks",
                headers=headers,
                timeout=10
            )
            
            if response.status_code == 200:
                school.chapa_enabled = True
                school.chapa_test_status = 'success'
                school.chapa_last_test = timezone.now()
                school.save(update_fields=['chapa_enabled', 'chapa_test_status', 'chapa_last_test'])
                
                return Response({
                    'success': True,
                    'message': '✅ Chapa credentials are valid! Online payments are now enabled.'
                })
            else:
                school.chapa_enabled = False
                school.chapa_test_status = f'failed: {response.status_code}'
                school.save(update_fields=['chapa_enabled', 'chapa_test_status'])
                
                return Response({
                    'success': False,
                    'message': f'❌ Invalid credentials. Please check your API key.'
                }, status=400)
                
        except requests.exceptions.Timeout:
            return Response({'error': 'Connection timeout. Please try again.'}, status=408)
        except requests.exceptions.ConnectionError:
            return Response({'error': 'Cannot connect to Chapa API. Please check your internet connection.'}, status=503)
        except Exception as e:
            school.chapa_enabled = False
            school.chapa_test_status = f'error: {str(e)[:50]}'
            school.save(update_fields=['chapa_enabled', 'chapa_test_status'])
            
            return Response({
                'success': False,
                'message': f'❌ Connection error: {str(e)}'
            }, status=400)


# ========== EMAIL CONFIGURATION VIEWS (BREVO) ==========

class SchoolEmailConfigView(APIView):
    """View for schools to update their Brevo email credentials.

    ✅ SECURITY FIX: previously reachable (read AND write) by any
    authenticated staff member of the school — now school_admin/
    super_admin only (require_school_admin).
    """
    permission_classes = [IsAuthenticated]
    
    def get(self, request):
        """Get current email configuration for the school"""
        require_school_admin(request)
        try:
            school = get_school_for_user(request)
        except ObjectDoesNotExist as e:
            return Response(
                {'error': 'School association not found.', 'detail': str(e)},
                status=status.HTTP_403_FORBIDDEN
            )
        
        return Response({
            'brevo_api_key': '********' if school.brevo_api_key else '',
            'brevo_sender_email': school.brevo_sender_email or '',
            'brevo_sender_name': school.brevo_sender_name or '',
            'email_enabled': school.email_enabled,
            'email_test_status': school.email_test_status or '',
            'email_last_test': school.email_last_test,
            'email_monthly_limit': school.email_monthly_limit or 0,
            'email_current_month_count': school.email_current_month_count or 0,
        })
    
    def post(self, request):
        """Save email credentials"""
        require_school_admin(request)
        try:
            school = get_school_for_user(request)
        except ObjectDoesNotExist as e:
            return Response(
                {'error': 'School association not found.', 'detail': str(e)},
                status=status.HTTP_403_FORBIDDEN
            )
        
        if 'brevo_api_key' in request.data and request.data['brevo_api_key'] != '********':
            school.brevo_api_key = request.data['brevo_api_key']
        if 'brevo_sender_email' in request.data:
            school.brevo_sender_email = request.data['brevo_sender_email']
        if 'brevo_sender_name' in request.data:
            school.brevo_sender_name = request.data['brevo_sender_name']
        if 'email_monthly_limit' in request.data:
            school.email_monthly_limit = request.data['email_monthly_limit']
        
        school.email_enabled = False
        school.email_test_status = 'pending'
        school.save()
        
        return Response({
            'message': 'Email credentials saved. Please test them.',
            'email_enabled': school.email_enabled,
        })


class SchoolEmailTestView(APIView):
    """Test school's Brevo email credentials.

    ✅ SECURITY FIX: role-gated to school_admin/super_admin.
    """
    permission_classes = [IsAuthenticated]
    
    def post(self, request):
        require_school_admin(request)
        from django.utils import timezone
        
        try:
            school = get_school_for_user(request)
        except ObjectDoesNotExist as e:
            return Response(
                {'error': 'School association not found.', 'detail': str(e)},
                status=status.HTTP_403_FORBIDDEN
            )
        
        if not school.brevo_api_key or not school.brevo_sender_email:
            return Response({'error': 'Please save your Brevo credentials first'}, status=400)
        
        if not school.email:
            return Response({'error': 'School email address is not set. Please update school details first.'}, status=400)
        
        try:
            from common.email_service import SchoolEmailService
            email_service = SchoolEmailService(school.id)
            result = email_service.test_credentials()
            
            school.email_enabled = True
            school.email_test_status = 'success'
            school.email_last_test = timezone.now()
            school.save(update_fields=['email_enabled', 'email_test_status', 'email_last_test'])
            
            return Response(result)
            
        except Exception as e:
            error_msg = str(e)[:200]
            school.email_enabled = False
            school.email_test_status = f"Failed: {error_msg[:100]}"
            school.save(update_fields=['email_enabled', 'email_test_status'])
            
            return Response({'error': error_msg}, status=400)

# ── Bank Accounts API ────────────────────────────────────────────────────────
class BankAccountViewSet(viewsets.ModelViewSet):
    """
    CRUD for a school's bank accounts (multiple per school supported).
    School admins manage their own accounts only; super admins can manage
    any school's accounts using X-School-ID header.
    Parents read their school's active accounts via the list action —
    that's how the app shows "pay into this account" options.

    ✅ SECURITY FIX: create/update/destroy previously had NO role check —
    any authenticated staff member of the school (a teacher, a
    registrar...) could add a new bank account and mark it primary,
    silently redirecting where parents are told to send bank transfers.
    Only school_admin/super_admin may write now; the read path for
    everyone else is unchanged (active accounts only, as before).
    """
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        from common.utils import get_verified_school_id
        school_id = get_verified_school_id(self.request)
        if not school_id:
            return SchoolBankAccount.objects.none()
        qs = SchoolBankAccount.objects.filter(school_id=school_id)
        # Non-admins (parents) only ever see active accounts.
        from common.utils import get_effective_role
        role = get_effective_role(self.request.user)
        if role not in ('super_admin', 'school_admin'):
            qs = qs.filter(is_active=True)
        return qs

    def get_serializer_class(self):
        return BankAccountSerializer

    def _require_admin_write(self):
        from common.utils import get_effective_role
        if get_effective_role(self.request.user) not in ('super_admin', 'school_admin'):
            raise PermissionDenied("Only a school admin can manage bank accounts.")

    def perform_create(self, serializer):
        self._require_admin_write()
        from common.utils import get_verified_school_id
        school_id = get_verified_school_id(self.request)
        from .models import School
        school = School.objects.get(id=school_id)
        # If this is being marked primary, un-mark the current primary first.
        if serializer.validated_data.get('is_primary'):
            SchoolBankAccount.objects.filter(school=school, is_primary=True).update(is_primary=False)
        serializer.save(school=school)

    def perform_update(self, serializer):
        self._require_admin_write()
        if serializer.validated_data.get('is_primary'):
            school = serializer.instance.school
            SchoolBankAccount.objects.filter(school=school, is_primary=True).exclude(
                pk=serializer.instance.pk
            ).update(is_primary=False)
        serializer.save()

    def perform_destroy(self, instance):
        self._require_admin_write()
        instance.delete()
