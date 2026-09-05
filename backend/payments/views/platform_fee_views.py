# backend/payments/views/platform_fee_views.py
#
# NEW (requested): the "developer usage fee" feature. A small amount
# (currently set by PlatformFeeSettings, adjustable by the super admin)
# is owed to the platform developer for every verified payment
# processed through the system - separate from Chapa and separate from
# anything the school owes for the annual license.
#
# Deliberately NOT automatic money movement: nothing here ever touches
# a parent's payment, Chapa, or any bank transfer. This module only
# calculates totals and now runs a receipt-based confirmation workflow
# for settlements - see Payment.platform_fee_amount and
# PlatformFeeSettlement in payments/models.py for the full reasoning.
#
# ✅ UPDATED (requested): school admins can now submit a settlement
# themselves with a receipt attached (submit_fee_settlement), which
# starts 'pending' and does NOT reduce their balance until the super
# admin reviews the receipt and confirms it (confirm_fee_settlement) or
# rejects it (reject_fee_settlement). This closes the "communication"
# gap: before, a settlement only existed once the super admin had
# already typed it in as done - the school had no way to say "I sent
# it, please check" and no visibility into whether it had actually been
# reviewed yet.
from decimal import Decimal, InvalidOperation
from django.db.models import Sum, Count
from django.db.models.functions import TruncMonth
from django.utils import timezone
from rest_framework.decorators import api_view, permission_classes, parser_classes
from rest_framework.parsers import MultiPartParser, FormParser
from rest_framework.response import Response

from schools.models import School
from schools.approval_views import IsPlatformOwner
from common.utils import get_verified_school_id, is_super_admin
from ..models import Payment, PlatformFeeSettings, PlatformFeeSettlement
from ..services.school_chapa_service import SchoolChapaService
# ✅ NEW (requested): platform subscription fee (per active student,
# per month) — see subscription_billing_service.py for the full
# reasoning. Combined into the SAME balance/settlement flow below so
# the school only ever sees and pays ONE number, not two bills.
from ..services.subscription_billing_service import get_subscription_summary


def _school_fee_summary(school):
    accrued = Payment.objects.filter(
        student__school=school, status='verified', is_archived=False
    ).aggregate(total=Sum('platform_fee_amount'))['total'] or Decimal('0')

    # ✅ NEW (requested): the platform subscription fee (per active
    # student, per month) — combined into the SAME accrued balance as
    # the per-payment developer usage fee above, so the school sees and
    # settles ONE number, never two separate bills for the same thing.
    subscription_charges, subscription_total = get_subscription_summary(school)
    accrued += subscription_total

    # ✅ FIXED: only CONFIRMED settlements reduce the balance now. A
    # 'pending' settlement (school says "I sent it", receipt attached,
    # not yet reviewed) must NOT make the balance look already paid -
    # that would be trusting an unverified claim with real money
    # implications. 'rejected' ones never counted and still don't.
    confirmed = PlatformFeeSettlement.objects.filter(school=school, status='confirmed')
    settled = confirmed.aggregate(total=Sum('amount'))['total'] or Decimal('0')

    pending = PlatformFeeSettlement.objects.filter(school=school, status='pending').aggregate(
        total=Sum('amount')
    )['total'] or Decimal('0')

    # ✅ NEW: "since your last confirmed settlement" - the school asked
    # for this specifically, so the page stops being an ever-growing,
    # confusing all-time wall of numbers once they've actually settled
    # up. last_settled_at is None until they've had at least one
    # confirmed settlement, in which case the frontend just shows the
    # full history (nothing to hide yet).
    last_settlement = confirmed.order_by('-reviewed_at', '-created_at').first()
    last_settled_at = (last_settlement.reviewed_at or last_settlement.created_at) if last_settlement else None

    return {
        'school_id': school.id,
        'school_name': school.name,
        'school_code': school.code,
        'total_accrued': accrued,
        'total_settled': settled,
        'balance_owed': accrued - settled,
        'pending_settlement_amount': pending,
        'last_settled_at': last_settled_at,
        # ✅ NEW: broken out separately purely so the school can SEE the
        # math ("600 students x 25 ETB = 15,000 ETB this month") — it's
        # still all one combined balance/settlement above, this is just
        # for transparency, not a second bill.
        'subscription_total_accrued': subscription_total,
    }


