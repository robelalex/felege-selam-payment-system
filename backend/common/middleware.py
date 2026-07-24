# backend/common/middleware.py
from django.http import JsonResponse
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

        # ✅ SECURITY FIX: subscription_status/subscription_active existed on
        # the School model but nothing ever checked them on incoming
        # requests. That meant rejecting or suspending a school did nothing
        # to actually stop its admin from using the API as long as their
        # session or token was still valid. This blocks that school's
        # requests at the door, regardless of how the user authenticated.
        if request.current_school and request.current_school.subscription_status in ('rejected', 'suspended'):
            return JsonResponse(
                {'error': 'This school\'s access has been suspended. Contact the platform administrator.'},
                status=403
            )

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