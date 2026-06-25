# academics/serializers.py
from rest_framework import serializers
from django.db import models
from .models import AcademicYear, YearPromotionLog


class AcademicYearSerializer(serializers.ModelSerializer):
    statistics = serializers.SerializerMethodField()

    class Meta:
        model = AcademicYear
        fields = '__all__'

    def get_statistics(self, obj):
        """Get statistics for this academic year"""
        from students.models import Student
        from payments.models import Payment

        # Students still use the CharField on Student model — that's fine
        total_students = Student.objects.filter(
            academic_year=obj.name,
            school=obj.school
        ).count()

        # ✅ FIX: Filter by the FK object (obj), not the string (obj.name)
        # deadline__academic_year is now a ForeignKey to AcademicYear
        total_payments = Payment.objects.filter(
            deadline__academic_year=obj,
            student__school=obj.school,
            status='verified'
        ).aggregate(total=models.Sum('amount'))['total'] or 0

        verified_payments = Payment.objects.filter(
            deadline__academic_year=obj,
            student__school=obj.school,
            status='verified'
        ).count()

        return {
            'total_students': total_students,
            'total_payments': float(total_payments),
            'verified_payments': verified_payments,
        }


class YearPromotionLogSerializer(serializers.ModelSerializer):
    from_year_name = serializers.CharField(source='from_year.name', read_only=True)
    to_year_name = serializers.CharField(source='to_year.name', read_only=True)
    promoted_by_username = serializers.CharField(source='promoted_by.username', read_only=True)

    class Meta:
        model = YearPromotionLog
        fields = '__all__'