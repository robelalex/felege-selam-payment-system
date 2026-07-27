# backend/authentication/views.py - REAL OTP EMAIL INTEGRATION
from django.contrib.auth import authenticate, login as auth_login, logout as auth_logout
from django.contrib.auth.models import User
from django.http import HttpResponse, HttpResponseRedirect
from django.middleware.csrf import get_token
from django.core.mail import send_mail
from django.conf import settings
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response
from rest_framework import status
from rest_framework_simplejwt.tokens import RefreshToken
from django.utils import timezone
from django.views.decorators.csrf import csrf_exempt
from django.contrib.auth.hashers import make_password, check_password
import uuid
import random
import string

from .serializers import (
    RegisterSerializer, LoginSerializer, UserSerializer, 
    ForgotPasswordSerializer, ResetPasswordSerializer, 
    ChangePasswordSerializer
)
from .models import UserProfile, PasswordHistory
from datetime import date
from .throttles import LoginRateThrottle
from common.utils import log_action
from .utils import generate_otp, verify_otp
from .permissions import IsSuperAdmin, IsSchoolAdmin


# ===== HELPER FUNCTIONS =====
def generate_secure_otp(length=6):
    """Generate a cryptographically secure numeric OTP"""
    return ''.join(random.choices(string.digits, k=length))

def save_password_history(user, password):
    """Save password to history and keep only last 5"""
    PasswordHistory.objects.create(
        user=user,
        password_hash=make_password(password)
    )
    old_passwords = PasswordHistory.objects.filter(user=user).order_by('-created_at')[5:]
    for old in old_passwords:
        old.delete()

def check_password_history(user, new_password):
    """Check if password was used before (prevent reuse)"""
    recent_passwords = PasswordHistory.objects.filter(user=user).order_by('-created_at')[:5]
    for history in recent_passwords:
        if check_password(new_password, history.password_hash):
            return False, "You cannot reuse a recent password. Please choose a different password."
    return True, ""

def send_otp_via_email(email, otp_code):
    """Send OTP code via Resend/django-anymail"""
    try:
        subject = f"Your Felege Selam Verification Code: {otp_code}"
        message = f"""
        Hello,
        
        Your verification code is: {otp_code}
        
        This code expires in 10 minutes. Do not share this code with anyone.
        
        If you did not request this code, please ignore this email.
        
        Best regards,
        Felege Selam Payment System
        """
        send_mail(
            subject=subject,
            message=message,
            from_email=settings.DEFAULT_FROM_EMAIL,
            recipient_list=[email],
            fail_silently=False,
        )
        return True
    except Exception as e:
        print(f"❌ Failed to send OTP email to {email}: {e}")
        return False


# ===== OTP 2FA: ADMIN LOGIN WITH 2FA =====
@api_view(['POST'])
@permission_classes([AllowAny])
@csrf_exempt
def admin_login_step1(request):
    """Step 1: Admin login with email and password -> Send REAL OTP"""
    email = request.data.get('email')
    password = request.data.get('password')
    
    if not email or not password:
        return Response({'error': 'Email and password required'}, status=400)
    
    try:
        # This endpoint is only ever used for school-admin/staff/teacher
        # logins — parents use a completely separate OTP flow
        # (parent_login_step1). A person can legitimately hold both a
        # parent account and a staff/admin account under the same email
        # (e.g. a school admin whose child also attends the school), so
        # excluding parent accounts here resolves that ambiguity correctly
        # instead of treating it as a data-integrity error.
        user = User.objects.exclude(profile__role='parent').get(email=email)
    except User.DoesNotExist:
        return Response({'error': 'Invalid credentials'}, status=401)
    except User.MultipleObjectsReturned:
        # This means two genuinely non-parent (staff/admin) accounts share
        # this email — a real data-integrity issue that needs manual
        # cleanup, unlike the parent+admin case filtered out above.
        return Response(
            {'error': 'Multiple accounts are registered with this email. Please contact support.'},
            status=409,
        )
    
    if not user.is_active:
        return Response({'error': 'Account pending approval'}, status=401)
    
    user = authenticate(username=user.username, password=password)
    if not user:
        return Response({'error': 'Invalid credentials'}, status=401)
    
    if hasattr(user, 'profile') and not user.profile.is_email_verified:
        return Response({'error': 'Please verify your email first'}, status=401)
    
    # ✅ GENERATE REAL OTP
    otp_code = generate_secure_otp()
    
    profile = user.profile
    profile.otp_code = otp_code
    profile.otp_created_at = timezone.now()
    profile.save()
    
    # ✅ SEND REAL EMAIL VIA RESEND
    email_sent = send_otp_via_email(user.email, otp_code)
    
    if not email_sent:
        return Response({
            'success': False,
            'error': 'Failed to send verification email. Please try again.'
        }, status=500)
    
    return Response({
        'success': True,
        'message': 'Verification code sent to your email.',
        'user_id': user.id,
        'requires_otp': True
    })


