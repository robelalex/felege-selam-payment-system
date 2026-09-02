# backend/payments/views/sms_self_tracker_views.py
#
# ✅ NEW (requested): API surface for the optional self-managed SMS
# balance tracker. School-admin-only — there is no super-admin review
# step here on purpose, unlike the platform wallet top-ups. This
# balance belongs entirely to the school (it's their own Afro Message
# account); the platform has no billing role and nothing to confirm.
from decimal import Decimal, InvalidOperation

from rest_framework.decorators import api_view
from rest_framework.response import Response

from schools.models import School
from common.utils import get_verified_school_id, is_super_admin
from ..sms_self_tracker_models import SchoolSMSSelfTracker


def _tracker_summary(school):
    tracker = SchoolSMSSelfTracker.get_or_create_for_school(school)
    return {
        'school_id': school.id,
        'school_name': school.name,
        'enabled': tracker.enabled,
        'balance_etb': tracker.balance_etb,
        'low_threshold_etb': tracker.low_threshold_etb,
        'estimated_cost_per_sms': tracker.estimated_cost_per_sms,
        'is_low': tracker.is_low(),
        'estimated_messages_remaining': (
            int(tracker.balance_etb / tracker.estimated_cost_per_sms)
            if tracker.estimated_cost_per_sms else 0
        ),
        'note': (
            "This is a self-reported balance you keep up to date yourself — "
            "Afro Message doesn't provide a way for this app to check your "
            "real balance automatically. Update it here after you top up "
            "on Afro Message directly."
        ),
    }


def _get_school_or_error(request):
    if is_super_admin(request.user):
        return None, Response({'error': 'This is a school-admin action.'}, status=400)
    school_id = get_verified_school_id(request)
    if not school_id:
        return None, Response({'error': 'Could not determine your school.'}, status=400)
    try:
        return School.objects.get(id=school_id), None
    except School.DoesNotExist:
        return None, Response({'error': 'School not found'}, status=404)


@api_view(['GET'])
def my_sms_self_tracker(request):
    """School admin's own self-managed SMS balance tracker."""
    school, error = _get_school_or_error(request)
    if error:
        return error
    return Response(_tracker_summary(school))


@api_view(['POST'])
def enable_self_sms_tracking(request):
    """
    ✅ NEW: opt-in step for a self-managed school (has its own Afro
    Message key) to start seeing a balance + low-balance alert here.
    Does not require an Afro Message key check like the platform-managed
    path does — this tracker works regardless, it's just a personal
    bookkeeping tool.
    """
    school, error = _get_school_or_error(request)
    if error:
        return error
    tracker = SchoolSMSSelfTracker.get_or_create_for_school(school)
    tracker.enabled = True
    tracker.save(update_fields=['enabled', 'updated_at'])
    return Response({'success': True, 'summary': _tracker_summary(school)})


@api_view(['POST'])
def disable_self_sms_tracking(request):
    """Pause tracking — stops counting down, keeps the last balance stored in case they re-enable later."""
    school, error = _get_school_or_error(request)
    if error:
        return error
    tracker = SchoolSMSSelfTracker.get_or_create_for_school(school)
    tracker.enabled = False
    tracker.save(update_fields=['enabled', 'updated_at'])
    return Response({'success': True, 'summary': _tracker_summary(school)})


@api_view(['POST'])
def update_self_sms_balance(request):
    """
    ✅ NEW: the school's "I just topped up on Afro Message, here's my new
    balance" action. Accepts an absolute new balance (simplest, matches
    what the school actually sees on Afro Message's own dashboard) and,
    optionally, an updated low-balance threshold and/or cost estimate.
    """
    school, error = _get_school_or_error(request)
    if error:
        return error
    tracker = SchoolSMSSelfTracker.get_or_create_for_school(school)

    if 'balance_etb' in request.data:
        try:
            new_balance = Decimal(str(request.data.get('balance_etb')))
        except (InvalidOperation, ValueError, TypeError):
            return Response({'error': 'balance_etb must be a number.'}, status=400)
        if new_balance < 0:
            return Response({'error': 'balance_etb cannot be negative.'}, status=400)
        tracker.balance_etb = new_balance

    if 'low_threshold_etb' in request.data:
        try:
            new_threshold = Decimal(str(request.data.get('low_threshold_etb')))
        except (InvalidOperation, ValueError, TypeError):
            return Response({'error': 'low_threshold_etb must be a number.'}, status=400)
        if new_threshold < 0:
            return Response({'error': 'low_threshold_etb cannot be negative.'}, status=400)
        tracker.low_threshold_etb = new_threshold

    if 'estimated_cost_per_sms' in request.data:
        try:
            new_cost = Decimal(str(request.data.get('estimated_cost_per_sms')))
        except (InvalidOperation, ValueError, TypeError):
            return Response({'error': 'estimated_cost_per_sms must be a number.'}, status=400)
        if new_cost < 0:
            return Response({'error': 'estimated_cost_per_sms cannot be negative.'}, status=400)
        tracker.estimated_cost_per_sms = new_cost

    tracker.save()
    return Response({'success': True, 'summary': _tracker_summary(school)})
