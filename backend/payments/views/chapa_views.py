# backend/payments/views/chapa_views.py
import json
import uuid
import hmac
import hashlib
import logging
from django.http import JsonResponse
from django.views.decorators.csrf import csrf_exempt
from django.utils import timezone
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import AllowAny
from ..services.chapa_service import ChapaService
from ..models import Payment, PaymentDeadline
from students.models import Student
from django.conf import settings

logger = logging.getLogger(__name__)

ENGLISH_MONTHS = {
    'መስከረም': 'Meskerem', 'ጥቅምት': 'Tikimt', 'ህዳር': 'Hidar',
    'ታህሳስ': 'Tahsas', 'ጥር': 'Tir', 'የካቲት': 'Yekatit',
    'መጋቢት': 'Megabit', 'ሚያዝያ': 'Miazia', 'ግንቦት': 'Ginbot',
    'ሰኔ': 'Sene', 'ሐምሌ': 'Hamle', 'ነሐሴ': 'Nehase', 'ጳጉሜ': 'Pagume'
}


def _generate_tx_ref(student_id, deadline_id):
    return f"FSPAY-{student_id}-{deadline_id}-{uuid.uuid4().hex[:8]}"


@api_view(['POST'])
@permission_classes([AllowAny])
def initiate_chapa_payment(request):
    """Initiate a Chapa payment - used by Flutter app"""
    try:
        data = request.data
        student_id  = data.get('student_id')
        deadline_id = data.get('deadline_id')
        amount      = data.get('amount')
        email       = data.get('email', '')
        first_name  = data.get('first_name', 'Parent')
        last_name   = data.get('last_name', 'User')

        if not all([student_id, deadline_id, amount]):
            return JsonResponse(
                {'success': False, 'error': 'student_id, deadline_id and amount are required'},
                status=400
            )

        try:
            student = Student.objects.get(student_id=student_id)
        except Student.DoesNotExist:
            return JsonResponse(
                {'success': False, 'error': f'Student {student_id} not found'},
                status=404
            )

        try:
            deadline = PaymentDeadline.objects.get(id=deadline_id)
        except PaymentDeadline.DoesNotExist:
            return JsonResponse(
                {'success': False, 'error': f'Deadline {deadline_id} not found'},
                status=404
            )

        # Block if already verified
        if Payment.objects.filter(
            student=student, deadline=deadline, status='verified'
        ).exists():
            return JsonResponse(
                {'success': False,
                 'error': f'Payment for {deadline.get_month_display()} already verified'},
                status=400
            )

        # Reuse existing pending payment or create new one
        payment = Payment.objects.filter(
            student=student, deadline=deadline, status='pending',
            payment_method='chapa'
        ).first()

        if not payment:
            tx_ref = _generate_tx_ref(student.student_id, deadline.id)
            payment = Payment.objects.create(
                student=student,
                deadline=deadline,
                amount=amount,
                payment_method='chapa',
                status='pending',
                paid_by=f"{first_name} {last_name}",
                paid_by_phone=student.parent_phone or '',
                transaction_reference=tx_ref,
            )
        else:
            tx_ref = payment.transaction_reference

        month_amharic = deadline.get_month_display()
        month_english = ENGLISH_MONTHS.get(month_amharic, 'Monthly Fee')

        service = ChapaService()
        result = service.initialize_payment(
            amount=float(amount),
            currency='ETB',
            email=email or student.parent_email or f"{student.student_id}@parent.com",
            first_name=first_name,
            last_name=last_name,
            tx_ref=tx_ref,
            callback_url='https://felege-selam-payment-system.onrender.com/api/chapa/webhook/',
            return_url=f'https://felege-selam-payment-system.vercel.app/payment/success?tx_ref={tx_ref}',
            title=f"{month_english} Fee",
            description=f"{month_english} {deadline.academic_year}",
        )

        if result.get('success'):
            logger.info(f"✅ Chapa payment initiated for {student.student_id}, tx_ref={tx_ref}")
            return JsonResponse({
                'success': True,
                'checkout_url': result.get('checkout_url'),
                'tx_ref': tx_ref,
                'payment_id': payment.id,
            })
        else:
            payment.delete()
            return JsonResponse(
                {'success': False, 'error': result.get('error', 'Chapa error')},
                status=500
            )

    except Exception as e:
        logger.exception("initiate_chapa_payment error")
        return JsonResponse({'success': False, 'error': str(e)}, status=500)


# Keep test_payment as alias — same logic
@api_view(['POST'])
@permission_classes([AllowAny])
def test_payment(request):
    return initiate_chapa_payment(request)


