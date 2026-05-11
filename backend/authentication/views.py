# backend/authentication/views.py - COMPLETE WITH OTP 2FA
from django.contrib.auth import authenticate
from django.contrib.auth import login as auth_login
from django.contrib.auth import logout as auth_logout
from django.contrib.auth.models import User
from django.middleware.csrf import get_token
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response
from rest_framework import status
from rest_framework.decorators import throttle_classes
from django.utils import timezone
from django.contrib.auth.hashers import make_password, check_password
import uuid
from .serializers import (
    RegisterSerializer, LoginSerializer, UserSerializer, 
    ForgotPasswordSerializer, ResetPasswordSerializer, 
    ChangePasswordSerializer
)
from .models import UserProfile, PasswordHistory
from datetime import date
from .throttles import LoginRateThrottle
from common.utils import log_action
from .utils import generate_otp, send_otp_email, verify_otp
from common.email_service import send_otp_email
from .permissions import IsSuperAdmin, IsSchoolAdmin
# ===== HELPER FUNCTION FOR PASSWORD HISTORY =====
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


# ===== OTP 2FA: ADMIN LOGIN WITH 2FA =====
@api_view(['POST'])
@permission_classes([AllowAny])
def admin_login_step1(request):
    """Step 1: Admin login with email and password, sends OTP"""
    email = request.data.get('email')
    password = request.data.get('password')
    
    if not email or not password:
        return Response({'error': 'Email and password required'}, status=400)
    
    try:
        user = User.objects.get(email=email)
    except User.DoesNotExist:
        return Response({'error': 'Invalid credentials'}, status=401)
    
    # Check if user is active
    if not user.is_active:
        return Response({'error': 'Account pending approval'}, status=401)
    
    # Authenticate
    user = authenticate(username=user.username, password=password)
    
    if not user:
        return Response({'error': 'Invalid credentials'}, status=401)
    
    # Check email verification
    if hasattr(user, 'profile') and not user.profile.is_email_verified:
        return Response({'error': 'Please verify your email first'}, status=401)
    
    # Generate OTP (6-digit random number)
    import random
    otp_code = f"{random.randint(100000, 999999)}"
    
    profile = user.profile
    profile.otp_code = otp_code
    profile.otp_created_at = timezone.now()
    profile.save()
    
    # Send OTP email
    success, message = send_otp_email(email, otp_code, 'admin')
    
    if not success:
        return Response({'error': 'Failed to send OTP. Please try again.'}, status=500)
    
    return Response({
        'success': True,
        'message': 'OTP sent to your email',
        'user_id': user.id,
        'requires_otp': True
    })


@api_view(['POST'])
@permission_classes([AllowAny])
def admin_login_step2(request):
    """Step 2: Verify OTP and complete admin login"""
    user_id = request.data.get('user_id')
    otp_code = request.data.get('otp_code')
    
    if not user_id or not otp_code:
        return Response({'error': 'User ID and OTP required'}, status=400)
    
    try:
        user = User.objects.get(id=user_id)
    except User.DoesNotExist:
        return Response({'error': 'User not found'}, status=404)
    
    profile = user.profile
    
    # Verify OTP
    valid, message = verify_otp(profile, otp_code)
    
    if not valid:
        return Response({'error': message}, status=401)
    
    # Clear OTP
    profile.otp_code = None
    profile.otp_created_at = None
    profile.save()
    
    # Login the user
    auth_login(request, user)
    
    # Log audit
    log_action(user, 'LOGIN', 'Admin logged in with 2FA', request)
    
    # Get school info
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
    except:
        pass
    
    return Response({
        'success': True,
        'message': 'Login successful',
        'user': {
            'id': user.id,
            'email': user.email,
            'username': user.username,
            'first_name': user.first_name,
            'last_name': user.last_name,
            'role': profile.role,
            'is_super_admin': profile.is_super_admin,
            'is_school_admin': profile.is_school_admin,
            'school': school_info
        }
    })


