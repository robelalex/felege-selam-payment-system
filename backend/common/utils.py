# backend/common/utils.py
from schools.models import SchoolAdminProfile
from .models import AuditLog

def get_user_school(user):
    """Get the school associated with a user (returns None for super admins)"""
    try:
        profile = SchoolAdminProfile.objects.filter(user=user, is_active=True).first()
        if profile:
            return profile.school
    except:
        pass
    return None

def is_super_admin(user):
    """Check if user is super admin"""
    return user.is_superuser or user.is_staff

def get_school_id_from_request(request):
    """Get school ID from request header or user profile"""
    # First check header (sent from frontend)
    school_id = request.headers.get('X-School-ID')
    if school_id:
        try:
            return int(school_id)
        except ValueError:
            pass
    
    # If no header, get from user's profile (for school admins)
    if request.user.is_authenticated and not is_super_admin(request.user):
        school = get_user_school(request.user)
        if school:
            return school.id
    
    return None


def get_verified_school_id(request):
    """
    ✅ Safer alternative to get_school_id_from_request() above.

    The older function trusts the X-School-ID header FIRST, even for
    non-super-admins — meaning a school_admin could send a different
    school's ID and read/write that school's data. Use this function for
    any NEW view (staff, attendance, exams, payroll, library, hostel, etc).

    - Non-super-admins: ALWAYS resolved from their own profile
      (SchoolAdminProfile or UserProfile.school_id). The header is ignored
      entirely for them — they cannot override which school they're scoped to.
    - Super admins: may use the X-School-ID header to switch which school's
      data they're viewing/managing, since they're allowed to see all schools
      anyway.
    """
    user = request.user
    if not user.is_authenticated:
        return None

    if is_super_admin(user):
        school_id = request.headers.get('X-School-ID')
        if school_id:
            try:
                return int(school_id)
            except ValueError:
                return None
        return None

    school = get_user_school(user)
    if school:
        return school.id

    profile = getattr(user, 'profile', None)
    if profile and getattr(profile, 'school_id', None):
        return profile.school_id

    return None

def get_effective_role(user):
    """
    ✅ Single source of truth for "what can this person do" — unifies the
    two role systems that previously disagreed:
      - authentication.UserProfile.role: only ever 'super_admin',
        'school_admin', 'staff', or 'parent'. Every staff login created via
        StaffMemberViewSet.create_login gets 'staff' here, which is useless
        for telling a registrar apart from an accountant.
      - staff.StaffMember.role: the real, granular role
        (teacher/registrar/accountant/librarian/reporting_manager/
        reminder_manager/other/school_admin) chosen when the staff member
        was added.
    Resolution order: super_admin > school_admin > StaffMember.role >
    UserProfile.role > None.
    """
    if not user or not user.is_authenticated:
        return None
    if is_super_admin(user):
        return 'super_admin'

    profile = getattr(user, 'profile', None)
    if profile and profile.role == 'school_admin':
        return 'school_admin'

    staff_profile = getattr(user, 'staff_profile', None)
    if staff_profile is not None:
        return staff_profile.role

    if profile:
        return profile.role

    return None


def log_action(user, action, details='', request=None):
    """Helper function to log user actions"""
    ip_address = None
    user_agent = None
    
    if request:
        ip_address = get_client_ip(request)
        user_agent = request.META.get('HTTP_USER_AGENT', '')[:500]
    
    AuditLog.objects.create(
        user=user,
        action=action,
        details=details,
        ip_address=ip_address,
        user_agent=user_agent
    )

def get_client_ip(request):
    """Get client IP address from request"""
    x_forwarded_for = request.META.get('HTTP_X_FORWARDED_FOR')
    if x_forwarded_for:
        ip = x_forwarded_for.split(',')[0]
    else:
        ip = request.META.get('REMOTE_ADDR')
    return ip