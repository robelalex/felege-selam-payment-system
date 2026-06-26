from django.db import migrations

def copy_fk_data(apps, schema_editor):
    with schema_editor.connection.cursor() as cursor:
        cursor.execute("""
            UPDATE payments_paymentdeadline
            SET academic_year_id = academic_year_new_id;
        """)

        cursor.execute("""
            SELECT COUNT(*) FROM payments_paymentdeadline
            WHERE academic_year_id IS NOT NULL;
        """)
        count = cursor.fetchone()[0]
        print(f"\n✅ Step 3: {count} deadlines now have academic_year_id set correctly")

class Migration(migrations.Migration):
    dependencies = [
        ('payments', '0015_alter_paymentdeadline_academic_year'),
    ]

    operations = [
        migrations.RunPython(copy_fk_data, reverse_code=migrations.RunPython.noop),
    ]