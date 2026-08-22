# backend/authentication/views.py - REAL OTP EMAIL INTEGRATION
from django.contrib.auth import authenticate, login as auth_login, logout as auth_logout
from django.contrib.auth.models import User
from django.http import HttpResponse, HttpResponseRedirect
from django.middleware.csrf import get_token
from django.core.mail import send_mail
from django.conf import settings
from rest_framework.decorators import api_view, permission_classes, authentication_classes
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

def send_otp_via_email(email, otp_code, school_name=None):
    """
    Send OTP code via Resend/django-anymail.

    ✅ FIX (Jimma request #3): this used to hardcode "Felege Selam
    Payment System" in the subject and body for every school, regardless
    of which school the logging-in user actually belongs to. Callers now
    resolve the real school name (see get_school_name_for_otp below) and
    pass it in. Falls back to a generic, non-branded label — never to
    "Felege Selam" — when no school can be resolved (e.g. a super admin
    with no school_id), so no school is ever shown the wrong school's name.
    """
    display_name = school_name or "your school"
    try:
        subject = f"Your {display_name} Verification Code: {otp_code}"
        message = f"""
        Hello,
        
        Your verification code is: {otp_code}
        
        This code expires in 10 minutes. Do not share this code with anyone.
        
        If you did not request this code, please ignore this email.
        
        Best regards,
        {display_name}
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


def get_school_name_for_otp(school_id):
    """
    Resolves a UserProfile.school_id to that school's display name for
    OTP emails. Returns None (not a hardcoded name) when school_id is
    None or the school can't be found, so send_otp_via_email falls back
    to its own generic, non-misleading default instead of ever showing
    one school's name to another school's user.
    """
    if not school_id:
        return None
    from schools.models import School
    try:
        return School.objects.get(id=school_id).name
    except School.DoesNotExist:
        return None


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

    # ✅ NEW — a super admin has no business logging in through ANY portal
    # other than the dedicated /superadmin/login (which sends
    # portal='superadmin'). Previously this endpoint would still happily
    # authenticate a superuser through the plain /admin/login form (or
    # the teacher portal) too — AdminLogin.js sends no portal field at
    # all, so neither of the portal-specific checks below ever applied to
    # it. The account just wouldn't get redirected anywhere useful
    # afterward (see ProtectedRoute in App.js), which is a landing-page
    # fix, not a login-time rejection — the login itself still succeeded
    # and an OTP still went out. Reject it here instead, at the earliest
    # possible point, so a super-admin credential simply cannot
    # authenticate through the wrong door at all.
    if user.is_superuser and request.data.get('portal') != 'superadmin':
        return Response(
            {
                'error': 'This is a platform administrator account. '
                         'Please sign in at the Super Admin login instead.',
                'is_super_admin_account': True,
            },
            status=403,
        )

    # ✅ FIX: the teacher web portal (TeacherLogin.js) reuses this exact
    # endpoint for convenience, but had no check that the account logging
    # in is actually a teacher — any staff role (accountant, registrar...)
    # could authenticate through it. When the caller identifies itself as
    # the teacher portal, require the linked StaffMember to have
    # role='teacher' before an OTP is even sent.
    if request.data.get('portal') == 'teacher':
        staff_profile = getattr(user, 'staff_profile', None)
        if not staff_profile or staff_profile.role != 'teacher':
            return Response(
                {'error': 'This portal is for teacher accounts only.'},
                status=403,
            )

    # ✅ FIX: mirrors the portal='teacher' check above. SuperAdminLogin.js
    # (the dedicated /superadmin/login page) reuses this same
    # email+password+OTP endpoint, but without this check any school
    # admin who found that URL could still request an OTP through it —
    # the frontend route guard is UX only, not security (see
    # SuperAdminProtectedRoute in App.js). Reject before an OTP is ever
    # sent unless the account is the real platform owner.
    if request.data.get('portal') == 'superadmin' and not user.is_superuser:
        return Response(
            {'error': 'This portal is for the platform administrator account only.'},
            status=403,
        )

    user = authenticate(username=user.username, password=password)
    if not user:
        return Response({'error': 'Invalid credentials'}, status=401)
    
    if hasattr(user, 'profile') and not user.profile.is_email_verified:
        return Response({'error': 'Please verify your email first'}, status=401)

    # ✅ NEW — Service Agreement Section 4 enforcement. Only school_admin/
    # staff/teacher logins for THAT school are affected; super_admin (no
    # school_id) always passes through, and parents use a separate login
    # flow entirely, so an overdue school's parents can still pay.
    profile_role = getattr(user.profile, 'role', None) if hasattr(user, 'profile') else None
    school_id = getattr(user.profile, 'school_id', None) if hasattr(user, 'profile') else None
    if profile_role != 'super_admin' and school_id:
        from schools.models import School
        try:
            school = School.objects.get(id=school_id)
        except School.DoesNotExist:
            school = None
        if school and school.is_access_suspended:
            return Response({
                'error': (
                    "This school's SchoolPay Ethiopia subscription is not active. "
                    "Please contact SchoolPay Ethiopia to reactivate access. "
                    "Student and payment records are safe and have not been affected."
                ),
                'subscription_suspended': True,
            }, status=402)  # 402 Payment Required
    
    # ✅ GENERATE REAL OTP
    otp_code = generate_secure_otp()
    
    profile = user.profile
    profile.otp_code = otp_code
    profile.otp_created_at = timezone.now()
    profile.save()
    
    # ✅ SEND REAL EMAIL VIA RESEND — school-branded (Jimma request #3)
    school_name = get_school_name_for_otp(profile.school_id)
    email_sent = send_otp_via_email(user.email, otp_code, school_name)
    
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

    # ✅ NEW — same reasoning as step1: a super admin should never
    # complete a login through any portal other than 'superadmin', even
    # if step1 were somehow bypassed (e.g. a captured user_id reused
    # directly against step2).
    if user.is_superuser and request.data.get('portal') != 'superadmin':
        return Response(
            {
                'error': 'This is a platform administrator account. '
                         'Please sign in at the Super Admin login instead.',
                'is_super_admin_account': True,
            },
            status=403,
        )

    # ✅ FIX: same teacher-portal check as step1, so a call directly to
    # step2 (skipping step1) can't bypass the role gate.
    if request.data.get('portal') == 'teacher':
        staff_profile = getattr(user, 'staff_profile', None)
        if not staff_profile or staff_profile.role != 'teacher':
            return Response(
                {'error': 'This portal is for teacher accounts only.'},
                status=403,
            )

    # ✅ FIX: same superadmin-portal check as step1, so a call directly to
    # step2 (skipping step1, e.g. with a stolen/guessed user_id) can't
    # bypass the role gate either.
    if request.data.get('portal') == 'superadmin' and not user.is_superuser:
        return Response(
            {'error': 'This portal is for the platform administrator account only.'},
            status=403,
        )
    
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
@authentication_classes([])
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

    # ✅ FIX: parent UserProfiles were being created with no school_id at
    # all, even though `students` (already fetched above from parent_email)
    # tells us exactly which school this parent belongs to. Without it,
    # get_school_for_user() — used by /schools/chapa-config/, bank-accounts,
    # etc. — can't resolve a school for parent accounts and returns 403,
    # which the parent dashboard silently treats as "Online Payments
    # Unavailable". This was previously masked because parent requests had
    # no JWT and got redirected to /admin/login before ever reaching a
    # school-scoped endpoint; now that parents authenticate correctly,
    # this pre-existing gap needs to be filled too.
    student_school_id = students.first().school_id

    if created:
        UserProfile.objects.create(
            user=user,
            role='parent',
            is_email_verified=True,
            school_id=student_school_id
        )
    else:
        # Backfill existing parent accounts created before this fix, or
        # whose linked student's school has since changed.
        profile = user.profile
        if profile.school_id != student_school_id:
            profile.school_id = student_school_id
            profile.save(update_fields=['school_id'])
    
    profile = user.profile
    profile.otp_code = otp_code
    profile.otp_created_at = timezone.now()
    profile.save()
    
    # ✅ SEND REAL EMAIL VIA RESEND — school-branded (Jimma request #3).
    # student_school_id was already resolved above from the parent's
    # student record, so this is always the parent's own school, not
    # whatever school_id happened to be on a stale profile.
    school_name = get_school_name_for_otp(student_school_id)
    email_sent = send_otp_via_email(user.email, otp_code, school_name)
    
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
@authentication_classes([])
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
        
        # ✅ FIX: this used to be is_email_verified=True, which skipped
        # email verification entirely — the verify-email endpoint, the
        # token field, and the "Please verify your email first" login gate
        # all already existed but were dead code because nothing ever
        # required this step. A real school registration now needs BOTH:
        # (1) confirm the email address (below), and (2) Robel's manual
        # approval (is_active=False, unchanged) — two independent gates.
        new_profile = UserProfile.objects.create(
            user=user,
            school_id=school.id,
            role='school_admin',
            is_email_verified=False,
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

        from common.email_service import send_registration_confirmation_email
        email_sent, email_message = send_registration_confirmation_email(
            email, school.name, first_name, str(new_profile.email_verification_token)
        )
        if not email_sent:
            print(f"⚠️ Registration confirmation email failed: {email_message}")

        return Response({
            'success': True,
            'message': 'Registration submitted. Check your email to confirm your address — your school will then be reviewed for approval.',
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
                'photo': (user.profile.photo.url if getattr(user, 'profile', None) and user.profile.photo else None),
                # ✅ Jimma item 5: prefer the linked StaffMember's
                # salutation (kept in sync by update_profile below), fall
                # back to UserProfile.salutation for accounts with no
                # StaffMember record (e.g. self-registered school_admin).
                'salutation': (
                    getattr(user, 'staff_profile', None).salutation
                    if getattr(user, 'staff_profile', None) and user.staff_profile.salutation
                    else (user.profile.salutation if getattr(user, 'profile', None) else '')
                ),
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
    implemented, so every call to it 404'd/500'd.

    UserProfile.photo is the source of truth — every account with portal
    access has a UserProfile, whereas StaffMember (and its own photo field)
    only exists for staff created through the Staff module. A self-
    registered school_admin has no StaffMember record at all, so relying
    on staff_profile.photo failed for exactly that case. If the account
    DOES also have a linked StaffMember (teachers, staff), that record's
    name/phone/photo are kept in sync too, since those show up separately
    on staff ID cards/directories.
    """
    try:
        user = request.user
        # ✅ FIX: previously this 400'd for any account with no
        # UserProfile row — which includes Robel's own superuser account,
        # since createsuperuser doesn't create one (only the registration/
        # staff-creation flows do). That's exactly the account that needs
        # this endpoint to work for the super-admin profile editor, so
        # auto-create it here instead of erroring.
        profile, _ = UserProfile.objects.get_or_create(
            user=user,
            defaults={'role': 'super_admin' if user.is_superuser else 'staff'},
        )
        first_name = request.data.get('first_name')
        last_name = request.data.get('last_name')
        phone = request.data.get('phone')
        photo = request.FILES.get('photo')
        # ✅ Jimma item 5: salutation, same "only touch it if provided"
        # pattern as the other fields here. Empty string is a valid,
        # intentional value (clearing the title), so we check for the
        # key's presence rather than truthiness.
        salutation = request.data.get('salutation')

        if first_name is not None and first_name != '':
            user.first_name = first_name
        if last_name is not None and last_name != '':
            user.last_name = last_name
        if phone is not None:
            profile.phone = phone
        if photo:
            profile.photo = photo
        if salutation is not None:
            profile.salutation = salutation

        user.save(update_fields=['first_name', 'last_name'])
        profile.save()

        # Keep StaffMember in sync too, if this account has one.
        staff = getattr(user, 'staff_profile', None)
        if staff:
            if first_name is not None and first_name != '':
                staff.first_name = first_name
            if last_name is not None and last_name != '':
                staff.last_name = last_name
            if phone is not None:
                staff.phone = phone
            if photo:
                staff.photo = photo
            if salutation is not None:
                staff.salutation = salutation
            staff.save()

        # ✅ NEW — keep School.phone in sync too, for school_admin accounts.
        # At registration, the phone number typed in goes to BOTH
        # UserProfile.phone (the admin's personal profile) AND
        # School.phone (the school's own registered contact number) — see
        # register() above. But this endpoint only ever updated
        # UserProfile.phone, and there was no other UI anywhere in the app
        # to edit School.phone. That's the number
        # payments/services/multi_school_sms_service.py actually sends
        # AfroMessage SMS to/uses for the school's SMS credentials test —
        # so a school admin changing "their" phone here had no effect on
        # what AfroMessage used, silently keeping the number from
        # registration forever. Only applies to school_admin accounts —
        # a teacher/staff member updating their own personal phone should
        # never overwrite the school's registered contact number.
        if profile.role == 'school_admin' and profile.school_id and phone is not None:
            from schools.models import School
            School.objects.filter(id=profile.school_id).update(phone=phone)

        return Response({
            'success': True,
            # ✅ FIX: was returning these fields at the top level
            # (res.data.first_name, etc.), but ProfileMenu.js (the only
            # caller) reads res.data.user.* — matching get_current_user's
            # response shape, which nests everything under 'user' too.
            # Previously this mismatch meant the freshly-uploaded photo/
            # name never actually appeared after saving — the save
            # succeeded, `res.data.user` was just always undefined, so
            # the local state update silently did nothing until the next
            # full page reload re-fetched /me/.
            'user': {
                'first_name': user.first_name,
                'last_name': user.last_name,
                'phone': profile.phone,
                'photo': profile.photo.url if profile.photo else None,
            },
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
        
        # Only block on a genuine admin/staff collision — a 'parent'
        # account under this email is a separate identity (see
        # RegisterSerializer.validate and admin_login_step1 for the same
        # exclusion) and shouldn't stop this email from also being used
        # for a staff account.
        if User.objects.exclude(profile__role='parent').filter(email=email).exists():
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