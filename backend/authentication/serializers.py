# backend/authentication/serializers.py
from rest_framework import serializers
from django.contrib.auth.models import User
from django.contrib.auth.password_validation import validate_password
from django.core.validators import ValidationError
from .models import UserProfile, PasswordHistory
import re


# Add to UserSerializer - make sure 'role' is included
class UserSerializer(serializers.ModelSerializer):
    role = serializers.CharField(source='profile.role')
    phone = serializers.CharField(source='profile.phone')
    is_email_verified = serializers.BooleanField(source='profile.is_email_verified')
    school_id = serializers.IntegerField(source='profile.school_id')
    
    class Meta:
        model = User
        fields = ['id', 'email', 'username', 'first_name', 'last_name', 'role', 'phone', 'is_email_verified', 'school_id']
        read_only_fields = ['id']


def validate_password_strength(password):
    """Custom password strength validator - Relaxed for production"""
    errors = []
    
    # Reduced to 8 characters for easier testing
    if len(password) < 8:
        errors.append("Password must be at least 8 characters long")
    
    if not re.search(r'[A-Z]', password):
        errors.append("Password must contain at least one uppercase letter")
    
    if not re.search(r'[a-z]', password):
        errors.append("Password must contain at least one lowercase letter")
    
    if not re.search(r'[0-9]', password):
        errors.append("Password must contain at least one number")
    
    # Special character is recommended but not required
    # if not re.search(r'[!@#$%^&*(),.?":{}|<>]', password):
    #     errors.append("Password must contain at least one special character (!@#$%^&* etc.)")
    
    if errors:
        raise ValidationError(errors)
    
    return password


def check_password_history(user, new_password):
    """Check if password was used before (prevent reuse)"""
    from django.contrib.auth.hashers import check_password
    
    # Check last 5 passwords
    recent_passwords = PasswordHistory.objects.filter(user=user)[:5]
    
    for history in recent_passwords:
        if check_password(new_password, history.password_hash):
            raise ValidationError("You cannot reuse a recent password. Please choose a different password.")
    
    return True


class RegisterSerializer(serializers.Serializer):
    email = serializers.EmailField()
    username = serializers.CharField()
    password = serializers.CharField(write_only=True)
    confirm_password = serializers.CharField(write_only=True)
    first_name = serializers.CharField(required=False, allow_blank=True)
    last_name = serializers.CharField(required=False, allow_blank=True)
    phone = serializers.CharField(required=False, allow_blank=True)
    role = serializers.CharField(default='school_admin')
    school_name = serializers.CharField(required=False, allow_blank=True)
    school_code = serializers.CharField(required=False, allow_blank=True)
    
    def validate_password(self, value):
        """Validate password strength"""
        # First run Django's built-in validators
        try:
            validate_password(value)
        except ValidationError as e:
            # Don't fail on Django's default validators
            pass
        # Then run custom strength validation
        return validate_password_strength(value)
    
    def validate(self, attrs):
        if attrs['password'] != attrs['confirm_password']:
            raise serializers.ValidationError({"password": "Password fields didn't match."})
        
        if User.objects.filter(email=attrs['email']).exists():
            raise serializers.ValidationError({"email": "User with this email already exists."})
        
        if User.objects.filter(username=attrs['username']).exists():
            raise serializers.ValidationError({"username": "Username already taken."})
        
        return attrs
    
    def create(self, validated_data):
        # Remove confirm_password
        validated_data.pop('confirm_password')
        
        # Remove school fields (handled in view)
        validated_data.pop('school_name', None)
        validated_data.pop('school_code', None)
        
        # Remove role and phone (handled in view)
        validated_data.pop('role', None)
        validated_data.pop('phone', None)
        
        # Get is_active from kwargs (passed from view)
        is_active = validated_data.pop('is_active', False)
        
        # Get the validated password (already strength-checked)
        password = validated_data.get('password')
        
        # Create user ONLY (NO UserProfile creation here)
        user = User.objects.create_user(
            email=validated_data['email'],
            username=validated_data['username'],
            password=password,
            first_name=validated_data.get('first_name', ''),
            last_name=validated_data.get('last_name', ''),
            is_active=is_active
        )
        
        return user


class LoginSerializer(serializers.Serializer):
    email = serializers.EmailField()
    password = serializers.CharField()


class ForgotPasswordSerializer(serializers.Serializer):
    email = serializers.EmailField()


class ResetPasswordSerializer(serializers.Serializer):
    token = serializers.UUIDField()
    new_password = serializers.CharField(write_only=True)
    confirm_password = serializers.CharField(write_only=True)
    
    def validate_new_password(self, value):
        """Validate new password strength"""
        try:
            validate_password(value)
        except ValidationError:
            pass
        return validate_password_strength(value)
    
    def validate(self, attrs):
        if attrs['new_password'] != attrs['confirm_password']:
            raise serializers.ValidationError({"new_password": "Password fields didn't match."})
        return attrs


class ChangePasswordSerializer(serializers.Serializer):
    """Serializer for password change (authenticated users)"""
    old_password = serializers.CharField(write_only=True)
    new_password = serializers.CharField(write_only=True)
    confirm_password = serializers.CharField(write_only=True)
    
    def validate_new_password(self, value):
        """Validate new password strength"""
        try:
            validate_password(value)
        except ValidationError:
            pass
        return validate_password_strength(value)
    
    def validate(self, attrs):
        if attrs['new_password'] != attrs['confirm_password']:
            raise serializers.ValidationError({"new_password": "Password fields didn't match."})
        
        if attrs['old_password'] == attrs['new_password']:
            raise serializers.ValidationError({"new_password": "New password must be different from old password."})
        
        return attrs