@api_view(['POST'])
@permission_classes([AllowAny])
@csrf_exempt
def admin_login_step2(request):
    """Step 2: Verify REAL OTP and complete admin login"""
    user_id = request.data.get('user_id')
    otp_code = request.data.get('otp_code')
    
    if not user_id or not otp_code:
        return Response({'error': 'User ID and OTP required'}, status=400)
    
    try:
        user = User.objects.get(id=user_id)
    except User.DoesNotExist:
        return Response({'error': 'User not found'}, status=404)
    
    profile = user.profile
    
    # ✅ VERIFY REAL OTP
    valid, message = verify_otp(profile, otp_code)
    if not valid:
        return Response({'error': message}, status=401)
    
    # Clear OTP after successful verification
    profile.otp_code = None
    profile.otp_created_at = None
    profile.save()
    
    auth_login(request, user)
    request.session.save()
    
    school_info = None
    try:
        from schools.models import SchoolAdminProfile, School
        school = None

        # 1. Preferred: SchoolAdminProfile
        school_admin_profile = SchoolAdminProfile.objects.filter(user=user, is_active=True).first()
        if school_admin_profile:
            school = School.objects.get(id=school_admin_profile.school_id)
        else:
            # 2. ✅ FIX: fall back to UserProfile.school_id — without this,
            # any account without a SchoolAdminProfile row (super_admin
            # accounts, or staff logins resolved only through UserProfile)
            # got school_info = None on login. That meant the sidebar's
            # localStorage cache never received the school's logo/name at
            # login time, so it kept showing the generic icon even after
            # the logo was successfully saved in School Settings — this
            # mirrors the same SchoolAdminProfile-only bug fixed in the
            # SMS balance/reminder endpoints.
            school_id = getattr(profile, 'school_id', None)
            if school_id:
                school = School.objects.filter(id=school_id).first()

        if school:
            school_info = {
                'id': school.id,
                'name': school.name,
                'code': school.code,
                'logo': school.logo.url if school.logo else None
            }
    except Exception:
        pass
    
    refresh = RefreshToken.for_user(user)

    # ✅ Same fix as get_current_user: profile.role is always 'staff' for
    # any StaffMemberViewSet.create_login account (teacher, registrar,
    # accountant...) — resolve the real granular role instead, so a
    # teacher logging in gets 'teacher' back, not the generic 'staff'.
    from common.utils import get_effective_role
    effective_role = get_effective_role(user) or profile.role

    return Response({
        'success': True,
        'message': 'Login successful',
        'access': str(refresh.access_token),
        'refresh': str(refresh),
        'user': {
            'id': user.id,
            'email': user.email,
            'username': user.username,
            'first_name': user.first_name,
            'last_name': user.last_name,
            'role': effective_role,
            'is_super_admin': effective_role == 'super_admin',
            'is_school_admin': effective_role == 'school_admin',
            'school': school_info
        }
    })


