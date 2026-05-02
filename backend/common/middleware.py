# backend/common/middleware.py
from .utils import get_user_school, is_super_admin
from .models import AuditLog
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
    
class AuditMiddleware:
    def __init__(self, get_response):
        self.get_response = get_response
    
    def __call__(self, request):
        # Log user activity for important actions
        response = self.get_response(request)
        return response
    
    def process_view(self, request, view_func, view_args, view_kwargs):
        # Log specific actions
        pass