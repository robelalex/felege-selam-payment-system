# backend/payments/services/fee_override_service.py
"""
Single source of truth for "how much does this student actually owe for
this deadline" — the ONE place that knows about StudentFeeOverride, so
every screen/report/reminder/charge agrees with each other.

Before this existed, every call site (report_service, dashboard, SMS/
email reminders, Chapa payment initiation) read deadline.amount
directly. Fee exceptions mean that's no longer always correct — a
student on a waiver or partial arrangement owes a different amount.
Rather than editing every one of those ~15 call sites individually
(real risk of missing one and quietly overcharging/undercharging a
poverty-waiver family), call sites should go through
get_effective_deadline_amount() below.

Wired in: Chapa payment initiation (chapa_views.py), the public
Telebirr/cash endpoint (views/views.py), on-demand and scheduled SMS
reminders (sms_views_v2.py, reminder_views.py,
send_scheduled_reminders.py), email reminders (reminder_service.py),
the pending-payments list (students/views.py), and reports
(report_service.py, reports/views.py).

✅ Jimma request #2 — registration fees: get_effective_deadline_amount()
now also handles deadline_type == 'registration' deadlines (delegating
to registration_fee_service), so every one of the call sites above
picked up registration-fee support automatically with no changes needed
at the call site itself.
"""
from decimal import Decimal


def get_active_override(student, academic_year):
    """
    Returns the student's active StudentFeeOverride for this academic
    year, or None. `academic_year` may be None (falls back to no
    override — matches deadlines that don't resolve to a year either).
    """
    if academic_year is None:
        return None

    # Local import avoids a circular import at module load time
    # (payments.models imports students.models; this module is imported
    # by payments views, so importing payments.models at the top of this
    # file is safe, but keeping it local mirrors the existing codebase's
    # convention of local imports for cross-app lookups — see
    # signals.py, chapa_views.py, etc.)
    from payments.models import StudentFeeOverride

    return StudentFeeOverride.objects.filter(
        student=student, academic_year=academic_year, is_active=True
    ).first()


def _first_deadline_of_year(student, deadline):
    """
    The deadline a 'waiver' override's one-time amount is charged
    against — the earliest active deadline in the same school/academic
    year that applies to this student's grade (grade-specific or
    all-grades). Deliberately NOT "the first deadline this student ever
    pays" — it's always the calendar-first month of the year, so a
    waiver granted mid-year still resolves to the same deadline
    consistently no matter when it's queried.
    """
    from django.db.models import Q
    from payments.models import PaymentDeadline

    return PaymentDeadline.objects.filter(
        school=deadline.school,
        academic_year=deadline.academic_year,
        is_active=True,
    ).filter(
        Q(grade=student.grade) | Q(grade__isnull=True)
    ).order_by('month').first()


def get_effective_deadline_amount(student, deadline):
    """
    Returns the Decimal amount this student actually owes for this
    specific PaymentDeadline, accounting for an active fee override.

    - No active override -> deadline.amount (unchanged behavior).
    - 'partial' override  -> override.amount, for every deadline in
      that academic year.
    - 'waiver' override   -> override.amount on the single
      calendar-first deadline of that academic year for this student's
      grade; Decimal('0.00') on every other deadline that year (already
      "paid" by the one-time amount).

    ✅ Jimma request #2: for a 'registration' deadline, delegates to
    registration_fee_service instead — fee overrides (waiver/partial)
    are a monthly-fee concept and don't apply to the one-time
    registration charge.
    """
    if deadline.deadline_type == 'registration':
        from payments.services.registration_fee_service import get_effective_registration_amount
        return get_effective_registration_amount(student, deadline)

    override = get_active_override(student, deadline.academic_year)
    if override is None:
        return deadline.amount

    if override.override_type == 'partial':
        return override.amount

    # 'waiver'
    first_deadline = _first_deadline_of_year(student, deadline)
    if first_deadline is not None and first_deadline.id == deadline.id:
        return override.amount
    return Decimal('0.00')


def describe_override_for_student(student, academic_year):
    """
    Small helper for API responses that want to show *why* an amount is
    different (e.g. the parent/admin payment screens), without every
    call site re-deriving the same override lookup + type check.
    Returns None, or a small dict describing the active override.
    """
    override = get_active_override(student, academic_year)
    if override is None:
        return None
    return {
        'id': override.id,
        'type': override.override_type,
        'amount': float(override.amount),
        'reason': override.reason,
    }
