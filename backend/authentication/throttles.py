# backend/authentication/throttles.py
from rest_framework.throttling import SimpleRateThrottle

class LoginRateThrottle(SimpleRateThrottle):
    scope = 'login'
    
    def get_cache_key(self, request, view):
        # Use email or username as throttle key
        email = request.data.get('email')
        if not email:
            return None
        return f"login_{email}"