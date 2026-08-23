# backend/authentication/throttles.py
from rest_framework.throttling import SimpleRateThrottle

class LoginRateThrottle(SimpleRateThrottle):
    """
    ✅ SECURITY FIX: this was imported everywhere but never actually
    attached to a view with @throttle_classes, so it did nothing — only
    the generic per-IP AnonRateThrottle (200/min) applied to login and
    OTP-verify endpoints.

    ✅ SECURITY FIX (this class): the old get_cache_key only looked at
    request.data['email'], so it silently did NOT throttle at all on
    the *_step2 (OTP verify) endpoints, which send user_id + otp_code,
    not email — exactly the endpoint where brute-force limiting matters
    most. Now keys on, in order of preference: email, user_id, or
    (as a last resort) the request IP, so every login/OTP/reset
    endpoint this is attached to is always throttled by something.
    """
    scope = 'login'

    def get_cache_key(self, request, view):
        identifier = (
            request.data.get('email')
            or request.data.get('user_id')
            or self.get_ident(request)
        )
        return f"login_{identifier}"