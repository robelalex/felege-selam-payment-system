# payments/migrations/0014_convert_academic_year_to_fk.py
from django.db import migrations, models
import django.db.models.deletion


def prepare_columns(apps, schema_editor):
    """
    Step 1 (raw SQL):
      a) Add temp integer column
      b) Populate it by matching text → AcademicYear.id
      c) Set the old text column to NULL so AlterField won't choke on "2020 E.C."
    """
    with schema_editor.connection.cursor() as cursor:

        # a) Add temp column to hold the matched FK id
        cursor.execute("""
            ALTER TABLE payments_paymentdeadline
            ADD COLUMN IF NOT EXISTS academic_year_new_id INTEGER NULL;
        """)

        # b) Match by name (exact)
        cursor.execute("""
            UPDATE payments_paymentdeadline pd
            SET academic_year_new_id = ay.id
            FROM academics_academicyear ay
            WHERE ay.name = pd.academic_year
              AND ay.school_id = pd.school_id;
        """)

        # c) Fallback: match by 4-digit year_ec
        cursor.execute("""
            UPDATE payments_paymentdeadline pd
            SET academic_year_new_id = ay.id
            FROM academics_academicyear ay
            WHERE pd.academic_year_new_id IS NULL
              AND ay.school_id = pd.school_id
              AND ay.year_ec::text = substring(pd.academic_year FROM '(\d{4})');
        """)

        # d) Log
        cursor.execute("""
            SELECT
                COUNT(*) FILTER (WHERE academic_year_new_id IS NOT NULL) AS matched,
                COUNT(*) FILTER (WHERE academic_year_new_id IS NULL)     AS unmatched
            FROM payments_paymentdeadline;
        """)
        row = cursor.fetchone()
        print(f"\n✅ Step 1: {row[0]} deadlines matched, {row[1]} unmatched")

        # e) CRITICAL: drop NOT NULL and clear the old text column so
        #    AlterField doesn't try to cast "2020 E.C." → bigint
        cursor.execute("""
            ALTER TABLE payments_paymentdeadline
            ALTER COLUMN academic_year DROP NOT NULL;
        """)
        cursor.execute("""
            UPDATE payments_paymentdeadline
            SET academic_year = NULL;
        """)
        print("✅ Step 1: old academic_year text column cleared (ready for AlterField)")


def copy_fk_and_cleanup(apps, schema_editor):
    """
    Step 3 (raw SQL):
      Django's AlterField created academic_year_id (bigint, nullable).
      Copy our temp values in and drop the temp column.
    """
    with schema_editor.connection.cursor() as cursor:

        cursor.execute("""
            UPDATE payments_paymentdeadline
            SET academic_year_id = academic_year_new_id;
        """)

        cursor.execute("""
            ALTER TABLE payments_paymentdeadline
            DROP COLUMN IF EXISTS academic_year_new_id;
        """)

        cursor.execute("""
            SELECT COUNT(*) FROM payments_paymentdeadline
            WHERE academic_year_id IS NOT NULL;
        """)
        count = cursor.fetchone()[0]
        print(f"\n✅ Step 3: {count} deadlines now have academic_year_id set correctly")


def reverse_migration(apps, schema_editor):
    with schema_editor.connection.cursor() as cursor:
        cursor.execute("""
            ALTER TABLE payments_paymentdeadline
            DROP COLUMN IF EXISTS academic_year_new_id;
        """)


class Migration(migrations.Migration):

    dependencies = [
        ('payments', '0013_remove_paymentslip_auto_verified_and_more'),
        ('academics', '0004_academicyear_is_archived'),
    ]

    operations = [

        # ── 1. Populate temp column + NULL out the old text column ──
        migrations.RunPython(prepare_columns, reverse_code=reverse_migration),

        # ── 2. AlterField: text → FK (safe now because column is NULL) ──
        migrations.AlterField(
            model_name='paymentdeadline',
            name='academic_year',
            field=models.ForeignKey(
                blank=True,
                null=True,
                help_text='The academic year this deadline belongs to',
                on_delete=django.db.models.deletion.CASCADE,
                related_name='payment_deadlines',
                to='academics.academicyear',
            ),
        ),

        # ── 3. Copy temp → real FK column, drop temp ──
        migrations.RunPython(copy_fk_and_cleanup, reverse_code=migrations.RunPython.noop),

        # ── 4. PaymentSlip field cleanups ──
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
