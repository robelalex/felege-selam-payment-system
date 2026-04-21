# backend/authentication/views.py - FULL UPDATED (with logo, academic year, and approval workflow)
from django.contrib.auth import authenticate
from django.contrib.auth import login as auth_login
from django.contrib.auth import logout as auth_logout
from django.contrib.auth.models import User
from django.middleware.csrf import get_token
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response
from rest_framework import status
from django.utils import timezone
import uuid
from .serializers import RegisterSerializer, LoginSerializer, UserSerializer, ForgotPasswordSerializer, ResetPasswordSerializer
from .models import UserProfile
from datetime import date


@api_view(['POST'])
@permission_classes([AllowAny])
def register(request):
    """Register a new school admin or staff (pending Super Admin approval)"""
    
    print("=" * 50)
    print("📝 REGISTRATION REQUEST RECEIVED")
    
    # Handle file upload for logo
    logo = request.FILES.get('logo')
    school = None
    
    # Get data with defaults
    email = request.data.get('email')
    username = request.data.get('username')
    school_code = request.data.get('school_code', '').upper()
    school_name = request.data.get('school_name')
    
    # ✅ Check if email already exists
    from django.contrib.auth.models import User
    if User.objects.filter(email=email).exists():
        return Response({
            'success': False,
            'errors': {'email': 'This email is already registered. Please use a different email.'}
        }, status=status.HTTP_400_BAD_REQUEST)
    
    # ✅ Check if username already exists
    if User.objects.filter(username=username).exists():
        return Response({
            'success': False,
            'errors': {'username': 'This username is already taken. Please choose another.'}
        }, status=status.HTTP_400_BAD_REQUEST)
    
    # ✅ Check if school code already exists
    from schools.models import School
    if School.objects.filter(code=school_code).exists():
        return Response({
            'success': False,
            'errors': {'school_code': f'School code "{school_code}" already exists. Please use a different code.'}
        }, status=status.HTTP_400_BAD_REQUEST)
    
    try:
        # Create school (NO academic year here - school admin will create it)
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
        
        # Create user (inactive until approved)
        serializer = RegisterSerializer(data=request.data)
        if serializer.is_valid():
            user = serializer.save(is_active=False)
            print(f"✅ User created: {user.username}")
            
            # Create UserProfile with school_id
            from .models import UserProfile
            UserProfile.objects.create(
                user=user,
                school_id=school.id,
                role='school_admin',
                is_email_verified=True
            )
            print(f"✅ UserProfile created")
            
            # Create SchoolAdminProfile
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
        
        # If serializer fails, clean up
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
def login(request):
    """Login user"""
    serializer = LoginSerializer(data=request.data)
    if not serializer.is_valid():
        return Response({
            'success': False,
            'errors': serializer.errors
        }, status=status.HTTP_400_BAD_REQUEST)
    
    email = serializer.validated_data['email']
    password = serializer.validated_data['password']
    
    # Get user by email
    try:
        user = User.objects.get(email=email)
    except User.DoesNotExist:
        return Response({
            'success': False,
            'error': 'Invalid email or password'
        }, status=status.HTTP_401_UNAUTHORIZED)
    
    # ✅ Check if user is active (approved by Super Admin)
    if not user.is_active:
        return Response({
            'success': False,
            'error': 'Your account is pending approval. Please wait for Super Admin to activate your school.'
        }, status=status.HTTP_401_UNAUTHORIZED)
    
    # Authenticate with username
    user = authenticate(username=user.username, password=password)
    
    if not user:
        return Response({
            'success': False,
            'error': 'Invalid email or password'
        }, status=status.HTTP_401_UNAUTHORIZED)
    
    # Check email verification
    if hasattr(user, 'userprofile') and not user.userprofile.is_email_verified:
        return Response({
            'success': False,
            'error': 'Please verify your email before logging in'
        }, status=status.HTTP_401_UNAUTHORIZED)
    
    # Login the user
    auth_login(request, user)
    
    # Get school from SchoolAdminProfile
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
            print(f"✅ Login - School found for {user.username}: {school.name} (ID: {school.id})")
        else:
            print(f"⚠️ Login - No SchoolAdminProfile found for {user.username}")
    except Exception as e:
        print(f"❌ Login - Error getting school: {e}")
    
    # Get role from UserProfile if exists
    role = 'school_admin'
    is_super_admin = False
    is_school_admin = True
    
    if hasattr(user, 'userprofile'):
        role = user.userprofile.role
        is_super_admin = user.userprofile.is_super_admin
        is_school_admin = user.userprofile.is_school_admin
    
    return Response({
        'success': True,
        'message': 'Login successful',
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
        user = User.objects.get(email=email)
        # Generate reset token
        if hasattr(user, 'userprofile'):
            user.userprofile.reset_password_token = uuid.uuid4()
            user.userprofile.reset_password_expires = timezone.now() + timezone.timedelta(hours=24)
            user.userprofile.save()
        
        return Response({
            'success': True,
            'message': 'Password reset link sent to your email'
        })
    except User.DoesNotExist:
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
        user.set_password(new_password)
        user.save()
        profile.reset_password_token = None
        profile.reset_password_expires = None
        profile.save()
        
        return Response({
            'success': True,
            'message': 'Password reset successful. You can now login.'
        })
    except UserProfile.DoesNotExist:
        return Response({
            'success': False,
            'error': 'Invalid or expired reset token'
        }, status=status.HTTP_400_BAD_REQUEST)


@api_view(['POST'])
@permission_classes([IsAuthenticated])
def logout(request):
    """Logout user"""
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
@permission_classes([IsAuthenticated])
def get_current_user(request):
    """Get current logged in user info"""
    user = request.user
    
    # Get school from SchoolAdminProfile
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
            print(f"✅ get_current_user - School found for {user.username}: {school.name}")
        else:
            print(f"⚠️ get_current_user - No SchoolAdminProfile found for {user.username}")
    except Exception as e:
        print(f"❌ get_current_user - Error getting school: {e}")
    
    # Get role from UserProfile if exists
    role = 'school_admin'
    is_super_admin = False
    is_school_admin = True
    
    if hasattr(user, 'userprofile'):
        role = user.userprofile.role
        is_super_admin = user.userprofile.is_super_admin
        is_school_admin = user.userprofile.is_school_admin
    
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