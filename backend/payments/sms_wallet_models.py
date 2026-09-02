# backend/payments/sms_wallet_models.py
#
# ✅ NEW (requested): the "SMS reseller" business model — the developer
# runs one shared SMS gateway account, schools prepay into a wallet,
# and every SMS sent through the PLATFORM'S account is billed to that
# wallet at a marked-up price (developer's real cost + a margin).
#
# IMPORTANT — this only applies to schools who don't already bring
# their own Afro Message API key. Schools that configured their own
# key in School Settings keep paying Afro Message directly, exactly as
# before — nothing changes for them, and the platform earns nothing
# from (and bears no cost for) their SMS. This is a genuine opt-in
# value-add, not something forced onto existing schools. See
# payments/services/multi_school_sms_service.py for where this
# decision actually gets made at send-time.
#
# Separate file, imported by payments/models.py, following the same
# pattern as schools/bank_account_models.py — keeps the diff against
# the already-large models.py minimal.
from decimal import Decimal

from django.core.validators import MinValueValidator
from django.db import models
from django.utils import timezone


class SMSPricingSettings(models.Model):
    """
    Singleton (always exactly one row) — the super admin's control panel
    for the SMS reseller business. Mirrors PlatformFeeSettings' "system
    calculates, school pays developer directly" philosophy: this table
    only holds numbers and the platform's own gateway credentials —
    nothing here ever moves money by itself.
    """
    cost_per_sms = models.DecimalField(
        max_digits=6, decimal_places=4, default=Decimal('0.25'),
        validators=[MinValueValidator(0)],
        help_text="What the SMS gateway actually charges the developer per message (ETB)."
    )
    markup_percentage = models.DecimalField(
        max_digits=5, decimal_places=4, default=Decimal('0.5'),
        validators=[MinValueValidator(0)],
        help_text="e.g. 0.50 = schools are charged 1.5x the developer's real cost."
    )
    low_balance_threshold_etb = models.DecimalField(
        max_digits=8, decimal_places=2, default=Decimal('50.00'),
        validators=[MinValueValidator(0)],
        help_text="A school's wallet is flagged 'low' at or below this ETB balance, across all platform-managed schools."
    )
    platform_api_key = models.CharField(
        max_length=255, blank=True,
        help_text="The DEVELOPER'S OWN Afro Message API key, shared across every platform-managed school. "
                   "Schools with their own key configured never use this."
    )
    updated_by = models.ForeignKey('auth.User', on_delete=models.SET_NULL, null=True, blank=True)
    updated_at = models.DateTimeField(auto_now=True)

    @property
    def price_per_sms(self):
        return (self.cost_per_sms * (Decimal('1') + self.markup_percentage)).quantize(Decimal('0.01'))

    @classmethod
    def get_current(cls):
        obj, _ = cls.objects.get_or_create(pk=1)
        return obj

    def __str__(self):
        return f"SMS pricing: cost {self.cost_per_sms} ETB, price {self.price_per_sms} ETB"


class SchoolSMSWallet(models.Model):
    """
    One row per school that uses the platform-managed SMS path. Created
    lazily (get_or_create) the first time a school's balance is checked
    or topped up — a school that only ever uses its own Afro Message key
    will simply never have one of these, by design.
    """
    school = models.OneToOneField('schools.School', on_delete=models.CASCADE, related_name='sms_wallet')
    balance_etb = models.DecimalField(max_digits=10, decimal_places=2, default=Decimal('0'))
    updated_at = models.DateTimeField(auto_now=True)

    @classmethod
    def get_or_create_for_school(cls, school):
        obj, _ = cls.objects.get_or_create(school=school)
        return obj

    def is_low(self):
        threshold = SMSPricingSettings.get_current().low_balance_threshold_etb
        return self.balance_etb <= threshold

    def __str__(self):
        return f"{self.school.name} SMS wallet: {self.balance_etb} ETB"


class SMSWalletTopUp(models.Model):
    """
    A school prepaying into their SMS wallet — same receipt-then-confirm
    pattern as PlatformFeeSettlement in payments/models.py (school
    submits a receipt, it sits 'pending', super admin reviews and
    confirms/rejects; only 'confirmed' actually credits the wallet).
    Kept as its own model rather than reusing PlatformFeeSettlement
    because this ADDS money to a balance rather than paying down a debt
    — different direction, different meaning, worth keeping distinct in
    the database even though the review workflow looks identical.
    """
    STATUS_CHOICES = [
        ('pending', 'Pending Review'),
        ('confirmed', 'Confirmed'),
        ('rejected', 'Rejected'),
    ]

    school = models.ForeignKey('schools.School', on_delete=models.CASCADE, related_name='sms_wallet_topups')
    amount = models.DecimalField(max_digits=10, decimal_places=2, validators=[MinValueValidator(0)])
    note = models.CharField(max_length=255, blank=True)
    receipt = models.ImageField(upload_to='sms_wallet_receipts/%Y/%m/', blank=True, null=True)

    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default='pending')
    rejection_reason = models.CharField(max_length=255, blank=True)

    submitted_by = models.ForeignKey(
        'auth.User', on_delete=models.SET_NULL, null=True, blank=True,
        related_name='submitted_sms_topups',
    )
    recorded_by = models.ForeignKey(
        'auth.User', on_delete=models.SET_NULL, null=True, blank=True,
        related_name='recorded_sms_topups',
    )
    reviewed_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['-created_at']

    def __str__(self):
        return f"{self.school.name} — {self.amount} ETB top-up ({self.status})"


class SMSUsageRecord(models.Model):
    """
    ✅ NEW: one row per SMS actually sent through the platform-managed
    gateway, so both the school and the super admin can see exactly
    what was sent and what it cost — not just a single balance number
    that changes with no audit trail. Only created for platform-managed
    sends; self-managed schools (their own Afro Message key) never
    generate these, since the platform has no visibility or billing
    role in that path.
    """
    school = models.ForeignKey('schools.School', on_delete=models.CASCADE, related_name='sms_usage_records')
    related_to = models.CharField(max_length=100, blank=True, help_text="e.g. 'payment_reminder', 'test_credentials'")
    price_charged = models.DecimalField(max_digits=6, decimal_places=4)
    cost_to_platform = models.DecimalField(max_digits=6, decimal_places=4)
    success = models.BooleanField(default=True)
    created_at = models.DateTimeField(default=timezone.now)

    class Meta:
        ordering = ['-created_at']

    def __str__(self):
        return f"{self.school.name} SMS @ {self.created_at:%Y-%m-%d %H:%M}"