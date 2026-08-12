# backend/payments/views/chapa_views.py
import json
import uuid
import hmac
import hashlib
import logging
from django.http import JsonResponse, HttpResponse
from django.views.decorators.csrf import csrf_exempt
from django.utils import timezone
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import AllowAny, IsAuthenticated
from ..services.chapa_service import ChapaService
from ..services.payment_initiation_service import initiate_payment_checkout
from ..services.receipt_service import finalize_receipt
from ..models import Payment, PaymentDeadline
from students.models import Student
from schools.models import School
from django.conf import settings

logger = logging.getLogger(__name__)

ENGLISH_MONTHS = {
    'መስከረም': 'Meskerem', 'ጥቅምት': 'Tikimt', 'ህዳር': 'Hidar',
    'ታህሳስ': 'Tahsas', 'ጥር': 'Tir', 'የካቲት': 'Yekatit',
    'መጋቢት': 'Megabit', 'ሚያዝያ': 'Miazia', 'ግንቦት': 'Ginbot',
    'ሰኔ': 'Sene', 'ሐምሌ': 'Hamle', 'ነሐሴ': 'Nehase', 'ጳጉሜ': 'Pagume'
}


def find_payment_by_tx_ref(tx_ref):
    """
    ✅ FIX (money-safety): a Payment row's tx_ref changes on retry (see
    previous_tx_refs on the model), so a lookup that only checks the
    CURRENT transaction_reference can miss a payment that Chapa actually
    processed under an older tx_ref — which used to mean that money was
    deducted from a parent with zero record of it anywhere in this system.
    Every webhook/verify/status lookup must go through this function, not
    a raw `Payment.objects.filter(transaction_reference=tx_ref)`.
    """
    if not tx_ref:
        return None
    payment = Payment.objects.filter(transaction_reference=tx_ref).first()
    if payment:
        return payment
    return Payment.objects.filter(previous_tx_refs__contains=[tx_ref]).first()


