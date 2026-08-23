# ✅ SECURITY FIX: switches chapa_api_key, chapa_webhook_secret, and
# verify_et_api_key from plain CharField(200) to EncryptedCharField
# (a TextField under the hood — see common/encrypted_fields.py).
#
# This is a column TYPE change (varchar -> text) but NOT a data
# migration: existing plain-text values are left exactly as they are
# in the database. They keep reading back correctly (the field falls
# back to plaintext for any value that isn't a valid Fernet token) and
# will start being written back encrypted the next time each row is
# saved, once FIELD_ENCRYPTION_KEY is configured in your environment.
# Safe to run on a live database with no downtime and no data loss.
from django.db import migrations
import common.encrypted_fields


class Migration(migrations.Migration):

    dependencies = [
        ('schools', '0020_platformpayment'),
    ]

    operations = [
        migrations.AlterField(
            model_name='school',
            name='chapa_api_key',
            field=common.encrypted_fields.EncryptedCharField(
                blank=True, null=True,
                help_text='Chapa API key (starts with CHASECK_)',
            ),
        ),
        migrations.AlterField(
            model_name='school',
            name='chapa_webhook_secret',
            field=common.encrypted_fields.EncryptedCharField(
                blank=True, null=True,
                help_text='Chapa webhook secret for verifying webhook requests',
            ),
        ),
        migrations.AlterField(
            model_name='school',
            name='verify_et_api_key',
            field=common.encrypted_fields.EncryptedCharField(
                blank=True, null=True,
                help_text='Verify.ET API key for this school',
            ),
        ),
    ]