@api_view(['GET'])
@permission_classes([IsPlatformOwner])
def developer_fees_overview(request):
    """
    NEW - the super admin's cross-school view: what every school
    currently owes the developer, at a glance. This is the "notification
    as a sub-school" summary requested - one row per school.
    """
    schools = School.objects.all().order_by('name')
    data = [_school_fee_summary(s) for s in schools]
    totals = {
        'total_accrued': sum((row['total_accrued'] for row in data), Decimal('0')),
        'total_settled': sum((row['total_settled'] for row in data), Decimal('0')),
        'total_balance_owed': sum((row['balance_owed'] for row in data), Decimal('0')),
    }
    settings_row = PlatformFeeSettings.get_current()
    # ✅ NEW: how many settlement receipts are sitting in the queue
    # waiting for the super admin's attention, so the dashboard can
    # surface this without a separate round trip.
    pending_count = PlatformFeeSettlement.objects.filter(status='pending').count()
    return Response({
        'schools': data,
        'totals': totals,
        'current_rates': {
            'monthly_payment_fee': settings_row.monthly_payment_fee,
            'registration_payment_fee': settings_row.registration_payment_fee,
            'platform_subscription_fee_per_student': settings_row.platform_subscription_fee_per_student,
        },
        'pending_settlements_count': pending_count,
    })


@api_view(['GET', 'PATCH'])
@permission_classes([IsPlatformOwner])
def developer_fee_rates(request):
    """
    NEW - read or update the current per-payment developer fee rates.
    PATCH only ever affects payments verified AFTER the change; every
    already-verified payment keeps whatever rate was snapshotted onto
    it at the time (see Payment.save()). This is deliberate: the
    developer noted hosting/Cloudinary costs may rise over time, and
    this lets the rate move without rewriting what any school already
    owes for past months.
    """
    settings_row = PlatformFeeSettings.get_current()
    if request.method == 'PATCH':
        monthly = request.data.get('monthly_payment_fee')
        registration = request.data.get('registration_payment_fee')
        # ✅ NEW (requested): the platform subscription fee (per active
        # student, per month) — editable here alongside the other two
        # rates, same validation, same singleton pattern.
        subscription = request.data.get('platform_subscription_fee_per_student')
        # ✅ Server-side validation — the frontend already checks this,
        # but this endpoint is reachable directly via the API, and a bad
        # value here (negative, non-numeric, absurdly large) would
        # silently corrupt every fee calculation and settlement balance
        # from that point on. Reject rather than trust the client.
        for label, value in (
            ('monthly_payment_fee', monthly),
            ('registration_payment_fee', registration),
            ('platform_subscription_fee_per_student', subscription),
        ):
            if value is None:
                continue
            try:
                parsed = Decimal(str(value))
            except (InvalidOperation, ValueError, TypeError):
                return Response({'error': f'{label} must be a number.'}, status=400)
            if parsed < 0:
                return Response({'error': f'{label} cannot be negative.'}, status=400)
            if parsed > Decimal('9999.99'):
                return Response({'error': f'{label} is unreasonably large — check the value.'}, status=400)
        if monthly is not None:
            settings_row.monthly_payment_fee = monthly
        if registration is not None:
            settings_row.registration_payment_fee = registration
        if subscription is not None:
            settings_row.platform_subscription_fee_per_student = subscription
        settings_row.updated_by = request.user
        settings_row.save()
    return Response({
        'monthly_payment_fee': settings_row.monthly_payment_fee,
        'registration_payment_fee': settings_row.registration_payment_fee,
        'platform_subscription_fee_per_student': settings_row.platform_subscription_fee_per_student,
        'updated_at': settings_row.updated_at,
    })


