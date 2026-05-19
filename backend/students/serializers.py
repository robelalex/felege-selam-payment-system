# students/serializers.py
from rest_framework import serializers
from .models import Student
from payments.models import PaymentDeadline

class StudentSerializer(serializers.ModelSerializer):
    full_name = serializers.CharField(read_only=True)
    
    # ✅ Add bank fields from the related school
    bank_name = serializers.CharField(source='school.bank_name', read_only=True)
    bank_account_number = serializers.CharField(source='school.bank_account_number', read_only=True)
    bank_account_holder = serializers.CharField(source='school.bank_account_holder', read_only=True)
    school_name = serializers.CharField(source='school.name', read_only=True)
    
    class Meta:
        model = Student
        fields = '__all__'
        # Or explicitly list fields:
        # fields = ['id', 'student_id', 'first_name', 'last_name', 'full_name', 'grade', 
        #          'section', 'academic_year', 'parent_email', 'parent_phone', 
        #          'parent_full_name', 'monthly_fee', 'status', 'school', 
        #          'bank_name', 'bank_account_number', 'bank_account_holder', 'school_name']

class PaymentDeadlineSerializer(serializers.ModelSerializer):
    month_name = serializers.CharField(source='get_month_display', read_only=True)
    
    class Meta:
        model = PaymentDeadline
        fields = '__all__'