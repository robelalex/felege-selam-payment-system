# staff/serializers.py
from rest_framework import serializers
from .models import StaffMember, TeacherClassAssignment


class TeacherClassAssignmentSerializer(serializers.ModelSerializer):
    staff_name = serializers.CharField(source='staff.full_name', read_only=True)

    class Meta:
        model = TeacherClassAssignment
        fields = '__all__'
        # ✅ school is set server-side from the authenticated user's own
        # school (see StaffMemberViewSet.perform_create) — never trust a
        # client-supplied school id.
        read_only_fields = ['school']


class StaffMemberSerializer(serializers.ModelSerializer):
    full_name = serializers.CharField(read_only=True)
    role_display = serializers.CharField(source='get_role_display', read_only=True)
    class_assignments = TeacherClassAssignmentSerializer(many=True, read_only=True)
    school_name = serializers.CharField(source='school.name', read_only=True)

    # ✅ Both school and the auto-generated staff_id are read-only —
    # they're set/derived server-side, never taken from client input.
    # user is also read-only: it's only ever set via create_login/revoke_login.
    school = serializers.PrimaryKeyRelatedField(read_only=True)

    class Meta:
        model = StaffMember
        fields = '__all__'
        read_only_fields = ['school', 'staff_id', 'user']