# ===== OTP 2FA: PARENT LOGIN WITH OTP ONLY =====
@api_view(['POST'])
@permission_classes([AllowAny])
@csrf_exempt
def parent_login_step1(request):
    """Step 1: Parent sends email, receives REAL OTP"""
    email = request.data.get('email')
    
    if not email:
        return Response({'error': 'Email required'}, status=400)
    
    from students.models import Student
    students = Student.objects.filter(parent_email=email)
    
    if not students.exists():
        return Response({'error': 'No student found with this email'}, status=404)
    
    # ✅ GENERATE REAL OTP
    otp_code = generate_secure_otp()
    
    username = f"parent_{email.replace('@', '_').replace('.', '_')}"
    user, created = User.objects.get_or_create(
        username=username,
        defaults={'email': email, 'is_active': True}
    )
    
    if created:
        UserProfile.objects.create(
            user=user,
            role='parent',
            is_email_verified=True
        )
    
    profile = user.profile
    profile.otp_code = otp_code
    profile.otp_created_at = timezone.now()
    profile.save()
    
    # ✅ SEND REAL EMAIL VIA RESEND
    email_sent = send_otp_via_email(user.email, otp_code)
    
    if not email_sent:
        return Response({
            'success': False,
            'error': 'Failed to send verification email. Please try again.'
        }, status=500)
    
    return Response({
        'success': True,
        'message': 'Verification code sent to your email.',
        'user_id': user.id
    })


@api_view(['POST'])
@permission_classes([AllowAny])
@csrf_exempt
def parent_login_step2(request):
    """Step 2: Verify REAL OTP and return success"""
    user_id = request.data.get('user_id')
    otp_code = request.data.get('otp_code')
    
    if not user_id or not otp_code:
        return Response({'error': 'User ID and OTP required'}, status=400)
    
    try:
        user = User.objects.get(id=user_id)
    except User.DoesNotExist:
        return Response({'error': 'User not found'}, status=404)
    
    profile = user.profile
    
    # ✅ VERIFY REAL OTP
    valid, message = verify_otp(profile, otp_code)
    if not valid:
        return Response({'error': message}, status=401)
    
    profile.otp_code = None
    profile.otp_created_at = None
    profile.save()
    
    auth_login(request, user)

    # ✅ FIX: this endpoint only ever did session-based login (auth_login),
    # never issued a token. That's fine for the web app (browsers carry
    # session cookies automatically) but Flutter's native HTTP client
    # doesn't persist cookies the same way, so every subsequent mobile
    # request looked anonymous — "Authentication credentials were not
    # provided". The mobile app already expects a field called 'token'
    # (see ApiService.verifyOtp), so we now actually send one — a real
    # JWT — without touching the session-cookie behavior the web app uses.
    refresh = RefreshToken.for_user(user)

    return Response({
        'success': True,
        'message': 'OTP verified successfully. Please enter your student ID.',
        'user_id': user.id,
        'token': str(refresh.access_token),
        'refresh': str(refresh),
    })


