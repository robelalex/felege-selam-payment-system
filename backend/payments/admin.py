from django.contrib import admin
from .models import Payment, PaymentDeadline, PaymentReminder

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