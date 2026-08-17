# report_cards/admin.py
from django.contrib import admin
from .models import ReportCard


@admin.register(ReportCard)
class ReportCardAdmin(admin.ModelAdmin):
    list_display = (
        'student', 'report_type', 'term', 'semester', 'academic_year', 'status',
        'grade', 'section', 'overall_average', 'homeroom_rank', 'generated_at',
    )
    list_filter = ('report_type', 'status', 'academic_year', 'grade')
    search_fields = ('student__first_name', 'student__last_name', 'student__student_id')
    readonly_fields = (
        'snapshot_data', 'pdf_file', 'access_token', 'generated_at', 'released_at',
    )
    autocomplete_fields = ['student']
