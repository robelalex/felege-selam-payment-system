# ✅ NEW (requested): school-admin-initiated settlements with a
# receipt upload, reviewed and confirmed/rejected by the super admin,
# instead of the super admin typing in an already-"settled" row with
# no proof. Existing PlatformFeeSettlement rows all get status
# migrated implicitly to the new field's default ('confirmed') below
# via a data migration, so historical totals don't change — only new
# settlements go through pending review.
from django.conf import settings
import django.db.models.deletion
from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
        ('payments', '0027_platform_developer_fees'),
    ]

    operations = [
        migrations.AddField(
            model_name='platformfeesettlement',
            name='receipt',
            field=models.ImageField(
                blank=True, null=True, upload_to='developer_fee_receipts/%Y/%m/',
                help_text='Screenshot or photo of the bank transfer / payment receipt, uploaded by the school admin.',
            ),
        ),
        migrations.AddField(
            model_name='platformfeesettlement',
            name='status',
            field=models.CharField(
                choices=[('pending', 'Pending Review'), ('confirmed', 'Confirmed'), ('rejected', 'Rejected')],
                default='confirmed', max_length=20,
            ),
        ),
        migrations.AddField(
            model_name='platformfeesettlement',
            name='rejection_reason',
            field=models.CharField(blank=True, max_length=255),
        ),
        migrations.AddField(
            model_name='platformfeesettlement',
            name='submitted_by',
            field=models.ForeignKey(
                blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL,
                related_name='submitted_fee_settlements', to=settings.AUTH_USER_MODEL,
                help_text='School admin who submitted this settlement claim, if submitted from the school side.',
            ),
        ),
        migrations.AddField(
            model_name='platformfeesettlement',
            name='reviewed_at',
            field=models.DateTimeField(blank=True, null=True),
        ),
        migrations.AlterField(
            model_name='platformfeesettlement',
            name='recorded_by',
            field=models.ForeignKey(
                blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL,
                related_name='recorded_fee_settlements', to=settings.AUTH_USER_MODEL,
                help_text='Super admin who confirmed or rejected this settlement.',
            ),
        ),
    ]