@api_view(['POST'])
@permission_classes([IsPlatformOwner])
def record_fee_settlement(request):
    """
    Super admin logs a settlement DIRECTLY as already-confirmed - for
    cash handed over in person, or a historical catch-up entry with no
    receipt to review. Everyday "school sent a bank transfer" cases
    should go through the school admin's submit_fee_settlement +
    confirm_fee_settlement flow below instead, so there's a receipt on
    file. This is bookkeeping only: creating this row does not move any
    money itself.
    """
    school_id = request.data.get('school_id')
    amount = request.data.get('amount')
    note = request.data.get('note', '')
    if not school_id or not amount:
        return Response({'error': 'school_id and amount are required'}, status=400)
    try:
        school = School.objects.get(id=school_id)
    except School.DoesNotExist:
        return Response({'error': 'School not found'}, status=404)

    settlement = PlatformFeeSettlement.objects.create(
        school=school, amount=amount, note=note,
        status='confirmed', recorded_by=request.user, reviewed_at=timezone.now(),
    )
    return Response({
        'success': True,
        'settlement_id': settlement.id,
        'new_summary': _school_fee_summary(school),
    })


def _serialize_settlement(s):
    return {
        'id': s.id,
        'amount': s.amount,
        'note': s.note,
        'status': s.status,
        'rejection_reason': s.rejection_reason,
        'receipt_url': s.receipt.url if s.receipt else None,
        'submitted_by': (s.submitted_by.get_full_name() or s.submitted_by.username) if s.submitted_by else None,
        'recorded_by': (s.recorded_by.get_full_name() or s.recorded_by.username) if s.recorded_by else None,
        'created_at': s.created_at,
        'reviewed_at': s.reviewed_at,
    }


@api_view(['GET'])
@permission_classes([IsPlatformOwner])
def school_fee_settlements(request, school_id):
    """NEW - settlement history for one school (super admin only)."""
    try:
        school = School.objects.get(id=school_id)
    except School.DoesNotExist:
        return Response({'error': 'School not found'}, status=404)
    settlements = PlatformFeeSettlement.objects.filter(school=school)
    return Response({
        'summary': _school_fee_summary(school),
        'settlements': [_serialize_settlement(s) for s in settlements],
    })


@api_view(['GET'])
@permission_classes([IsPlatformOwner])
def pending_fee_settlements(request):
    """
    ✅ NEW (requested) - the super admin's review queue: every
    settlement a school has submitted with a receipt that hasn't been
    confirmed or rejected yet. This is the "click accept once he sees
    the money arrived" screen - one place to review every school's
    claims, not scattered per-school.
    """
    settlements = PlatformFeeSettlement.objects.filter(status='pending').select_related('school').order_by('created_at')
    return Response({
        'settlements': [
            {**_serialize_settlement(s), 'school_id': s.school_id, 'school_name': s.school.name, 'school_code': s.school.code}
            for s in settlements
        ],
    })


@api_view(['POST'])
@permission_classes([IsPlatformOwner])
def confirm_fee_settlement(request, settlement_id):
    """
    ✅ NEW (requested) - the super admin has checked their bank account,
    the money genuinely arrived, and they click Confirm here. THIS is
    the moment the settlement actually reduces the school's balance
    (see _school_fee_summary, which only sums status='confirmed'). The
    optional 'amount' in the body lets the super admin correct the
    figure if the receipt shows a different amount than what the school
    typed (e.g. bank fees deducted) — defaults to the submitted amount.
    """
    try:
        settlement = PlatformFeeSettlement.objects.get(id=settlement_id)
    except PlatformFeeSettlement.DoesNotExist:
        return Response({'error': 'Settlement not found'}, status=404)
    if settlement.status != 'pending':
        return Response({'error': f'This settlement is already {settlement.status}.'}, status=400)

    corrected_amount = request.data.get('amount')
    if corrected_amount is not None:
        try:
            settlement.amount = Decimal(str(corrected_amount))
        except (InvalidOperation, ValueError, TypeError):
            return Response({'error': 'amount must be a number.'}, status=400)

    settlement.status = 'confirmed'
    settlement.recorded_by = request.user
    settlement.reviewed_at = timezone.now()
    settlement.save()

    return Response({
        'success': True,
        'settlement': _serialize_settlement(settlement),
        'new_summary': _school_fee_summary(settlement.school),
    })


