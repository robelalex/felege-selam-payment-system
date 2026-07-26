# Generated manually — adds UserProfile.photo (dashboard profile picture)
from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('authentication', '0004_merge_20260512_1041'),
    ]

    operations = [
        migrations.AddField(
            model_name='userprofile',
            name='photo',
            field=models.ImageField(
                blank=True,
                null=True,
                upload_to='profile_photos/%Y/%m/',
                help_text='Profile photo shown in the dashboard header',
            ),
        ),
    ]
