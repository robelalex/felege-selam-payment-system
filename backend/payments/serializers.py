# backend/payments/serializers.py
from rest_framework import serializers
from .models import Payment, PaymentDeadline, PaymentReminder, PaymentSlip


class PaymentDeadlineSerializer(serializers.ModelSerializer):
    month_name = serializers.CharField(source='get_month_display', read_only=True)
    grade_name = serializers.SerializerMethodField()

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

    def get_grade_name(self, obj):
        if obj.grade:
            return f"Grade {obj.grade}"
        return "All Grades"

    def get_academic_year_name(self, obj):
        if obj.academic_year:
            return obj.academic_year.name
        return None


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
