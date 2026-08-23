# ✅ SECURITY FIX: adds OTP brute-force lockout tracking to UserProfile.
# Purely additive — both new fields have safe defaults (0 / null), so
# this does not touch or reinterpret any existing row and is safe to
# run on a live database with no downtime.
from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('authentication', '0006_userprofile_salutation'),
    ]

    operations = [
        migrations.AddField(
            model_name='userprofile',
            name='otp_attempts',
            field=models.PositiveSmallIntegerField(default=0),
        ),
        migrations.AddField(
            model_name='userprofile',
            name='otp_locked_until',
            field=models.DateTimeField(blank=True, null=True),
        ),
    ]