# ===== REGISTRATION ENDPOINT (UNCHANGED) =====
@api_view(['POST'])
@permission_classes([AllowAny])
def register(request):
    """Register a new school admin or staff (pending Super Admin approval)"""
    print("=" * 50)
    print("📝 REGISTRATION REQUEST RECEIVED")
    print(f"📝 Request data: {request.data}")
    print(f"📝 FILES: {request.FILES}")
    
    logo = request.FILES.get('logo')
    school = None
    
    serializer = RegisterSerializer(data=request.data)
    if not serializer.is_valid():
        print(f"❌ Serializer errors: {serializer.errors}")
        return Response({
            'success': False,
            'errors': serializer.errors
        }, status=status.HTTP_400_BAD_REQUEST)
    
    validated_data = serializer.validated_data
    email = validated_data['email']
    username = validated_data['username']
    password = validated_data['password']
    school_code = request.data.get('school_code', '').upper()
    school_name = request.data.get('school_name')
    first_name = validated_data.get('first_name', '')
    last_name = validated_data.get('last_name', '')
    phone = request.data.get('phone', '')
    
    from schools.models import School
    if School.objects.filter(code=school_code).exists():
        return Response({
            'success': False,
            'error': f'School code "{school_code}" already exists. Please use a different code.'
        }, status=status.HTTP_400_BAD_REQUEST)
    
    try:
        school = School.objects.create(
            name=school_name,
            code=school_code,
            phone=phone,
            email=email,
            address='',
            bank_name='',
            bank_account_number='',
            bank_account_holder='',
            subscription_active=False,
            subscription_status='pending'
        )
        print(f"✅ School created: {school.name} (Code: {school.code}) - ID: {school.id}")
        
        if logo:
            try:
                school.logo.save(logo.name, logo)
                school.save()
                print(f"✅ Logo saved successfully: {school.logo.url}")
            except Exception as logo_error:
                print(f"⚠️ Logo save error: {logo_error}")
        
        from academics.models import AcademicYear
        from datetime import date
        import datetime as dt
        
        current_gregorian_year = dt.datetime.now().year
        ethiopian_year = current_gregorian_year - 8
        
        years_to_create = [ethiopian_year - 1, ethiopian_year, ethiopian_year + 1, ethiopian_year + 2]
        for year_ec in years_to_create:
            year_name = f"{year_ec} E.C."
            try:
                AcademicYear.objects.create(
                    school=school,
                    year_ec=year_ec,
                    name=year_name,
                    start_date=date(year_ec + 8, 9, 10),
                    end_date=date(year_ec + 9, 7, 9),
                    is_current=(year_ec == ethiopian_year),
                    is_active=True,
                    is_archived=False
                )
                print(f"✅ Created academic year: {year_name}")
            except Exception as e:
                print(f"⚠️ Could not create {year_name}: {e}")
        
        user = User.objects.create_user(
            username=username,
            email=email,
            password=password,
            first_name=first_name,
            last_name=last_name,
            is_active=False
        )
        print(f"✅ User created: {user.username}")
        
        UserProfile.objects.create(
            user=user,
            school_id=school.id,
            role='school_admin',
            is_email_verified=True,
            phone=phone
        )
        print(f"✅ UserProfile created")
        
        from schools.models import SchoolAdminProfile
        SchoolAdminProfile.objects.create(
            user=user,
            school=school,
            is_active=True
        )
        print(f"✅ SchoolAdminProfile created")
        
        save_password_history(user, password)
        
        return Response({
            'success': True,
            'message': 'Registration submitted. Waiting for Super Admin approval.',
            'user': {
                'id': user.id,
                'username': user.username,
                'email': user.email,
                'school_id': school.id,
                'school_name': school.name
            }
        }, status=status.HTTP_201_CREATED)
        
    except Exception as e:
        print(f"❌ Registration error: {e}")
        import traceback
        traceback.print_exc()
        if school:
            try:
                school.delete()
            except:
                pass
        return Response({
            'success': False,
            'error': str(e)
        }, status=status.HTTP_400_BAD_REQUEST)


# ===== ORIGINAL ENDPOINTS (UNCHANGED) =====
@api_view(['GET'])
@permission_classes([AllowAny])
def verify_email(request, token):
    try:
        profile = UserProfile.objects.get(email_verification_token=token)
        profile.is_email_verified = True
        profile.save()
        return Response({
            'success': True,
            'message': 'Email verified successfully. You can now login.'
        })
    except UserProfile.DoesNotExist:
        return Response({
            'success': False,
            'error': 'Invalid verification token'
        }, status=status.HTTP_400_BAD_REQUEST)


