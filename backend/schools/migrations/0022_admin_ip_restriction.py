from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('schools', '0021_encrypt_chapa_credentials'),
    ]

    operations = [
        migrations.AddField(
            model_name='school',
            name='admin_ip_restriction_enabled',
            field=models.BooleanField(default=False),
        ),
        migrations.AddField(
            model_name='school',
            name='admin_allowed_ip_list',
            field=models.JSONField(default=list, blank=True),
        ),
    ]
