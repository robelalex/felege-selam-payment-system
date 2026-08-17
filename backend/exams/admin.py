from django.contrib import admin
from .models import Term, Semester, AssessmentType, Mark, DailyAttendance


@admin.register(Semester)
class SemesterAdmin(admin.ModelAdmin):
    list_display = ['name', 'school', 'academic_year', 'order', 'is_active']
    list_filter = ['school', 'academic_year', 'is_active']


@admin.register(Term)
class TermAdmin(admin.ModelAdmin):
    list_display = ['name', 'school', 'academic_year', 'semester', 'order', 'is_active']
    list_filter = ['school', 'academic_year', 'is_active']


@admin.register(AssessmentType)
class AssessmentTypeAdmin(admin.ModelAdmin):
    list_display = ['name', 'school', 'academic_year', 'max_score', 'weight_percent', 'is_active']
    list_filter = ['school', 'academic_year', 'is_active']


@admin.register(Mark)
class MarkAdmin(admin.ModelAdmin):
    list_display = ['student', 'subject', 'assessment_type', 'score', 'status', 'grade', 'section']
    list_filter = ['school', 'academic_year', 'subject', 'status', 'grade']
    search_fields = ['student__first_name', 'student__last_name', 'student__student_id']


@admin.register(DailyAttendance)
class DailyAttendanceAdmin(admin.ModelAdmin):
    list_display = ['student', 'date', 'status', 'grade', 'section']
    list_filter = ['school', 'academic_year', 'date', 'status', 'grade']
    search_fields = ['student__first_name', 'student__last_name', 'student__student_id']
