# schools/migrations/0020_platformpayment.py
import django.db.models.deletion
from django.conf import settings
from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('schools', '0019_school_director_signature_school_school_stamp'),
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
    ]

    operations = [
        migrations.CreateModel(
            name='PlatformPayment',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('amount', models.DecimalField(decimal_places=2, max_digits=12)),
                ('method', models.CharField(
                    choices=[
                        ('chapa', 'Chapa (online)'),
                        ('bank_transfer', 'Bank Transfer'),
                        ('cash', 'Cash'),
                        ('other', 'Other'),
                    ],
                    default='bank_transfer',
                    max_length=20,
                )),
                ('period_months', models.PositiveIntegerField(
                    default=1, help_text='How many months of access this payment covers',
                )),
                ('paid_on', models.DateField(help_text='Date the school actually paid')),
                ('note', models.CharField(blank=True, max_length=255)),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('school', models.ForeignKey(
                    on_delete=django.db.models.deletion.CASCADE,
                    related_name='platform_payments',
                    to='schools.school',
                )),
                ('recorded_by', models.ForeignKey(
                    blank=True, null=True,
                    on_delete=django.db.models.deletion.SET_NULL,
                    related_name='platform_payments_recorded',
                    to=settings.AUTH_USER_MODEL,
                )),
            ],
            options={
                'ordering': ['-paid_on', '-created_at'],
            },
        ),
    ]
