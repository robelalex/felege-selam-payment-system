# schools/utils.py
from django.core.exceptions import ObjectDoesNotExist
from django.contrib.auth.models import User

def get_school_for_user(request):
    """
    Resolves the school for a request, supporting both profile models.
    Returns a School instance or raises ObjectDoesNotExist.

    ✅ SECURITY FIX: this used to fall back to trusting a client-supplied
    X-School-ID header for any user without a SchoolAdminProfile or
    UserProfile.school_id. That header is set by the caller, not verified
    against anything — any authenticated account without a proper school
    link (e.g. a super-admin login, or a staff account mid-onboarding)
    could send X-School-ID for a DIFFERENT school and be treated as that
    school's admin. This function feeds SchoolChapaConfigView, SMS/email
    credential views, and bank-detail views — trusting the header there
    meant an attacker could overwrite another school's Chapa API key and
    redirect that school's payments to their own account.
    is_authenticated users with no real school link now correctly get
    "no school association" instead of being able to pick one.
    """
    user = request.user

    # 1. Try SchoolAdminProfile first (legacy / preferred)
    try:
        return user.school_profile.school
    except ObjectDoesNotExist:
        pass

    # 2. Fall back to UserProfile
    # ✅ FIX: the actual related_name on UserProfile.user is 'profile', not
    # 'userprofile' — the old attribute name raised AttributeError (not
    # ObjectDoesNotExist) for any user without a SchoolAdminProfile,
    # meaning this fallback never actually worked, it just crashed instead.
    try:
        school_id = user.profile.school_id
        if school_id:
            from schools.models import School
            return School.objects.get(pk=school_id)
    except (ObjectDoesNotExist, AttributeError):
        pass

    raise ObjectDoesNotExist(
        f"No school association found for user {user.id}. "
        f"Checked: school_profile, userprofile. This endpoint is for a "
        f"school's own admin account — a super-admin account isn't "
        f"expected to have one school's settings to view."
    )