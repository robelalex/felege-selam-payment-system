# schools/bank_account_models.py
#
# Separate file imported by schools/models.py so the diff against the
# existing large models.py stays minimal. The old flat fields
# (bank_name, bank_account_number, bank_account_holder) are kept on
# School for backward compatibility — existing code and old data still
# work. SchoolBankAccount is the new structured table; anything new
# should use it instead of the flat fields.
from django.db import models


class SchoolBankAccount(models.Model):
    """
    One row per bank account a school accepts payments into.
    A school with a CBE deal AND an Ahadu deal has two rows, each
    visible to parents as a payment option.
    """
    BANK_CHOICES = [
        ('cbe', 'Commercial Bank of Ethiopia (CBE)'),
        ('awash', 'Awash Bank'),
        ('dashen', 'Dashen Bank'),
        ('abyssinia', 'Bank of Abyssinia'),
        ('ahadu', 'Ahadu Bank'),
        ('nib', 'Nib International Bank'),
        ('coop_oromia', 'Cooperative Bank of Oromia'),
        ('zemen', 'Zemen Bank'),
        ('berhan', 'Berhan Bank'),
        ('wegagen', 'Wegagen Bank'),
        ('amhara', 'Amhara Bank'),
        ('debub', 'Debub Global Bank'),
        ('abay', 'Abay Bank'),
        ('oromia', 'Oromia Bank'),
        ('sidama', 'Sidama Bank'),
        ('enat', 'Enat Bank'),
        ('addis_international', 'Addis International Bank'),
        ('united', 'United Bank'),
        ('telebirr', 'Telebirr (Ethio Telecom)'),
        ('mpesa', 'M-Pesa'),
        ('other', 'Other'),
    ]

    school = models.ForeignKey(
        'schools.School', on_delete=models.CASCADE,
        related_name='bank_accounts',
    )
    bank_code = models.CharField(
        max_length=30, choices=BANK_CHOICES, default='cbe',
        help_text='Which bank or wallet this account belongs to',
    )
    # Free-text override so a school can say "Telebirr via CBE Birr"
    # or anything Chapa doesn't cover; ignored when bank_code is not 'other'.
    bank_name_override = models.CharField(
        max_length=100, blank=True,
        help_text='Custom bank name — only needed when bank_code is "other"',
    )
    account_number = models.CharField(max_length=50)
    account_holder = models.CharField(max_length=200)
    # Human-readable label parents see, e.g. "Main school account (CBE)"
    display_label = models.CharField(
        max_length=150, blank=True,
        help_text='Optional label shown to parents, e.g. "Main fee account (CBE)"',
    )
    is_primary = models.BooleanField(
        default=False,
        help_text='Mark one account as the default/primary. Used when the parent '
                  'app doesn\'t show a picker and just needs one account to display.',
    )
    is_active = models.BooleanField(default=True)
    # Optional: flag for Verify.ET-compatible CBE accounts
    supports_auto_verify = models.BooleanField(
        default=False,
        help_text='True only for CBE accounts that have Verify.ET configured — '
                  'slips for this account can be auto-verified without manual review.',
    )
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['-is_primary', 'bank_code']
        verbose_name = 'Bank Account'
        verbose_name_plural = 'Bank Accounts'
        constraints = [
            # Only one primary account per school.
            models.UniqueConstraint(
                fields=['school', 'is_primary'],
                condition=models.Q(is_primary=True),
                name='unique_primary_bank_account_per_school',
            )
        ]

    def __str__(self):
        label = self.display_label or f"{self.get_bank_code_display()} — {self.account_number}"
        return f"{self.school.name}: {label}"

    @property
    def bank_name(self):
        """Resolved display name — uses choice label, falls back to override."""
        if self.bank_code == 'other':
            return self.bank_name_override or 'Other Bank'
        return self.get_bank_code_display()

    def to_parent_dict(self):
        """Serialise to a dict safe to return to the parent mobile app."""
        return {
            'id': self.id,
            'bank_name': self.bank_name,
            'account_number': self.account_number,
            'account_holder': self.account_holder,
            'display_label': self.display_label or self.bank_name,
            'is_primary': self.is_primary,
            'supports_auto_verify': self.supports_auto_verify,
        }
