# staff/serializers.py
from rest_framework import serializers
from .models import StaffMember, TeacherClassAssignment, StaffDocument, StaffCareerEvent
from academics.models import Subject


class TeacherClassAssignmentSerializer(serializers.ModelSerializer):
    staff_name = serializers.CharField(source='staff.full_name', read_only=True)
    subject_name = serializers.CharField(source='subject.name', read_only=True)
    # ✅ Required at the API layer even though the DB column is nullable
    # (nullable only as a safety net for migration purposes).
    subject = serializers.PrimaryKeyRelatedField(queryset=Subject.objects.all(), required=True)

    class Meta:
        model = TeacherClassAssignment
        fields = '__all__'
        # ✅ school is set server-side from the authenticated user's own
        # school (see StaffMemberViewSet.perform_create) — never trust a
        # client-supplied school id.
        read_only_fields = ['school']


class StaffDocumentSerializer(serializers.ModelSerializer):
    uploaded_by_name = serializers.CharField(source='uploaded_by.get_full_name', read_only=True, default='')
    verified_by_name = serializers.CharField(source='verified_by.get_full_name', read_only=True, default='')

    class Meta:
        model = StaffDocument
        fields = '__all__'
        # ✅ staff is set server-side from the URL (nested under a staff
        # member), never trusted from client input — see
        # StaffDocumentViewSet.perform_create. verified/verified_by/
        # verified_at are only ever changed via the dedicated verify/
        # unverify actions, not a plain PATCH, so an upload can't
        # silently self-certify as verified.
        read_only_fields = ['staff', 'uploaded_by', 'verified', 'verified_by', 'verified_at']


class StaffCareerEventSerializer(serializers.ModelSerializer):
    event_type_display = serializers.CharField(source='get_event_type_display', read_only=True)
    recorded_by_name = serializers.CharField(source='recorded_by.get_full_name', read_only=True, default='')

    class Meta:
        model = StaffCareerEvent
        fields = '__all__'
        # ✅ Automatic fields (event_type/field_changed/old_value/
        # new_value/is_manual) are only ever written by the signal in
        # staff/signals.py. The only thing a client can create directly
        # is a manual note — see StaffMemberViewSet.add_career_note,
        # which hardcodes event_type='note' and is_manual=True itself.
        read_only_fields = [
            'staff', 'event_type', 'field_changed', 'old_value', 'new_value',
            'is_manual', 'recorded_by',
        ]


class StaffMemberSerializer(serializers.ModelSerializer):
    full_name = serializers.CharField(read_only=True)
    display_name = serializers.CharField(read_only=True)
    role_display = serializers.CharField(source='get_role_display', read_only=True)
    salutation_display = serializers.CharField(source='get_salutation_display', read_only=True)
    class_assignments = TeacherClassAssignmentSerializer(many=True, read_only=True)
    school_name = serializers.CharField(source='school.name', read_only=True)
    # ✅ Jimma item 5: nested read-only so the staff detail view (or a
    # single list call) already has documents + career history without
    # extra round trips. Both are still separately writable through
    # their own endpoints (StaffDocumentViewSet, add_career_note).
    documents = StaffDocumentSerializer(many=True, read_only=True)
    career_events = StaffCareerEventSerializer(many=True, read_only=True)

    # ✅ Both school and the auto-generated staff_id are read-only —
    # they're set/derived server-side, never taken from client input.
    # user is also read-only: it's only ever set via create_login/revoke_login.
    school = serializers.PrimaryKeyRelatedField(read_only=True)

    class Meta:
        model = StaffMember
        fields = '__all__'
        read_only_fields = ['school', 'staff_id', 'user']
