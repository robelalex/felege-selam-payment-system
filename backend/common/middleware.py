# backend/common/middleware.py
from .utils import get_user_school, is_super_admin

class SchoolMiddleware:
    """Automatically add school info to request for school admins"""
    
    def __init__(self, get_response):
        self.get_response = get_response
    
    def __call__(self, request):
        # Add school to request object if user is a school admin
        if request.user.is_authenticated and not is_super_admin(request.user):
            request.current_school = get_user_school(request.user)
        else:
            request.current_school = None
        
        response = self.get_response(request)
        return response