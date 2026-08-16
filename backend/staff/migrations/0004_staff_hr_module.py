# Generated manually — Jimma item 5 (Staff/Teacher/Admin HR)
import django.db.models.deletion
from django.conf import settings
from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
        ('staff', '0003_rename_staff_staff_staff_i_2f5c1a_idx_staff_staff_staff_i_d27e17_idx_and_more'),
    ]

    operations = [
        migrations.AddField(
            model_name='staffmember',
            name='salutation',
            field=models.CharField(
                blank=True,
                choices=[('mr', 'Mr.'), ('mrs', 'Mrs.'), ('ms', 'Ms.'), ('dr', 'Dr.')],
                help_text='Title shown before the name (Mr./Mrs./Ms./Dr.) — optional',
                max_length=10,
            ),
        ),
        migrations.CreateModel(
            name='StaffDocument',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('document_type', models.CharField(
                    help_text="Admin-defined label, e.g. 'National ID', 'Teaching Credential', 'Employment Contract 2026'",
                    max_length=100,
                )),
                ('file', models.FileField(upload_to='staff_documents/%Y/%m/')),
                ('original_filename', models.CharField(blank=True, max_length=255)),
                ('notes', models.TextField(blank=True, help_text='Optional context, e.g. expiry date, issuing authority')),
                ('uploaded_at', models.DateTimeField(auto_now_add=True)),
                ('verified', models.BooleanField(default=False)),
                ('verified_at', models.DateTimeField(blank=True, null=True)),
                ('staff', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='documents', to='staff.staffmember')),
                ('uploaded_by', models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name='+', to=settings.AUTH_USER_MODEL)),
                ('verified_by', models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name='+', to=settings.AUTH_USER_MODEL)),
            ],
            options={
                'ordering': ['-uploaded_at'],
            },
        ),
        migrations.AddIndex(
            model_name='staffdocument',
            index=models.Index(fields=['staff'], name='staff_staff_staff_i_8a2c11_idx'),
        ),
        migrations.CreateModel(
            name='StaffCareerEvent',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('event_type', models.CharField(choices=[
                    ('role_change', 'Role Changed'),
                    ('title_change', 'Title Changed'),
                    ('status_change', 'Status Changed'),
                    ('salary_change', 'Salary Changed'),
                    ('note', 'Note'),
                ], max_length=20)),
                ('field_changed', models.CharField(blank=True, max_length=30)),
                ('old_value', models.CharField(blank=True, max_length=255)),
                ('new_value', models.CharField(blank=True, max_length=255)),
                ('note', models.TextField(blank=True)),
                ('is_manual', models.BooleanField(default=False)),
                ('effective_date', models.DateField(help_text='When this change took effect')),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('staff', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='career_events', to='staff.staffmember')),
                ('recorded_by', models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name='+', to=settings.AUTH_USER_MODEL)),
            ],
            options={
                'ordering': ['-effective_date', '-created_at'],
            },
        ),
        migrations.AddIndex(
            model_name='staffcareerevent',
            index=models.Index(fields=['staff'], name='staff_staff_staff_i_c9d4e2_idx'),
        ),
    ]
