# backend/payments/views/anti_spoofing_views.py
import json
import secrets
from django.core.cache import cache
from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework.permissions import AllowAny
from rest_framework import status
from django.utils import timezone
from ..tokens import client_ip, fingerprint, ip_prefix, mask_phone, verify_payment_token
from ..services.sms_otp_service import send_payment_otp
from ..services.school_chapa_service import SchoolChapaService

RATE_LIMIT_WINDOW_SECONDS = 15 * 60
RATE_LIMIT_MAX_ATTEMPTS = 8
OTP_CODE_TTL_SECONDS = 10 * 60
OTP_RESEND_COOLDOWN_SECONDS = 60
MAX_OTP_FAILURES = 5


def _build_page_payload(record, request=None):
    """Builds the response payload for the React landing page after OTP success."""
    payment = record.payment
    student = payment.student
    school = student.school

    def safe_media_url(field):
        """Safely extract URL from ImageField or return None."""
        if not field:
            return None
        try:
            url = field.url  # Get the actual URL string
            if request:
                return request.build_absolute_uri(url)  # Make absolute
            return url
        except (ValueError, AttributeError):
            return None

    return {
        "status": "ok",
        "transaction_id": str(record.id)[:8].upper(),
        "student_name": student.full_name,
        "student_photo_url": safe_media_url(getattr(student, 'photo', None)),
        "school_name": school.name,
        "school_seal_url": safe_media_url(getattr(school, 'logo', None)),
        "amount": str(payment.amount),
        "currency": "ETB",
        "expires_at": record.expires_at.isoformat(),
    }


class PaymentLandingView(APIView):
    """
    GET /api/pay/<token>/
    ALWAYS triggers mandatory OTP gate first. 
    Generates dynamic OTP and sends via SMS.
    """
    permission_classes = [AllowAny]

    def get(self, request, token):
        ip = client_ip(request)
        rl_key = f"pl_rl_{ip}"
        attempts = cache.get(rl_key, 0)
        if attempts >= RATE_LIMIT_MAX_ATTEMPTS:
            return Response({"status": "rate_limited"}, status=status.HTTP_429_TOO_MANY_REQUESTS)
        cache.set(rl_key, attempts + 1, RATE_LIMIT_WINDOW_SECONDS)

        record, error = verify_payment_token(token)
        if error:
            return Response({"status": error}, status=status.HTTP_400_BAD_REQUEST)

        # ✅ MANDATORY OTP: Always trigger OTP gate
        if not record.otp_verified_at:
            if not cache.get(f"otp_sent_{record.id}"):
                code = f"{secrets.randbelow(1_000_000):06d}"
                cache.set(f"otp_code_{record.id}", code, OTP_CODE_TTL_SECONDS)
                cache.set(f"otp_sent_{record.id}", True, OTP_RESEND_COOLDOWN_SECONDS)
                
                # Send dynamic OTP via our dedicated service
                send_payment_otp(record.payment.student.school_id, record.parent_phone, code)
            
            return Response({
                "status": "otp_required",
                "masked_phone": mask_phone(record.parent_phone)
            })

        # If OTP already verified, show payment details
        return Response(_build_page_payload(record, request))


class OtpVerifyView(APIView):
    """POST /api/pay/<token>/verify-otp/"""
    permission_classes = [AllowAny]

    def post(self, request, token):
        record, error = verify_payment_token(token)
        if error:
            return Response({"status": error}, status=status.HTTP_400_BAD_REQUEST)

        if record.failed_attempts >= MAX_OTP_FAILURES:
            return Response({"status": "locked"}, status=status.HTTP_423_LOCKED)

        submitted = str(request.data.get("code", "")).strip()
        expected = cache.get(f"otp_code_{record.id}")

        if not expected or not secrets.compare_digest(submitted, expected):
            record.failed_attempts += 1
            record.save(update_fields=["failed_attempts"])
            return Response({"status": "otp_invalid"}, status=status.HTTP_400_BAD_REQUEST)

        record.otp_verified_at = timezone.now()
        record.save(update_fields=["otp_verified_at"])
        cache.delete(f"otp_code_{record.id}")
        
        # Return payment details after successful OTP
        return Response(_build_page_payload(record, request))


class PaymentInitiateView(APIView):
    """
    POST /api/pay/<token>/initiate/
    Only reachable after mandatory OTP verification.
    Marks token consumed BEFORE handing off to Chapa.
    """
    permission_classes = [AllowAny]

    def post(self, request, token):
        record, error = verify_payment_token(token)
        if error:
            return Response({"status": error}, status=status.HTTP_400_BAD_REQUEST)

        # ✅ MANDATORY CHECK: Must have verified OTP
        if not record.otp_verified_at:
            return Response({"status": "otp_required"}, status=status.HTTP_403_FORBIDDEN)

        # Mark consumed BEFORE calling PSP to close double-submit race window
        record.consumed_at = timezone.now()
        record.save(update_fields=["consumed_at"])

        # Generate checkout URL using existing SchoolChapaService
        try:
            chapa_service = SchoolChapaService(record.payment.student.school_id)
            result = chapa_service.initialize_payment(
                amount=float(record.payment.amount),
                email=record.payment.student.parent_email or f"{record.payment.student.student_id}@parent.com",
                first_name="Parent",
                last_name="User",
                tx_ref=f"PL-{record.id.hex[:8]}",
                callback_url="https://felege-selam-payment-system.onrender.com/api/chapa/webhook/",
                return_url=f"https://felege-selam-payment-system.vercel.app/payment/success?tx_ref=PL-{record.id.hex[:8]}",
            )

            if result.get("success"):
                return Response({
                    "status": "ok",
                    "checkout_url": result["checkout_url"]
                })
            else:
                return Response({
                    "status": "payment_init_failed",
                    "error": result.get("error", "Unknown payment error")
                }, status=status.HTTP_500_INTERNAL_SERVER_ERROR)

        except Exception as e:
            return Response({
                "status": "payment_init_error",
                "error": str(e)
            }, status=status.HTTP_500_INTERNAL_SERVER_ERROR)