@csrf_exempt
def chapa_webhook(request):
    """
    Chapa webhook handler.
    - Verifies Chapa-Signature header
    - Handles duplicate webhooks (idempotency)
    - Generates invoice number
    - Sends SMS confirmation
    """
    if request.method != 'POST':
        return JsonResponse({'error': 'Method not allowed'}, status=405)

    try:
        raw_body = request.body
        data = json.loads(raw_body)
        logger.info(f"📥 Chapa webhook received: {data}")

        # ── Signature verification ──────────────────────────────────────────
        chapa_secret = getattr(settings, 'CHAPA_SECRET_KEY', '')
        signature    = request.headers.get('Chapa-Signature', '')

        if chapa_secret and signature:
            expected = hmac.new(
                chapa_secret.encode('utf-8'),
                raw_body,
                hashlib.sha256
            ).hexdigest()
            if not hmac.compare_digest(expected, signature):
                logger.warning("❌ Webhook signature mismatch")
                return JsonResponse({'error': 'Invalid signature'}, status=401)

        tx_ref = data.get('tx_ref') or data.get('trx_ref')
        status = data.get('status')

        if not tx_ref:
            return JsonResponse({'error': 'Missing tx_ref'}, status=400)

        # ── Find payment ────────────────────────────────────────────────────
        payment = Payment.objects.filter(transaction_reference=tx_ref).first()
        if not payment:
            logger.warning(f"⚠️ Webhook: payment not found for tx_ref={tx_ref}")
            return JsonResponse({'status': 'not_found'}, status=404)

        # ── Idempotency: skip if already processed ──────────────────────────
        if payment.webhook_received:
            logger.info(f"⚠️ Duplicate webhook for tx_ref={tx_ref}, skipping")
            return JsonResponse({'status': 'already_processed'})

        # ── Update payment ──────────────────────────────────────────────────
        payment.webhook_received    = True
        payment.webhook_received_at = timezone.now()
        payment.chapa_reference     = data.get('ref_id', '')

        if status == 'success':
            payment.status      = 'verified'
            payment.verified_at = timezone.now()

            # Generate invoice number
            if not payment.invoice_number:
                payment.invoice_number = payment.generate_invoice_number()

            payment.save()
            logger.info(f"✅ Payment verified: {tx_ref}, invoice: {payment.invoice_number}")

            # ── Send SMS confirmation ───────────────────────────────────────
            _send_payment_confirmation(payment)

        elif status in ('failed', 'cancelled'):
            payment.status = 'failed'
            payment.save()
            logger.info(f"❌ Payment failed/cancelled: {tx_ref}")

        else:
            payment.save()

        return JsonResponse({'status': 'success'})

    except json.JSONDecodeError:
        return JsonResponse({'error': 'Invalid JSON'}, status=400)
    except Exception as e:
        logger.exception("Webhook error")
        return JsonResponse({'error': str(e)}, status=500)


def _send_payment_confirmation(payment):
    """Send SMS to parent after successful payment."""
    try:
        from common.sms_service import send_sms
        phone = payment.student.parent_phone
        if phone:
            month = payment.deadline.get_month_display()
            message = (
                f"Dear {payment.paid_by}, your payment of {payment.amount} Birr "
                f"for {payment.student.full_name} ({month}) has been confirmed. "
                f"Invoice: {payment.invoice_number}. Thank you!"
            )
            send_sms(phone, message)
            logger.info(f"✅ SMS confirmation sent to {phone}")
    except Exception as e:
        logger.warning(f"⚠️ SMS confirmation failed: {e}")


@api_view(['GET'])
@permission_classes([AllowAny])
def verify_chapa_payment(request):
    """Verify payment — called by frontend after Chapa redirects back."""
    tx_ref = request.GET.get('tx_ref')
    if not tx_ref:
        return JsonResponse({'error': 'Missing tx_ref'}, status=400)

    try:
        payment = Payment.objects.filter(transaction_reference=tx_ref).first()

        if payment and payment.status == 'verified':
            return JsonResponse({
                'success': True,
                'status': 'success',
                'verified': True,
                'payment_id': payment.id,
                'invoice_number': payment.invoice_number,
                'amount': str(payment.amount),
                'student_name': payment.student.full_name,
                'month': payment.deadline.get_month_display(),
            })

        # Poll Chapa API to confirm
        service = ChapaService()
        result  = service.verify_payment(tx_ref)

        if result.get('success'):
            chapa_status = (
                result.get('data', {})
                      .get('data', {})
                      .get('status', '')
            )
            if chapa_status == 'success' and payment and payment.status != 'verified':
                payment.status      = 'verified'
                payment.verified_at = timezone.now()
                if not payment.invoice_number:
                    payment.invoice_number = payment.generate_invoice_number()
                payment.save()
                _send_payment_confirmation(payment)

            return JsonResponse({
                'success': True,
                'status': chapa_status,
                'verified': chapa_status == 'success',
                'invoice_number': payment.invoice_number if payment else None,
            })

        # Chapa API unreachable — return local status
        if payment:
            return JsonResponse({
                'success': True,
                'status': payment.status,
                'verified': payment.status == 'verified',
                'from_local': True,
            })

        return JsonResponse({'success': False, 'error': 'Payment not found'}, status=404)

    except Exception as e:
        logger.exception("verify_chapa_payment error")
        return JsonResponse({'success': False, 'error': str(e)}, status=500)


@api_view(['GET'])
@permission_classes([AllowAny])
def payment_status(request, tx_ref):
    """Quick status check by tx_ref."""
    try:
        payment = Payment.objects.filter(transaction_reference=tx_ref).first()
        if payment:
            return JsonResponse({
                'success': True,
                'status': payment.status,
                'verified': payment.status == 'verified',
                'amount': str(payment.amount),
                'invoice_number': payment.invoice_number,
                'student_name': payment.student.full_name,
                'month': payment.deadline.get_month_display(),
            })
        return JsonResponse({'success': False, 'error': 'Payment not found'}, status=404)
    except Exception as e:
        return JsonResponse({'success': False, 'error': str(e)}, status=500)


@api_view(['GET'])
@permission_classes([AllowAny])
def get_chapa_banks(request):
    """Get list of supported banks from Chapa."""
    try:
        service = ChapaService()
        result  = service.get_banks()
        if result.get('success'):
            return JsonResponse({'success': True, 'banks': result.get('data')})
    except Exception:
        pass

    return JsonResponse({
        'success': True,
        'banks': [
            {'id': '1', 'name': 'Commercial Bank of Ethiopia'},
            {'id': '2', 'name': 'Dashen Bank'},
            {'id': '3', 'name': 'Awash Bank'},
        ],
        'mock': True
    })