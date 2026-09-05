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

    ✅ Snapshotted on creation and never updated afterwards — if a
    student is added/removed later in the month, or the super admin
    changes the rate, THIS month's already-created charge stays exactly
    as it was first computed. That's deliberate: it mirrors how
    Payment.platform_fee_amount already behaves, so a school's bill for
    a month that's already underway can't silently move on them.
    """
    month = _first_of_month()
    existing = PlatformSubscriptionCharge.objects.filter(school=school, month=month).first()
    if existing:
        return existing

    rate = PlatformFeeSettings.get_current().platform_subscription_fee_per_student
    student_count = Student.objects.filter(school=school, status='active').count()
    amount = rate * student_count

    try:
        return PlatformSubscriptionCharge.objects.create(
            school=school, month=month, student_count=student_count,
            rate_per_student=rate, amount=amount,
        )
    except IntegrityError:
        # Rare race: two requests hit this in the same instant — the
        # unique_together already saved one, just return it.
        return PlatformSubscriptionCharge.objects.get(school=school, month=month)


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
