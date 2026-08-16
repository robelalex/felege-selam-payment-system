# Generated manually — Jimma item 6 (School location field).
# Adds region/city/latitude/longitude (all optional) plus a location_public
# flag that defaults to False. See models.py comment on School for why the
# flag exists even though nothing reads it yet — no destructive change to
# the existing `address` field, this is purely additive.
from django.db import migrations, models
import django.core.validators


class Migration(migrations.Migration):

    dependencies = [
        ('schools', '0016_school_naming_convention'),
    ]

    operations = [
        migrations.AddField(
            model_name='school',
            name='region',
            field=models.CharField(blank=True, help_text='e.g. Oromia, Addis Ababa', max_length=100),
        ),
        migrations.AddField(
            model_name='school',
            name='city',
            field=models.CharField(blank=True, help_text='e.g. Jimma', max_length=100),
        ),
        migrations.AddField(
            model_name='school',
            name='latitude',
            field=models.DecimalField(
                blank=True, null=True, max_digits=9, decimal_places=6,
                help_text='GPS latitude, optional',
                validators=[
                    django.core.validators.MinValueValidator(-90),
                    django.core.validators.MaxValueValidator(90),
                ],
            ),
        ),
        migrations.AddField(
            model_name='school',
            name='longitude',
            field=models.DecimalField(
                blank=True, null=True, max_digits=9, decimal_places=6,
                help_text='GPS longitude, optional',
                validators=[
                    django.core.validators.MinValueValidator(-180),
                    django.core.validators.MaxValueValidator(180),
                ],
            ),
        ),
        migrations.AddField(
            model_name='school',
            name='location_public',
            field=models.BooleanField(
                default=False,
                help_text=(
                    "Whether region/city/coordinates may be shown outside this "
                    "school's own admin/staff and super admins. Not currently used "
                    "by any endpoint — reserved for a future public-facing feature. "
                    "Leave False unless specifically told to enable a public page."
                ),
            ),
        ),
    ]