@api_view(['POST'])
@permission_classes([AllowAny])
def forgot_password(request):
    serializer = ForgotPasswordSerializer(data=request.data)
    if not serializer.is_valid():
        return Response({
            'success': False,
            'errors': serializer.errors
        }, status=status.HTTP_400_BAD_REQUEST)
    
    email = serializer.validated_data['email']
    
    try:
        user = User.objects.filter(email=email).first()
        if user and hasattr(user, 'profile'):
            user.profile.reset_password_token = uuid.uuid4()
            user.profile.reset_password_expires = timezone.now() + timezone.timedelta(hours=24)
            user.profile.save()
            
            from common.email_service import send_reset_password_email
            success, message = send_reset_password_email(email, str(user.profile.reset_password_token))
            if not success:
                print(f"Failed to send reset email: {message}")
        
        return Response({
            'success': True,
            'message': 'Password reset link sent to your email'
        })
    except Exception as e:
        print(f"Forgot password error: {e}")
        return Response({
            'success': True,
            'message': 'If your email is registered, you will receive a reset link'
        })


@api_view(['POST'])
@permission_classes([AllowAny])
def reset_password(request):
    serializer = ResetPasswordSerializer(data=request.data)
    if not serializer.is_valid():
        return Response({
            'success': False,
            'errors': serializer.errors
        }, status=status.HTTP_400_BAD_REQUEST)
    
    token = serializer.validated_data['token']
    new_password = serializer.validated_data['new_password']
    
    try:
        profile = UserProfile.objects.get(
            reset_password_token=token,
            reset_password_expires__gt=timezone.now()
        )
        user = profile.user
        
        valid, message = check_password_history(user, new_password)
        if not valid:
            return Response({
                'success': False,
                'error': message
            }, status=status.HTTP_400_BAD_REQUEST)
        
        user.set_password(new_password)
        user.save()
        save_password_history(user, new_password)
        
        profile.reset_password_token = None
        profile.reset_password_expires = None
        profile.save()
        
        log_action(user, 'PASSWORD_RESET', 'Password reset via token', request)
        
        return Response({
            'success': True,
            'message': 'Password reset successful. You can now login.'
        })
    except UserProfile.DoesNotExist:
        return Response({
            'success': False,
            'error': 'Invalid or expired reset token. Please request a new password reset.'
        }, status=status.HTTP_400_BAD_REQUEST)


@api_view(['POST'])
@permission_classes([IsAuthenticated])
def change_password(request):
    serializer = ChangePasswordSerializer(data=request.data)
    if not serializer.is_valid():
        return Response({
            'success': False,
            'errors': serializer.errors
        }, status=status.HTTP_400_BAD_REQUEST)
    
    user = request.user
    old_password = serializer.validated_data['old_password']
    new_password = serializer.validated_data['new_password']
    
    if not user.check_password(old_password):
        return Response({
            'success': False,
            'error': 'Current password is incorrect'
        }, status=status.HTTP_400_BAD_REQUEST)
    
    valid, message = check_password_history(user, new_password)
    if not valid:
        return Response({
            'success': False,
            'error': message
        }, status=status.HTTP_400_BAD_REQUEST)
    
    user.set_password(new_password)
    user.save()
    save_password_history(user, new_password)
    log_action(user, 'PASSWORD_CHANGE', 'User changed password', request)
    
    return Response({
        'success': True,
        'message': 'Password changed successfully. Please login again.'
    })


@api_view(['GET', 'POST'])
@permission_classes([AllowAny])
def logout(request):
    from django.shortcuts import redirect
    if request.user.is_authenticated:
        user = request.user
        log_action(user, 'LOGOUT', 'User logged out', request)
    request.session.flush()
    auth_logout(request)
    return redirect('/admin-dashboard/login/')


@api_view(['GET'])
@permission_classes([AllowAny])
def get_csrf_token(request):
    csrf_token = get_token(request)
    return Response({'csrfToken': csrf_token})


