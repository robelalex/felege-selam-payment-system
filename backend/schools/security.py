# backend/schools/security.py
"""
Shared security helpers for school-settings/credential views.

✅ SECURITY FIX (2026-08-26 audit): Chapa/SMS/Email/Verify.ET credential
views, and the bank-account write actions, previously only checked
IsAuthenticated — ANY staff member of a school (a teacher, a registrar,
a reminder_manager) could view or overwrite the school's payment-gateway
API key, SMS key, email key, or bank accounts. `require_school_admin`
is the single role gate used by all of those views from now on: only
school_admin / super_admin may pass.

✅ NEW: password re-confirmation ("step-up auth") for the Chapa
credentials page specifically. Being logged in as a school_admin is not
enough to view/edit the real Chapa API key — the admin must re-type
their own account password first. This protects against someone else
using an admin's computer while the admin is logged in but has stepped
away (the single biggest real-world risk for a shared office computer).
The re-auth token is short-lived (5 minutes) and tied to this specific
user, so it can't be replayed by anyone else or reused after a break.
"""
from rest_framework.exceptions import PermissionDenied
from itsdangerous import BadSignature, SignatureExpired, URLSafeTimedSerializer
from django.conf import settings

# Default: 5 minutes. Make this configurable via the environment/Settings
# by setting `REAUTH_MAX_AGE_SECONDS` in Django settings or via
# environment variable (see core/settings.py). Increasing this makes the
# reauth token live longer; setting it very large effectively makes it
# permanent for practical use (not recommended for security reasons).
REAUTH_MAX_AGE_SECONDS = getattr(settings, 'REAUTH_MAX_AGE_SECONDS', 5 * 60)


def require_school_admin(request):
    """
    Raises PermissionDenied unless the caller is a school_admin or
    super_admin. Call this at the top of every school credential/config
    view (Chapa, SMS, Email, Verify.ET, bank accounts) before doing
    anything else — including before returning masked config, since even
    knowing "SMS is configured" is more than a teacher account needs.
    """
    from common.utils import get_effective_role
    role = get_effective_role(request.user)
    if role not in ('school_admin', 'super_admin'):
        raise PermissionDenied(
            "Only a school admin can view or change this setting."
        )


def _reauth_serializer() -> URLSafeTimedSerializer:
    # Separate salt from the payment-link tokens (tokens.py) and any other
    # itsdangerous use — signatures from one purpose must never validate
    # for another, even though they share the same underlying SECRET_KEY.
    return URLSafeTimedSerializer(settings.SECRET_KEY, salt="chapa-credentials-reauth-v1")


def generate_reauth_token(user) -> str:
    """Call this ONLY after independently verifying the user's password
    with check_password() — this function itself does not check anything."""
    return _reauth_serializer().dumps({"uid": user.id})


def verify_reauth_token(token: str, user) -> bool:
    """
    True only if `token` is a valid, unexpired, untampered token that was
    issued for THIS exact user within the last REAUTH_MAX_AGE_SECONDS.
    A token issued for a different user (e.g. stolen from another admin's
    request) is rejected even if otherwise well-formed and fresh.
    """
    if not token:
        return False
    try:
        payload = _reauth_serializer().loads(token, max_age=REAUTH_MAX_AGE_SECONDS)
    except (BadSignature, SignatureExpired):
        return False
    return payload.get("uid") == user.id