@api_view(['POST'])
@permission_classes([IsAuthenticated])
def initiate_chapa_payment(request):
    """Initiate a Chapa payment using school's OWN credentials.

    Requires the caller to be authenticated as a parent whose email or phone
    matches the student's parent_email / parent_phone — so a parent can only
    pay for their own child, not for a random student ID they guessed.
    """
    try:
        data = request.data
        student_id  = data.get('student_id')
        deadline_id = data.get('deadline_id')
        email       = data.get('email', '')
        first_name  = data.get('first_name', 'Parent')
        last_name   = data.get('last_name', 'User')
        platform    = data.get('platform', 'web')

        # ✅ SECURITY / MONEY-SAFETY FIX: `amount` used to be taken directly
        # from the request body (`data.get('amount')`) and trusted as-is —
        # any authenticated parent could set it to any number they wanted
        # (e.g. pay 1 Birr against a 500 Birr deadline) and the Chapa
        # checkout, webhook, and verified Payment row would all silently
        # go along with it, since nothing here ever compared it to what
        # was actually owed. The amount actually charged is now ALWAYS
        # computed server-side below, from the deadline (and any active
        # fee override) — the client is not trusted for this value at all.

        # ✅ Get school from header
        school_id = request.headers.get('X-School-ID')
        if not school_id:
            return JsonResponse(
                {'success': False, 'error': 'X-School-ID header required'},
                status=400
            )

        if not all([student_id, deadline_id]):
            return JsonResponse(
                {'success': False, 'error': 'student_id and deadline_id are required'},
                status=400
            )

        try:
            student = Student.objects.get(student_id=student_id)
        except Student.DoesNotExist:
            return JsonResponse(
                {'success': False, 'error': f'Student {student_id} not found'},
                status=404
            )

        # ✅ SECURITY: verify the authenticated caller is actually this
        # student's parent — not just someone who knows the student_id.
        # A parent's User is created with their email as the username, and
        # their student's parent_email / parent_phone links back to them.
        caller_email = request.user.email or ''
        caller_phone = getattr(request.user, 'profile', None)
        caller_phone = caller_phone.phone if caller_phone else ''
        is_own_child = (
            (caller_email and caller_email == student.parent_email) or
            (caller_phone and caller_phone == student.parent_phone)
        )
        # Super admins and school admins are allowed to initiate on behalf
        # of a parent (e.g. for testing or assisted payment at the counter).
        from common.utils import get_effective_role
        role = get_effective_role(request.user)
        if not is_own_child and role not in ('super_admin', 'school_admin'):
            return JsonResponse(
                {'success': False, 'error': 'You can only initiate payment for your own child'},
                status=403
            )

        # ✅ Verify student belongs to this school
        if str(student.school_id) != str(school_id):
            return JsonResponse(
                {'success': False, 'error': 'Student does not belong to your school'},
                status=403
            )

        # ✅ Get school and check Chapa configuration
        try:
            school = School.objects.get(id=int(school_id))
        except School.DoesNotExist:
            return JsonResponse(
                {'success': False, 'error': 'School not found'},
                status=404
            )

        # ✅ CRITICAL: Check if school has Chapa configured
        if not school.chapa_enabled or not school.chapa_api_key:
            return JsonResponse({
                'success': False,
                'error': 'chapa_not_configured',
                'message': '⚠️ Online payments are not configured for this school. Please contact school administration.',
                'redirect': '/admin/chapa-settings'
            }, status=400)

        try:
            deadline = PaymentDeadline.objects.get(id=deadline_id)
        except PaymentDeadline.DoesNotExist:
            return JsonResponse(
                {'success': False, 'error': f'Deadline {deadline_id} not found'},
                status=404
            )

        # ✅ Verify deadline belongs to the same school as the student — the
        # student check above didn't cover this, so a deadline from a
        # different school could otherwise be attached to this payment.
        if deadline.school_id != student.school_id:
            return JsonResponse(
                {'success': False, 'error': 'Deadline does not belong to the student\'s school'},
                status=403
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

        # ✅ Fee exceptions (Jimma request #1): the authoritative amount
        # owed for this deadline, accounting for an active
        # StudentFeeOverride ('waiver' or 'partial'). See
        # fee_override_service.py — falls back to deadline.amount
        # unchanged for every student without an override.
        from ..services.fee_override_service import get_effective_deadline_amount
        amount = get_effective_deadline_amount(student, deadline)

        if amount <= 0:
            # 'waiver' students: every month except the one the one-time
            # amount is charged against is already fully covered.
            return JsonResponse(
                {'success': False, 'error': 'Nothing is due for this month — already covered by a fee waiver.'},
                status=400
            )

        # Reuse existing pending payment or create new one
        payment = Payment.objects.filter(
            student=student, deadline=deadline, status='pending',
            payment_method='chapa'
        ).first()

        if not payment:
            payment = Payment.objects.create(
                student=student,
                deadline=deadline,
                amount=amount,
                payment_method='chapa',
                status='pending',
                paid_by=f"{first_name} {last_name}",
                paid_by_phone=student.parent_phone or '',
            )
        elif payment.amount != amount:
            # An override could have been granted/changed after this
            # pending row was first created (e.g. late-approved waiver) —
            # keep the charge in sync with what's actually owed right now
            # rather than re-charging a stale amount.
            payment.amount = amount
            payment.save(update_fields=['amount'])


        # Define return_url base depending on platform
        if platform == 'mobile':
            return_url_base = 'https://felege-selam-payment-system.onrender.com/api/chapa/mobile-redirect/'
        else:
            return_url_base = 'https://felege-selam-payment-system.vercel.app/payment/success'

        # ✅ Unified checkout — same function the reminder-link flow uses.
        # Generates tx_ref, saves it onto the Payment row, THEN calls Chapa.
        result = initiate_payment_checkout(
            payment=payment,
            email=email or student.parent_email or f"{student.student_id}@parent.com",
            first_name=first_name,
            last_name=last_name,
            callback_url='https://felege-selam-payment-system.onrender.com/api/chapa/webhook/',
            return_url_base=return_url_base,
        )

        if result.get('success'):
            logger.info(f"✅ Chapa payment initiated for {student.student_id}, tx_ref={result['tx_ref']}")
            return JsonResponse({
                'success': True,
                'checkout_url': result.get('checkout_url'),
                'tx_ref': result.get('tx_ref'),
                'payment_id': payment.id,
            })
        else:
            return JsonResponse(
                {'success': False, 'error': result.get('error', 'Chapa error')},
                status=500
            )

    except Exception as e:
        logger.exception("initiate_chapa_payment error")
        return JsonResponse({'success': False, 'error': str(e)}, status=500)

# Keep test_payment as alias — same logic
@api_view(['POST', 'OPTIONS'])
@permission_classes([AllowAny])
def test_payment(request):
    # Handle preflight OPTIONS request
    if request.method == 'OPTIONS':
        response = JsonResponse({'status': 'ok'})
        response['Access-Control-Allow-Methods'] = 'POST, OPTIONS'
        response['Access-Control-Allow-Headers'] = 'Content-Type, Authorization, X-School-ID'
        return response
    
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
        # Get school from webhook data
        tx_ref = data.get('tx_ref') or data.get('trx_ref')
        
        # Find payment first to get school
        payment = find_payment_by_tx_ref(tx_ref)
        if not payment:
            logger.warning(f"⚠️ Webhook: payment not found for tx_ref={tx_ref}")
            return JsonResponse({'status': 'not_found'}, status=404)
        
        # Get school from payment
        school = payment.student.school
        
        # ── Verify signature using school's webhook secret ──────────────────
        # ✅ SECURITY FIX: this used to only verify when BOTH a secret was
        # configured AND a Chapa-Signature header was present. That meant an
        # attacker could just omit the header (or target a school that
        # hadn't set a webhook secret yet) and the check was skipped
        # entirely — a payment could be marked "verified" by posting a fake
        # {"tx_ref": ..., "status": "success"} with no signature at all.
        # Verification must fail CLOSED: no secret configured, or no/invalid
        # signature, both now reject the webhook instead of silently passing.
        chapa_secret = school.chapa_webhook_secret or school.chapa_api_key
        signature    = request.headers.get('Chapa-Signature', '')

        if not chapa_secret:
            logger.error(f"❌ Webhook rejected: school {school.id} has no Chapa webhook secret configured")
            return JsonResponse({'error': 'Webhook not configured for this school'}, status=401)

        if not signature:
            logger.warning("❌ Webhook rejected: missing Chapa-Signature header")
            return JsonResponse({'error': 'Missing signature'}, status=401)

        expected = hmac.new(
            chapa_secret.encode('utf-8'),
            raw_body,
            hashlib.sha256
        ).hexdigest()
        if not hmac.compare_digest(expected, signature):
            logger.warning("❌ Webhook signature mismatch")
            return JsonResponse({'error': 'Invalid signature'}, status=401)

        # ── Find payment (already found above) ─────────────────────────────
        if not payment:
            return JsonResponse({'status': 'not_found'}, status=404)

        # ── Idempotency: skip if already processed ──────────────────────────
        if payment.webhook_received:
            logger.info(f"⚠️ Duplicate webhook for tx_ref={tx_ref}, skipping")
            return JsonResponse({'status': 'already_processed'})

        # ── Update payment ──────────────────────────────────────────────────
        payment.webhook_received    = True
        payment.webhook_received_at = timezone.now()
        payment.chapa_reference     = data.get('ref_id', '')

        if data.get('status') == 'success':
            payment.status      = 'verified'
            payment.verified_at = timezone.now()

            # Generate invoice number
            if not payment.invoice_number:
                payment.invoice_number = payment.generate_invoice_number()

            payment.save()
            logger.info(f"✅ Payment verified: {tx_ref}, invoice: {payment.invoice_number}")

            # ── Send SMS confirmation ───────────────────────────────────────
            _send_payment_confirmation(payment)

        elif data.get('status') in ('failed', 'cancelled'):
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
    """
    Send SMS + Email receipt confirmation to parent after successful payment.
    Routed through receipt_service, which also generates the tokenized
    receipt link and uses MultiSchoolSMSService (Afro Message) instead of
    the broken africastalking-based common/sms_service.py.
    """
    from ..services.receipt_service import send_payment_success_notifications
    try:
        send_payment_success_notifications(payment)
    except Exception as e:
        logger.warning(f"⚠️ Receipt notification failed for payment {payment.id}: {e}")


@api_view(['GET'])
@permission_classes([AllowAny])
def verify_chapa_payment(request):
    """Verify payment — called by frontend after Chapa redirects back."""
    tx_ref = request.GET.get('tx_ref')
    if not tx_ref:
        return JsonResponse({'error': 'Missing tx_ref'}, status=400)

    try:
        payment = find_payment_by_tx_ref(tx_ref)

        if payment and payment.status == 'verified':
            finalize_receipt(payment)
            return JsonResponse({
                'success': True,
                'status': 'success',
                'verified': True,
                'payment_id': payment.id,
                'invoice_number': payment.invoice_number,
                'amount': str(payment.amount),
                'student_name': payment.student.full_name,
                'month': payment.deadline.get_month_display(),
                'receipt_token': str(payment.receipt_token),
            })

        # Poll Chapa API to confirm
        if payment:
            from ..services.school_chapa_service import SchoolChapaService
            chapa_service = SchoolChapaService(payment.student.school.id)
            result = chapa_service.verify_payment(tx_ref)

            if result.get('success'):
                chapa_status = result.get('status', '')
                if chapa_status == 'success' and payment.status != 'verified':
                    payment.status = 'verified'
                    payment.verified_at = timezone.now()
                    finalize_receipt(payment)
                    payment.save()
                    _send_payment_confirmation(payment)

                receipt_token = str(payment.receipt_token) if payment.receipt_token else None
                return JsonResponse({
                    'success': True,
                    'status': chapa_status,
                    'verified': chapa_status == 'success',
                    'invoice_number': payment.invoice_number if payment else None,
                    'receipt_token': receipt_token,
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
        payment = find_payment_by_tx_ref(tx_ref)
        if payment:
            receipt_token = None
            if payment.status == 'verified':
                finalize_receipt(payment)
                receipt_token = str(payment.receipt_token)
            return JsonResponse({
                'success': True,
                'status': payment.status,
                'verified': payment.status == 'verified',
                'amount': str(payment.amount),
                'invoice_number': payment.invoice_number,
                'student_name': payment.student.full_name,
                'month': payment.deadline.get_month_display(),
                'receipt_token': receipt_token,
            })
        return JsonResponse({'success': False, 'error': 'Payment not found'}, status=404)
    except Exception as e:
        return JsonResponse({'success': False, 'error': str(e)}, status=500)


@api_view(['GET'])
@permission_classes([AllowAny])
def get_chapa_banks(request):
    """Get list of supported banks from Chapa using school's credentials."""
    school_id = request.headers.get('X-School-ID')
    if not school_id:
        return JsonResponse({'success': False, 'error': 'X-School-ID header required'}, status=400)
    
    try:
        from ..services.school_chapa_service import SchoolChapaService
        chapa_service = SchoolChapaService(int(school_id))
        result = chapa_service.get_banks()
        if result.get('success'):
            return JsonResponse({'success': True, 'banks': result.get('data')})
    except Exception as e:
        logger.warning(f"Chapa banks fetch error: {e}")

    return JsonResponse({
        'success': True,
        'banks': [
            {'id': '1', 'name': 'Commercial Bank of Ethiopia'},
            {'id': '2', 'name': 'Dashen Bank'},
            {'id': '3', 'name': 'Awash Bank'},
        ],
        'mock': True
    })


# ===== MOBILE REDIRECT ENDPOINT =====
@api_view(['GET'])
@permission_classes([AllowAny])
def mobile_redirect(request):
    """Redirect page for Flutter app deep linking"""
    tx_ref = request.GET.get('tx_ref')
    html = f'''
    <!DOCTYPE html>
    <html>
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Returning to App...</title>
        <style>
            body {{
                font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
                display: flex;
                justify-content: center;
                align-items: center;
                height: 100vh;
                margin: 0;
                background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
                color: white;
                text-align: center;
            }}
            .container {{
                padding: 20px;
            }}
            .spinner {{
                width: 50px;
                height: 50px;
                border: 4px solid rgba(255,255,255,0.3);
                border-top-color: white;
                border-radius: 50%;
                animation: spin 1s linear infinite;
                margin: 20px auto;
            }}
            @keyframes spin {{
                to {{ transform: rotate(360deg); }}
            }}
            .btn {{
                display: inline-block;
                margin-top: 20px;
                padding: 12px 24px;
                background: white;
                color: #667eea;
                text-decoration: none;
                border-radius: 25px;
                font-weight: bold;
            }}
        </style>
        <script>
            function redirectToApp() {{
                window.location.href = "parentpay://payment/success?tx_ref={tx_ref}";
            }}
            setTimeout(redirectToApp, 800);
        </script>
    </head>
    <body>
        <div class="container">
            <div class="spinner"></div>
            <h2>Payment Successful!</h2>
            <p>Redirecting back to the app...</p>
            <a href="parentpay://payment/success?tx_ref={tx_ref}" class="btn">Click here if not redirected</a>
        </div>
    </body>
    </html>
    '''
    return HttpResponse(html)