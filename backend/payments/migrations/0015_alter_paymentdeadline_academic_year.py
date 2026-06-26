from django.db import migrations, models
import django.db.models.deletion

class Migration(migrations.Migration):
    dependencies = [
        ('payments', '0014_prepare_academic_year_data'),
        ('academics', '0004_academicyear_is_archived'),
    ]

    operations = [
        migrations.AlterField(
            model_name='paymentdeadline',
            name='academic_year',
            field=models.ForeignKey(
                blank=True,
                null=True,
                help_text='The academic year this deadline belongs to',
                on_delete=django.db.models.deletion.CASCADE,
                related_name='payment_deadlines',
                to='academics.academicyear',
            ),
        ),
    ]