# ===== OTP 2FA: PARENT LOGIN WITH OTP ONLY =====
@api_view(['POST'])
@permission_classes([AllowAny])
def parent_login_step1(request):
    """Step 1: Parent sends email, receives OTP"""
    email = request.data.get('email')
    
    if not email:
        return Response({'error': 'Email required'}, status=400)
    
    # Find student by parent email
    from students.models import Student
    students = Student.objects.filter(parent_email=email)
    
    if not students.exists():
        return Response({'error': 'No student found with this email'}, status=404)
    
    # Generate OTP
    otp_code = generate_otp()
    print(f"🔐 Generated OTP for {email}: {otp_code}")  # Debug print
    
    # Create or update user profile for this email
    username = f"parent_{email.replace('@', '_').replace('.', '_')}"
    user, created = User.objects.get_or_create(
        username=username,
        defaults={
            'email': email,
            'is_active': True
        }
    )
    
    if created:
        UserProfile.objects.create(
            user=user,
            role='parent',
            is_email_verified=True
        )
    
    # ✅ FIX: Get or create profile and save OTP
    profile = user.profile
    profile.otp_code = otp_code
    profile.otp_created_at = timezone.now()
    profile.save()
    
    print(f"✅ OTP saved for {email}: {profile.otp_code}")  # Debug print
    
    # Send OTP email
    send_otp_email(email, otp_code, 'parent')
    
    return Response({
        'success': True,
        'message': 'OTP sent to your email',
        'user_id': user.id
    })

@api_view(['POST'])
@permission_classes([AllowAny])
def parent_login_step2(request):
    """Step 2: Verify OTP and return success (without student list)"""
    user_id = request.data.get('user_id')
    otp_code = request.data.get('otp_code')
    
    if not user_id or not otp_code:
        return Response({'error': 'User ID and OTP required'}, status=400)
    
    try:
        user = User.objects.get(id=user_id)
    except User.DoesNotExist:
        return Response({'error': 'User not found'}, status=404)
    
    profile = user.profile
    
    # Verify OTP
    valid, message = verify_otp(profile, otp_code)
    
    if not valid:
        return Response({'error': message}, status=401)
    
    # Clear OTP
    profile.otp_code = None
    profile.otp_created_at = None
    profile.save()
    
    # Create session
    auth_login(request, user)
    
    # ✅ REMOVED: The student list is no longer returned
    # Parent will now manually enter Student ID on the next page
    
    return Response({
        'success': True,
        'message': 'OTP verified successfully. Please enter your student ID.',
        'user_id': user.id
    })

# ===== ORIGINAL REGISTRATION ENDPOINT =====
@api_view(['POST'])
@permission_classes([AllowAny])
def register(request):
    """Register a new school admin or staff (pending Super Admin approval)"""
    
    print("=" * 50)
    print("📝 REGISTRATION REQUEST RECEIVED")
    
    logo = request.FILES.get('logo')
    school = None
    
    email = request.data.get('email')
    username = request.data.get('username')
    school_code = request.data.get('school_code', '').upper()
    school_name = request.data.get('school_name')
    
    if User.objects.filter(email=email).exists():
        return Response({
            'success': False,
            'errors': {'email': 'This email is already registered. Please use a different email.'}
        }, status=status.HTTP_400_BAD_REQUEST)
    
    if User.objects.filter(username=username).exists():
        return Response({
            'success': False,
            'errors': {'username': 'This username is already taken. Please choose another.'}
        }, status=status.HTTP_400_BAD_REQUEST)
    
    from schools.models import School
    if School.objects.filter(code=school_code).exists():
        return Response({
            'success': False,
            'errors': {'school_code': f'School code "{school_code}" already exists. Please use a different code.'}
        }, status=status.HTTP_400_BAD_REQUEST)
    
    try:
        school = School.objects.create(
            name=school_name,
            code=school_code,
            phone=request.data.get('phone', ''),
            email=email,
            address='',
            bank_name='',
            bank_account_number='',
            bank_account_holder='',
            logo=logo if logo else None,
            subscription_active=False
        )
        print(f"✅ School created: {school.name} (Code: {school.code})")
        
        serializer = RegisterSerializer(data=request.data)
        if serializer.is_valid():
            user = serializer.save(is_active=False)
            print(f"✅ User created: {user.username}")
            
            password = request.data.get('password')
            save_password_history(user, password)
            
            UserProfile.objects.create(
                user=user,
                school_id=school.id,
                role='school_admin',
                is_email_verified=True
            )
            print(f"✅ UserProfile created")
            
            from schools.models import SchoolAdminProfile
            SchoolAdminProfile.objects.create(
                user=user,
                school=school,
                is_active=True
            )
            print(f"✅ SchoolAdminProfile created")
            
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
        
        print(f"❌ Serializer errors: {serializer.errors}")
        school.delete()
        return Response({
            'success': False,
            'errors': serializer.errors
        }, status=status.HTTP_400_BAD_REQUEST)
        
    except Exception as e:
        print(f"❌ Registration error: {e}")
        if school:
            try:
                school.delete()
            except:
                pass
        return Response({
            'success': False,
            'error': str(e)
        }, status=status.HTTP_400_BAD_REQUEST)


