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

    Only used as a FALLBACK now — see get_effective_deadline_amount()'s
    'waiver' branch below — for a school that hasn't set up a
    'registration' deadline for this academic year at all. When a
    registration deadline does exist, it carries the one-time waiver
    amount instead (see _registration_deadline_of_year), so this
    function's result is never actually billed in that case.
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


def _registration_deadline_of_year(student, deadline):
    """
    The active 'registration' PaymentDeadline (if any) for this
    student's school/academic year — registration deadlines are never
    grade-specific (grade is always null on them, enforced in
    PaymentDeadline.clean()), so no grade filter is needed here.
    Returns None if the school hasn't configured a registration
    deadline for this academic year (or has deactivated it).
    """
    from payments.models import PaymentDeadline

    return PaymentDeadline.objects.filter(
        school=deadline.school,
        academic_year=deadline.academic_year,
        deadline_type='registration',
        is_active=True,
    ).first()


def get_effective_deadline_amount(student, deadline):
    """
    Returns the Decimal amount this student actually owes for this
    specific PaymentDeadline, accounting for an active fee override.

    - No active override -> deadline.amount (unchanged behavior), or
      for a 'registration' deadline, the school's configured
      new/continuing/transferred rate (via registration_fee_service).
    - 'partial' override  -> override.amount, for every MONTHLY deadline
      in that academic year. A partial arrangement only ever covers
      monthly fees (per StudentFeeOverride's docstring) — a partial
      student's registration deadline is untouched and still charged
      the school's normal configured rate, same as before this fix.
    - 'waiver' override   -> ✅ BUG FIX: a full waiver is meant to
      replace EVERYTHING this student owes for the year with a single
      one-time amount, but 'registration' deadlines used to skip the
      override check entirely and go straight to
      registration_fee_service — so a waiver student was billed the
      full new/continuing/transferred registration rate AND (separately)
      the waiver's one-time amount on the calendar-first monthly
      deadline: two payments pending instead of one.
      Now: if the school has an active 'registration' deadline for this
      academic year, THAT deadline carries the one-time waiver amount,
      and every monthly deadline that year is Decimal('0.00'). If the
      school has no registration deadline set up at all, behavior is
      unchanged from before — the waiver amount is charged on the
      calendar-first monthly deadline instead, so it's never silently
      lost.
    """
    override = get_active_override(student, deadline.academic_year)

    if deadline.deadline_type == 'registration':
        # A full waiver takes over the registration deadline itself; a
        # partial arrangement (or no override) leaves registration
        # billing exactly as it was.
        if override is not None and override.override_type == 'waiver':
            return override.amount

        from payments.services.registration_fee_service import get_effective_registration_amount
        return get_effective_registration_amount(student, deadline)

    if override is None:
        return deadline.amount

    if override.override_type == 'partial':
        return override.amount

    # 'waiver' on a monthly deadline. If this student's school has an
    # active registration deadline for this year, that deadline is
    # already carrying the one-time waiver amount (see above) — every
    # monthly deadline is $0 so the amount is never billed twice.
    registration_deadline = _registration_deadline_of_year(student, deadline)
    if registration_deadline is not None:
        return Decimal('0.00')

    # No registration deadline exists for this school/year — fall back
    # to the original behavior so the waiver still gets billed
    # somewhere: the calendar-first monthly deadline of the year.
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