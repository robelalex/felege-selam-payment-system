# schools/serializers.py
from rest_framework import serializers
from .models import School

class SchoolSerializer(serializers.ModelSerializer):
    class Meta:
        model = School
        # ✅ SECURITY FIX: this was `fields = '__all__'`, which meant every
        # authenticated staff member of a school (a teacher, a registrar —
        # anyone `SchoolViewSet.get_queryset()` scopes to their own school)
        # got the school's REAL, decrypted Chapa/SMS/email/Verify.ET API
        # keys back in plaintext on a plain `GET /api/schools/<id>/` —
        # bypassing the masking ('********') that the dedicated
        # SchoolChapaConfigView/SchoolSMSConfigView/SchoolEmailConfigView/
        # verify_et_settings views apply on purpose. Those dedicated views
        # remain the only way to read (masked) or write these credentials —
        # `exclude` here means this general-purpose serializer never touches
        # them at all, in either direction. Every other School field
        # (branding, location, bank display fields, admin_ip_restriction_*,
        # grading/term settings, etc.) is unaffected and still works exactly
        # as before.
        exclude = [
            'chapa_api_key',
            'chapa_webhook_secret',
            'brevo_api_key',
            'at_api_key',
            'verify_et_api_key',
        ]

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
