# staff/signals.py
"""
✅ Jimma item 5 — HR. Automatically logs a StaffCareerEvent whenever a
StaffMember's role, salutation/title, status, or base_salary changes.

Uses pre_save to snapshot the DB row as it was *before* this save (not
the in-memory instance, which already has the new values by the time
pre_save fires) — then post_save compares that snapshot to the saved
instance and writes one event per changed field. This mirrors the
existing pattern in payments/signals.py (deadline amount → monthly_fee
sync), just scoped to StaffMember instead.

Deliberately does NOT fire on creation (is_new) — a brand new hire
doesn't have a "change" to log, they have a starting state. The first
real event appears the first time something about them changes after
that.
"""
from django.db.models.signals import pre_save, post_save
from django.dispatch import receiver
from django.utils import timezone

from .models import StaffMember, StaffCareerEvent

_TRACKED_FIELDS = {
    'role': 'role_change',
    'salutation': 'title_change',
    'status': 'status_change',
    'base_salary': 'salary_change',
}


def _display_value(instance, field_name, raw_value):
    """Human-readable label for choice fields; str() for everything else."""
    if raw_value in (None, ''):
        return ''
    if field_name == 'role':
        return dict(StaffMember.ROLE_CHOICES).get(raw_value, raw_value)
    if field_name == 'salutation':
        return dict(StaffMember.SALUTATION_CHOICES).get(raw_value, raw_value)
    if field_name == 'status':
        return dict(StaffMember.STATUS_CHOICES).get(raw_value, raw_value)
    return str(raw_value)


@receiver(pre_save, sender=StaffMember)
def _snapshot_staff_member_before_save(sender, instance, **kwargs):
    if not instance.pk:
        instance._pre_save_snapshot = None
        return
    try:
        instance._pre_save_snapshot = StaffMember.objects.get(pk=instance.pk)
    except StaffMember.DoesNotExist:
        instance._pre_save_snapshot = None


@receiver(post_save, sender=StaffMember)
def _log_staff_member_changes(sender, instance, created, **kwargs):
    if created:
        return

    old = getattr(instance, '_pre_save_snapshot', None)
    if old is None:
        return

    for field_name, event_type in _TRACKED_FIELDS.items():
        old_value = getattr(old, field_name)
        new_value = getattr(instance, field_name)
        if old_value == new_value:
            continue

        StaffCareerEvent.objects.create(
            staff=instance,
            event_type=event_type,
            field_changed=field_name,
            old_value=_display_value(instance, field_name, old_value),
            new_value=_display_value(instance, field_name, new_value),
            is_manual=False,
            effective_date=(instance.updated_at.date() if instance.updated_at else timezone.now().date()),
        )
