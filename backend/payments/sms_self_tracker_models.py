# backend/payments/sms_self_tracker_models.py
#
# ✅ NEW (requested): optional balance/low-balance visibility for
# SELF-MANAGED schools (their own Afro Message API key configured in
# School Settings) — WITHOUT changing how they're billed in any way.
# They still pay Afro Message directly, at whatever rate Afro Message
# gives them; the platform earns nothing from and bears no cost for
# their SMS, exactly as before this file existed.
#
# HONEST LIMITATION, stated up front: Afro Message's public API does
# not expose a live account balance (see get_balance() in
# multi_school_sms_service.py — this was already true before this
# feature). So this can NEVER be a real, automatically-fetched balance.
# What it IS: a self-reported number the school types in after they
# top up on Afro Message's own site, which this app then quietly counts
# down by an estimated per-message cost as they send SMS — purely a
# convenience tracker, clearly labeled as self-reported everywhere it's
# shown, never treated as a source of truth for money.
#
# Fully opt-in (enabled=False by default) and fully separate from
# SchoolSMSWallet in sms_wallet_models.py — that model is the real,
# billing-linked wallet for PLATFORM-managed schools and is completely
# untouched by this file. A self-managed school that never opts in
# here has no row in this table at all and behaves exactly as it did
# before this feature shipped.
from decimal import Decimal

from django.core.validators import MinValueValidator
from django.db import models


class SchoolSMSSelfTracker(models.Model):
    """
    One optional row per self-managed school that has chosen to track
    their own Afro Message balance inside this app. Created lazily
    (get_or_create) the first time the school opts in — see
    enable_self_sms_tracking in sms_self_tracker_views.py.
    """
    school = models.OneToOneField(
        'schools.School', on_delete=models.CASCADE, related_name='sms_self_tracker'
    )
    enabled = models.BooleanField(
        default=False,
        help_text="Off by default. While off, sending SMS never touches this row at all."
    )
    balance_etb = models.DecimalField(
        max_digits=10, decimal_places=2, default=Decimal('0'),
        help_text="Self-reported — the school enters this after topping up on Afro Message directly. Not a live balance."
    )
    low_threshold_etb = models.DecimalField(
        max_digits=10, decimal_places=2, default=Decimal('50.00'),
        validators=[MinValueValidator(0)],
        help_text="School-chosen alert threshold for THEIR OWN tracker (independent of the platform wallet's global threshold)."
    )
    estimated_cost_per_sms = models.DecimalField(
        max_digits=6, decimal_places=4, default=Decimal('0.25'),
        validators=[MinValueValidator(0)],
        help_text="School's own estimate of what Afro Message charges them per SMS. Used only to count this tracker down — never used for billing."
    )
    updated_at = models.DateTimeField(auto_now=True)

    @classmethod
    def get_or_create_for_school(cls, school):
        obj, _ = cls.objects.get_or_create(school=school)
        return obj

    def is_low(self):
        return self.enabled and self.balance_etb <= self.low_threshold_etb

    def __str__(self):
        return f"{self.school.name} self-tracked SMS balance: {self.balance_etb} ETB ({'on' if self.enabled else 'off'})"
