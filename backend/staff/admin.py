from django.contrib import admin
from .models import StaffMember, TeacherClassAssignment


@admin.register(StaffMember)
class StaffMemberAdmin(admin.ModelAdmin):
    list_display = ['staff_id', 'first_name', 'last_name', 'role', 'school', 'status', 'hire_date']
    list_filter = ['role', 'status', 'school']
    search_fields = ['staff_id', 'first_name', 'last_name', 'phone', 'email']


@admin.register(TeacherClassAssignment)
class TeacherClassAssignmentAdmin(admin.ModelAdmin):
    list_display = ['staff', 'grade', 'section', 'subject', 'school', 'academic_year', 'is_active']
    list_filter = ['grade', 'school', 'is_active']
