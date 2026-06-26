from django.db import migrations

def prepare_columns(apps, schema_editor):
    with schema_editor.connection.cursor() as cursor:
        # a) Add temp column
        cursor.execute("""
            ALTER TABLE payments_paymentdeadline
            ADD COLUMN IF NOT EXISTS academic_year_new_id INTEGER NULL;
        """)

        # b) Match by name
        cursor.execute("""
            UPDATE payments_paymentdeadline pd
            SET academic_year_new_id = ay.id
            FROM academics_academicyear ay
            WHERE ay.name = pd.academic_year AND ay.school_id = pd.school_id;
        """)

        # c) Fallback match by year_ec
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
                COUNT(*) FILTER (WHERE academic_year_new_id IS NULL) AS unmatched
            FROM payments_paymentdeadline;
        """)
        row = cursor.fetchone()
        print(f"\n✅ Step 1: {row[0]} deadlines matched, {row[1]} unmatched")

        # e) Drop NOT NULL and clear old text column
        cursor.execute("""
            ALTER TABLE payments_paymentdeadline
            ALTER COLUMN academic_year DROP NOT NULL;
        """)
        cursor.execute("""
            UPDATE payments_paymentdeadline SET academic_year = NULL;
        """)
        print("✅ Step 1: old academic_year text column cleared")

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
        migrations.RunPython(prepare_columns, reverse_code=reverse_migration),
    ]