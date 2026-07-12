# backend/authentication/permissions.py
from rest_framework import permissions
from common.utils import get_effective_role


class HasRole(permissions.BasePermission):
    """
    ✅ Base class for the new, unified role checks. school_admin and
    super_admin are ALWAYS allowed — no need to list them in every
    subclass's allowed_roles. Subclasses just declare which extra
    granular StaffMember roles get the same access.
    """
    allowed_roles = []

    def has_permission(self, request, view):
        role = get_effective_role(request.user)
        if role is None:
            return False
        if role in ('super_admin', 'school_admin'):
            return True
        return role in self.allowed_roles


class CanManageStaff(HasRole):
    """Only school_admin/super_admin — nobody else adds/edits/removes staff or grants logins."""
    allowed_roles = []


class CanManageStudents(HasRole):
    """school_admin + registrar can create/edit/delete student records."""
    allowed_roles = ['registrar']


class CanManagePayments(HasRole):
    """school_admin + accountant can create/edit/delete/verify payments."""
    allowed_roles = ['accountant']


class CanSendReminders(HasRole):
    """school_admin + reminder_manager can send SMS / manage reminders."""
    allowed_roles = ['reminder_manager']


class CanViewReports(HasRole):
    """school_admin + reporting_manager can access the reports module."""
    allowed_roles = ['reporting_manager']


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