@api_view(['GET'])
@permission_classes([AllowAny])
def get_current_user(request):
    try:
        if not request.user.is_authenticated:
            return Response({
                'success': False,
                'error': 'Not authenticated',
                'user': None
            }, status=200)
        
        user = request.user
        school_info = None
        try:
            from schools.models import SchoolAdminProfile, School
            school_admin_profile = SchoolAdminProfile.objects.filter(user=user, is_active=True).first()
            if school_admin_profile:
                school = School.objects.get(id=school_admin_profile.school_id)
                school_info = {
                    'id': school.id,
                    'name': school.name,
                    'code': school.code,
                    'logo': school.logo.url if school.logo else None
                }
            else:
                # ✅ FIX: school_info was only ever resolved for
                # SchoolAdminProfile — every StaffMember-linked account
                # (teacher, registrar, accountant...) got school=None here,
                # even though get_verified_school_id() elsewhere correctly
                # resolves their school from StaffMember.school. Same fix,
                # applied to this response too.
                staff_profile = getattr(user, 'staff_profile', None)
                if staff_profile and staff_profile.school_id:
                    school = staff_profile.school
                    school_info = {
                        'id': school.id,
                        'name': school.name,
                        'code': school.code,
                        'logo': school.logo.url if school.logo else None
                    }
        except Exception as e:
            print(f"Error getting school info: {e}")
        
        # ✅ Was: role = profile.role (always 'staff' for anyone logged in
        # via StaffMemberViewSet.create_login — the frontend nav couldn't
        # tell a registrar from an accountant from a librarian, and fell
        # back to showing everyone the full admin menu).
        # Now: resolves the real StaffMember.role when there is one.
        from common.utils import get_effective_role
        role = get_effective_role(user) or 'staff'
        is_super_admin = (role == 'super_admin')
        is_school_admin = (role == 'school_admin')
        
        return Response({
            'success': True,
            'user': {
                'id': user.id,
                'email': user.email,
                'username': user.username,
                'first_name': user.first_name,
                'last_name': user.last_name,
                'role': role,
                'is_super_admin': is_super_admin,
                'is_school_admin': is_school_admin,
                'staff_id': getattr(getattr(user, 'staff_profile', None), 'id', None),
                'school': school_info
            }
        })
    except Exception as e:
        print(f"Error in get_current_user: {e}")
        import traceback
        traceback.print_exc()
        return Response({'success': False, 'error': str(e)}, status=500)


@api_view(['PATCH'])
@permission_classes([IsAuthenticated])
def update_profile(request):
    """
    Update the logged-in user's own profile: first_name, last_name, phone,
    photo. This was referenced by urls.py ('me/update/') but never actually
    implemented, so every call to it 404'd/500'd — including the admin
    profile-photo upload on the School Settings-adjacent profile page.

    Name/phone/photo for anyone with portal access live on StaffMember
    (school_admin, teacher, registrar, etc. — see staff/models.py), not on
    UserProfile, so this updates both the StaffMember record and the
    User's own first_name/last_name (kept in sync since get_current_user
    and other views read user.first_name/last_name directly).
    """
    try:
        user = request.user
        staff = getattr(user, 'staff_profile', None)
        if not staff:
            return Response(
                {'success': False, 'error': 'No staff profile is linked to this account.'},
                status=400,
            )

        first_name = request.data.get('first_name')
        last_name = request.data.get('last_name')
        phone = request.data.get('phone')
        photo = request.FILES.get('photo')

        if first_name is not None and first_name != '':
            staff.first_name = first_name
            user.first_name = first_name
        if last_name is not None and last_name != '':
            staff.last_name = last_name
            user.last_name = last_name
        if phone is not None:
            staff.phone = phone
        if photo:
            staff.photo = photo

        staff.save()
        user.save(update_fields=['first_name', 'last_name'])

        return Response({
            'success': True,
            'first_name': staff.first_name,
            'last_name': staff.last_name,
            'phone': staff.phone,
            'photo': staff.photo.url if staff.photo else None,
        })
    except Exception as e:
        print(f"Error in update_profile: {e}")
        import traceback
        traceback.print_exc()
        return Response({'success': False, 'error': str(e)}, status=500)


