from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('common', '0001_initial'),
    ]

    operations = [
        migrations.AlterField(
            model_name='auditlog',
            name='action',
            field=models.CharField(
                max_length=50,
                choices=[
                    ('LOGIN', 'Login'),
                    ('LOGOUT', 'Logout'),
                    ('PAYMENT_VERIFY', 'Payment Verification'),
                    ('STUDENT_CREATE', 'Student Created'),
                    ('STUDENT_EDIT', 'Student Edited'),
                    ('STUDENT_DELETE', 'Student Deleted'),
                    ('DEADLINE_CREATE', 'Deadline Created'),
                    ('DEADLINE_EDIT', 'Deadline Edited'),
                    ('DEADLINE_DELETE', 'Deadline Deleted'),
                    ('SLIP_VERIFY', 'Slip Verified'),
                    ('SLIP_REJECT', 'Slip Rejected'),
                    ('SCHOOL_APPROVE', 'School Approved'),
                    ('SCHOOL_REJECT', 'School Rejected'),
                    ('SETTINGS_CHANGE', 'Settings Changed'),
                    ('STAFF_CREATE', 'Staff Member Added'),
                    ('STAFF_EDIT', 'Staff Member Edited'),
                    ('STAFF_DELETE', 'Staff Member Removed'),
                    ('STAFF_LOGIN_GRANTED', 'Staff Login Granted'),
                    ('STAFF_LOGIN_REVOKED', 'Staff Login Revoked'),
                ],
            ),
        ),
    ]
