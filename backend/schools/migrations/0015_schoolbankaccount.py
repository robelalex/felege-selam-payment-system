# schools/migrations/0015_schoolbankaccount.py
from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):

    dependencies = [
        ('schools', '0014_school_pass_mark_alter_school_grade_scale'),
    ]

    operations = [
        migrations.CreateModel(
            name='SchoolBankAccount',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('bank_code', models.CharField(
                    choices=[
                        ('cbe', 'Commercial Bank of Ethiopia (CBE)'),
                        ('awash', 'Awash Bank'),
                        ('dashen', 'Dashen Bank'),
                        ('abyssinia', 'Bank of Abyssinia'),
                        ('ahadu', 'Ahadu Bank'),
                        ('nib', 'Nib International Bank'),
                        ('coop_oromia', 'Cooperative Bank of Oromia'),
                        ('zemen', 'Zemen Bank'),
                        ('berhan', 'Berhan Bank'),
                        ('wegagen', 'Wegagen Bank'),
                        ('amhara', 'Amhara Bank'),
                        ('debub', 'Debub Global Bank'),
                        ('abay', 'Abay Bank'),
                        ('oromia', 'Oromia Bank'),
                        ('sidama', 'Sidama Bank'),
                        ('enat', 'Enat Bank'),
                        ('addis_international', 'Addis International Bank'),
                        ('united', 'United Bank'),
                        ('telebirr', 'Telebirr (Ethio Telecom)'),
                        ('mpesa', 'M-Pesa'),
                        ('other', 'Other'),
                    ],
                    default='cbe',
                    help_text='Which bank or wallet this account belongs to',
                    max_length=30,
                )),
                ('bank_name_override', models.CharField(
                    blank=True,
                    help_text='Custom bank name — only needed when bank_code is "other"',
                    max_length=100,
                )),
                ('account_number', models.CharField(max_length=50)),
                ('account_holder', models.CharField(max_length=200)),
                ('display_label', models.CharField(
                    blank=True,
                    help_text='Optional label shown to parents, e.g. "Main fee account (CBE)"',
                    max_length=150,
                )),
                ('is_primary', models.BooleanField(
                    default=False,
                    help_text="Mark one account as the default/primary. Used when the parent app doesn't show a picker and just needs one account to display.",
                )),
                ('is_active', models.BooleanField(default=True)),
                ('supports_auto_verify', models.BooleanField(
                    default=False,
                    help_text='True only for CBE accounts that have Verify.ET configured — slips for this account can be auto-verified without manual review.',
                )),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('school', models.ForeignKey(
                    on_delete=django.db.models.deletion.CASCADE,
                    related_name='bank_accounts',
                    to='schools.school',
                )),
            ],
            options={
                'verbose_name': 'Bank Account',
                'verbose_name_plural': 'Bank Accounts',
                'ordering': ['-is_primary', 'bank_code'],
            },
        ),
        migrations.AddConstraint(
            model_name='schoolbankaccount',
            constraint=models.UniqueConstraint(
                condition=models.Q(is_primary=True),
                fields=['school', 'is_primary'],
                name='unique_primary_bank_account_per_school',
            ),
        ),
    ]
