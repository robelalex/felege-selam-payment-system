# backend/payments/views/sms_wallet_views.py
#
# ✅ NEW (requested): the SMS wallet / reseller feature's API surface.
# Mirrors platform_fee_views.py's settlement workflow almost exactly on
# purpose — same shape of problem (school claims to have sent money,
# attaches a receipt, super admin reviews and confirms/rejects before
# it counts), just adding TO a balance here instead of paying one down.
from decimal import Decimal, InvalidOperation

from django.db.models import Sum
from django.utils import timezone
from rest_framework.decorators import api_view, permission_classes, parser_classes
from rest_framework.parsers import MultiPartParser, FormParser
from rest_framework.response import Response

from schools.models import School
from schools.approval_views import IsPlatformOwner
from common.utils import get_verified_school_id, is_super_admin
from ..sms_wallet_models import SMSPricingSettings, SchoolSMSWallet, SMSWalletTopUp, SMSUsageRecord


def _wallet_summary(school):
    wallet = SchoolSMSWallet.get_or_create_for_school(school)
    pricing = SMSPricingSettings.get_current()
    pending = SMSWalletTopUp.objects.filter(school=school, status='pending').aggregate(
        total=Sum('amount')
    )['total'] or Decimal('0')

    now = timezone.now()
    messages_sent_this_month = SMSUsageRecord.objects.filter(
        school=school, success=True, created_at__year=now.year, created_at__month=now.month,
    ).count()

    return {
        'school_id': school.id,
        'school_name': school.name,
        'is_platform_managed': not bool(school.at_api_key),  # true if they'd use the developer's shared key at all
        'sms_enabled': school.sms_enabled,  # ✅ NEW: whether they've actually consented/enabled it yet
        'balance_etb': wallet.balance_etb,
        'price_per_sms': pricing.price_per_sms,
        'cost_per_sms': pricing.cost_per_sms,
        'low_balance_threshold_etb': pricing.low_balance_threshold_etb,
        'is_low': wallet.is_low(),
        'pending_topup_amount': pending,
        'messages_sent_this_month': messages_sent_this_month,
        'estimated_messages_remaining': int(wallet.balance_etb / pricing.price_per_sms) if pricing.price_per_sms else 0,
    }


def _serialize_topup(t):
    return {
        'id': t.id,
        'amount': t.amount,
        'note': t.note,
        'status': t.status,
        'rejection_reason': t.rejection_reason,
        'receipt_url': t.receipt.url if t.receipt else None,
        'submitted_by': (t.submitted_by.get_full_name() or t.submitted_by.username) if t.submitted_by else None,
        'recorded_by': (t.recorded_by.get_full_name() or t.recorded_by.username) if t.recorded_by else None,
        'created_at': t.created_at,
        'reviewed_at': t.reviewed_at,
    }


# ==================== SCHOOL ADMIN ====================

@api_view(['GET'])
def my_sms_wallet(request):
    """School admin's own SMS wallet balance, live price, and status."""
    if is_super_admin(request.user):
        return Response({'error': 'Super admins should use the platform overview instead.'}, status=400)
    school_id = get_verified_school_id(request)
    if not school_id:
        return Response({'error': 'Could not determine your school.'}, status=400)
    try:
        school = School.objects.get(id=school_id)
    except School.DoesNotExist:
        return Response({'error': 'School not found'}, status=404)
    return Response(_wallet_summary(school))


@api_view(['POST'])
def enable_platform_managed_sms(request):
    """
    ✅ NEW (requested) — the explicit consent step. A school with no
    Afro Message key of its own can choose to use the developer's
    shared account instead, WITH FULL KNOWLEDGE it will be billed per
    message from its SMS wallet at the current marked-up price.

    This is deliberately NOT automatic. Before this is called, such a
    school behaves exactly as it did before this feature ever existed
    — SMS sending simply isn't configured, no different from today.
    Calling this is the one moment a school actually agrees to the
    billing relationship; nothing bills them before they've done this.
    """
    if is_super_admin(request.user):
        return Response({'error': 'This is a school-admin action.'}, status=400)
    school_id = get_verified_school_id(request)
    if not school_id:
        return Response({'error': 'Could not determine your school.'}, status=400)
    try:
        school = School.objects.get(id=school_id)
    except School.DoesNotExist:
        return Response({'error': 'School not found'}, status=404)

    if school.at_api_key:
        return Response({
            'error': 'Your school already has its own Afro Message key configured. '
                     'Platform-managed SMS is only for schools without their own key — '
                     'remove your key in SMS Settings first if you want to switch.'
        }, status=400)

    pricing = SMSPricingSettings.get_current()
    if not pricing.platform_api_key:
        return Response({'error': 'Platform-managed SMS has not been enabled by the developer yet. Please contact them.'}, status=400)

    school.sms_enabled = True
    school.sms_test_status = 'Platform-managed (developer account)'
    school.save(update_fields=['sms_enabled', 'sms_test_status'])
    return Response({'success': True, 'summary': _wallet_summary(school)})


