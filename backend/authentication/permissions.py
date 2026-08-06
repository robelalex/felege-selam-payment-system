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


class CanManageAcademics(HasRole):
    """school_admin + registrar can register subjects and assign teachers
    to classes/subjects/homerooms. Teachers themselves use separate
    teacher-facing endpoints (marks/attendance entry), not this one."""
    allowed_roles = ['registrar']


class IsTeacherOrAdmin(HasRole):
    """Teachers can enter marks/attendance for their own assigned classes;
    school_admin/super_admin get full oversight automatically via HasRole.
    View-level code still scopes teachers to only their own assignments —
    this permission class only gates "can you reach this endpoint at all"."""
    allowed_roles = ['teacher']


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

class IsParentOfStudentOrCanManage(permissions.BasePermission):
    """
    ✅ NEW — powers the parent self-service registration flow (photo +
    document upload from the Parent Portal). A parent may only ever
    touch their OWN child's record, matched by their logged-in email
    against Student.parent_email — never another family's data. Staff
    who can already manage students (CanManageStudents: school_admin/
    registrar, scoped to their own school) keep full access too, so a
    registrar can still do this in person if a parent can't.

    This is a brand-new, narrowly-scoped permission used only by the new
    parent-facing actions on StudentViewSet — it does not touch or
    loosen any existing permission anywhere else in the system.
    """
    def has_permission(self, request, view):
        return bool(request.user and request.user.is_authenticated)

    def has_object_permission(self, request, view, obj):
        from common.utils import get_verified_school_id, is_super_admin

        if CanManageStudents().has_permission(request, view):
            school_id = get_verified_school_id(request)
            if is_super_admin(request.user) or (school_id and obj.school_id == school_id):
                return True

        profile = getattr(request.user, 'profile', None)
        if profile and profile.role == 'parent' and obj.parent_email:
            return obj.parent_email.strip().lower() == request.user.email.strip().lower()

        return False


class IsSameSchoolOrOwnParent(permissions.BasePermission):
    """
    ✅ NEW — read-only guard for per-student detail endpoints (payment
    history, pending payments, pending bank slips) that are legitimately
    viewed by several different staff roles across the admin dashboard
    (e.g. the Class Details view on the main dashboard), not just
    registrars. Deliberately does NOT require CanManageStudents — any
    authenticated staff member scoped to the SAME school as the student
    keeps read access, exactly as before. A parent may only view their
    OWN child, matched by their logged-in email against
    Student.parent_email — never another family's.
    """
    def has_permission(self, request, view):
        return bool(request.user and request.user.is_authenticated)

    def has_object_permission(self, request, view, obj):
        from common.utils import get_verified_school_id, is_super_admin

        profile = getattr(request.user, 'profile', None)
        if profile and profile.role == 'parent':
            return bool(obj.parent_email) and (
                obj.parent_email.strip().lower() == request.user.email.strip().lower()
            )

        if is_super_admin(request.user):
            return True
        school_id = get_verified_school_id(request)
        return bool(school_id) and obj.school_id == school_id
