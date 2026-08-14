# backend/payments/serializers.py
from rest_framework import serializers
from .models import (
    Payment, PaymentDeadline, PaymentReminder, PaymentSlip, StudentFeeOverride,
    RegistrationFeeConfig, StudentRegistrationType,
)
from common.utils import get_verified_school_id


class PaymentDeadlineSerializer(serializers.ModelSerializer):
    month_name = serializers.CharField(source='get_month_display', read_only=True)
    grade_name = serializers.SerializerMethodField()

    # Accept school as an optional write field so views that set the
    # school from the authenticated user's context (or X-School-ID header)
    # don't force clients to always include it during validation.
    # Expose `school` as read-only; the view sets it server-side via
    # `serializer.save(school=...)`. This ensures validation does not
    # require the client to provide a school id.
    school = serializers.PrimaryKeyRelatedField(read_only=True)

    # ✅ Read: show the year name (e.g. "2021 E.C.") in API responses
    academic_year_name = serializers.SerializerMethodField(read_only=True)

    # ✅ Write: accept academic_year as an integer ID when creating/updating
    academic_year = serializers.PrimaryKeyRelatedField(
        queryset=__import__(
            'academics.models', fromlist=['AcademicYear']
        ).AcademicYear.objects.all(),
        allow_null=True,
        required=False,
    )

    class Meta:
        model = PaymentDeadline
        fields = '__all__'
        read_only_fields = ['school']

    def get_grade_name(self, obj):
        if obj.grade:
            return f"Grade {obj.grade}"
        return "All Grades"

    def get_academic_year_name(self, obj):
        if obj.academic_year:
            return obj.academic_year.name
        return None

    def validate(self, attrs):
        """Prevent creation of duplicate deadlines for the same school/year/type/month/grade.

        Use the verified school resolved from the request (super-admins may use a header,
        but get_verified_school_id centralizes that logic). This runs during serializer
        validation so the API returns a clean 400 instead of an IntegrityError 500.
        """
        request = self.context.get('request') if self.context else None
        school_id = None
        if request:
            try:
                school_id = get_verified_school_id(request)
            except Exception:
                school_id = None

        # Only run this check on create — updates should be allowed to save
        # changes to the instance without tripping on itself.
        if not self.instance:
            deadline_type = attrs.get('deadline_type', 'monthly')
            month = attrs.get('month')
            grade = attrs.get('grade')
            academic_year = attrs.get('academic_year')

            if school_id and academic_year:
                exists = PaymentDeadline.objects.filter(
                    school_id=school_id,
                    academic_year=academic_year,
                    deadline_type=deadline_type,
                    month=month,
                    grade=grade,
                ).exists()
                if exists:
                    raise serializers.ValidationError({
                        'non_field_errors': ['A deadline for this school, academic year, type, month and grade already exists.']
                    })

        return attrs


class PaymentSerializer(serializers.ModelSerializer):
    student_name = serializers.CharField(source='student.full_name', read_only=True)
    student_id = serializers.CharField(source='student.student_id', read_only=True)
    student_grade = serializers.IntegerField(source='student.grade', read_only=True)
    deadline_month = serializers.CharField(source='deadline.get_month_display', read_only=True)

    # ✅ Expose the academic year name through the deadline FK chain
    academic_year_name = serializers.SerializerMethodField(read_only=True)

    # Slip-related fields
    is_from_slip = serializers.BooleanField(read_only=True)
    slip_image_url = serializers.SerializerMethodField(read_only=True)
    slip_status = serializers.SerializerMethodField(read_only=True)
    can_delete = serializers.SerializerMethodField(read_only=True)

    class Meta:
        model = Payment
        fields = '__all__'

    def get_academic_year_name(self, obj):
        """Return the academic year name this payment belongs to via its deadline"""
        try:
            if obj.deadline and obj.deadline.academic_year:
                return obj.deadline.academic_year.name
        except Exception:
            pass
        return None

    def get_slip_image_url(self, obj):
        if obj.is_from_slip and obj.slip:
            try:
                return obj.slip.slip_image.url if obj.slip.slip_image else None
            except Exception:
                return None
        return None

    def get_slip_status(self, obj):
        if obj.is_from_slip and obj.slip:
            return obj.slip.status
        return None

    def get_can_delete(self, obj):
        """Pending payments within 24 hours can be deleted by parent"""
        from django.utils import timezone
        from datetime import timedelta
        if obj.status == 'pending':
            return timezone.now() - obj.created_at < timedelta(hours=24)
        return False


class StudentFeeOverrideSerializer(serializers.ModelSerializer):
    student_name = serializers.CharField(source='student.full_name', read_only=True)
    student_id_display = serializers.CharField(source='student.student_id', read_only=True)
    academic_year_name = serializers.CharField(source='academic_year.name', read_only=True)
    override_type_display = serializers.CharField(source='get_override_type_display', read_only=True)
    created_by_username = serializers.CharField(source='created_by.username', read_only=True)

    class Meta:
        model = StudentFeeOverride
        fields = [
            'id', 'student', 'student_name', 'student_id_display',
            'academic_year', 'academic_year_name',
            'override_type', 'override_type_display', 'amount',
            'supporting_document', 'reason', 'is_active',
            'created_by', 'created_by_username',
            'deactivated_by', 'deactivated_at',
            'created_at', 'updated_at',
        ]
        read_only_fields = [
            'id', 'created_by', 'deactivated_by', 'deactivated_at',
            'created_at', 'updated_at',
        ]

    def validate(self, attrs):
        # supporting_document is required on CREATE, but shouldn't be
        # force-required on partial updates (e.g. an admin flipping
        # is_active off doesn't need to re-upload the letter).
        is_create = self.instance is None
        if is_create and not attrs.get('supporting_document'):
            raise serializers.ValidationError({
                'supporting_document': 'A supporting document (kebele/NGO letter) is required to create a fee exception.'
            })
        return attrs


# ✅ Jimma request #2 — registration fees
class RegistrationFeeConfigSerializer(serializers.ModelSerializer):
    academic_year_name = serializers.CharField(source='academic_year.name', read_only=True)
    created_by_username = serializers.CharField(source='created_by.username', read_only=True)

    class Meta:
        model = RegistrationFeeConfig
        fields = [
            'id', 'school', 'academic_year', 'academic_year_name',
            'new_student_amount', 'continuing_student_amount', 'transferred_student_amount',
            'created_by', 'created_by_username', 'created_at', 'updated_at',
        ]
        read_only_fields = ['id', 'school', 'created_by', 'created_at', 'updated_at']


class StudentRegistrationTypeSerializer(serializers.ModelSerializer):
    student_name = serializers.CharField(source='student.full_name', read_only=True)
    student_id_display = serializers.CharField(source='student.student_id', read_only=True)
    academic_year_name = serializers.CharField(source='academic_year.name', read_only=True)
    registration_type_display = serializers.CharField(source='get_registration_type_display', read_only=True)
    set_by_username = serializers.CharField(source='set_by.username', read_only=True)

    class Meta:
        model = StudentRegistrationType
        fields = [
            'id', 'student', 'student_name', 'student_id_display',
            'academic_year', 'academic_year_name',
            'registration_type', 'registration_type_display',
            'is_manual_override', 'set_by', 'set_by_username',
            'created_at', 'updated_at',
        ]
        read_only_fields = ['id', 'is_manual_override', 'set_by', 'created_at', 'updated_at']