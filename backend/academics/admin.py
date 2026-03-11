from django.contrib import admin
from .models import AcademicYear, YearPromotionLog

@admin.register(AcademicYear)
class AcademicYearAdmin(admin.ModelAdmin):
    list_display = ['name', 'year_ec', 'start_date', 'end_date', 'is_current', 'is_active']
    list_filter = ['is_current', 'is_active']
    search_fields = ['name', 'year_ec']

@admin.register(YearPromotionLog)
class YearPromotionLogAdmin(admin.ModelAdmin):
    list_display = ['from_year', 'to_year', 'students_promoted', 'created_at']
    list_filter = ['from_year', 'to_year']