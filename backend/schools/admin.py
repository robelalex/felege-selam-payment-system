# backend/schools/admin.py
from django.contrib import admin
from django.contrib.auth.models import User
from .models import School, SchoolAdminProfile, SchoolBankAccount

@admin.register(School)
class SchoolAdmin(admin.ModelAdmin):
    list_display = ['name', 'code', 'phone', 'email', 'subscription_status', 'subscription_active']
    search_fields = ['name', 'code', 'phone']
    list_filter = ['subscription_status', 'subscription_active']
    actions = ['approve_schools', 'reject_schools', 'suspend_schools']

    @admin.action(description='✅ Approve selected schools (activates their admin login)')
    def approve_schools(self, request, queryset):
        count = 0
        for school in queryset:
            school.subscription_status = 'approved'
            school.subscription_active = True
            school.save()
            # Activate the matching school-admin login(s), same as the
            # existing approve_school API endpoint does.
            for admin_profile in SchoolAdminProfile.objects.filter(school=school):
                admin_profile.user.is_active = True
                admin_profile.user.save()
                count += 1
        self.message_user(request, f'Approved {queryset.count()} school(s), activated {count} admin login(s).')

    @admin.action(description='❌ Reject selected schools (deactivates their admin login, does NOT delete data)')
    def reject_schools(self, request, queryset):
        count = 0
        for school in queryset:
            school.subscription_status = 'rejected'
            school.subscription_active = False
            school.save()
            for admin_profile in SchoolAdminProfile.objects.filter(school=school):
                admin_profile.user.is_active = False
                admin_profile.user.save()
                count += 1
        self.message_user(request, f'Rejected {queryset.count()} school(s), deactivated {count} admin login(s).')

    @admin.action(description='⏸️ Suspend selected schools (e.g. non-payment)')
    def suspend_schools(self, request, queryset):
        for school in queryset:
            school.subscription_status = 'suspended'
            school.subscription_active = False
            school.save()
        self.message_user(request, f'Suspended {queryset.count()} school(s).')


@admin.register(SchoolAdminProfile)
class SchoolAdminProfileAdmin(admin.ModelAdmin):
    list_display = ['user', 'school', 'is_active', 'created_at']
    list_filter = ['is_active', 'school']
    search_fields = ['user__username', 'user__email', 'school__name']
    raw_id_fields = ['user', 'school']

@admin.register(SchoolBankAccount)
class SchoolBankAccountAdmin(admin.ModelAdmin):
    list_display = ['school', 'bank_name', 'account_number', 'account_holder', 'is_primary', 'is_active', 'supports_auto_verify']
    list_filter = ['bank_code', 'is_primary', 'is_active', 'supports_auto_verify', 'school']
    search_fields = ['school__name', 'account_number', 'account_holder', 'display_label']
    autocomplete_fields = ['school']
