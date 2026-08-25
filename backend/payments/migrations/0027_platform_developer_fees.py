# ✅ NEW (requested): developer usage fee tracking. Purely additive —
# platform_fee_amount defaults to null on every existing Payment row
# (meaning "not applicable / predates this feature", never recomputed
# retroactively), and the two new models start empty. Safe to run on a
# live database with no downtime and no effect on existing payments,
# receipts, or reports.
from django.conf import settings
import django.core.validators
import django.db.models.deletion
from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
        ('schools', '0021_encrypt_chapa_credentials'),
        ('payments', '0026_registration_transferred_type'),
    ]

    operations = [
        migrations.AddField(
            model_name='payment',
            name='platform_fee_amount',
            field=models.DecimalField(
                blank=True, decimal_places=2, max_digits=10, null=True,
                help_text='Developer usage fee owed for this payment, snapshotted at verification time. Null = not yet computed (payment isn\'t verified) or fees weren\'t configured yet.',
            ),
        ),
        migrations.CreateModel(
            name='PlatformFeeSettings',
            fields=[
                ('id', models.AutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('monthly_payment_fee', models.DecimalField(decimal_places=2, default=5.0, max_digits=6, help_text='Developer usage fee (ETB) charged per verified MONTHLY tuition payment.')),
                ('registration_payment_fee', models.DecimalField(decimal_places=2, default=2.0, max_digits=6, help_text='Developer usage fee (ETB) charged per verified REGISTRATION (one-time) payment.')),
                ('updated_at', models.DateTimeField(auto_now=True)),
                ('updated_by', models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, to=settings.AUTH_USER_MODEL, help_text='Which super admin last changed these rates.')),
            ],
        ),
        migrations.CreateModel(
            name='PlatformFeeSettlement',
            fields=[
                ('id', models.AutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('amount', models.DecimalField(decimal_places=2, max_digits=10, validators=[django.core.validators.MinValueValidator(0)])),
                ('note', models.CharField(blank=True, help_text="e.g. 'Bank transfer, CBE, 12 Sep 2026'", max_length=255)),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('recorded_by', models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, to=settings.AUTH_USER_MODEL)),
                ('school', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='fee_settlements', to='schools.school')),
            ],
            options={'ordering': ['-created_at']},
        ),
    ]
