# payments/serializers.py
from rest_framework import serializers
from .models import Payment, PaymentDeadline, PaymentReminder

class PaymentDeadlineSerializer(serializers.ModelSerializer):
    month_name = serializers.CharField(source='get_month_display', read_only=True)
    
    class Meta:
        model = PaymentDeadline
        fields = '__all__'

class PaymentSerializer(serializers.ModelSerializer):
    student_name = serializers.CharField(source='student.full_name', read_only=True)
    student_id = serializers.CharField(source='student.student_id', read_only=True)
    deadline_month = serializers.CharField(source='deadline.get_month_display', read_only=True)
    
    class Meta:
        model = Payment
        fields = '__all__'