# ===== ORIGINAL ENDPOINTS (KEPT FOR COMPATIBILITY) =====
@api_view(['GET'])
@permission_classes([AllowAny])
def verify_email(request, token):
    """Verify user email"""
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
    """Send password reset email"""
    serializer = ForgotPasswordSerializer(data=request.data)
    if not serializer.is_valid():
        return Response({
            'success': False,
            'errors': serializer.errors
        }, status=status.HTTP_400_BAD_REQUEST)
    
    email = serializer.validated_data['email']
    
    try:
        # ✅ Use filter().first() to avoid MultipleObjectsReturned
        user = User.objects.filter(email=email).first()
        
        if user and hasattr(user, 'profile'):
            import uuid
            user.profile.reset_password_token = uuid.uuid4()
            user.profile.reset_password_expires = timezone.now() + timezone.timedelta(hours=24)
            user.profile.save()
            
            # ✅ Send the reset email
            from common.email_service import send_reset_password_email
            success, message = send_reset_password_email(email, str(user.profile.reset_password_token))
            
            if not success:
                print(f"Failed to send reset email: {message}")
        
        # Always return success for security (don't reveal if email exists)
        return Response({
            'success': True,
            'message': 'Password reset link sent to your email'
        })
        
    except Exception as e:
        print(f"Forgot password error: {e}")
        # Still return success for security
        return Response({
            'success': True,
            'message': 'If your email is registered, you will receive a reset link'
        })


@api_view(['POST'])
@permission_classes([AllowAny])
def reset_password(request):
    """Reset password using token"""
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
        
        # Check password history
        valid, message = check_password_history(user, new_password)
        if not valid:
            return Response({
                'success': False,
                'error': message
            }, status=status.HTTP_400_BAD_REQUEST)
        
        user.set_password(new_password)
        user.save()
        
        save_password_history(user, new_password)
        
        # Clear the reset token
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
    """Change password for authenticated user"""
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


@api_view(['POST'])
@permission_classes([IsAuthenticated])
def logout(request):
    """Logout user"""
    user = request.user
    log_action(user, 'LOGOUT', 'User logged out', request)
    auth_logout(request)
    return Response({
        'success': True,
        'message': 'Logged out successfully'
    })


@api_view(['GET'])
@permission_classes([AllowAny])
def get_csrf_token(request):
    """Get CSRF token for frontend"""
    csrf_token = get_token(request)
    return Response({
        'csrfToken': csrf_token
    })


@api_view(['GET'])
@permission_classes([AllowAny])
def get_current_user(request):
    """Get current logged in user info"""
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
        except Exception as e:
            print(f"Error getting school info: {e}")
        
        role = 'staff'
        is_super_admin = False
        is_school_admin = False
        
        if hasattr(user, 'profile'):
            profile = user.profile
            role = profile.role
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
                'school': school_info
            }
        })
    except Exception as e:
        print(f"Error in get_current_user: {e}")
        import traceback
        traceback.print_exc()
        return Response({
            'success': False,
            'error': str(e)
        }, status=500)

@api_view(['GET'])
@permission_classes([AllowAny])
def get_school_staff(request):
    """Get all staff members for the school admin's school"""
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
@permission_classes([AllowAny]) 
def create_staff(request):
    """Create a new staff member"""
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
            'message': f'Staff member created successfully',
            'user': {
                'id': user.id,
                'email': user.email,
                'username': user.username,
                'role': role
            }
        }, status=201)
        
    except Exception as e:
        print(f"Error in create_staff: {e}")
        import traceback
        traceback.print_exc()
        return Response({'error': str(e)}, status=500)

@api_view(['DELETE'])
@permission_classes([AllowAny])
def delete_staff(request, user_id):
    """Delete a staff member"""
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