@api_view(['POST'])
def disable_platform_managed_sms(request):
    """
    ✅ NEW: lets a school pause platform-managed SMS at any time — sets
    sms_enabled back to False, so no further sends (and no further
    wallet charges) happen until they re-enable. Their wallet balance
    is left untouched, ready for if/when they turn it back on.
    """
    if is_super_admin(request.user):
        return Response({'error': 'This is a school-admin action.'}, status=400)
    school_id = get_verified_school_id(request)
    if not school_id:
        return Response({'error': 'Could not determine your school.'}, status=400)
    try:
        school = School.objects.get(id=school_id)
    except School.DoesNotExist:
        return Response({'error': 'School not found'}, status=404)
    school.sms_enabled = False
    school.save(update_fields=['sms_enabled'])
    return Response({'success': True, 'summary': _wallet_summary(school)})


@api_view(['POST'])
@parser_classes([MultiPartParser, FormParser])
def submit_sms_topup(request):
    """
    ✅ NEW — school admin's "I sent money for SMS credit" button. Same
    receipt-attached, starts-pending pattern as the developer fee
    settlement submission — see submit_fee_settlement in
    platform_fee_views.py for the identical reasoning.
    """
    if is_super_admin(request.user):
        return Response({'error': 'Super admins do not submit top-ups.'}, status=400)
    school_id = get_verified_school_id(request)
    if not school_id:
        return Response({'error': 'Could not determine your school.'}, status=400)
    try:
        school = School.objects.get(id=school_id)
    except School.DoesNotExist:
        return Response({'error': 'School not found'}, status=404)

    amount = request.data.get('amount')
    note = request.data.get('note', '')
    receipt = request.FILES.get('receipt')

    if not amount:
        return Response({'error': 'amount is required.'}, status=400)
    try:
        parsed_amount = Decimal(str(amount))
    except (InvalidOperation, ValueError, TypeError):
        return Response({'error': 'amount must be a number.'}, status=400)
    if parsed_amount <= 0:
        return Response({'error': 'amount must be greater than zero.'}, status=400)
    if not receipt:
        return Response({'error': 'Please attach a receipt or screenshot of the transfer.'}, status=400)

    topup = SMSWalletTopUp.objects.create(
        school=school, amount=parsed_amount, note=note, receipt=receipt,
        status='pending', submitted_by=request.user,
    )
    return Response({'success': True, 'topup': _serialize_topup(topup)}, status=201)


@api_view(['GET'])
def my_sms_topups(request):
    """School admin's own top-up submission history and live status."""
    if is_super_admin(request.user):
        return Response({'error': 'Super admins should use the platform overview instead.'}, status=400)
    school_id = get_verified_school_id(request)
    if not school_id:
        return Response({'error': 'Could not determine your school.'}, status=400)
    topups = SMSWalletTopUp.objects.filter(school_id=school_id)
    return Response({'topups': [_serialize_topup(t) for t in topups]})


# ==================== SUPER ADMIN ====================

