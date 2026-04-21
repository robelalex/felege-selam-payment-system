# backend/common/utils.py
from schools.models import SchoolAdminProfile

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