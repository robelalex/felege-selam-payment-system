# schools/utils.py
from django.core.exceptions import ObjectDoesNotExist
from django.contrib.auth.models import User

def get_school_for_user(request):
    """
    Resolves the school for a request, supporting both profile models.
    Returns a School instance or raises ObjectDoesNotExist.
    """
    user = request.user

    # 1. Try SchoolAdminProfile first (legacy / preferred)
    try:
        return user.school_profile.school
    except ObjectDoesNotExist:
        pass

    # 2. Fall back to UserProfile
    try:
        school_id = user.userprofile.school_id
        if school_id:
            from schools.models import School
            return School.objects.get(pk=school_id)
    except ObjectDoesNotExist:
        pass

    # 3. Fall back to X-School-ID header (last resort)
    school_id = request.headers.get('X-School-ID') or request.META.get('HTTP_X_SCHOOL_ID')
    if school_id:
        from schools.models import School
        try:
            return School.objects.get(pk=school_id)
        except School.DoesNotExist:
            pass

    raise ObjectDoesNotExist(
        f"No school association found for user {user.id}. "
        f"Checked: school_profile, userprofile, X-School-ID header."
    )