@api_view(['GET', 'PATCH'])
@permission_classes([IsPlatformOwner])
def sms_pricing(request):
    """Super admin: read or update the SMS cost/markup/threshold, and set the platform's own Afro Message key."""
    pricing = SMSPricingSettings.get_current()
    if request.method == 'PATCH':
        for field, label in [
            ('cost_per_sms', 'cost_per_sms'),
            ('markup_percentage', 'markup_percentage'),
            ('low_balance_threshold_etb', 'low_balance_threshold_etb'),
        ]:
            value = request.data.get(field)
            if value is None:
                continue
            try:
                parsed = Decimal(str(value))
            except (InvalidOperation, ValueError, TypeError):
                return Response({'error': f'{label} must be a number.'}, status=400)
            if parsed < 0:
                return Response({'error': f'{label} cannot be negative.'}, status=400)
            setattr(pricing, field, parsed)
        if 'platform_api_key' in request.data:
            pricing.platform_api_key = request.data.get('platform_api_key', '').strip()
        pricing.updated_by = request.user
        pricing.save()
    return Response({
        'cost_per_sms': pricing.cost_per_sms,
        'markup_percentage': pricing.markup_percentage,
        'price_per_sms': pricing.price_per_sms,
        'low_balance_threshold_etb': pricing.low_balance_threshold_etb,
        'platform_api_key_configured': bool(pricing.platform_api_key),
        'updated_at': pricing.updated_at,
    })


@api_view(['GET'])
@permission_classes([IsPlatformOwner])
def sms_wallets_overview(request):
    """
    Super admin: every PLATFORM-MANAGED school's SMS wallet at a
    glance — balance, whether they've actually opted in yet
    (sms_enabled), and who's running low. Schools with their own Afro
    Message key are excluded entirely — the platform has no billing
    role or visibility into their usage.
    """
    schools = School.objects.filter(at_api_key__isnull=True) | School.objects.filter(at_api_key='')
    data = [_wallet_summary(s) for s in schools.distinct().order_by('name')]
    pending_count = SMSWalletTopUp.objects.filter(status='pending').count()
    return Response({'schools': data, 'pending_topups_count': pending_count})


@api_view(['GET'])
@permission_classes([IsPlatformOwner])
def pending_sms_topups(request):
    """Super admin's review queue for SMS wallet top-up receipts."""
    topups = SMSWalletTopUp.objects.filter(status='pending').select_related('school').order_by('created_at')
    return Response({
        'topups': [
            {**_serialize_topup(t), 'school_id': t.school_id, 'school_name': t.school.name, 'school_code': t.school.code}
            for t in topups
        ],
    })


@api_view(['POST'])
@permission_classes([IsPlatformOwner])
def confirm_sms_topup(request, topup_id):
    """Super admin confirms a top-up receipt — THIS is the moment the wallet balance actually increases."""
    try:
        topup = SMSWalletTopUp.objects.get(id=topup_id)
    except SMSWalletTopUp.DoesNotExist:
        return Response({'error': 'Top-up not found'}, status=404)
    if topup.status != 'pending':
        return Response({'error': f'This top-up is already {topup.status}.'}, status=400)

    corrected_amount = request.data.get('amount')
    if corrected_amount is not None:
        try:
            topup.amount = Decimal(str(corrected_amount))
        except (InvalidOperation, ValueError, TypeError):
            return Response({'error': 'amount must be a number.'}, status=400)

    topup.status = 'confirmed'
    topup.recorded_by = request.user
    topup.reviewed_at = timezone.now()
    topup.save()

    wallet = SchoolSMSWallet.get_or_create_for_school(topup.school)
    wallet.balance_etb = wallet.balance_etb + topup.amount
    wallet.save(update_fields=['balance_etb', 'updated_at'])

    return Response({'success': True, 'topup': _serialize_topup(topup), 'new_balance': wallet.balance_etb})


@api_view(['POST'])
@permission_classes([IsPlatformOwner])
def reject_sms_topup(request, topup_id):
    """Super admin rejects a top-up receipt — does NOT touch the wallet balance."""
    try:
        topup = SMSWalletTopUp.objects.get(id=topup_id)
    except SMSWalletTopUp.DoesNotExist:
        return Response({'error': 'Top-up not found'}, status=404)
    if topup.status != 'pending':
        return Response({'error': f'This top-up is already {topup.status}.'}, status=400)

    reason = request.data.get('reason', '').strip()
    if not reason:
        return Response({'error': 'A rejection reason is required so the school knows what to fix.'}, status=400)

    topup.status = 'rejected'
    topup.rejection_reason = reason
    topup.recorded_by = request.user
    topup.reviewed_at = timezone.now()
    topup.save()

    return Response({'success': True, 'topup': _serialize_topup(topup)})