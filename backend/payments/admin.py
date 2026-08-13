from django.contrib import admin
from .models import (
    Payment, PaymentDeadline, PaymentReminder, StudentFeeOverride,
    RegistrationFeeConfig, StudentRegistrationType,
)

@admin.register(Payment)
class PaymentAdmin(admin.ModelAdmin):
    list_display = ['student', 'deadline', 'amount', 'status', 'created_at']
    list_filter = ['status', 'payment_method']
    search_fields = ['student__student_id', 'transaction_reference']

@admin.register(PaymentDeadline)
class PaymentDeadlineAdmin(admin.ModelAdmin):
    list_display = ['academic_year', 'deadline_type', 'month', 'due_date', 'amount', 'is_active']
    list_filter = ['academic_year', 'deadline_type', 'is_active']

@admin.register(PaymentReminder)
class PaymentReminderAdmin(admin.ModelAdmin):
    list_display = ['student', 'deadline', 'sent_at', 'status']
@admin.register(StudentFeeOverride)
class StudentFeeOverrideAdmin(admin.ModelAdmin):
    list_display = ['student', 'academic_year', 'override_type', 'amount', 'is_active', 'created_at']
    list_filter = ['override_type', 'is_active', 'academic_year']
    search_fields = ['student__student_id', 'student__first_name', 'student__last_name']

@admin.register(RegistrationFeeConfig)
class RegistrationFeeConfigAdmin(admin.ModelAdmin):
    list_display = ['school', 'academic_year', 'new_student_amount', 'continuing_student_amount', 'updated_at']
    list_filter = ['academic_year']

@admin.register(StudentRegistrationType)
class StudentRegistrationTypeAdmin(admin.ModelAdmin):
    list_display = ['student', 'academic_year', 'registration_type', 'is_manual_override', 'created_at']
    list_filter = ['registration_type', 'is_manual_override', 'academic_year']
    search_fields = ['student__student_id', 'student__first_name', 'student__last_name']
