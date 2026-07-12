# backend/common/serializers.py
from rest_framework import serializers
from .models import AuditLog


class AuditLogSerializer(serializers.ModelSerializer):
    """
    Feeds the admin 'Activity Log' page. actor_name/actor_role are derived
    rather than plain FK fields since the frontend wants a human-readable
    name + the staff member's granular role (teacher/registrar/...), not
    just the raw user id.
    """
    actor_name = serializers.SerializerMethodField()
    actor_role = serializers.SerializerMethodField()
    action_display = serializers.CharField(source='get_action_display', read_only=True)

    class Meta:
        model = AuditLog
        fields = ['id', 'actor_name', 'actor_role', 'action', 'action_display', 'details', 'timestamp']

    def get_actor_name(self, obj):
        if not obj.user:
            return 'Deleted user'
        full_name = obj.user.get_full_name()
        return full_name or obj.user.username or obj.user.email

    def get_actor_role(self, obj):
        if not obj.user:
            return ''
        # Prefer the granular HR role (teacher/registrar/accountant/...)
        # from StaffMember over the coarse UserProfile.role ('staff').
        staff_profile = getattr(obj.user, 'staff_profile', None)
        if staff_profile:
            return staff_profile.role
        profile = getattr(obj.user, 'profile', None)
        if profile:
            return profile.role
        return ''