@api_view(['POST'])
@permission_classes([IsPlatformOwner])
def reject_fee_settlement(request, settlement_id):
    """
    ✅ NEW (requested) - super admin rejects a submitted settlement
    (wrong amount, unreadable receipt, money never actually arrived,
    etc.), with a reason the school admin will see against their
    submission. Does NOT touch the balance — a rejected settlement
    never counted toward total_settled in the first place.
    """
    try:
        settlement = PlatformFeeSettlement.objects.get(id=settlement_id)
    except PlatformFeeSettlement.DoesNotExist:
        return Response({'error': 'Settlement not found'}, status=404)
    if settlement.status != 'pending':
        return Response({'error': f'This settlement is already {settlement.status}.'}, status=400)

    reason = request.data.get('reason', '').strip()
    if not reason:
        return Response({'error': 'A rejection reason is required so the school knows what to fix.'}, status=400)

    settlement.status = 'rejected'
    settlement.rejection_reason = reason
    settlement.recorded_by = request.user
    settlement.reviewed_at = timezone.now()
    settlement.save()

    return Response({'success': True, 'settlement': _serialize_settlement(settlement)})


@api_view(['POST'])
@parser_classes([MultiPartParser, FormParser])
def submit_fee_settlement(request):
    """
    ✅ NEW (requested) - the school admin's own "I sent the money"
    button. They attach a receipt (bank transfer screenshot, Telebirr
    confirmation, etc.), an amount, and an optional note. This creates
    a 'pending' PlatformFeeSettlement - it does NOT reduce their
    balance yet (see _school_fee_summary). It just puts the claim in
    front of the super admin for review via pending_fee_settlements /
    confirm_fee_settlement above. Scoped to the admin's own school the
    same safe way as every other school-admin endpoint here.
    """
    if is_super_admin(request.user):
        return Response({'error': 'Super admins record settlements directly — see record_fee_settlement.'}, status=400)
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

    settlement = PlatformFeeSettlement.objects.create(
        school=school, amount=parsed_amount, note=note, receipt=receipt,
        status='pending', submitted_by=request.user,
    )
    return Response({
        'success': True,
        'settlement': _serialize_settlement(settlement),
        'new_summary': _school_fee_summary(school),
    }, status=201)


@api_view(['GET'])
def my_fee_settlements(request):
    """
    ✅ NEW (requested) - the school admin's own settlement history and
    live status (pending / confirmed / rejected) for each one they've
    submitted. This is the "communicate real-time" piece — instead of
    the school wondering whether the developer ever saw their transfer,
    they can check this list and see exactly where each submission
    stands, and the rejection reason if one was rejected.
    """
    if is_super_admin(request.user):
        return Response({'error': 'Super admins should use the platform overview instead.'}, status=400)
    school_id = get_verified_school_id(request)
    if not school_id:
        return Response({'error': 'Could not determine your school.'}, status=400)
    settlements = PlatformFeeSettlement.objects.filter(school_id=school_id)
    return Response({'settlements': [_serialize_settlement(s) for s in settlements]})


