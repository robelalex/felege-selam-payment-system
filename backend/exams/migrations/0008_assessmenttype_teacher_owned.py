from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):

    dependencies = [
        ('academics', '0007_subject_grade_alter_subject_options_and_more'),
        ('staff', '0005_rename_staff_staff_staff_i_c9d4e2_idx_staff_staff_staff_i_500544_idx_and_more'),
        ('exams', '0007_semester_term_semester_studentsemesterresult_and_more'),
    ]

    operations = [
        migrations.AddField(
            model_name='assessmenttype',
            name='subject',
            field=models.ForeignKey(
                blank=True, null=True, on_delete=django.db.models.deletion.CASCADE,
                related_name='assessment_types', to='academics.subject',
                help_text='The subject this assignment belongs to (empty = every subject)',
            ),
        ),
        migrations.AddField(
            model_name='assessmenttype',
            name='section',
            field=models.CharField(
                blank=True, default='', max_length=10,
                help_text='The section it applies to (empty = the whole grade)',
            ),
        ),
        migrations.AddField(
            model_name='assessmenttype',
            name='created_by',
            field=models.ForeignKey(
                blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL,
                related_name='created_assessments', to='staff.staffmember',
                help_text='The teacher who created it (empty = created before teachers could)',
            ),
        ),
        migrations.RemoveConstraint(
            model_name='assessmenttype',
            name='unique_active_assessment_type_per_term',
        ),
        migrations.AddConstraint(
            model_name='assessmenttype',
            constraint=models.UniqueConstraint(
                condition=models.Q(('is_active', True)),
                fields=('school', 'academic_year', 'term', 'name', 'grade', 'subject', 'section', 'created_by'),
                name='unique_active_assessment_type_per_term',
            ),
        ),
    ]
