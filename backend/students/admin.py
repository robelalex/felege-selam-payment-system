from django.contrib import admin
from .models import Student

@admin.register(Student)
class StudentAdmin(admin.ModelAdmin):
    list_display = ['student_id', 'full_name', 'grade', 'section', 'parent_phone', 'status']
    list_filter = ['grade', 'section', 'status']
    search_fields = ['student_id', 'first_name', 'last_name', 'parent_phone']