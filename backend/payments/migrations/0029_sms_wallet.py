# ✅ NEW (requested): the SMS wallet / reseller feature. Four new
# tables, none of which touch any existing table — fully additive.
from decimal import Decimal

import django.db.models.deletion
import django.utils.timezone
from django.conf import settings
from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
        ('schools', '0015_schoolbankaccount'),
        ('payments', '0028_settlement_receipt_workflow'),
    ]

    operations = [
        migrations.CreateModel(
            name='SMSPricingSettings',
            fields=[
                ('id', models.AutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('cost_per_sms', models.DecimalField(decimal_places=4, default=Decimal('0.25'), max_digits=6,
                    help_text='What the SMS gateway actually charges the developer per message (ETB).')),
                ('markup_percentage', models.DecimalField(decimal_places=4, default=Decimal('0.5'), max_digits=5,
                    help_text='e.g. 0.50 = schools are charged 1.5x the developer\'s real cost.')),
                ('low_balance_threshold_etb', models.DecimalField(decimal_places=2, default=Decimal('50.00'), max_digits=8,
                    help_text='A school\'s wallet is flagged \'low\' at or below this ETB balance, across all platform-managed schools.')),
                ('platform_api_key', models.CharField(blank=True, max_length=255,
                    help_text='The DEVELOPER\'S OWN Afro Message API key, shared across every platform-managed school. Schools with their own key configured never use this.')),
                ('updated_at', models.DateTimeField(auto_now=True)),
                ('updated_by', models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, to=settings.AUTH_USER_MODEL)),
            ],
        ),
        migrations.CreateModel(
            name='SchoolSMSWallet',
            fields=[
                ('id', models.AutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('balance_etb', models.DecimalField(decimal_places=2, default=Decimal('0'), max_digits=10)),
                ('updated_at', models.DateTimeField(auto_now=True)),
                ('school', models.OneToOneField(on_delete=django.db.models.deletion.CASCADE, related_name='sms_wallet', to='schools.school')),
            ],
        ),
        migrations.CreateModel(
            name='SMSWalletTopUp',
            fields=[
                ('id', models.AutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('amount', models.DecimalField(decimal_places=2, max_digits=10)),
                ('note', models.CharField(blank=True, max_length=255)),
                ('receipt', models.ImageField(blank=True, null=True, upload_to='sms_wallet_receipts/%Y/%m/')),
                ('status', models.CharField(choices=[('pending', 'Pending Review'), ('confirmed', 'Confirmed'), ('rejected', 'Rejected')], default='pending', max_length=20)),
                ('rejection_reason', models.CharField(blank=True, max_length=255)),
                ('reviewed_at', models.DateTimeField(blank=True, null=True)),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('school', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='sms_wallet_topups', to='schools.school')),
                ('submitted_by', models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name='submitted_sms_topups', to=settings.AUTH_USER_MODEL)),
                ('recorded_by', models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name='recorded_sms_topups', to=settings.AUTH_USER_MODEL)),
            ],
            options={'ordering': ['-created_at']},
        ),
        migrations.CreateModel(
            name='SMSUsageRecord',
            fields=[
                ('id', models.AutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('related_to', models.CharField(blank=True, help_text="e.g. 'payment_reminder', 'test_credentials'", max_length=100)),
                ('price_charged', models.DecimalField(decimal_places=4, max_digits=6)),
                ('cost_to_platform', models.DecimalField(decimal_places=4, max_digits=6)),
                ('success', models.BooleanField(default=True)),
                ('created_at', models.DateTimeField(default=django.utils.timezone.now)),
                ('school', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='sms_usage_records', to='schools.school')),
            ],
            options={'ordering': ['-created_at']},
        ),
    ]