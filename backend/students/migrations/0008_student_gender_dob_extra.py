from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('students', '0007_document_review_and_requests'),
    ]

    operations = [
        migrations.AddField(
            model_name='student',
            name='gender',
            field=models.CharField(blank=True, choices=[('Male', 'Male'), ('Female', 'Female')], default='', max_length=10),
        ),
        migrations.AddField(
            model_name='student',
            name='date_of_birth',
            field=models.CharField(blank=True, default='', help_text='As recorded, e.g. 15/8/2008 (Ethiopian calendar)', max_length=20),
        ),
        migrations.AddField(
            model_name='student',
            name='extra_info',
            field=models.JSONField(blank=True, default=dict),
        ),
    ]
