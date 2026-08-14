# backend/payments/services/registration_fee_service.py
"""
Jimma request #2 — registration fees.

Single source of truth for "how much registration fee does this student
actually owe" and "is this student new or continuing this year". Mirrors
the fee_override_service.py pattern deliberately, for the same reason:
one place that knows the rule, so every screen agrees.

Wired in via fee_override_service.get_effective_deadline_amount(), which
delegates here whenever deadline.deadline_type == 'registration' — every
call site that already calls get_effective_deadline_amount() (Chapa
checkout, public Telebirr/cash, SMS/email reminders, reports, pending
payments list) picks up registration fees automatically. Nothing else
needed to change at those call sites.
"""
from decimal import Decimal


def get_registration_type(student, academic_year, auto_create=True):
    """
    Returns the StudentRegistrationType row for this student/year,
    creating (and caching) an auto-detected one if none exists yet and
    auto_create is True. Returns None if academic_year is None, or if
    auto_create is False and no row exists.

    Auto-detection rule: 'continuing' if this student has any VERIFIED
    payment at this school in a strictly earlier academic year (by
    academic_year.year_ec) than the one being asked about; otherwise
    'new'. This only looks at the student's OWN payment history — a
    transfer student who is new to this school but was verified
    elsewhere isn't detectable this way, which is exactly why admins can
    override it (see set_registration_type_override below).
    """
    if academic_year is None:
        return None

    from payments.models import StudentRegistrationType

    existing = StudentRegistrationType.objects.filter(
        student=student, academic_year=academic_year
    ).first()
    if existing is not None:
        return existing

    if not auto_create:
        return None

    from payments.models import Payment
    has_earlier_verified_payment = Payment.objects.filter(
        student=student,
        status='verified',
        deadline__academic_year__year_ec__lt=academic_year.year_ec,
    ).exists()

    detected_type = 'continuing' if has_earlier_verified_payment else 'new'

    return StudentRegistrationType.objects.create(
        student=student,
        academic_year=academic_year,
        registration_type=detected_type,
        is_manual_override=False,
        set_by=None,
    )


def set_registration_type_override(student, academic_year, registration_type, user):
    """
    Admin-set override — always wins over auto-detection, regardless of
    whether a cached auto-detected row already exists for this student/year.
    """
    from payments.models import StudentRegistrationType

    obj, _created = StudentRegistrationType.objects.update_or_create(
        student=student,
        academic_year=academic_year,
        defaults={
            'registration_type': registration_type,
            'is_manual_override': True,
            'set_by': user,
        },
    )
    return obj


def get_registration_fee_config(school, academic_year):
    """Returns this school's RegistrationFeeConfig for the year, or None if not yet set."""
    if academic_year is None:
        return None

    from payments.models import RegistrationFeeConfig

    return RegistrationFeeConfig.objects.filter(
        school=school, academic_year=academic_year
    ).first()


def get_effective_registration_amount(student, deadline):
    """
    Returns the Decimal amount this student owes for a 'registration'
    deadline. Requires deadline.deadline_type == 'registration'.

    Returns Decimal('0.00') (rather than raising) if no
    RegistrationFeeConfig exists yet for this school/year — a school
    admin hasn't configured registration fees yet, so nothing is charged
    rather than falling back to some arbitrary number. This mirrors the
    "fail safe toward not overcharging" posture the fee-override service
    already takes.

    Same fail-safe applies per-tier: 'transferred' is optional on
    RegistrationFeeConfig (transferred_student_amount can be None even
    when new/continuing are set, since it was added later and a school
    may not have decided that price yet) — a transferred student is
    charged Decimal('0.00') until an admin sets it, rather than silently
    billing them at the new-student rate.
    """
    config = get_registration_fee_config(deadline.school, deadline.academic_year)
    if config is None:
        return Decimal('0.00')

    reg_type = get_registration_type(student, deadline.academic_year)
    if reg_type is None:
        return Decimal('0.00')

    if reg_type.registration_type == 'new':
        return config.new_student_amount
    if reg_type.registration_type == 'transferred':
        return config.transferred_student_amount or Decimal('0.00')
    return config.continuing_student_amount


def describe_registration_for_student(student, academic_year):
    """
    Small helper for API responses that want to show *why* a student is
    billed a given registration amount — same shape/spirit as
    fee_override_service.describe_override_for_student().
    Returns None, or a small dict describing the type + config.
    """
    reg_type = get_registration_type(student, academic_year, auto_create=False)
    if reg_type is None:
        return None
    return {
        'registration_type': reg_type.registration_type,
        'is_manual_override': reg_type.is_manual_override,
    }