from django.contrib import admin
from .models import Payment, PaymentDeadline, PaymentReminder, StudentFeeOverride

@admin.register(Payment)
class PaymentAdmin(admin.ModelAdmin):
    list_display = ['student', 'deadline', 'amount', 'status', 'created_at']
    list_filter = ['status', 'payment_method']
    search_fields = ['student__student_id', 'transaction_reference']

@admin.register(PaymentDeadline)
class PaymentDeadlineAdmin(admin.ModelAdmin):
    list_display = ['academic_year', 'month', 'due_date', 'amount', 'is_active']
    list_filter = ['academic_year', 'is_active']

@admin.register(PaymentReminder)
class PaymentReminderAdmin(admin.ModelAdmin):
    list_display = ['student', 'deadline', 'sent_at', 'status']
@admin.register(StudentFeeOverride)
class StudentFeeOverrideAdmin(admin.ModelAdmin):
    list_display = ['student', 'academic_year', 'override_type', 'amount', 'is_active', 'created_at']
    list_filter = ['override_type', 'is_active', 'academic_year']
    search_fields = ['student__student_id', 'student__first_name', 'student__last_name']
