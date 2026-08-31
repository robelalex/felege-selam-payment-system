# backend/payments/views/platform_fee_views.py
#
# NEW (requested): the "developer usage fee" feature. A small amount
# (currently 5 ETB per monthly payment, 2 ETB per registration payment,
# both adjustable) is owed to the platform developer for every verified
# payment processed through the system - separate from Chapa and
# separate from anything the school owes for the annual license.
#
# Deliberately NOT automatic money movement: nothing here ever touches
# a parent's payment, Chapa, or any bank transfer. This module only
# calculates totals and lets the super admin log settlements once a
# school has actually paid - see Payment.platform_fee_amount and
# PlatformFeeSettlement in payments/models.py for the full reasoning.
from decimal import Decimal, InvalidOperation
from django.db.models import Sum, Count
from django.db.models.functions import TruncMonth
from rest_framework.decorators import api_view, permission_classes
from rest_framework.response import Response

from schools.models import School
from schools.approval_views import IsPlatformOwner
from common.utils import get_verified_school_id, is_super_admin
from ..models import Payment, PlatformFeeSettings, PlatformFeeSettlement
from ..services.school_chapa_service import SchoolChapaService


def _school_fee_summary(school):
    accrued = Payment.objects.filter(
        student__school=school, status='verified', is_archived=False
    ).aggregate(total=Sum('platform_fee_amount'))['total'] or Decimal('0')
    settled = PlatformFeeSettlement.objects.filter(school=school).aggregate(
        total=Sum('amount')
    )['total'] or Decimal('0')
    return {
        'school_id': school.id,
        'school_name': school.name,
        'school_code': school.code,
        'total_accrued': accrued,
        'total_settled': settled,
        'balance_owed': accrued - settled,
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
    return Response({
        'schools': data,
        'totals': totals,
        'current_rates': {
            'monthly_payment_fee': settings_row.monthly_payment_fee,
            'registration_payment_fee': settings_row.registration_payment_fee,
        },
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
        # ✅ Server-side validation — the frontend already checks this,
        # but this endpoint is reachable directly via the API, and a bad
        # value here (negative, non-numeric, absurdly large) would
        # silently corrupt every fee calculation and settlement balance
        # from that point on. Reject rather than trust the client.
        for label, value in (('monthly_payment_fee', monthly), ('registration_payment_fee', registration)):
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
        settings_row.updated_by = request.user
        settings_row.save()
    return Response({
        'monthly_payment_fee': settings_row.monthly_payment_fee,
        'registration_payment_fee': settings_row.registration_payment_fee,
        'updated_at': settings_row.updated_at,
    })


@api_view(['POST'])
@permission_classes([IsPlatformOwner])
def record_fee_settlement(request):
    """
    NEW - super admin logs that a school has actually paid their
    accrued developer fees (bank transfer, cash, however they chose to
    pay). This is bookkeeping only: creating this row does not move any
    money. Reduces that school's outstanding balance going forward.
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
        school=school, amount=amount, note=note, recorded_by=request.user
    )
    return Response({
        'success': True,
        'settlement_id': settlement.id,
        'new_summary': _school_fee_summary(school),
    })


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
        'settlements': [
            {
                'id': s.id,
                'amount': s.amount,
                'note': s.note,
                'recorded_by': s.recorded_by.get_full_name() or s.recorded_by.username if s.recorded_by else None,
                'created_at': s.created_at,
            }
            for s in settlements
        ],
    })


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
    }

    breakdown_qs = (
        Payment.objects.filter(
            student__school=school, status='verified', is_archived=False,
            platform_fee_amount__isnull=False,
        )
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