# Generated manually — follows the same style as 0024_registration_fees.py
#
# Adds a third registration billing tier: "transferred from another
# school". Requested after Jimma flagged that auto-detection was
# marking every promoted student as "new" — for a school digitizing
# paper records mid-way, most students simply have no prior-year
# Payment rows in this system yet, so the "has a verified payment in
# a strictly earlier year" heuristic can't tell them apart from an
# actual first-time student, or from a genuine transfer-in. Admins now
# get a distinct, separately-priced "Transferred" bucket instead of
# being forced to mis-classify those students as either New or
# Continuing just to get billing to work.

import django.core.validators
from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('payments', '0025_rename_payments_st_student_c1f4a1_idx_payments_st_student_412523_idx'),
    ]

    operations = [
        migrations.AddField(
            model_name='registrationfeeconfig',
            name='transferred_student_amount',
            field=models.DecimalField(
                blank=True,
                decimal_places=2,
                help_text=(
                    "One-time registration fee for a student TRANSFERRED IN from "
                    "another school this academic year. Leave blank if not yet "
                    "decided — transferred students won't be charged until this is set."
                ),
                max_digits=10,
                null=True,
                validators=[django.core.validators.MinValueValidator(0)],
            ),
        ),
        migrations.AlterField(
            model_name='studentregistrationtype',
            name='registration_type',
            field=models.CharField(
                choices=[
                    ('new', 'New Student'),
                    ('continuing', 'Continuing/Senior Student'),
                    ('transferred', 'Transferred from Another School'),
                ],
                max_length=20,
            ),
        ),
    ]