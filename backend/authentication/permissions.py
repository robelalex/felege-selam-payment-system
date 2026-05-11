# backend/authentication/permissions.py
from rest_framework import permissions

class IsSuperAdmin(permissions.BasePermission):
    """Super Admin only"""
    def has_permission(self, request, view):
        return request.user.is_authenticated and hasattr(request.user, 'profile') and request.user.profile.role == 'super_admin'

class IsSchoolAdmin(permissions.BasePermission):
    def has_permission(self, request, view):
        return request.user.is_authenticated and hasattr(request.user, 'profile') and request.user.profile.role == 'school_admin'

class IsRegistrar(permissions.BasePermission):
    """Registrar only"""
    def has_permission(self, request, view):
        return request.user.is_authenticated and hasattr(request.user, 'profile') and request.user.profile.role == 'registrar'

class IsPaymentManager(permissions.BasePermission):
    """Payment Manager only"""
    def has_permission(self, request, view):
        return request.user.is_authenticated and hasattr(request.user, 'profile') and request.user.profile.role == 'payment_manager'

class IsReportingManager(permissions.BasePermission):
    """Reporting Manager only"""
    def has_permission(self, request, view):
        return request.user.is_authenticated and hasattr(request.user, 'profile') and request.user.profile.role == 'reporting_manager'

class IsReminderManager(permissions.BasePermission):
    """Reminder Manager only"""
    def has_permission(self, request, view):
        return request.user.is_authenticated and hasattr(request.user, 'profile') and request.user.profile.role == 'reminder_manager'

class IsSchoolAdminOrStaff(permissions.BasePermission):
    """School Admin or any staff member"""
    def has_permission(self, request, view):
        if not request.user.is_authenticated:
            return False
        if not hasattr(request.user, 'profile'):
            return False
        role = request.user.profile.role
        return role in ['school_admin', 'registrar', 'payment_manager', 'reporting_manager', 'reminder_manager']

class IsSchoolAdminOrRegistrar(permissions.BasePermission):
    """School Admin or Registrar"""
    def has_permission(self, request, view):
        if not request.user.is_authenticated:
            return False
        if not hasattr(request.user, 'profile'):
            return False
        role = request.user.profile.role
        return role in ['school_admin', 'registrar']

class IsSchoolAdminOrPaymentManager(permissions.BasePermission):
    """School Admin or Payment Manager"""
    def has_permission(self, request, view):
        if not request.user.is_authenticated:
            return False
        if not hasattr(request.user, 'profile'):
            return False
        role = request.user.profile.role
        return role in ['school_admin', 'payment_manager']