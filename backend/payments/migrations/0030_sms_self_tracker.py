# ✅ NEW (requested): optional self-reported SMS balance tracker for
# self-managed schools. One new table, fully additive — does not alter
# any existing table, does not touch SchoolSMSWallet or any billing
# model at all.
from decimal import Decimal

import django.db.models.deletion
from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('schools', '0015_schoolbankaccount'),
        ('payments', '0029_sms_wallet'),
    ]

    operations = [
        migrations.CreateModel(
            name='SchoolSMSSelfTracker',
            fields=[
                ('id', models.AutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('enabled', models.BooleanField(default=False,
                    help_text='Off by default. While off, sending SMS never touches this row at all.')),
                ('balance_etb', models.DecimalField(decimal_places=2, default=Decimal('0'), max_digits=10,
                    help_text='Self-reported — the school enters this after topping up on Afro Message directly. Not a live balance.')),
                ('low_threshold_etb', models.DecimalField(decimal_places=2, default=Decimal('50.00'), max_digits=10,
                    help_text="School-chosen alert threshold for THEIR OWN tracker (independent of the platform wallet's global threshold).")),
                ('estimated_cost_per_sms', models.DecimalField(decimal_places=4, default=Decimal('0.25'), max_digits=6,
                    help_text="School's own estimate of what Afro Message charges them per SMS. Used only to count this tracker down — never used for billing.")),
                ('updated_at', models.DateTimeField(auto_now=True)),
                ('school', models.OneToOneField(on_delete=django.db.models.deletion.CASCADE, related_name='sms_self_tracker', to='schools.school')),
            ],
        ),
    ]
