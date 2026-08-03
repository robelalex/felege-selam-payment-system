# schools/serializers.py
from rest_framework import serializers
from .models import School

class SchoolSerializer(serializers.ModelSerializer):
    class Meta:
        model = School
        fields = '__all__'

from .bank_account_models import SchoolBankAccount


class BankAccountSerializer(serializers.ModelSerializer):
    bank_name = serializers.ReadOnlyField()

    class Meta:
        model = SchoolBankAccount
        fields = [
            'id', 'school', 'bank_code', 'bank_name', 'bank_name_override',
            'account_number', 'account_holder', 'display_label',
            'is_primary', 'is_active', 'supports_auto_verify', 'created_at',
        ]
        read_only_fields = ['id', 'school', 'bank_name', 'created_at']
