# Generated manually — Jimma item 5 (Staff/Teacher/Admin HR):
# salutation for accounts with no linked StaffMember (self-registered
# school_admin).
from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('authentication', '0005_userprofile_photo'),
    ]

    operations = [
        migrations.AddField(
            model_name='userprofile',
            name='salutation',
            field=models.CharField(
                blank=True,
                choices=[('mr', 'Mr.'), ('mrs', 'Mrs.'), ('ms', 'Ms.'), ('dr', 'Dr.')],
                max_length=10,
            ),
        ),
    ]
