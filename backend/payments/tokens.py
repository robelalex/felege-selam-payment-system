# backend/payments/tokens.py
"""
Signed, time-limited, single-use payment link tokens for anti-spoofing.
Signature + 6hr expiry: enforced cryptographically by itsdangerous.
Single-use: enforced by DB lookup of jti + consumed_at.
Device binding: detects forwarded/leaked links via UA + IP-prefix fingerprint.
"""
import hashlib
import secrets
from datetime import timedelta

from django.conf import settings
from django.utils import timezone
from itsdangerous import BadSignature, SignatureExpired, URLSafeTimedSerializer

# ✅ CHANGED: 6 hours for better parent convenience while maintaining security
TOKEN_MAX_AGE_SECONDS = 6 * 60 * 60 


def _serializer() -> URLSafeTimedSerializer:
    return URLSafeTimedSerializer(settings.SECRET_KEY, salt="payment-link-v1")


def generate_payment_token(payment, parent_phone: str):
    """
    Creates a PaymentLinkToken row and returns (signed_token, record).
    Note: verification_code is now generated dynamically in the View, not here.

    Args:
        payment: A payments.Payment instance
        parent_phone: Parent's phone in E.164 format (e.g., 251911234567)

    Returns:
        tuple: (signed_token_string, PaymentLinkToken_instance)
    """
    from .models import PaymentLinkToken  # local import avoids app-loading cycles

    jti = secrets.token_urlsafe(16)
    
    # ✅ REMOVED: verification_code generation (moved to View for dynamic OTP)

    record = PaymentLinkToken.objects.create(
        payment=payment,  # ✅ Links to your existing Payment model
        parent_phone=parent_phone,
        jti=jti,
        verification_code="",  # Will be filled dynamically when link is clicked
        expires_at=timezone.now() + timedelta(seconds=TOKEN_MAX_AGE_SECONDS),
    )

    # Token payload uses 'pay' key to match our Payment FK
    token = _serializer().dumps({"jti": jti, "pay": str(payment.id)})
    return token, record


def verify_payment_token(token: str):
    """
    Validates signature, expiry, consumption status, and returns the DB record.

    Returns:
        tuple: (PaymentLinkToken_record_or_None, error_code_or_None)
        error_code is one of: None (success), 'expired', 'invalid', 'already_used'
    """
    from .models import PaymentLinkToken

    try:
        payload = _serializer().loads(token, max_age=TOKEN_MAX_AGE_SECONDS)
    except SignatureExpired:
        return None, "expired"
    except BadSignature:
        return None, "invalid"

    try:
        # ✅ select_related("payment") pre-fetches Payment in one query
        record = PaymentLinkToken.objects.select_related("payment").get(
            jti=payload["jti"]
        )
    except PaymentLinkToken.DoesNotExist:
        return None, "invalid"

    if record.is_expired():
        return None, "expired"
    if record.is_consumed():
        return None, "already_used"

    return record, None


def fingerprint(request) -> str:
    """
    Coarse, privacy-light device signal — enough to detect 'different
    device than the one that first opened this link', not a full tracker.
    """
    ua = request.META.get("HTTP_USER_AGENT", "")
    accept_lang = request.META.get("HTTP_ACCEPT_LANGUAGE", "")
    raw = f"{ua}|{accept_lang}"
    return hashlib.sha256(raw.encode()).hexdigest()[:32]


def client_ip(request) -> str:
    xff = request.META.get("HTTP_X_FORWARDED_FOR")
    return xff.split(",")[0].strip() if xff else request.META.get("REMOTE_ADDR", "")


def ip_prefix(ip: str) -> str:
    parts = ip.split(".")
    if len(parts) == 4:
        return ".".join(parts[:3])  # /24 for IPv4
    return ip[:20]  # rough /64-ish prefix for IPv6


def mask_phone(phone: str) -> str:
    """Returns e.g., '251911••••67' — never exposes full number."""
    if len(phone) < 8:
        return phone
    return phone[:6] + "••••" + phone[-2:]