@api_view(['GET'])
@permission_classes([AllowAny])
def get_school_staff(request):
    try:
        if not request.user.is_authenticated:
            return Response({'error': 'Authentication required'}, status=401)
        if not hasattr(request.user, 'profile'):
            return Response({'error': 'User profile not found'}, status=403)
        if request.user.profile.role != 'school_admin':
            return Response({'error': 'Only school admins can view staff'}, status=403)
        
        school_id = request.user.profile.school_id
        if not school_id:
            return Response({'error': 'No school associated with this admin'}, status=400)
        
        users = User.objects.filter(
            profile__school_id=school_id,
            profile__role__in=['registrar', 'payment_manager', 'reporting_manager', 'reminder_manager']
        )
        from .serializers import UserSerializer
        serializer = UserSerializer(users, many=True)
        return Response(serializer.data)
    except Exception as e:
        print(f"Error in get_school_staff: {e}")
        import traceback
        traceback.print_exc()
        return Response({'error': str(e)}, status=500)


@api_view(['POST'])
@permission_classes([IsAuthenticated])
@csrf_exempt
def create_staff(request):
    try:
        if not request.user.is_authenticated:
            return Response({'error': 'Authentication required'}, status=401)
        if not hasattr(request.user, 'profile'):
            return Response({'error': 'User profile not found'}, status=403)
        if request.user.profile.role != 'school_admin':
            return Response({'error': 'Only school admins can create staff'}, status=403)
        
        email = request.data.get('email')
        username = request.data.get('username')
        password = request.data.get('password')
        role = request.data.get('role')
        first_name = request.data.get('first_name', '')
        last_name = request.data.get('last_name', '')
        phone = request.data.get('phone', '')
        
        valid_roles = ['registrar', 'payment_manager', 'reporting_manager', 'reminder_manager']
        if role not in valid_roles:
            return Response({'error': f'Invalid role. Choose from: {valid_roles}'}, status=400)
        
        if User.objects.filter(email=email).exists():
            return Response({'error': 'Email already exists'}, status=400)
        if User.objects.filter(username=username).exists():
            return Response({'error': 'Username already exists'}, status=400)
        
        school_id = request.user.profile.school_id
        user = User.objects.create(
            email=email,
            username=username,
            password=make_password(password),
            first_name=first_name,
            last_name=last_name,
            is_active=True
        )
        UserProfile.objects.create(
            user=user,
            role=role,
            phone=phone,
            school_id=school_id,
            is_email_verified=True
        )
        return Response({
            'success': True,
            'message': 'Staff member created successfully',
            'user': {'id': user.id, 'email': user.email, 'username': user.username, 'role': role}
        }, status=201)
    except Exception as e:
        print(f"Error in create_staff: {e}")
        import traceback
        traceback.print_exc()
        return Response({'error': str(e)}, status=500)


@api_view(['DELETE'])
@permission_classes([AllowAny])
def delete_staff(request, user_id):
    try:
        if not request.user.is_authenticated:
            return Response({'error': 'Authentication required'}, status=401)
        if not hasattr(request.user, 'profile'):
            return Response({'error': 'User profile not found'}, status=403)
        if request.user.profile.role != 'school_admin':
            return Response({'error': 'Only school admins can delete staff'}, status=403)
        
        school_id = request.user.profile.school_id
        user = User.objects.get(id=user_id, profile__school_id=school_id)
        user.delete()
        return Response({'success': True, 'message': 'Staff member deleted'})
    except User.DoesNotExist:
        return Response({'error': 'Staff member not found'}, status=404)
    except Exception as e:
        print(f"Error in delete_staff: {e}")
        return Response({'error': str(e)}, status=500)
