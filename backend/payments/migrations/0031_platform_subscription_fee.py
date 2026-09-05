# ✅ NEW (requested): platform subscription fee (per-active-student,
# per-month) — a new field on the existing PlatformFeeSettings singleton,
# plus a new PlatformSubscriptionCharge table. Additive only: does not
# alter PlatformFeeSettlement, Payment, or any other billing model.
from decimal import Decimal

import django.db.models.deletion
from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('schools', '0015_schoolbankaccount'),
        ('payments', '0030_sms_self_tracker'),
    ]

    operations = [
        migrations.AddField(
            model_name='platformfeesettings',
            name='platform_subscription_fee_per_student',
            field=models.DecimalField(decimal_places=2, default=Decimal('25.00'), max_digits=6,
                help_text='Platform subscription fee (ETB) charged per active student, per month.'),
        ),
        migrations.CreateModel(
            name='PlatformSubscriptionCharge',
            fields=[
                ('id', models.AutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('month', models.DateField(help_text='First day of the billing month, e.g. 2026-09-01')),
                ('student_count', models.PositiveIntegerField()),
                ('rate_per_student', models.DecimalField(decimal_places=2, max_digits=6)),
                ('amount', models.DecimalField(decimal_places=2, max_digits=10)),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('school', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='subscription_charges', to='schools.school')),
            ],
            options={
                'ordering': ['-month'],
                'unique_together': {('school', 'month')},
            },
        ),
    ]
