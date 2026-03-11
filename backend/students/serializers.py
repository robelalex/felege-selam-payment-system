# students/serializers.py
from rest_framework import serializers
from .models import Student
from payments.models import PaymentDeadline

class StudentSerializer(serializers.ModelSerializer):
    full_name = serializers.CharField(read_only=True)
    
    class Meta:
        model = Student
        fields = '__all__'

class PaymentDeadlineSerializer(serializers.ModelSerializer):
    month_name = serializers.CharField(source='get_month_display', read_only=True)
    
    class Meta:
        model = PaymentDeadline
        fields = '__all__'