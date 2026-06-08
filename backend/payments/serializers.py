from rest_framework import serializers
from .models import Payment, PaymentDeadline, PaymentReminder, PaymentSlip

class PaymentDeadlineSerializer(serializers.ModelSerializer):
    month_name = serializers.CharField(source='get_month_display', read_only=True)
    grade_name = serializers.SerializerMethodField()
    
    class Meta:
        model = PaymentDeadline
        fields = '__all__'
    
    def get_grade_name(self, obj):
        if obj.grade:
            return f"Grade {obj.grade}"
        return "All Grades"

class PaymentSerializer(serializers.ModelSerializer):
    student_name = serializers.CharField(source='student.full_name', read_only=True)
    student_id = serializers.CharField(source='student.student_id', read_only=True)
    student_grade = serializers.IntegerField(source='student.grade', read_only=True)
    deadline_month = serializers.CharField(source='deadline.get_month_display', read_only=True)
    
    # ✅ NEW: Slip-related fields
    is_from_slip = serializers.BooleanField(read_only=True)
    slip_image_url = serializers.SerializerMethodField(read_only=True)
    slip_status = serializers.SerializerMethodField(read_only=True)
    can_delete = serializers.SerializerMethodField(read_only=True)
    
    class Meta:
        model = Payment
        fields = '__all__'
    
    def get_slip_image_url(self, obj):
        """Get slip image URL if payment is from a slip"""
        if obj.is_from_slip and obj.slip:
            try:
                return obj.slip.slip_image.url if obj.slip.slip_image else None
            except:
                return None
        return None
    
    def get_slip_status(self, obj):
        """Get slip verification status"""
        if obj.is_from_slip and obj.slip:
            return obj.slip.status
        return None
    
    def get_can_delete(self, obj):
        """Check if parent can request deletion (pending payments only)"""
        # Parents can request deletion for pending payments within 24 hours
        from django.utils import timezone
        from datetime import timedelta
        
        if obj.status == 'pending':
            time_diff = timezone.now() - obj.created_at
            return time_diff < timedelta(hours=24)
        return False