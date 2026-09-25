# backend/payments/services/subscription_billing_service.py
#
# ✅ NEW (requested): computes the platform subscription fee (per active
# student, per month) — separate from the per-payment developer usage
# fee in platform_fee_views.py, but settled through the SAME
# PlatformFeeSettlement workflow so the school only ever sees and pays
# ONE combined balance, not two separate bills.
from datetime import date
from decimal import Decimal

from django.db import IntegrityError
from django.db.models import Sum

from django.db import IntegrityError

from students.models import Student
from ..models import PlatformFeeSettings, PlatformSubscriptionCharge


def _first_of_month(d=None):
    d = d or date.today()
    return d.replace(day=1)


def get_or_create_current_month_charge(school):
    """
    Returns this school's PlatformSubscriptionCharge for the current
    calendar month, creating it on first access.

    ✅ CHANGED (Jimma feedback, 2026-09-25): while the month is still the
    CURRENT month, this row is now live — it's recomputed against
    whatever rate is in PlatformFeeSettings and however many active
    students the school has, every time it's read. Previously it was
    snapshotted once on first creation and never touched again, which
    meant a super admin correcting the rate mid-month (e.g. 25 -> 40)
    had no visible effect until next month, while the summary text
    right above the breakdown table (which reads the rate straight from
    PlatformFeeSettings) updated immediately — the two numbers disagreed
    on-screen for the rest of the month. Since a balance for a month
    that hasn't ended yet was never "final" in the first place, there's
    nothing to protect by freezing it early.

    A month's row ONLY stops being touched once it is no longer the
    current month (i.e. once the calendar rolls over past it) — from
    that point on this function never queries or writes it again, so
    every PAST month stays exactly as it was on the day it closed. That
    preserves the original guarantee (a school's bill for a month
    that's already over never silently changes) while fixing the part
    that was actually confusing (a month still in progress not
    reflecting a rate the super admin just changed).
    """
    month = _first_of_month()
    rate = PlatformFeeSettings.get_current().platform_subscription_fee_per_student
    student_count = Student.objects.filter(school=school, status='active').count()
    amount = rate * student_count

    existing = PlatformSubscriptionCharge.objects.filter(school=school, month=month).first()
    if existing:
        if existing.rate_per_student != rate or existing.student_count != student_count:
            existing.rate_per_student = rate
            existing.student_count = student_count
            existing.amount = amount
            existing.save(update_fields=['rate_per_student', 'student_count', 'amount'])
        return existing

    try:
        return PlatformSubscriptionCharge.objects.create(
            school=school, month=month, student_count=student_count,
            rate_per_student=rate, amount=amount,
        )
    except IntegrityError:
        # Rare race: two requests hit this in the same instant — the
        # unique_together already saved one, just refresh and return it
        # rather than leaving it at whichever value won the race.
        existing = PlatformSubscriptionCharge.objects.get(school=school, month=month)
        if existing.rate_per_student != rate or existing.student_count != student_count:
            existing.rate_per_student = rate
            existing.student_count = student_count
            existing.amount = amount
            existing.save(update_fields=['rate_per_student', 'student_count', 'amount'])
        return existing


def get_subscription_summary(school):
    """
    All of this school's subscription charges, ensuring the current
    month's row exists first. Returned oldest-relevant-first is handled
    by the model's Meta.ordering (-month) at the call site.
    """
    get_or_create_current_month_charge(school)  # ensure current month exists
    charges = PlatformSubscriptionCharge.objects.filter(school=school)
    total = charges.aggregate(total=Sum('amount'))['total'] or Decimal('0')
    return charges, total
