from django.db import migrations, models

class Migration(migrations.Migration):
    dependencies = [
        ('payments', '0016_copy_fk_data'),
    ]

    operations = [
        # Drop the temporary column safely in its own transaction
        migrations.RunSQL(
            sql="ALTER TABLE payments_paymentdeadline DROP COLUMN IF EXISTS academic_year_new_id;",
            reverse_sql="ALTER TABLE payments_paymentdeadline ADD COLUMN IF NOT EXISTS academic_year_new_id INTEGER NULL;",
        ),

        # ── PaymentSlip field cleanups ──
        migrations.AlterField(
            model_name='paymentslip',
            name='cbe_verification_notes',
            field=models.TextField(blank=True),
        ),
        migrations.AlterField(
            model_name='paymentslip',
            name='verification_error',
            field=models.TextField(blank=True),
        ),
        migrations.AlterField(
            model_name='paymentslip',
            name='verification_status',
            field=models.CharField(
                choices=[
                    ('pending', 'Pending Verification'),
                    ('queued', 'Queued for Background Check'),
                    ('verified', 'Verified by System'),
                    ('failed', 'Verification Failed'),
                    ('manual_review', 'Needs Manual Review'),
                    ('timeout', 'Verification Timed Out'),
                ],
                default='pending',
                max_length=20,
            ),
        ),
        migrations.AlterField(
            model_name='paymentslip',
            name='verified_at_system',
            field=models.DateTimeField(blank=True, null=True),
        ),
        migrations.AlterField(
            model_name='paymentslip',
            name='verify_et_amount',
            field=models.DecimalField(blank=True, decimal_places=2, max_digits=10, null=True),
        ),
        migrations.AlterField(
            model_name='paymentslip',
            name='verify_et_checked_at',
            field=models.DateTimeField(blank=True, null=True),
        ),
        migrations.AlterField(
            model_name='paymentslip',
            name='verify_et_date',
            field=models.CharField(blank=True, max_length=50),
        ),
        migrations.AlterField(
            model_name='paymentslip',
            name='verify_et_error',
            field=models.TextField(blank=True),
        ),
        migrations.AlterField(
            model_name='paymentslip',
            name='verify_et_payer_name',
            field=models.CharField(blank=True, max_length=200),
        ),
        migrations.AlterField(
            model_name='paymentslip',
            name='verify_et_receiver',
            field=models.CharField(blank=True, max_length=200),
        ),
        migrations.AlterField(
            model_name='paymentslip',
            name='verify_et_response_raw',
            field=models.JSONField(blank=True, default=dict),
        ),
        migrations.AlterField(
            model_name='paymentslip',
            name='verify_et_task_id',
            field=models.CharField(blank=True, max_length=255, null=True),
        ),
    ]