# students/serializers.py
from rest_framework import serializers
from .models import Student, Section, StudentDocument, RequiredDocumentRequest
from payments.models import PaymentDeadline


class StudentDocumentSerializer(serializers.ModelSerializer):
    document_type_display = serializers.CharField(source='get_document_type_display', read_only=True)
    status_display = serializers.CharField(source='get_status_display', read_only=True)
    academic_year_name = serializers.CharField(source='academic_year.name', read_only=True, default=None)

    class Meta:
        model = StudentDocument
        fields = '__all__'
        read_only_fields = ['student', 'uploaded_at', 'reviewed_at']


class RequiredDocumentRequestSerializer(serializers.ModelSerializer):
    document_type_display = serializers.CharField(source='get_document_type_display', read_only=True)

    class Meta:
        model = RequiredDocumentRequest
        fields = '__all__'
        read_only_fields = ['student', 'created_at', 'resolved_at', 'is_resolved']


class StudentSerializer(serializers.ModelSerializer):
    full_name = serializers.CharField(read_only=True)
    # ✅ Name formatted per the school's naming_convention (Ethiopian:
    # First + Father name, International: First + Last name). Use this
    # for anything printed/displayed to end users instead of full_name.
    formatted_name = serializers.CharField(read_only=True)
    school_level = serializers.CharField(read_only=True)
    school_level_label = serializers.CharField(read_only=True)

    # ✅ Add bank fields from the related school
    bank_name = serializers.CharField(source='school.bank_name', read_only=True)
    bank_account_number = serializers.CharField(source='school.bank_account_number', read_only=True)
    bank_account_holder = serializers.CharField(source='school.bank_account_holder', read_only=True)
    school_name = serializers.CharField(source='school.name', read_only=True)
    naming_convention = serializers.CharField(source='school.naming_convention', read_only=True)

    # ✅ Attached enrollment documents (birth certificate, leaving
    # certificates, etc.) — nested read-only; uploaded separately via
    # the /students/{id}/documents/ endpoint.
    documents = StudentDocumentSerializer(many=True, read_only=True)

    # ✅ CRITICAL: Make school read-only to prevent moving students between schools
    school = serializers.PrimaryKeyRelatedField(read_only=True)

    class Meta:
        model = Student
        fields = '__all__'
        # ✅ Extra protection: explicitly list read-only fields
        read_only_fields = ['school']


class SectionSerializer(serializers.ModelSerializer):
    class Meta:
        model = Section
        fields = '__all__'
        read_only_fields = ['school']


class PaymentDeadlineSerializer(serializers.ModelSerializer):
    month_name = serializers.CharField(source='get_month_display', read_only=True)

    class Meta:
        model = PaymentDeadline
        fields = '__all__'