@api_view(['GET'])
def my_school_fee_summary(request):
    """
    NEW - a SCHOOL ADMIN's own view of what they currently owe the
    developer. Deliberately transparent to the school (not hidden) -
    showing them the running total is what makes "the admin pays it
    manually" actually work in practice. Non-super-admins are always
    scoped to their OWN school via get_verified_school_id(), same as
    every other view in this codebase; the header cannot be used to
    view another school's balance.

    ✅ NEW: also includes a month-by-month breakdown (monthly-fee count
    vs registration-fee count vs total) so the school admin can see
    exactly how the total was built up, not just one opaque number.

    ✅ UPDATED (requested): the breakdown is now scoped to payments
    verified SINCE the school's last CONFIRMED settlement, instead of
    showing every month since the beginning of time. Once a school
    settles up and the developer confirms it, that's a clean line —
    older months are already paid for and don't need to keep cluttering
    the page. If they've never had a confirmed settlement, nothing is
    hidden and the full history still shows.
    """
    if is_super_admin(request.user):
        return Response({'error': 'Super admins should use the platform overview endpoint instead.'}, status=400)
    school_id = get_verified_school_id(request)
    if not school_id:
        return Response({'error': 'Could not determine your school.'}, status=400)
    try:
        school = School.objects.get(id=school_id)
    except School.DoesNotExist:
        return Response({'error': 'School not found'}, status=404)

    summary = _school_fee_summary(school)

    # ✅ FIXED: the school-admin page was hardcoding "5 ETB / 2 ETB" in
    # its own JSX instead of reading the real rate, so a super-admin
    # rate change never showed up here. Send the CURRENT rates down
    # alongside the summary — same values the super admin's own
    # overview endpoint already exposes — so the frontend has no
    # reason to hardcode anything.
    settings_row = PlatformFeeSettings.get_current()
    summary['current_rates'] = {
        'monthly_payment_fee': settings_row.monthly_payment_fee,
        'registration_payment_fee': settings_row.registration_payment_fee,
        'platform_subscription_fee_per_student': settings_row.platform_subscription_fee_per_student,
    }

    # ✅ NEW (requested): the school admin's own month-by-month platform
    # subscription breakdown — "600 students x 25 ETB = 15,000 ETB for
    # September 2026" — so the math is fully visible even though it's
    # settled as part of the ONE combined balance above, not separately.
    subscription_charges, _ = get_subscription_summary(school)
    summary['subscription_breakdown'] = [
        {
            'month': c.month.strftime('%Y-%m'),
            'student_count': c.student_count,
            'rate_per_student': c.rate_per_student,
            'amount': c.amount,
        }
        for c in subscription_charges
    ]

    breakdown_filters = dict(
        student__school=school, status='verified', is_archived=False,
        platform_fee_amount__isnull=False,
    )
    if summary['last_settled_at']:
        breakdown_filters['verified_at__gt'] = summary['last_settled_at']

    breakdown_qs = (
        Payment.objects.filter(**breakdown_filters)
        .annotate(month=TruncMonth('verified_at'))
        .values('month', 'deadline__deadline_type')
        .annotate(count=Count('id'), total=Sum('platform_fee_amount'))
        .order_by('-month')
    )

    monthly = {}
    for row in breakdown_qs:
        key = row['month'].strftime('%Y-%m') if row['month'] else 'unknown'
        entry = monthly.setdefault(key, {
            'month': key, 'monthly_count': 0, 'monthly_total': Decimal('0'),
            'registration_count': 0, 'registration_total': Decimal('0'),
        })
        if row['deadline__deadline_type'] == 'registration':
            entry['registration_count'] += row['count']
            entry['registration_total'] += row['total'] or Decimal('0')
        else:
            entry['monthly_count'] += row['count']
            entry['monthly_total'] += row['total'] or Decimal('0')

    summary['breakdown'] = sorted(monthly.values(), key=lambda r: r['month'], reverse=True)
    return Response(summary)


@api_view(['GET'])
def my_school_chapa_balance(request):
    """
    ✅ NEW (requested): the school's own current Chapa account balance,
    read live from Chapa using the school's own credentials. Purely
    informational — nothing here can move money. Scoped to the
    requesting admin's own school the same safe way as every other
    view; a school admin can never see another school's balance.
    """
    if is_super_admin(request.user):
        return Response({'error': 'Super admins do not have a single Chapa balance — each school has their own.'}, status=400)
    school_id = get_verified_school_id(request)
    if not school_id:
        return Response({'error': 'Could not determine your school.'}, status=400)
    try:
        service = SchoolChapaService(school_id)
    except Exception as e:
        return Response({'success': False, 'error': str(e)}, status=400)
    return Response(service.get_balance())