# backend/schools/admin.py
from django.contrib import admin
from .models import School, SchoolAdminProfile

@admin.register(School)
class SchoolAdmin(admin.ModelAdmin):
    list_display = ['name', 'code', 'phone', 'email', 'subscription_active']
    search_fields = ['name', 'code', 'phone']
    list_filter = ['subscription_active']


@admin.register(SchoolAdminProfile)
class SchoolAdminProfileAdmin(admin.ModelAdmin):
    list_display = ['user', 'school', 'is_active', 'created_at']
    list_filter = ['is_active', 'school']
    search_fields = ['user__username', 'user__email', 'school__name']
    raw_id_fields = ['user', 'school']